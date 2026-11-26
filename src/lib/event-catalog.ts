/**
 * What the event bus actually emits, and how to show a webhook target safely.
 *
 * ## Why this file exists
 *
 * The event type list lived in two places that disagreed with each other and
 * with the code: `_authenticated.events.tsx` offered 14 types and
 * `webhook-channels.tsx` offered 5. Neither was derived from anything — both
 * were hand-written aspirational lists, so between them they advertised nine
 * event types that no code anywhere emits (`lead.status_changed`,
 * `conversation.started`, `call.booked`, `call.showed`, `call.closed_lost`,
 * `content.posted`, `content.milestone_10k`, `alert.fired`,
 * `client.renewed`) while omitting five that really do fire.
 *
 * Subscribing to one of the invented types is worse than an error message: the
 * subscription saves, reports itself Active, and then stays silent forever,
 * with nothing on the page to suggest the type was never real.
 *
 * So this list is built from the emit sites, and the file names them. A new
 * event type is added here in the same change that starts emitting it.
 *
 * ## `dispatched` is the load-bearing field
 *
 * Only `dispatchEvent()` (src/lib/dispatch.server.ts) matches an event against
 * `webhook_subscriptions` and delivers it. Several types are written to the
 * `events` table and never dispatched — they show in the live stream on
 * /events but cannot reach a webhook. A subscription to one of those is as
 * silent as a subscription to an invented type, so the two groups have to be
 * told apart in the UI rather than merged into one "available" list.
 */

export type EventCatalogEntry = {
  type: string;
  /** Plain-language name, for a reader who did not write the emit site. */
  label: string;
  /** True when `dispatchEvent` carries it, i.e. a subscription can receive it. */
  dispatched: boolean;
  /** Where it comes from, so this list can be checked against the code. */
  emittedBy: string;
};

/** Events `dispatchEvent` delivers to matching subscriptions. */
export const DISPATCHED_EVENTS: EventCatalogEntry[] = [
  {
    type: "lead.created",
    label: "Lead created",
    dispatched: true,
    emittedBy: "dispatch.functions.ts",
  },
  {
    type: "lead.qualified",
    label: "Lead qualified",
    dispatched: true,
    emittedBy: "dispatch.functions.ts",
  },
  {
    type: "lead.application_submitted",
    label: "Application submitted",
    dispatched: true,
    emittedBy: "api/public/typeform.ts",
  },
  {
    type: "onboarding.submitted",
    label: "Onboarding form submitted",
    dispatched: true,
    emittedBy: "api/public/typeform.ts, onboarding.tsx",
  },
  {
    type: "call.closed_won",
    label: "Call closed won",
    dispatched: true,
    emittedBy: "dispatch.functions.ts",
  },
  {
    type: "payment.collected",
    label: "Payment collected",
    dispatched: true,
    emittedBy: "payment-events.server.ts (stripe, paypal, wise, whop, fanbasis)",
  },
  {
    type: "payment.failed",
    label: "Payment failed",
    dispatched: true,
    emittedBy: "payment-events.server.ts (stripe, paypal, whop, fanbasis; Wise sends no failures)",
  },
  {
    type: "payment.refunded",
    label: "Payment refunded",
    dispatched: true,
    emittedBy: "refund-dispute-events.server.ts (whop, stripe, paypal, fanbasis, ingest)",
  },
  {
    type: "payment.disputed",
    label: "Payment disputed (chargeback opened)",
    dispatched: true,
    emittedBy: "refund-dispute-events.server.ts (whop, stripe, paypal, fanbasis, ingest)",
  },
  {
    type: "payment.dispute_resolved",
    label: "Dispute resolved (won/lost)",
    dispatched: true,
    emittedBy: "refund-dispute-events.server.ts (whop, stripe, paypal, fanbasis)",
  },
  {
    type: "client.stage_changed",
    label: "Client stage changed",
    dispatched: true,
    emittedBy: "client-events.functions.ts",
  },
  {
    type: "content.ready_to_post",
    label: "Content ready to post",
    dispatched: true,
    emittedBy: "dispatch.functions.ts",
  },
  {
    type: "digest.weekly",
    label: "Weekly digest",
    dispatched: true,
    emittedBy: "weekly-report.server.ts",
  },
  {
    type: "call.booked",
    label: "Call booked",
    dispatched: true,
    emittedBy: "api/public/calendly.ts (invitee.created, not a reschedule)",
  },
  {
    type: "call.cancelled",
    label: "Call cancelled",
    dispatched: true,
    emittedBy: "api/public/calendly.ts (invitee.canceled, not a reschedule)",
  },
  {
    type: "call.rescheduled",
    label: "Call rescheduled",
    dispatched: true,
    emittedBy: "api/public/calendly.ts (invitee.created replacing an earlier booking)",
  },
  {
    type: "call.confirmed",
    label: "Call confirmed",
    dispatched: true,
    emittedBy: "event-emitters.server.ts (the configured touchpoint is ticked)",
  },
  {
    type: "call.unconfirmed",
    label: "Call not confirmed by its deadline",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "closer.post_call_submitted",
    label: "Closer post-call notes submitted",
    dispatched: true,
    emittedBy: "event-emitters.server.ts",
  },
  {
    type: "setter.eod_submitted",
    label: "Setter EOD report submitted",
    dispatched: true,
    emittedBy: "event-emitters.server.ts",
  },
  {
    type: "callback.logged",
    label: "Dialer callback logged",
    dispatched: true,
    emittedBy: "scheduler.server.ts (within a minute of the callback being saved)",
  },
  {
    type: "followup.short_term_logged",
    label: "Short-term follow-up logged",
    dispatched: true,
    emittedBy: "event-emitters.server.ts (closer post-call form)",
  },
  {
    type: "followup.long_term_logged",
    label: "Long-term follow-up logged",
    dispatched: true,
    emittedBy: "event-emitters.server.ts (closer post-call form)",
  },
  {
    type: "callback.due",
    label: "Dialer callback due",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "followup.short_term_due",
    label: "Short-term follow-up due",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "followup.long_term_due",
    label: "Long-term follow-up due",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.daily_sales",
    label: "Daily sales team report",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.weekly_sales",
    label: "Weekly sales team report",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.monthly_sales",
    label: "Monthly sales team report",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "lead.applied_not_booked",
    label: "Applied but didn't book",
    dispatched: true,
    emittedBy: "scheduler-ops.server.ts",
  },
  {
    type: "eod.missing",
    label: "EOD not filed (one per rep)",
    dispatched: true,
    emittedBy: "scheduler-ops.server.ts",
  },
  {
    type: "calls.today",
    label: "Today's calls on the calendar",
    dispatched: true,
    emittedBy: "scheduler-ops.server.ts",
  },
  {
    type: "payment.followup_logged",
    label: "Payment follow-up logged",
    dispatched: true,
    emittedBy: "event-emitters.server.ts (closer post-call)",
  },
  {
    type: "payment.followup_due",
    label: "Payment follow-up due",
    dispatched: true,
    emittedBy: "scheduler-ops.server.ts",
  },
  {
    type: "precall.progress",
    label: "Pre-call assets opened",
    dispatched: true,
    emittedBy: "scheduler-ops.server.ts",
  },
  {
    type: "content.ready_to_post.short_form",
    label: "Short-form ready to post",
    dispatched: true,
    emittedBy: "dispatch.functions.ts (reel, TikTok, Short, story, ad creative)",
  },
  {
    type: "content.ready_to_post.long_form",
    label: "Long-form ready to post",
    dispatched: true,
    emittedBy: "dispatch.functions.ts (YouTube, VSL)",
  },
  {
    type: "content.schedule_daily",
    label: "Today's content schedule",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.top_sources_daily",
    label: "Daily top content sources",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.top_sources_weekly",
    label: "Weekly top content sources",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
  {
    type: "report.top_sources_monthly",
    label: "Monthly top content sources",
    dispatched: true,
    emittedBy: "scheduler.server.ts",
  },
];

/**
 * Events written to the `events` table but never passed to `dispatchEvent`.
 *
 * They are listed so the page can say so plainly. Showing them as subscribable
 * would recreate the original bug in a new place; hiding them entirely would
 * leave a reader who saw one in the live stream with no explanation of why
 * subscribing to it does nothing.
 */
export const STREAM_ONLY_EVENTS: EventCatalogEntry[] = [
  {
    type: "team_member.added",
    label: "Team member added",
    dispatched: false,
    emittedBy: "team-roster-panel.tsx",
  },
  {
    type: "team_member.role_changed",
    label: "Team member role changed",
    dispatched: false,
    emittedBy: "team-roster-panel.tsx",
  },
  {
    type: "connector.verified",
    label: "Connector verified",
    dispatched: false,
    emittedBy: "connectors.functions.ts",
  },
  {
    type: "dispatch.lookup_failed",
    label: "Webhook lookup failed",
    dispatched: false,
    emittedBy: "dispatch.server.ts",
  },
];

export const EVENT_CATALOG: EventCatalogEntry[] = [...DISPATCHED_EVENTS, ...STREAM_ONLY_EVENTS];

/** The types a subscription can usefully name. */
export const DISPATCHED_EVENT_TYPES = DISPATCHED_EVENTS.map((e) => e.type);

const BY_TYPE = new Map(EVENT_CATALOG.map((e) => [e.type, e]));

export function eventCatalogEntry(type: string): EventCatalogEntry | null {
  return BY_TYPE.get(type) ?? null;
}

/**
 * The event types on a subscription that cannot ever be delivered: either not
 * in the catalogue at all, or stream-only.
 *
 * This is what lets a saved subscription admit it is silent instead of
 * reporting itself Active and leaving the reader to wonder.
 */
export function undeliverableEventTypes(types: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(types)) return [];
  return types.filter((t) => {
    const entry = BY_TYPE.get(t);
    return !entry || !entry.dispatched;
  });
}

/* ------------------------------------------------------------------ */
/* Who a Discord message posts as                                      */
/* ------------------------------------------------------------------ */

/** Twemoji 15.1 PNG for a codepoint, e.g. "1f4dd" → 📝. */
export const twemojiUrl = (code: string) =>
  `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/${code}.png`;

/**
 * The bot name and icon each event posts under in Discord, per the channel
 * spec (CareerAiAccelerator/06-ops/discord-rework-spec.md). The name says
 * what the message is, which is why the messages carry no title line.
 *
 * A subscription's own bot_name / bot_avatar_url override these.
 */
export const DISCORD_BOT_IDENTITIES: Record<string, { name: string; emoji: string }> = {
  "lead.application_submitted": { name: "NEW APPLICANT", emoji: "1f4dd" },
  "call.booked": { name: "CALL BOOKED", emoji: "1f4c5" },
  "call.confirmed": { name: "CALL CONFIRMED", emoji: "2705" },
  "call.unconfirmed": { name: "UNCONFIRMED CALL", emoji: "26a0" },
  "call.cancelled": { name: "CALL CANCELLED", emoji: "274c" },
  "call.rescheduled": { name: "CALL RESCHEDULED", emoji: "1f504" },
  "callback.logged": { name: "CALL BACK", emoji: "1f4de" },
  "callback.due": { name: "CALL BACK", emoji: "1f4de" },
  "followup.long_term_logged": { name: "LONG-TERM FOLLOW-UP", emoji: "1f5d3" },
  "followup.long_term_due": { name: "LONG-TERM FOLLOW-UP", emoji: "1f5d3" },
  "followup.short_term_logged": { name: "SHORT-TERM FOLLOW-UP", emoji: "23f0" },
  "followup.short_term_due": { name: "SHORT-TERM FOLLOW-UP", emoji: "23f0" },
  "payment.collected": { name: "NEW PAYMENT", emoji: "1f4b0" },
  "payment.failed": { name: "PAYMENT FAILED", emoji: "1f6a8" },
  "payment.refunded": { name: "REFUND", emoji: "1f4b8" },
  "payment.disputed": { name: "DISPUTE", emoji: "2696" },
  "payment.dispute_resolved": { name: "DISPUTE UPDATE", emoji: "2696" },
  "closer.post_call_submitted": { name: "POST-CALL NOTES", emoji: "1f5d2" },
  "setter.eod_submitted": { name: "SETTER EOD", emoji: "1f4cb" },
  "report.daily_sales": { name: "DAILY REPORT", emoji: "1f4ca" },
  "report.weekly_sales": { name: "WEEKLY REPORT", emoji: "1f4c8" },
  "report.monthly_sales": { name: "MONTHLY REPORT", emoji: "1f5c2" },
  "lead.applied_not_booked": { name: "APPLIED NOT BOOKED", emoji: "1f552" },
  "eod.missing": { name: "EOD NO-SHOW", emoji: "1f6ab" },
  "calls.today": { name: "TODAY'S CALLS", emoji: "260e" },
  "payment.followup_logged": { name: "PAYMENT FOLLOW-UP", emoji: "1f4b3" },
  "payment.followup_due": { name: "PAYMENT FOLLOW-UP", emoji: "1f4b3" },
  "precall.progress": { name: "PRE-CALL ASSETS", emoji: "1f3af" },
  "content.schedule_daily": { name: "CONTENT SCHEDULE", emoji: "1f4c6" },
  "content.ready_to_post.short_form": { name: "SHORT-FORM READY", emoji: "1f3ac" },
  "content.ready_to_post.long_form": { name: "LONG-FORM READY", emoji: "1f3a5" },
  "report.top_sources_daily": { name: "DAILY TOP SOURCES", emoji: "1f3c6" },
  "report.top_sources_weekly": { name: "WEEKLY TOP SOURCES", emoji: "1f3c6" },
  "report.top_sources_monthly": { name: "MONTHLY TOP SOURCES", emoji: "1f3c6" },
};

/**
 * The name and icon to post `eventType` under: the subscription's own when
 * set, otherwise the event's default, otherwise none (Discord then uses the
 * webhook's configured name, and the message keeps its title line).
 */
export function discordIdentityFor(
  eventType: string,
  override?: { bot_name?: string | null; bot_avatar_url?: string | null } | null,
): { username: string; avatar_url: string } | null {
  const def = DISCORD_BOT_IDENTITIES[eventType];
  // Discord rejects usernames over 80 characters or containing "discord".
  const name = (override?.bot_name ?? "").trim().slice(0, 80) || def?.name || "";
  if (!name || /discord/i.test(name)) return null;
  const avatar = (override?.bot_avatar_url ?? "").trim() || (def ? twemojiUrl(def.emoji) : "");
  return { username: name, avatar_url: avatar };
}

/* ------------------------------------------------------------------ */
/* Showing a webhook target without leaking it                         */
/* ------------------------------------------------------------------ */

/**
 * A webhook URL's path is the credential, not an address.
 *
 * `https://discord.com/api/webhooks/<id>/<token>` is all anyone needs to post
 * into that channel as this app — there is no second factor, no secret header,
 * nothing. Slack and n8n are the same shape. Rendering it in full put a
 * working credential on a screen that gets shared and screenshotted, so the
 * host is kept (it is what tells you which service a row points at) and
 * everything after it is replaced.
 *
 * The last four characters stay, which is not enough of a long opaque token to
 * be useful to anyone but is enough to tell two rows apart when their names
 * are similar. Below nine characters of path even that is withheld, since a
 * short path can be most of a short secret.
 */
export function maskWebhookUrl(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "No target URL";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Not a URL at all. Say so rather than printing whatever is stored, which
    // may still be a secret pasted into the wrong field.
    return "Unreadable target URL";
  }

  const tail = `${url.pathname}${url.search}`.replace(/^\/+/, "");
  if (!tail) return url.host;
  if (tail.length < 9) return `${url.host}/…`;
  return `${url.host}/…${tail.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Which wire format a target expects                                  */
/* ------------------------------------------------------------------ */

/**
 * Discord rejects a plain JSON body — it wants `{ content: ... }` — so
 * `dispatchEvent` formats for it. That formatting is gated on the
 * subscription's `channel` column, and the Event Bus "Add" dialog never set
 * `channel`: it inserts name, target_url, signing_secret, event_types and
 * active, so the column fell to its `'slack'` default. Every subscription
 * created from that page therefore POSTed raw JSON at Discord and got a 400
 * on every single event, with the delivery log showing failures and nothing
 * saying why.
 *
 * The target URL already says what it is, so read it rather than relying on a
 * column someone has to remember to set. A stored channel still wins when the
 * URL is not recognisable, so an explicitly configured Slack or n8n target is
 * unaffected — and this repairs rows that were already saved with the wrong
 * channel, without a migration.
 */
export function webhookChannelFor(
  targetUrl: string | null | undefined,
  storedChannel?: string | null,
): string {
  const value = (targetUrl ?? "").trim();
  if (value) {
    let host = "";
    let path = "";
    try {
      const url = new URL(value);
      host = url.host.toLowerCase();
      path = url.pathname.toLowerCase();
    } catch {
      host = "";
    }
    // discord.com and discordapp.com both serve webhooks, and both appear
    // with and without a `ptb.`/`canary.` subdomain.
    if (/(^|\.)(discord|discordapp)\.com$/.test(host) && path.includes("/api/webhooks/")) {
      return "discord";
    }
    if (host === "hooks.slack.com") return "slack";
  }
  return (storedChannel ?? "").trim() || "slack";
}

/** A Discord webhook URL with `wait=true`, so Discord answers with the
 *  message it created (its id is what a later "reply" links to) instead of
 *  an empty 204. Keeps any query already there, e.g. `thread_id`. */
export function withWait(targetUrl: string): string {
  try {
    const u = new URL(targetUrl);
    u.searchParams.set("wait", "true");
    return u.toString();
  } catch {
    return targetUrl;
  }
}
