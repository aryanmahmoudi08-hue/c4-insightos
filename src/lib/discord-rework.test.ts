/**
 * The Discord rework (CareerAiAccelerator/06-ops/discord-rework-spec.md):
 * per-channel bot identity, the spec's field order per channel, the divider
 * and AscendOS link, the unconfirmed-call alert schedule, and the due-time
 * follow-ups that link back to the message posted when the item was logged.
 */
import { describe, expect, it } from "vitest";
import { DIVIDER, formatDiscordMessage, unframe } from "./discord-format";
import {
  DISCORD_BOT_IDENTITIES,
  DISPATCHED_EVENT_TYPES,
  discordIdentityFor,
  twemojiUrl,
  withWait,
} from "./event-catalog";
import { bookedVia, leadCardFrom } from "./lead-card";
import { mergePostedMessages } from "./delivery-retry";
import {
  MIN_MINUTES_AFTER_BOOKING,
  unconfirmedAlertDue,
  unconfirmedAlertSchedule,
} from "./scheduler-rules";

/** formatDiscordMessage, with the top/bottom frame removed so tests check the body. */
const fmtBody = (...a: Parameters<typeof formatDiscordMessage>) => {
  const m = formatDiscordMessage(...a);
  return { ...m, content: unframe(m.content) };
};

const APP = "https://ascendos-app.vercel.app";
const TZ = "America/New_York";
const LEAD = {
  id: "L1",
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+15550001111",
  linkedin: "https://www.linkedin.com/in/ada",
  current_salary: "$95-120K",
  target_salary: "$130-160K",
  budget: "$1,500-$3,000",
  credit: "750+",
  source_platform: "instagram",
  source_medium: "bio",
  source_campaign: "evergreen",
};

/** The labels in a message, in the order they appear. */
/** The labels in a message, bold or plain, in the order they appear. */
const labels = (content: string) =>
  [...content.matchAll(/^(?:\*\*)?([A-Z][^:*\n]*):(?:\*\*)?(?: |$)/gm)].map((m) => m[1]);

describe("bot identity", () => {
  it("defaults every spec channel's event to its bot name and Twemoji icon", () => {
    expect(discordIdentityFor("call.booked")).toEqual({
      username: "CALL BOOKED",
      avatar_url: "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/1f4c5.png",
    });
    expect(discordIdentityFor("lead.application_submitted")?.avatar_url).toBe(twemojiUrl("1f4dd"));
  });

  it("only names events that are really dispatched", () => {
    for (const type of Object.keys(DISCORD_BOT_IDENTITIES)) {
      expect(DISPATCHED_EVENT_TYPES, type).toContain(type);
    }
  });

  it("lets a subscription override the name and icon", () => {
    expect(
      discordIdentityFor("call.booked", {
        bot_name: "BOOKINGS",
        bot_avatar_url: "https://x/y.png",
      }),
    ).toEqual({ username: "BOOKINGS", avatar_url: "https://x/y.png" });
  });

  it("refuses a name Discord would reject", () => {
    expect(discordIdentityFor("call.booked", { bot_name: "Discord Bot" })).toBeNull();
  });

  it("drops the title line when the bot name says what the message is", () => {
    const withName = fmtBody(
      "call.confirmed",
      { lead: LEAD },
      {
        username: "CALL CONFIRMED",
        avatarUrl: twemojiUrl("2705"),
      },
    );
    expect(withName.content).not.toContain("Call confirmed");
    expect(withName.content.startsWith("**Full Name:** Ada Lovelace")).toBe(true);
    expect(withName.username).toBe("CALL CONFIRMED");
    expect(withName.avatar_url).toBe(twemojiUrl("2705"));

    const without = fmtBody("call.confirmed", { lead: LEAD });
    expect(without.content).toContain("**Call confirmed**");
    expect(without.username).toBeUndefined();
  });
});

describe("every lead message ends with a divider and its AscendOS link", () => {
  const types = [
    "lead.application_submitted",
    "call.booked",
    "call.confirmed",
    "call.unconfirmed",
    "call.cancelled",
    "call.rescheduled",
    "callback.logged",
    "callback.due",
    "followup.short_term_logged",
    "followup.long_term_due",
    "payment.collected",
    "payment.failed",
    "closer.post_call_submitted",
  ];
  for (const type of types) {
    it(type, () => {
      const msg = fmtBody(type, { lead: LEAD, lead_id: "L1" }, { appUrl: APP });
      expect(
        msg.content
          .replace(/\n\u200b$/, "")
          .endsWith(`\n\n[Open in AscendOS](<${APP}/leads?leadId=L1>)`),
      ).toBe(true);
      // The only divider is the frame's, at the bottom.
      expect(msg.content.includes(DIVIDER)).toBe(false);
    });
  }
});

describe("channel formats, in the spec's order", () => {
  const opts = { appUrl: APP, timeZone: TZ, username: "X" };

  it("#new-1on1-applicants", () => {
    const msg = fmtBody(
      "lead.application_submitted",
      {
        lead: { ...LEAD, ticket_tier_label: "Mid Ticket" },
        application_data: {
          work_school: "Ops Lead, Co",
          income: "$95-120K",
          goal: "$130-160K",
          capital: "$1,500",
          credit: "750+",
          experience: "6",
          focus: "AI ops",
          candidate_fit: "Employed",
          serious_status: "Done waiting.",
        },
      },
      opts,
    );
    expect(labels(msg.content)).toEqual([
      "Name",
      "Email",
      "Phone",
      "LinkedIn",
      "Qualifies",
      "Role & company",
      "Current salary",
      "Target salary",
      "Budget",
      "Credit",
      "Experience (Years)",
      "Focus",
      "Situation",
      "Why you, why now",
      // Where they came from: "dm" tells dialers it's a setter's lead.
      "Source",
    ]);
    // A blank line, not a divider, between the lead block and the application.
    expect(msg.content.includes(DIVIDER)).toBe(false);
    expect(msg.content).toMatch(/\*\*LinkedIn:\*\* [^\n]+\n\n\*\*Qualifies:\*\*/);
  });

  it("#calls-booked and #calls-confirmed share a body", () => {
    const p = {
      lead: LEAD,
      scheduled_for: "2026-11-16T20:30:00Z",
      meeting_link: "https://meet.google.com/abc",
    };
    const booked = fmtBody("call.booked", p, opts);
    expect(labels(booked.content)).toEqual([
      "Full Name",
      "Email",
      "Phone",
      "LinkedIn",
      "Source",
      "Current salary",
      "Target salary",
      "Budget",
      "Credit",
      "Date of Call",
      "Meeting link",
    ]);
    expect(booked.content).toContain("Date of Call: Mon, Nov 16, 3:30 PM EST");
    expect(booked.content).toContain("**Source:** instagram · bio · evergreen");
    expect(fmtBody("call.confirmed", p, opts).content).toBe(booked.content);
  });

  it("#calls-unconfirmed, with the alert's own pings", () => {
    const msg = fmtBody(
      "call.unconfirmed",
      {
        lead: LEAD,
        booked_via: "Calendly · from instagram",
        scheduled_for: "2026-11-16T20:30:00Z",
        meeting_link: "https://meet.google.com/abc",
      },
      { ...opts, extraRoleIds: ["111", "222"], mentionRoleIds: ["111"] },
    );
    expect(labels(msg.content)).toEqual([
      "Full Name",
      "Email",
      "Phone",
      "LinkedIn",
      "Current salary",
      "Budget",
      "Credit",
      "Booked via",
      "Date of Call",
      "Meeting link",
    ]);
    expect(msg.content.startsWith("<@&111> <@&222>\n")).toBe(true);
    expect(msg.allowed_mentions.roles).toEqual(["111", "222"]);
  });

  it("#calls-cancelled", () => {
    const msg = fmtBody(
      "call.cancelled",
      { lead: LEAD, scheduled_for: "2026-11-16T20:30:00Z", cancellation_reason: "Got a job" },
      opts,
    );
    expect(labels(msg.content).slice(-2)).toEqual(["Date of Call", "Cancellation Reason"]);
    expect(msg.content).toContain("Cancellation Reason: Got a job");
  });

  it("#calls-rescheduled shows both dates, and the reason only when given", () => {
    const msg = fmtBody(
      "call.rescheduled",
      {
        lead: LEAD,
        scheduled_for: "2026-11-18T15:00:00Z",
        previous_scheduled_for: "2026-11-16T20:30:00Z",
      },
      opts,
    );
    expect(msg.content).toContain("Date of Call: Wed, Nov 18, 10:00 AM EST");
    expect(msg.content).toContain("Previous Date of Call: Mon, Nov 16, 3:30 PM EST");
    expect(msg.content).not.toContain("Reason");
  });

  it("#setter-logged-call-backs when logged: no LinkedIn", () => {
    const msg = fmtBody("callback.logged", { lead: LEAD, due_at: "2026-11-16T20:30:00Z" }, opts);
    expect(labels(msg.content)).toEqual([
      "Full Name",
      "Email",
      "Phone",
      "Current salary",
      "Budget",
      "Credit",
      "Call Back (Date/Time)",
    ]);
  });

  it("#setter-logged-call-backs at the due time links the original", () => {
    const link = "https://discord.com/channels/1/2/3";
    const msg = fmtBody(
      "callback.due",
      { lead: LEAD, due_at: "2026-11-16T20:30:00Z" },
      { ...opts, extraRoleIds: ["111"], replyToUrl: link },
    );
    expect(msg.content.startsWith("CALL THEM ASAP <@&111>\n")).toBe(true);
    expect(msg.content).toContain(`↪ [Original callback](<${link}>)`);
    // The original carries the details; this one only says who to call.
    expect(msg.content).not.toContain("Budget");
  });

  it("carries the details itself when there is no original to link", () => {
    const msg = fmtBody("callback.due", { lead: LEAD, due_at: "2026-11-16T20:30:00Z" }, opts);
    expect(msg.content.startsWith("CALL THEM ASAP\n")).toBe(true);
    expect(msg.content).toContain("**Call Back (Date/Time):** Mon, Nov 16, 3:30 PM EST");
    expect(msg.content).not.toContain("↪");
  });

  it("#closer-short-term when logged, then FOLLOW UP ASAP", () => {
    const p = {
      lead: LEAD,
      closer_name: "Sam",
      requested_followup_at: "2026-11-20T17:00:00Z",
      followup_amount_pitched_cents: 500000,
      followup_reason: "Talk to spouse",
      followup_notes: "Call after 5",
    };
    const logged = fmtBody("followup.short_term_logged", p, opts);
    expect(labels(logged.content)).toEqual([
      "Full Name",
      "Email",
      "Phone",
      "Closer",
      "Due",
      "Amount pitched",
      "Reason",
      "Notes",
    ]);
    expect(logged.content).toContain("Due: Fri, Nov 20, 12:00 PM EST");
    const due = fmtBody("followup.short_term_due", p, {
      ...opts,
      replyToUrl: "https://discord.com/channels/1/2/3",
    });
    expect(due.content.startsWith("FOLLOW UP ASAP")).toBe(true);
    expect(due.content).toContain("Original follow-up");
  });

  it("puts the period on a report, since the title line is gone", () => {
    const msg = fmtBody("report.daily_sales", { period_label: "Sat, Nov 14", setters: [] }, opts);
    expect(msg.content).toContain("**Period:** Sat, Nov 14");
    expect(msg.content).not.toContain("Daily sales team report");
  });

  it("shows an EOD's date as a date, not ISO", () => {
    const msg = fmtBody(
      "setter.eod_submitted",
      { team_member_name: "Kai", activity_date: "2026-11-14", dials: 40 },
      opts,
    );
    expect(msg.content).toContain("**Date:** Sat, Nov 14");
  });
});

describe("unconfirmed-call alert schedule", () => {
  // Mon Nov 16 2026, 3:30 PM EST.
  const call = new Date("2026-11-16T20:30:00Z");
  const at = (iso: string) => new Date(iso);

  it("is 10 PM the night before, then 3 h, 2 h, 1 h and 30 min out", () => {
    const s = unconfirmedAlertSchedule(call, at("2026-11-10T12:00:00Z"), TZ);
    expect(s.map((a) => [a.n, a.at.toISOString(), a.pings.join("+")])).toEqual([
      [1, "2026-11-16T03:00:00.000Z", "setter"], // Sun 10 PM EST
      [2, "2026-11-16T17:30:00.000Z", "setter"],
      [3, "2026-11-16T18:30:00.000Z", "setter"],
      [4, "2026-11-16T19:30:00.000Z", "setter+closer"],
      [5, "2026-11-16T20:00:00.000Z", "setter+closer"],
    ]);
  });

  it("keeps 10 PM at 10 PM across a DST change", () => {
    // Mon Nov 2 2026, 3 PM EST; DST ended Sun Nov 1 at 2 AM.
    const s = unconfirmedAlertSchedule(at("2026-11-02T20:00:00Z"), null, TZ);
    expect(s[0].at.toISOString()).toBe("2026-11-02T03:00:00.000Z");
  });

  it("skips the alerts already past when a same-day call was booked", () => {
    // Booked at 1:00 PM for 3:30 PM: the night-before and 3 h alerts are
    // past; the 2 h (1:30 PM), 1 h and 30 min alerts are ahead.
    const s = unconfirmedAlertSchedule(call, at("2026-11-16T18:00:00Z"), TZ);
    expect(s.map((a) => a.n)).toEqual([3, 4, 5]);
  });

  it(`never fires within ${MIN_MINUTES_AFTER_BOOKING} minutes of the booking`, () => {
    // Booked at 2:25 PM: the 1 h alert (2:30 PM) would be five minutes later.
    const s = unconfirmedAlertSchedule(call, at("2026-11-16T19:25:00Z"), TZ);
    expect(s.map((a) => a.n)).toEqual([5]);
  });

  it("drops the night-before alert when the call is just after midnight", () => {
    // Tue 12:30 AM EST: "10 PM the night before" is after the 3 h alert.
    const s = unconfirmedAlertSchedule(at("2026-11-17T05:30:00Z"), null, TZ);
    expect(s.map((a) => a.n)).toEqual([2, 3, 4, 5]);
  });

  it("does not guess the night-before alert without a business timezone", () => {
    expect(unconfirmedAlertSchedule(call, null, "").map((a) => a.n)).toEqual([2, 3, 4, 5]);
  });

  it("fires the alert whose time has come, and not a stale one", () => {
    const booked = at("2026-11-10T12:00:00Z");
    expect(unconfirmedAlertDue(call, booked, TZ, at("2026-11-16T17:31:00Z"))?.n).toBe(2);
    expect(unconfirmedAlertDue(call, booked, TZ, at("2026-11-16T17:29:00Z"))).toBeNull();
    expect(unconfirmedAlertDue(call, booked, TZ, at("2026-11-16T18:00:00Z"))).toBeNull();
    expect(unconfirmedAlertDue(call, booked, TZ, at("2026-11-16T20:05:00Z"))?.n).toBe(5);
    expect(unconfirmedAlertDue(call, booked, TZ, at("2026-11-16T20:31:00Z"))).toBeNull();
  });
});

describe("lead card", () => {
  it("pulls LinkedIn and the money answers from the application", () => {
    const card = leadCardFrom({
      id: "L1",
      full_name: "Ada",
      application_data: {
        income: "$95-120K",
        goal: "$130-160K",
        capital: "$1,500",
        credit: "750+",
        answers_by_title: { "Your LinkedIn?": "https://linkedin.com/in/ada" },
      },
      source_platform: "instagram",
    });
    expect(card).toMatchObject({
      linkedin: "https://linkedin.com/in/ada",
      current_salary: "$95-120K",
      target_salary: "$130-160K",
      budget: "$1,500",
      credit: "750+",
      source_platform: "instagram",
    });
  });

  it("is empty, not invented, for a lead who never applied", () => {
    expect(leadCardFrom({ id: "L2" })).toMatchObject({ linkedin: null, budget: null });
  });

  it("says how a call was booked", () => {
    expect(bookedVia("calendly", null, "instagram")).toBe("Calendly · from instagram");
    expect(bookedVia(null, "Kai", null)).toBe("Set by Kai");
    expect(bookedVia(null, null, null)).toBe("");
  });
});

describe("remembering what was posted", () => {
  it("asks Discord for the created message, keeping any thread", () => {
    expect(withWait("https://discord.com/api/webhooks/1/abc")).toBe(
      "https://discord.com/api/webhooks/1/abc?wait=true",
    );
    expect(withWait("https://discord.com/api/webhooks/1/abc?thread_id=9")).toBe(
      "https://discord.com/api/webhooks/1/abc?thread_id=9&wait=true",
    );
  });

  it("keeps an earlier attempt's message when a retry posts to another channel", () => {
    const merged = mergePostedMessages(
      { a: { message_id: "m1", channel_id: "c1" } },
      {
        lookupFailed: false,
        deliveries: [
          { subscriptionId: "b", ok: true, status: 200, messageId: "m2", channelId: "c2" },
          { subscriptionId: "c", ok: false, status: 429 },
        ],
      },
    );
    expect(merged).toEqual({
      a: { message_id: "m1", channel_id: "c1" },
      b: { message_id: "m2", channel_id: "c2" },
    });
  });
});

describe("reports remodel", () => {
  const opts = { appUrl: APP, timeZone: TZ, username: "X" };

  it("#closer-post-call-notes: lead, call, money, story, follow-up", () => {
    const msg = fmtBody(
      "closer.post_call_submitted",
      {
        lead: LEAD,
        closer_name: "Sam",
        scheduled_for: "2026-11-16T20:30:00Z",
        lead_status: "Follow Up (short term)",
        offer_made: true,
        cash_collected_cents: 150000,
        call_summary: "Needs spouse.",
        requested_followup_at: "2026-11-20T17:00:00Z",
      },
      opts,
    );
    expect(labels(msg.content)).toEqual([
      "Full Name",
      "Email",
      "Phone",
      "Closer",
      "Date of Call",
      "Outcome",
      "Offer made",
      "Cash collected",
      "Call summary",
      "Follow up",
      "Also posted in",
    ]);
    expect(msg.content).toContain("Date of Call: Mon, Nov 16, 3:30 PM EST");
    expect(msg.content).toContain("Also posted in: #closer-short-term");
  });

  it("#setter-eod-reports: DM setter funnel with rates", () => {
    const msg = fmtBody(
      "setter.eod_submitted",
      {
        role: "dm_setter",
        team_member_name: "Jordan",
        activity_date: "2026-11-14",
        outbound_dms_sent: 60,
        replies: 22,
        qualified_convos: 9,
        sets: 3,
      },
      opts,
    );
    expect(msg.content.startsWith("**Rep:** Jordan (DM Setter)\n**Date:** Sat, Nov 14\n\n")).toBe(
      true,
    );
    expect(msg.content).toContain("Reply rate: 37%\nSet rate: 33%");
    expect(msg.content).toContain("(<https://ascendos-app.vercel.app/dm-setter>)");
  });

  it("#setter-eod-reports: dialer gets pickup rate", () => {
    const msg = fmtBody(
      "setter.eod_submitted",
      { role: "inbound_dialer", team_member_name: "Alex", dials: 120, connections: 30, sets: 4 },
      opts,
    );
    expect(msg.content).toContain("**Rep:** Alex (Dialer)");
    expect(msg.content).toContain("Pickup rate: 25%\nSet rate: 13%");
  });

  it("monthly sales report is a dispatched, scheduled event with its own bot", () => {
    expect(DISPATCHED_EVENT_TYPES).toContain("report.monthly_sales");
    expect(discordIdentityFor("report.monthly_sales")?.username).toBe("MONTHLY REPORT");
  });
});
