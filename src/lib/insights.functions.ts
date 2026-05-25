import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface WeekBucket {
  weekStart: string; // YYYY-MM-DD
  cash: number;
  totalCalls: number;
  showed: number;
  closed: number;
  views: number;
  contentLeads: number;
}

interface MetricsSnapshot {
  // 30d totals
  cash: number;
  newLeads: number;
  totalCalls: number;
  showed: number;
  closed: number;
  views: number;
  contentLeads: number;
  avgHookRetention: number;
  topCloser?: { name: string; cash: number };
  // 4-week history (oldest → newest)
  weeks: WeekBucket[];
  // Trend patterns detected client-side
  trends: string[];
}

function weekStart(d: Date): string {
  const x = new Date(d);
  const day = x.getUTCDay();
  const diff = (day === 0 ? 6 : day - 1); // Monday start
  x.setUTCDate(x.getUTCDate() - diff);
  return x.toISOString().slice(0, 10);
}

function detectTrends(weeks: WeekBucket[]): string[] {
  const trends: string[] = [];
  if (weeks.length < 3) return trends;
  const metric = (key: keyof WeekBucket) => weeks.map(w => Number(w[key]));
  const directions = (vals: number[]) => {
    const dirs: ("up" | "down" | "flat")[] = [];
    for (let i = 1; i < vals.length; i++) {
      const prev = vals[i-1]; const cur = vals[i];
      if (prev === 0 && cur === 0) dirs.push("flat");
      else if (cur > prev * 1.05) dirs.push("up");
      else if (cur < prev * 0.95) dirs.push("down");
      else dirs.push("flat");
    }
    return dirs;
  };
  const checks: Array<{ key: keyof WeekBucket; label: string; goodUp: boolean }> = [
    { key: "cash", label: "cash collected", goodUp: true },
    { key: "totalCalls", label: "calls booked", goodUp: true },
    { key: "views", label: "content views", goodUp: true },
  ];
  for (const c of checks) {
    const vals = metric(c.key);
    const dirs = directions(vals);
    const lastN = dirs.slice(-3);
    if (lastN.length >= 2 && lastN.every(d => d === "down")) {
      trends.push(`${c.label} has declined ${lastN.length} consecutive weeks`);
    } else if (lastN.length >= 2 && lastN.every(d => d === "up")) {
      trends.push(`${c.label} climbing ${lastN.length} weeks straight`);
    }
  }
  // Show rate / close rate trends
  const showRates = weeks.map(w => w.totalCalls ? (w.showed / w.totalCalls) * 100 : 0);
  const sDirs = directions(showRates).slice(-3);
  if (sDirs.length >= 2 && sDirs.every(d => d === "down")) trends.push(`show rate has declined ${sDirs.length} consecutive weeks`);
  const closeRates = weeks.map(w => w.showed ? (w.closed / w.showed) * 100 : 0);
  const cDirs = directions(closeRates).slice(-3);
  if (cDirs.length >= 2 && cDirs.every(d => d === "down")) trends.push(`close rate has declined ${cDirs.length} consecutive weeks`);
  return trends;
}

async function gatherMetrics(supabase: any, orgId: string): Promise<MetricsSnapshot> {
  const since = new Date(Date.now() - 28 * 86400e3).toISOString();
  const sinceDate = since.slice(0, 10);
  const [pays, leads, calls, content, activity] = await Promise.all([
    supabase.from("payments").select("amount_cents, collected_at").eq("org_id", orgId).gte("collected_at", since),
    supabase.from("leads").select("id, created_at").eq("org_id", orgId).gte("created_at", since),
    supabase.from("calls").select("showed, closed, cash_collected_cents, closer_name, scheduled_for, created_at").eq("org_id", orgId).gte("created_at", since),
    supabase.from("content_metrics").select("views, leads_generated, hook_retention_pct, captured_at").eq("org_id", orgId).gte("captured_at", since),
    supabase.from("setter_activity").select("team_member_name, cash_collected_cents, activity_date").eq("org_id", orgId).gte("activity_date", sinceDate),
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

  // Bucket into 4 weeks
  const bucketMap = new Map<string, WeekBucket>();
  for (let i = 3; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 86400e3);
    const ws = weekStart(d);
    bucketMap.set(ws, { weekStart: ws, cash: 0, totalCalls: 0, showed: 0, closed: 0, views: 0, contentLeads: 0 });
  }
  const getBucket = (iso: string) => bucketMap.get(weekStart(new Date(iso)));
  for (const p of pays.data ?? []) {
    const b = getBucket(p.collected_at); if (b) b.cash += p.amount_cents ?? 0;
  }
  for (const c of callList) {
    const b = getBucket(c.created_at); if (!b) continue;
    b.totalCalls += 1;
    if (c.showed) b.showed += 1;
    if (c.closed) b.closed += 1;
  }
  for (const m of contentList) {
    const b = getBucket(m.captured_at); if (!b) continue;
    b.views += m.views ?? 0;
    b.contentLeads += m.leads_generated ?? 0;
  }
  const weeks = Array.from(bucketMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const trends = detectTrends(weeks);

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
    weeks,
    trends,
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

// Expose week-level snapshot to the client (for the trend strip on Insights page)
export const getWeeklyTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!m) throw new Error("No workspace");
    const snap = await gatherMetrics(supabase, m.org_id);
    return { weeks: snap.weeks, trends: snap.trends };
  });

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
You receive a 28-day metrics snapshot plus 4 weekly buckets and detected trend patterns.
Return 3-5 sharp, specific insights that drive revenue. Prioritize TREND PATTERNS (multi-week direction) over single-point snapshots.
Each insight must reference a concrete number AND end with one actionable recommendation.
Respond ONLY with valid JSON matching this shape:
{ "insights": [{ "title": "string (max 60 chars)", "body": "string (2-3 sentences)", "module": "executive|content|attribution|setter|closer", "recommendation": "string (1 sentence, imperative)", "confidence": 0.0-1.0 }] }`;

    const weekTable = metrics.weeks.map(w => {
      const sr = w.totalCalls ? ((w.showed / w.totalCalls) * 100).toFixed(0) : "0";
      const cr = w.showed ? ((w.closed / w.showed) * 100).toFixed(0) : "0";
      return `${w.weekStart}: cash $${(w.cash/100).toFixed(0)} · calls ${w.totalCalls} (show ${sr}%, close ${cr}%) · views ${w.views} · content leads ${w.contentLeads}`;
    }).join("\n");

    const userMsg = `28-day totals:
- Cash collected: $${(metrics.cash / 100).toFixed(0)}
- New leads: ${metrics.newLeads}
- Calls booked: ${metrics.totalCalls}
- Calls showed: ${metrics.showed} (show rate ${metrics.totalCalls ? ((metrics.showed / metrics.totalCalls) * 100).toFixed(1) : 0}%)
- Calls closed: ${metrics.closed} (close rate ${metrics.showed ? ((metrics.closed / metrics.showed) * 100).toFixed(1) : 0}%)
- Content views: ${metrics.views}
- Leads from content: ${metrics.contentLeads}
- Avg hook retention: ${metrics.avgHookRetention.toFixed(1)}%
- Top closer: ${metrics.topCloser ? `${metrics.topCloser.name} ($${(metrics.topCloser.cash / 100).toFixed(0)})` : "none"}

Weekly history (oldest → newest):
${weekTable}

Detected trend patterns:
${metrics.trends.length ? metrics.trends.map(t => `- ${t}`).join("\n") : "- no multi-week directional patterns detected"}

Generate insights now. Lead with trend-based observations if any exist.`;

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
      source_refs: [{ snapshot: metrics as unknown as Record<string, unknown> }] as never,
      generated_by: "gemini-2.5-flash",
    }));
    // Wipe prior un-dismissed insights so "Generate" always shows the latest take.
    await supabase.from("ai_insights").delete().eq("org_id", orgId).eq("dismissed", false).eq("saved", false);
    const { error } = await supabase.from("ai_insights").insert(rows as never);
    if (error) throw error;
    return { inserted: rows.length };
  });
