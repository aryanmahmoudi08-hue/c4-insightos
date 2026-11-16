import { describe, expect, it } from "vitest";
import { formatDiscordMessage, MESSAGE_SPACER } from "./discord-format";
import { discordIdentityFor, DISPATCHED_EVENT_TYPES } from "./event-catalog";
import { rsvpFor } from "./google-calendar";
import { needsPaymentFollowUp } from "./eod-reports";

const o = { appUrl: "https://app", timeZone: "America/New_York", username: "X" };
const lead = { id: "L1", full_name: "Jane Doe", email: "jane@x.com", phone: "+1555" };

describe("ops channels", () => {
  it("every new event is dispatched and has its own bot", () => {
    for (const t of [
      "lead.applied_not_booked",
      "eod.missing",
      "calls.today",
      "payment.followup_logged",
      "payment.followup_due",
      "precall.progress",
    ]) {
      expect(DISPATCHED_EVENT_TYPES).toContain(t);
      expect(discordIdentityFor(t)?.username).toBeTruthy();
    }
  });

  it("every message ends with a spacer line", () => {
    const m = formatDiscordMessage("call.booked", { lead }, o);
    expect(m.content.endsWith(MESSAGE_SPACER)).toBe(true);
  });

  it("#todays-calls tags reps and allows exactly those user mentions", () => {
    const m = formatDiscordMessage(
      "calls.today",
      {
        date_label: "Mon, Nov 16",
        calls: [
          {
            time: "2026-11-16T15:00:00Z",
            lead_name: "Jane",
            setter: "<@111>",
            closer: "<@222>",
            confirmed: true,
          },
        ],
        mention_user_ids: ["111", "222"],
      },
      o,
    );
    expect(m.content).toContain("**10:00 AM EST · Jane** ✅ Confirmed");
    expect(m.content).toContain("Setter: <@111> · Closer: <@222>");
    expect(m.allowed_mentions.users).toEqual(["111", "222"]);
  });

  it("#pre-call-assets shows a tick per opened asset", () => {
    const m = formatDiscordMessage(
      "precall.progress",
      {
        lead,
        assets: [
          { label: "A", done: true },
          { label: "B", done: false },
          { label: "C", done: false },
        ],
      },
      o,
    );
    expect(m.content).toContain("**Progress:** ✅❌❌ (1/3)");
  });

  it("COLLECT PAYMENT ASAP leads the due message", () => {
    const m = formatDiscordMessage(
      "payment.followup_due",
      { lead, payment_followup_amount_cents: 450000 },
      { ...o, extraRoleIds: ["222"], replyToUrl: "https://discord.com/channels/1/2/3" },
    );
    expect(m.content.startsWith("COLLECT PAYMENT ASAP <@&222>\n")).toBe(true);
    expect(m.content).toContain("**Amount due:** $4,500");
  });

  it("a collected payment says which payment it is", () => {
    const m = formatDiscordMessage(
      "payment.collected",
      {
        lead,
        amount_cents: 150000,
        product: "Group",
        prior_successful_payments: 1,
        plan_progress: "2/4 paid",
      },
      o,
    );
    expect(m.content).toContain("Product: Group");
    expect(m.content).toContain("Payment #: 2 of 4");
  });

  it("payment follow-up questions show for a deposit or a payment plan", () => {
    expect(needsPaymentFollowUp({ status: "Deposit" })).toBe(true);
    expect(needsPaymentFollowUp({ status: "Closed", payment_plan: true })).toBe(true);
    expect(needsPaymentFollowUp({ status: "Closed", payment_plan: false })).toBe(false);
  });
});

describe("google calendar rsvp", () => {
  const events = [
    {
      id: "e1",
      start: { dateTime: "2026-11-16T15:00:00-05:00" },
      attendees: [{ email: "Jane@X.com", responseStatus: "accepted" }],
    },
    {
      id: "e2",
      start: { dateTime: "2026-11-16T17:00:00Z" },
      attendees: [{ email: "bob@x.com", responseStatus: "needsAction" }],
    },
  ];
  it("matches the event by start minute and the lead's email", () => {
    expect(
      rsvpFor(events, { scheduled_for: "2026-11-16T20:00:00Z", lead_email: "jane@x.com" }),
    ).toEqual({
      eventId: "e1",
      status: "accepted",
    });
    expect(
      rsvpFor(events, { scheduled_for: "2026-11-16T17:00:00Z", lead_email: "bob@x.com" })?.status,
    ).toBe("needsAction");
    expect(
      rsvpFor(events, { scheduled_for: "2026-11-16T18:00:00Z", lead_email: "jane@x.com" }),
    ).toBeNull();
  });
});

describe("lead links and payment detail", () => {
  const o2 = { appUrl: "https://app", timeZone: "America/New_York", username: "X" };
  const withApp = { ...lead, application_message_url: "https://discord.com/channels/1/2/3" };

  it("lead messages link to the lead's application post", () => {
    const m = formatDiscordMessage("call.booked", { lead: withApp }, o2);
    expect(m.content).toContain("[📝 View 1on1 application](<https://discord.com/channels/1/2/3>)");
  });

  it("the application post doesn't link to itself", () => {
    const m = formatDiscordMessage("lead.application_submitted", { lead: withApp }, o2);
    expect(m.content).not.toContain("View 1on1 application");
  });

  it("a payment shows cash, revenue, what's collected so far, closer and setter", () => {
    const m = formatDiscordMessage(
      "payment.collected",
      {
        lead,
        amount_cents: 250000,
        amount_usd_cents: 250000,
        product: "Inner Circle / VIP Career Mentorship",
        revenue_cents: 500000,
        collected_to_date_cents: 250000,
        closer_name: "Sam",
        setter_name: "Jordan",
        prior_successful_payments: 0,
      },
      o2,
    );
    expect(m.content).toContain(
      "Cash collected: $2,500\nRevenue: $5,000\nCollected to date: $2,500 of $5,000",
    );
    expect(m.content).toContain("Closer: Sam\nSetter: Jordan");
  });
});
