import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface SubRow {
  id: string;
  target_url: string;
  channel: string;
  event_types: string[] | null;
  category: string | null;
  active: boolean;
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
) {
  const { data: subs, error: subsError } = await supabaseAdmin
    .from("webhook_subscriptions")
    .select("id, target_url, channel, event_types, category, active")
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
    await supabaseAdmin.from("events").insert({
      org_id: orgId,
      event_type: "dispatch.lookup_failed",
      subject_type: "webhook_subscriptions",
      payload: { original_event_type: eventType, error: subsError.message },
    }).then(() => {}, () => {});
    console.error(`dispatchEvent: webhook_subscriptions lookup failed for org ${orgId} (event ${eventType}): ${subsError.message}`);
    return;
  }

  if (!subs?.length) return;

  const category = (payload.category ?? null) as string | null;
  const matching = (subs as unknown as SubRow[]).filter(
    (s) =>
      Array.isArray(s.event_types) &&
      s.event_types.includes(eventType) &&
      (!s.category || s.category === category),
  );
  if (!matching.length) return;

  const jsonBody = JSON.stringify({
    event_type: eventType,
    timestamp: new Date().toISOString(),
    category,
    data: payload,
  });

  await Promise.all(
    matching.map(async (s) => {
      try {
        const isDiscord = s.channel === "discord";
        const requestBody = isDiscord
          ? JSON.stringify({
              content:
                `**${eventType}**` +
                (category ? ` · \`${category}\`` : "") +
                `\n\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 1500)}\n\`\`\``,
            })
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
          .then(() => {}, () => {});
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
          .then(() => {}, () => {});
      }
    }),
  );
}

/** Map a content_piece platform to a routing category. */
export function categoryFromPlatform(platform: string | null | undefined): string {
  switch ((platform ?? "").toLowerCase()) {
    case "instagram_reel":
    case "tiktok":
    case "youtube_short":
    case "reels":
      return "reels";
    case "instagram_story":
    case "story":
      return "story";
    case "email":
    case "newsletter":
      return "email";
    case "youtube":
    case "long_form":
    case "blog":
    case "podcast":
      return "long-form";
    default:
      return "hooks";
  }
}
