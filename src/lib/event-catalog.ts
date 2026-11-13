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
    emittedBy: "api/public/{stripe,paypal,wise,whop,fanbasis}.ts",
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
    type: "payment.failed",
    label: "Payment failed",
    dispatched: false,
    emittedBy: "api/public/{stripe,paypal}.ts",
  },
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
