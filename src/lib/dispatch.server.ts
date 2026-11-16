import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { discordIdentityFor, webhookChannelFor, withWait } from "./event-catalog";
import { formatDiscordMessage } from "./discord-format";
import type { DispatchOutcome, DeliveryResult } from "./delivery-retry";

// scheduled_event_fires.delivered_messages and the bot_* columns are ahead of
// the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = supabaseAdmin as any;

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
  bot_name: string | null;
  bot_avatar_url: string | null;
}

type PostedMessage = { message_id: string; channel_id: string | null; guild_id?: string | null };

/**
 * The Discord link to the message an earlier fire posted, for the
 * subscription about to post now — its own message when it posted one,
 * otherwise any message that fire left. Webhooks cannot send a native reply,
 * so the follow-up links the original instead.
 *
 * The webhook's execute response has no guild id, and a message link needs
 * one, so it is read from the webhook itself (GET on the webhook URL, which
 * returns its guild and channel) and only when a link is actually built.
 */
async function replyLinkResolver(orgId: string, replyTo: unknown) {
  const ref = (replyTo ?? null) as { event_type?: string; fire_key?: string } | null;
  if (!ref?.event_type || !ref.fire_key) return async () => null;
  const { data } = await untyped
    .from("scheduled_event_fires")
    .select("delivered_messages")
    .eq("org_id", orgId)
    .eq("event_type", ref.event_type)
    .eq("fire_key", ref.fire_key)
    .maybeSingle();
  const posted = (data?.delivered_messages ?? {}) as Record<string, PostedMessage>;
  const entries = Object.entries(posted).filter(([, m]) => m?.message_id);
  if (!entries.length) return async () => null;

  const { data: subs } = await supabaseAdmin
    .from("webhook_subscriptions")
    .select("id, target_url")
    .in(
      "id",
      entries.map(([id]) => id),
    );
  const urlOf = new Map(
    ((subs ?? []) as Array<{ id: string; target_url: string }>).map((r) => [r.id, r.target_url]),
  );
  const guildCache = new Map<string, Promise<string | null>>();
  const guildOf = (subId: string, known?: string | null) => {
    if (known) return Promise.resolve(known);
    const url = urlOf.get(subId);
    if (!url) return Promise.resolve(null);
    if (!guildCache.has(url))
      guildCache.set(
        url,
        fetch(url)
          .then((r) => (r.ok ? r.json() : null))
          .then((w: { guild_id?: string } | null) => w?.guild_id ?? null)
          .catch(() => null),
      );
    return guildCache.get(url)!;
  };

  return async (subscriptionId: string): Promise<string | null> => {
    const [subId, msg] = entries.find(([id]) => id === subscriptionId) ?? entries[0];
    if (!msg.channel_id) return null;
    const guild = await guildOf(subId, msg.guild_id);
    return guild
      ? `https://discord.com/channels/${guild}/${msg.channel_id}/${msg.message_id}`
      : null;
  };
}

/** Saves the Discord link of a lead's application post on the lead. The
 *  webhook's execute response has no guild id, so it is read from the
 *  webhook itself (GET on its URL), as replyLinkResolver does. */
async function saveApplicationMessageUrl(
  payload: Record<string, unknown>,
  subs: SubRow[],
  deliveries: DeliveryResult[],
) {
  const lead = (payload.lead ?? {}) as { id?: string | null };
  const leadId = lead.id ?? (payload.lead_id as string | undefined) ?? null;
  if (!leadId) return;
  const posted = deliveries.find((d) => d.ok && d.messageId && d.channelId);
  if (!posted) return;
  const sub = subs.find((s) => s.id === posted.subscriptionId);
  if (!sub) return;
  const hook = (await fetch(sub.target_url.split("?")[0])
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)) as { guild_id?: string } | null;
  if (!hook?.guild_id) return;
  await untyped
    .from("leads")
    .update({
      application_message_url: `https://discord.com/channels/${hook.guild_id}/${posted.channelId}/${posted.messageId}`,
    })
    .eq("id", leadId);
}

/** The message id an earlier fire posted for each subscription, for an
 *  edit-in-place update. Null for a subscription that has no such message
 *  (it was added later, or that post failed) — that one posts fresh. */
async function editTargetResolver(orgId: string, editOf: unknown) {
  const ref = (editOf ?? null) as { event_type?: string; fire_key?: string } | null;
  if (!ref?.event_type || !ref.fire_key) return (_: string) => null;
  const { data } = await untyped
    .from("scheduled_event_fires")
    .select("delivered_messages")
    .eq("org_id", orgId)
    .eq("event_type", ref.event_type)
    .eq("fire_key", ref.fire_key)
    .maybeSingle();
  const posted = (data?.delivered_messages ?? {}) as Record<string, PostedMessage>;
  return (subscriptionId: string) => posted[subscriptionId]?.message_id ?? null;
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
  const { data: subs, error: subsError } = await untyped
    .from("webhook_subscriptions")
    .select(
      "id, target_url, channel, event_types, category, active, mention_role_ids, bot_name, bot_avatar_url",
    )
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

  // Pings the message decides itself (resolved from the workspace's role
  // settings when it was fired), and the earlier message it follows up on.
  const extraRoleIds = Array.isArray(payload.ping_role_ids)
    ? (payload.ping_role_ids as unknown[]).map(String)
    : [];
  const replyLinkFor = await replyLinkResolver(orgId, payload.reply_to).catch(
    () => async () => null,
  );
  // An update to a message posted earlier (#pre-call-assets ticking off):
  // edit that message in place rather than posting a new one.
  const editTargetFor = await editTargetResolver(orgId, payload.edit_of).catch(
    () => (_: string) => null,
  );

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
        const identity = isDiscord ? discordIdentityFor(eventType, s) : null;
        const requestBody = isDiscord
          ? JSON.stringify(
              formatDiscordMessage(eventType, payload, {
                appUrl: appUrl(),
                mentionRoleIds: s.mention_role_ids ?? [],
                extraRoleIds,
                username: identity?.username ?? null,
                avatarUrl: identity?.avatar_url || null,
                replyToUrl: await replyLinkFor(s.id),
              }),
            )
          : jsonBody;

        const editId = isDiscord ? editTargetFor(s.id) : null;
        const base = s.target_url.split("?")[0];
        const res = await fetch(
          editId
            ? withWait(`${base}/messages/${editId}`)
            : isDiscord
              ? withWait(s.target_url)
              : s.target_url,
          {
            method: editId ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          },
        );
        const respText = await res.text().catch(() => "");
        let posted: { messageId: string; channelId: string | null } | null = null;
        if (isDiscord && res.ok) {
          try {
            const m = JSON.parse(respText) as { id?: string; channel_id?: string };
            if (m.id) posted = { messageId: m.id, channelId: m.channel_id ?? null };
          } catch {
            posted = null;
          }
        }
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
        return {
          subscriptionId: s.id,
          ok: res.ok,
          status: res.status,
          ...(posted ?? {}),
        };
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
  // Remember where the application posted, so every later message about this
  // lead can link back to it ("View application").
  if (eventType === "lead.application_submitted") {
    await saveApplicationMessageUrl(payload, matching, deliveries).catch((err) =>
      console.error("saveApplicationMessageUrl:", err),
    );
  }
  return { lookupFailed: false, deliveries };
}

/** Moved to content-events.ts (pure, testable); re-exported for callers. */
export { categoryFromPlatform } from "./content-events";
