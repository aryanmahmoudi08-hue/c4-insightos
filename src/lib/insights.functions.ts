import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface MetricsSnapshot {
  cash: number;
  newLeads: number;
  totalCalls: number;
  showed: number;
  closed: number;
  views: number;
  contentLeads: number;
  avgHookRetention: number;
  topCloser?: { name: string; cash: number };
}

async function gatherMetrics(supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : any, orgId: string): Promise<MetricsSnapshot> {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const sinceDate = since.slice(0, 10);
  const [pays, leads, calls, content, activity] = await Promise.all([
    supabase.from("payments").select("amount_cents").eq("org_id", orgId).gte("collected_at", since),
    supabase.from("leads").select("id").eq("org_id", orgId).gte("created_at", since),
    supabase.from("calls").select("showed, closed, cash_collected_cents, closer_name").eq("org_id", orgId).gte("created_at", since),
    supabase.from("content_metrics").select("views, leads_generated, hook_retention_pct").eq("org_id", orgId).gte("captured_at", since),
    supabase.from("setter_activity").select("team_member_name, cash_collected_cents").eq("org_id", orgId).gte("activity_date", sinceDate),
  ]);
  const cash = (pays.data ?? []).reduce((s: number, p: { amount_cents: number | null }) => s + (p.amount_cents ?? 0), 0);
  const callList = calls.data ?? [];
  const contentList = content.data ?? [];

  const closerMap = new Map<string, number>();
  for (const c of callList) {
    if (!c.closer_name) continue;
    closerMap.set(c.closer_name, (closerMap.get(c.closer_name) ?? 0) + (c.cash_collected_cents ?? 0));
  }
  const topCloser = Array.from(closerMap.entries()).sort((a, b) => b[1] - a[1])[0];

  return {
    cash,
    newLeads: leads.data?.length ?? 0,
    totalCalls: callList.length,
    showed: callList.filter((c: { showed: boolean | null }) => c.showed).length,
    closed: callList.filter((c: { closed: boolean | null }) => c.closed).length,
    views: contentList.reduce((s: number, m: { views: number | null }) => s + (m.views ?? 0), 0),
    contentLeads: contentList.reduce((s: number, m: { leads_generated: number | null }) => s + (m.leads_generated ?? 0), 0),
    avgHookRetention: contentList.length
      ? contentList.reduce((s: number, m: { hook_retention_pct: number | null }) => s + Number(m.hook_retention_pct ?? 0), 0) / contentList.length
      : 0,
    topCloser: topCloser ? { name: topCloser[0], cash: topCloser[1] } : undefined,
    // activity preserved for future use
    ...{ _activityCount: activity.data?.length ?? 0 },
  } as MetricsSnapshot;
}

interface AiInsight {
  title: string;
  body: string;
  module: string;
  recommendation: string;
  confidence: number;
}

export const generateAiInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: membership, error: memErr } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (memErr || !membership) throw new Error("No workspace found");
    const orgId = membership.org_id;

    const metrics = await gatherMetrics(supabase, orgId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `You are the analytics co-pilot for C4 InsightOS — a creator-led sales BI platform.
You receive a 30-day metrics snapshot and return 3-5 sharp, specific insights that drive revenue.
Each insight must be tied to a concrete number from the data and end with one actionable recommendation.
Respond ONLY with valid JSON matching this shape:
{ "insights": [{ "title": "string (max 60 chars)", "body": "string (2-3 sentences)", "module": "executive|content|attribution|setter|closer", "recommendation": "string (1 sentence, imperative)", "confidence": 0.0-1.0 }] }`;

    const userMsg = `30-day metrics snapshot:
- Cash collected: $${(metrics.cash / 100).toFixed(0)}
- New leads: ${metrics.newLeads}
- Calls booked: ${metrics.totalCalls}
- Calls showed: ${metrics.showed} (show rate ${metrics.totalCalls ? ((metrics.showed / metrics.totalCalls) * 100).toFixed(1) : 0}%)
- Calls closed: ${metrics.closed} (close rate ${metrics.showed ? ((metrics.closed / metrics.showed) * 100).toFixed(1) : 0}%)
- Content views: ${metrics.views}
- Leads from content: ${metrics.contentLeads}
- Avg hook retention: ${metrics.avgHookRetention.toFixed(1)}%
- Top closer: ${metrics.topCloser ? `${metrics.topCloser.name} ($${(metrics.topCloser.cash / 100).toFixed(0)})` : "none"}

Generate insights now.`;

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
      throw new Error(`AI Gateway [${res.status}]: ${txt.slice(0, 200)}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { insights: AiInsight[] };
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
    const insights = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 6) : [];
    if (insights.length === 0) return { inserted: 0 };

    const rows = insights.map((i) => ({
      org_id: orgId,
      module: i.module || "executive",
      title: String(i.title || "Insight").slice(0, 120),
      body: String(i.body || ""),
      recommendation: i.recommendation ? String(i.recommendation) : null,
      confidence: Math.min(1, Math.max(0, Number(i.confidence) || 0.5)),
      source_refs: [{ snapshot: metrics }],
      generated_by: "gemini-2.5-flash",
    }));
    const { error } = await supabase.from("ai_insights").insert(rows);
    if (error) throw error;
    return { inserted: rows.length };
  });
