import { describe, expect, it } from "vitest";
import {
  DISCORD_CONTENT_LIMIT,
  findLinkedIn,
  formatDiscordMessage,
  money,
  ordinal,
  unframe,
} from "./discord-format";

/** formatDiscordMessage, with the top/bottom frame removed so tests check the body. */
const fmtBody = (...a: Parameters<typeof formatDiscordMessage>) => {
  const m = formatDiscordMessage(...a);
  return { ...m, content: unframe(m.content) };
};

/** The application that landed as a truncated JSON blob on 2026-11-12. */
const APPLICATION = {
  lead_id: "lead-1",
  form_title: "Career AI Accelerator",
  lead: {
    id: "lead-1",
    full_name: "Tier Verify",
    email: "tier.verify@careeraiaccelerator.com",
    phone: "+12015550204",
    ticket_tier: "mid",
    ticket_tier_label: "Mid Ticket",
    source_platform: "instagram",
    source_campaign: "tier_verify",
  },
  // Three copies of every answer — the thing that ate the old budget.
  answers: Object.fromEntries(
    Array.from({ length: 60 }, (_, i) => [`d974dd1a-446c-423d-ab98-${i}`, "x".repeat(40)]),
  ),
  application_data: {
    work_school: "Operations Lead, Tier Verify Co",
    income: "$95-120K",
    goal: "$130-160K",
    capital: "$1,500-$3,000",
    credit: "750+",
    time: "",
    commitment: "true",
    serious_status: "Because I have been underpaid for three years and I am done waiting.",
    answers_by_title: {
      "What's your LinkedIn?": "https://www.linkedin.com/in/tier-verify",
      "First name": "Tier",
    },
  },
};

describe("formatDiscordMessage — application", () => {
  const msg = fmtBody("lead.application_submitted", APPLICATION, {
    appUrl: "https://ascendos-app.vercel.app",
  });

  it("leads with the things a closer decides on", () => {
    expect(msg.content).toContain("**Name:** Tier Verify");
    expect(msg.content).toContain("**Email:** tier.verify@careeraiaccelerator.com");
    expect(msg.content).toContain("**Phone:** +12015550204");
    expect(msg.content).toContain("**Qualifies:** Mid Ticket");
    expect(msg.content).toContain("**Budget:** $1,500-$3,000");
    expect(msg.content).toContain("**Current salary:** $95-120K");
    expect(msg.content).toContain("**Target salary:** $130-160K");
  });

  it("finds LinkedIn by its URL, not by the question's wording", () => {
    expect(msg.content).toContain("**LinkedIn:** https://www.linkedin.com/in/tier-verify");
  });

  it("never renders raw answers, UUIDs or JSON", () => {
    expect(msg.content).not.toContain("d974dd1a");
    expect(msg.content).not.toContain("```");
    expect(msg.content).not.toContain("{");
  });

  it("skips empty slots instead of printing a label with nothing after it", () => {
    expect(msg.content).not.toContain("Time available");
  });

  it("puts the long answer last, just before the link", () => {
    const why = msg.content.indexOf("Why you, why now");
    expect(why).toBeGreaterThan(msg.content.indexOf("**Budget:**"));
    expect(
      msg.content
        .replace(/\n\u200b$/, "")
        .endsWith("(<https://ascendos-app.vercel.app/leads?leadId=lead-1>)"),
    ).toBe(true);
  });

  it("omits the link when no app URL is known, rather than inventing one", () => {
    const noUrl = fmtBody("lead.application_submitted", APPLICATION, {});
    expect(noUrl.content).not.toContain("Open in AscendOS");
  });
});

describe("truncation", () => {
  it("cuts the long free text, keeps the contact details, and says it was cut", () => {
    const huge = {
      ...APPLICATION,
      application_data: { ...APPLICATION.application_data, serious_status: "word ".repeat(1000) },
    };
    const msg = fmtBody("lead.application_submitted", huge, {
      appUrl: "https://ascendos-app.vercel.app",
    });
    expect(msg.content.length).toBeLessThanOrEqual(DISCORD_CONTENT_LIMIT);
    expect(msg.content).toContain("**Email:** tier.verify@careeraiaccelerator.com");
    expect(msg.content).toContain("… (message truncated)");
    expect(msg.content).toContain("Open in AscendOS");
  });

  it("stays under the limit even when the fixed part is enormous", () => {
    const setters = Array.from({ length: 80 }, (_, i) => ({
      name: `Rep ${i}`,
      dials: 100,
      sets: 5,
    }));
    const msg = fmtBody("report.daily_sales", { period_label: "Nov 13", setters });
    expect(msg.content.length).toBeLessThanOrEqual(DISCORD_CONTENT_LIMIT);
    expect(msg.content).toContain("… (message truncated)");
  });
});

describe("link previews", () => {
  it("suppresses the preview cards for the AscendOS and meeting links", () => {
    const msg = fmtBody(
      "call.confirmed",
      {
        lead_id: "L",
        lead: { id: "L", full_name: "Ada" },
        meeting_link: "https://meet.google.com/abc-defg-hij",
      },
      { appUrl: "https://ascendos-app.vercel.app" },
    );
    expect(msg.content).toContain(
      "[Open in AscendOS](<https://ascendos-app.vercel.app/leads?leadId=L>)",
    );
    // No Meet card either: Aryan's layout ends at the AscendOS link.
    expect(msg.content).toContain("Meeting link: <https://meet.google.com/abc-defg-hij>");
  });
});

describe("mentions", () => {
  it("pings the roles and whitelists them so Discord actually notifies", () => {
    const msg = fmtBody(
      "call.unconfirmed",
      { lead_name: "Ada" },
      {
        mentionRoleIds: ["1570643974073487430", "1570644095586664649"],
      },
    );
    expect(msg.content.startsWith("<@&1570643974073487430> <@&1570644095586664649>")).toBe(true);
    expect(msg.allowed_mentions.roles).toEqual(["1570643974073487430", "1570644095586664649"]);
    expect(msg.allowed_mentions.parse).toEqual([]);
  });

  it("drops anything that is not a role ID, so @everyone cannot be smuggled in", () => {
    const msg = fmtBody("callback.due", {}, { mentionRoleIds: ["everyone", "@here", " 123 "] });
    expect(msg.allowed_mentions.roles).toEqual(["123"]);
    expect(msg.content).not.toContain("everyone");
  });

  it("pings nobody by default", () => {
    const msg = fmtBody("callback.due", {});
    expect(msg.allowed_mentions.roles).toEqual([]);
    expect(msg.content).not.toContain("<@&");
  });
});

describe("other event shapes", () => {
  it("renders a call with its time in the workspace timezone", () => {
    const msg = fmtBody(
      "call.confirmed",
      {
        lead: { full_name: "Ada Lovelace", phone: "+15550001111" },
        scheduled_for: "2026-11-13T20:00:00Z",
        closer_name: "Sam",
        touchpoint_label: "Morning of call — goals & anticipation",
      },
      { timeZone: "America/New_York" },
    );
    expect(msg.content).toContain("**Call confirmed**");
    expect(msg.content).toContain("**Full Name:** Ada Lovelace");
    expect(msg.content).toMatch(/Date of Call: Fri, Nov 13, 3:00 PM EST/);
  });

  it("renders post-call money as currency, not cents", () => {
    const msg = fmtBody("closer.post_call_submitted", {
      closer_name: "Sam",
      lead_status: "Deposit",
      cash_collected_cents: 150000,
      contract_value_cents: 600000,
      call_summary: "Good call.",
    });
    expect(msg.content).toContain("**Cash collected:** $1,500");
    expect(msg.content).toContain("**Total revenue:** $6,000");
  });

  it("lists only the EOD numbers a rep actually logged", () => {
    const msg = fmtBody("setter.eod_submitted", {
      team_member_name: "Jo",
      role: "inbound_dialer",
      activity_date: "2026-11-13",
      dials: 120,
      sets: 4,
      replies: 0,
    });
    expect(msg.content).toContain("**Dials:** 120");
    expect(msg.content).toContain("**Sets:** 4");
    expect(msg.content).not.toContain("Replies");
  });

  it("renders a leaderboard with rates", () => {
    const msg = fmtBody("report.daily_sales", {
      period_label: "Thu, Nov 13",
      closers: [{ name: "Sam", taken: 4, showed: 3, noShows: 1, closed: 1, cashCents: 300000 }],
      team: { name: "Team", showed: 3, noShows: 1, closed: 1, cashCents: 300000 },
    });
    expect(msg.content).toContain("Daily sales team report — Thu, Nov 13");
    expect(msg.content).toContain(
      "**Sam** — 4 calls taken · 3 showed · 1 no-show · 1 closed · $3,000 · show 75% · close 33%",
    );
  });

  it("falls back to readable lines for an event with no bespoke shape", () => {
    const msg = fmtBody("client.stage_changed", {
      amount_cents: 99900,
      customer_email: "a@b.c",
      raw: { nested: true },
    });
    expect(msg.content).toContain("**Client stage changed**");
    expect(msg.content).toContain("**Amount cents:** $999");
    expect(msg.content).toContain("**Customer email:** a@b.c");
    expect(msg.content).not.toContain("nested");
  });
});

describe("helpers", () => {
  it("money formats cents and keeps foreign currencies explicit", () => {
    expect(money(150000)).toBe("$1,500");
    expect(money(150050)).toBe("$1,500.50");
    expect(money(50000, "CAD")).toBe("500 CAD");
    expect(money(0)).toBe("");
    expect(money(null)).toBe("");
  });

  it("findLinkedIn ignores everything that is not a profile URL", () => {
    expect(findLinkedIn({ a: "linkedin", b: "https://linkedin.com/company/x" })).toBe("");
    expect(findLinkedIn({ a: "https://www.linkedin.com/in/ada" })).toBe(
      "https://www.linkedin.com/in/ada",
    );
  });
});

describe("content messages", () => {
  const piece = {
    title: "Why your salary is capped",
    platform: "reel",
    hook: "You're not underpaid, you're under-positioned",
    scheduled_date: "2026-11-16",
    scheduled_time: "09:30:00",
    url: "https://drive.example/cut-1",
    angle: "pain_point",
    funnel_stage: "top",
    script: "x".repeat(4000),
  };

  it("labels a short-form piece with its schedule, link and angle — not its script", () => {
    const msg = fmtBody("content.ready_to_post.short_form", piece, {
      appUrl: "https://app",
    });
    expect(msg.content).toContain("**Short-form ready to post — Instagram reel**");
    expect(msg.content).toContain("**Title:** Why your salary is capped");
    expect(msg.content).toContain("**Scheduled:** Mon, Nov 16, 9:30 AM");
    expect(msg.content).toContain("**Link:** https://drive.example/cut-1");
    expect(msg.content).toContain("**Angle:** pain point");
    expect(msg.content).not.toContain("xxxxxxxx");
    expect(msg.content).toContain("(<https://app/content-calendar>)");
  });

  it("lists the day's schedule in order, and says so when nothing is scheduled", () => {
    const msg = fmtBody("content.schedule_daily", {
      period_label: "Mon, Nov 16",
      pieces: [
        {
          title: "Morning reel",
          platform: "reel",
          scheduled_time: "09:00:00",
          pipeline_status: "ready_to_post",
        },
        {
          title: "Evening Short",
          platform: "youtube_short",
          scheduled_time: "18:15:00",
          pipeline_status: "draft",
        },
      ],
    });
    expect(msg.content).toContain("Content schedule — Mon, Nov 16");
    expect(msg.content).toContain("• 9:00 AM · Instagram reel · **Morning reel** · Ready to post");
    expect(msg.content.indexOf("Morning reel")).toBeLessThan(msg.content.indexOf("Evening Short"));

    const empty = fmtBody("content.schedule_daily", {
      period_label: "Tue, Nov 17",
      pieces: [],
    });
    expect(empty.content).toContain("Nothing scheduled today.");
  });

  it("ranks sources and keeps Unknown on its own unranked line", () => {
    const msg = fmtBody("report.top_sources_weekly", {
      period_label: "Nov 10 – Nov 16",
      sources: [
        { name: "Instagram", leads: 4, applications: 3, booked: 2, cashCents: 150000 },
        { name: "TikTok", leads: 1, applications: 0, booked: 0, cashCents: 0 },
      ],
      unattributed: {
        name: "Unknown / Unattributed",
        leads: 9,
        applications: 5,
        booked: 1,
        cashCents: 0,
      },
      content: [
        { name: "Why your salary is capped", leads: 2, applications: 2, booked: 1, cashCents: 0 },
      ],
    });
    expect(msg.content).toContain("Weekly top content sources — Nov 10 – Nov 16");
    expect(msg.content).toContain(
      "1. **Instagram** — 4 leads · 3 applications · 2 booked · $1,500",
    );
    expect(msg.content).toContain("2. **TikTok** — 1 lead");
    expect(msg.content).toContain("• **Unknown / Unattributed** — 9 leads");
    expect(msg.content).not.toMatch(/\d\. \*\*Unknown/);
    expect(msg.content).toContain("1. **Why your salary is capped**");
  });
});

describe("sales report call numbers", () => {
  it("shows bookings made and calls on calendar on the team line, as separate numbers", () => {
    const msg = fmtBody("report.daily_sales", {
      period_label: "Sat, Nov 14",
      team: { name: "Team", booked: 4, onCalendar: 1 },
    });
    expect(msg.content).toContain("**Team** — 4 booked · 1 on calendar");
  });
});

describe("call source", () => {
  it("shows platform, placement and campaign on a booked call", () => {
    const msg = fmtBody("call.booked", {
      lead: {
        full_name: "UTM Verify",
        source_platform: "instagram",
        source_medium: "bio",
        source_campaign: "evergreen",
      },
    });
    expect(msg.content).toContain("**Source:** instagram · bio · evergreen");
  });
});

describe("payment messages", () => {
  const base = {
    amount_cents: 150000,
    currency: "USD",
    amount_usd_cents: 150000,
    processor: "fanbasis",
    email: "erika.client@example.com",
    lead_id: "L1",
    lead: { id: "L1", full_name: "Jordan Ellis" },
    offer_name: "Career AI Accelerator",
    plan_progress: "2/5 paid",
  };

  it("reads a failure in the spec's order, with the attempt number", () => {
    const msg = fmtBody(
      "payment.failed",
      {
        ...base,
        lead: { ...base.lead, phone: "+15550001111" },
        failure_reason: "card_declined",
        failed_attempt_number: 2,
      },
      { appUrl: "https://app" },
    );
    const order = [
      "Name",
      "Email",
      "Phone",
      "Processor",
      "Product",
      "Amount",
      "Reason",
      "Attempt #",
    ].map((l) => msg.content.indexOf(`\n${l}:`));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(msg.content).toContain("Processor: Commas (Fanbasis)");
    expect(msg.content).toContain("Product: Career AI Accelerator");
    expect(msg.content).toContain("Attempt #: 2");
    expect(msg.content).toContain("(<https://app/leads?leadId=L1>)");
  });

  it("never shows a failure's reason or attempt on a collected payment", () => {
    const msg = fmtBody("payment.collected", {
      ...base,
      processor: "whop",
      failure_reason: "x",
      failed_attempt_number: 3,
    });
    expect(msg.content).toContain("Processor: Whop");
    expect(msg.content).not.toContain("Reason");
    expect(msg.content).not.toContain("Attempt");
  });

  it("shows the buyer's currency and the USD figure when they differ", () => {
    const msg = fmtBody("payment.collected", {
      ...base,
      amount_cents: 200000,
      currency: "CAD",
      amount_usd_cents: 146000,
    });
    expect(msg.content).toContain("Cash collected: 2,000 CAD ($1,460)");
  });

  it("leaves out what it does not know rather than printing blanks", () => {
    const msg = fmtBody("payment.collected", {
      amount_cents: 5000,
      currency: "USD",
      processor: "wise",
      prior_successful_payments: null,
    });
    expect(msg.content).not.toContain("Product");
    expect(msg.content).not.toContain("Phone");
    expect(msg.content).toContain("Processor: Wise");
  });
});

describe("ordinal", () => {
  it("handles the teens", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
      "111th",
    ]);
  });
});
