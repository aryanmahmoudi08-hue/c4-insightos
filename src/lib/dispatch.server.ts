import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function dispatchEvent(orgId: string, eventType: string, payload: Record<string, unknown>) {
  const { data: subs } = await supabaseAdmin
    .from("webhook_subscriptions")
    .select("id, target_url, channel, event_types, active")
    .eq("org_id", orgId)
    .eq("active", true);

  if (!subs?.length) return;

  const body = JSON.stringify({ event_type: eventType, timestamp: new Date().toISOString(), data: payload });

  await Promise.all(
    subs
      .filter((s: any) => Array.isArray(s.event_types) && s.event_types.includes(eventType))
      .map(async (s: any) => {
        try {
          // Discord expects {content}, everything else gets the structured payload
          const isDiscord = s.channel === "discord";
          const requestBody = isDiscord
            ? JSON.stringify({ content: `**${eventType}**\n\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 1500)}\n\`\`\`` })
            : body;

          const res = await fetch(s.target_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody,
          });

          await supabaseAdmin.from("webhook_deliveries").insert({
            subscription_id: s.id,
            event_type: eventType,
            status_code: res.status,
            success: res.ok,
            payload: { event_type: eventType, data: payload },
          }).then(() => {}, () => {});
        } catch (err) {
          await supabaseAdmin.from("webhook_deliveries").insert({
            subscription_id: s.id,
            event_type: eventType,
            status_code: 0,
            success: false,
            payload: { event_type: eventType, data: payload, error: String(err) },
          }).then(() => {}, () => {});
        }
      }),
  );
}
