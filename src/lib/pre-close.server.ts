import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function buildPreCloseSummary(orgId: string, clientId: string): Promise<{ summary: string; raw: Record<string, unknown> } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("id, full_name, email, offer_name, lead_id")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!client) return null;

  const leadId = client.lead_id;
  const calls = leadId
    ? (await supabaseAdmin.from("calls").select("call_summary, key_moment, scheduled_for, closed").eq("org_id", orgId).eq("lead_id", leadId).limit(20)).data ?? []
    : [];
  const convos = leadId
    ? (await supabaseAdmin.from("conversations").select("id").eq("org_id", orgId).eq("lead_id", leadId).limit(10)).data ?? []
    : [];
  const convoIds = convos.map((c) => c.id);
  const messages = convoIds.length
    ? (await supabaseAdmin.from("messages").select("direction, body, sent_at").in("conversation_id", convoIds).order("sent_at", { ascending: true }).limit(100)).data ?? []
    : [];

  const callText = calls.map((c) => `- ${c.scheduled_for ?? ""} ${c.closed ? "[CLOSED] " : ""}${c.call_summary ?? ""} | KEY: ${c.key_moment ?? ""}`).join("\n");
  const dmText = messages.map((m) => `${m.direction === "in" ? "Lead" : "Setter"}: ${m.body ?? ""}`).join("\n");

  const sys = `You are a sales operations analyst. Given a prospect's DMs and call notes BEFORE they closed, write a single-paragraph pre-close summary (5-7 sentences) capturing: the trigger that started the conversation, their stated pain, key objections that came up, the moment intent shifted, and what finally got them to commit. Be specific, no fluff.`;
  const user = `Client: ${client.full_name} (${client.offer_name ?? "no offer"})\n\nCALLS:\n${callText || "(none)"}\n\nDMs:\n${dmText.slice(0, 8000) || "(none)"}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
    if (!summary) return null;
    return { summary, raw: { call_count: calls.length, message_count: messages.length, generated_at: new Date().toISOString() } };
  } catch {
    return null;
  }
}
