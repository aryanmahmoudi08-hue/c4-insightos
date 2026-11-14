import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { webhookChannelFor } from "./event-catalog";
import { formatDiscordMessage } from "./discord-format";
import type { DispatchOutcome, DeliveryResult } from "./delivery-retry";

/**
 * Base URL for "Open in AscendOS" links. APP_URL wins when set; otherwise
 * Vercel's own production domain, which it injects into every deployment.
 * Neither -> no link, rather than a guessed address.
 */
function appUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

interface SubRow {
  id: string;
  target_url: string;
  channel: string;
  event_types: string[] | null;
  category: string | null;
  active: boolean;
  mention_role_ids: string[] | null;
}

/**
 * Dispatch an event to every active webhook_subscription whose:
 *   - event_types includes the event, AND
 *   - category is NULL (catch-all) OR matches payload.category
 *
 * Discord gets a formatted message; everything else (Slack, n8n, custom) gets JSON.
 */
export async function dispatchEvent(
  orgId: string,
  eventType: string,
  payload: Record<string, unknown> & { category?: string | null },
  opts: {
    /** Retry path: deliver only to these subscriptions, which failed before. */
    onlySubscriptionIds?: string[] | null;
  } = {},
): Promise<DispatchOutcome> {
  const { data: subs, error: subsError } = await supabaseAdmin
    .from("webhook_subscriptions")
    .select("id, target_url, channel, event_types, category, active, mention_role_ids")
    .eq("org_id", orgId)
    .eq("active", true);

  // A failed lookup must never render as "no active subscriptions" — same
  // "confident output from missing data" pathology the content engine had.
  // But dispatchEvent runs as a fire-and-forget side effect of unrelated
  // primary actions (closing a call, changing a client stage, a Typeform
  // ingest) that have ALREADY succeeded and persisted by the time this runs —
  // it must never throw out to those callers, or a webhook-lookup hiccup
  // would make e.g. a closer see "failed to close call" for a call that
  // closed fine. Instead, record it somewhere genuinely visible: the `events`
  // table, which /events already renders live — never console-only.
  if (subsError) {
    await supabaseAdmin
      .from("events")
      .insert({
        org_id: orgId,
        event_type: "dispatch.lookup_failed",
        subject_type: "webhook_subscriptions",
        payload: { original_event_type: eventType, error: subsError.message },
      })
      .then(
        () => {},
        () => {},
      );
    console.error(
      `dispatchEvent: webhook_subscriptions lookup failed for org ${orgId} (event ${eventType}): ${subsError.message}`,
    );
    return { lookupFailed: true, deliveries: [] };
  }

  if (!subs?.length) return { lookupFailed: false, deliveries: [] };

  const category = (payload.category ?? null) as string | null;
  const matching = (subs as unknown as SubRow[]).filter(
    (s) =>
      Array.isArray(s.event_types) &&
      s.event_types.includes(eventType) &&
      (!s.category || s.category === category) &&
      (!opts.onlySubscriptionIds || opts.onlySubscriptionIds.includes(s.id)),
  );
  if (!matching.length) return { lookupFailed: false, deliveries: [] };

  const jsonBody = JSON.stringify({
    event_type: eventType,
    timestamp: new Date().toISOString(),
    category,
    data: payload,
  });

  // Each delivery reports how it went, so a caller that claimed the event
  // once can retry the subscriptions that failed instead of losing them.
  const deliveries: DeliveryResult[] = await Promise.all(
    matching.map(async (s): Promise<DeliveryResult> => {
      try {
        // Read the target URL, not just the stored column: subscriptions
        // created from the Event Bus page never set `channel`, so it defaulted
        // to 'slack' and every Discord delivery went out as raw JSON and 400'd.
        const isDiscord = webhookChannelFor(s.target_url, s.channel) === "discord";
        // Labelled lines built from resolved fields. The old body was the
        // payload as a JSON block, which spent its whole budget on raw
        // answers and never reached a name. See discord-format.ts.
        const requestBody = isDiscord
          ? JSON.stringify(
              formatDiscordMessage(eventType, payload, {
                appUrl: appUrl(),
                mentionRoleIds: s.mention_role_ids ?? [],
              }),
            )
          : jsonBody;

        const res = await fetch(s.target_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        const respText = await res.text().catch(() => "");
        await supabaseAdmin
          .from("webhook_deliveries")
          .insert({
            subscription_id: s.id,
            org_id: orgId,
            status: res.ok ? "success" : "failed",
            response_code: res.status,
            response_body: respText.slice(0, 1000),
            delivered_at: new Date().toISOString(),
          })
          .then(
            () => {},
            () => {},
          );
        return { subscriptionId: s.id, ok: res.ok, status: res.status };
      } catch (err) {
        await supabaseAdmin
          .from("webhook_deliveries")
          .insert({
            subscription_id: s.id,
            org_id: orgId,
            status: "failed",
            response_code: 0,
            response_body: String(err).slice(0, 1000),
          })
          .then(
            () => {},
            () => {},
          );
        // Status 0: the request never got a response (network, DNS, timeout).
        return { subscriptionId: s.id, ok: false, status: 0 };
      }
    }),
  );
  return { lookupFailed: false, deliveries };
}

/** Moved to content-events.ts (pure, testable); re-exported for callers. */
export { categoryFromPlatform } from "./content-events";
