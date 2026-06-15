import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface Insight { title: string; body: string; recommendation: string }
interface Result {
  bottlenecks: Insight[];
  double_down: Insight[];
  priority_leads: { name: string; reason: string }[];
  sampleSize: number;
}

async function callGemini(sys: string, userMsg: string): Promise<Result> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("Rate limit — try again shortly");
    if (res.status === 402) throw new Error("AI credits exhausted");
    throw new Error(`AI Gateway [${res.status}]: ${txt.slice(0, 160)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
}

export const analyzeLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("leads")
      .select("full_name, status, pipeline_stage, priority, application_data, qualification_notes, intent_score, estimated_close_probability, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: leads, error } = await q;
    if (error) throw new Error(error.message);
    if (!leads || leads.length === 0) {
      return { bottlenecks: [], double_down: [], priority_leads: [], sampleSize: 0 };
    }
    const sys = `You are a sales pipeline strategist. Analyze leads and surface:
- "bottlenecks": top 3 friction points slowing closes (look at status distribution, objections, unqualified patterns).
- "double_down": top 3 winning patterns (sources, application answers, beliefs, content types tied to closes/deposits).
- "priority_leads": up to 5 hottest leads worth chasing today (high intent, qualified, recent, not yet closed).
Respond as JSON: {"bottlenecks":[{"title","body","recommendation"}],"double_down":[...],"priority_leads":[{"name","reason"}]}.
Be concrete, reference real patterns from the data. Keep bodies under 25 words.`;
    const userMsg = JSON.stringify({ count: leads.length, leads: leads.slice(0, 200) });
    const out = await callGemini(sys, userMsg);
    return { ...out, sampleSize: leads.length };
  });
