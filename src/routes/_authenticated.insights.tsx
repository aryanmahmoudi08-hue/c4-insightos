import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockAiInsightRows, withMockDelay } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, TrendingUp, TrendingDown, X, Bookmark, Activity } from "lucide-react";
import { generateAiInsights, getWeeklyTrend } from "@/lib/insights.functions";
import { sendWeeklyReportFn } from "@/lib/weekly-report.functions";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { BentoGrid, BentoCell } from "@/components/bento-grid";

export const Route = createFileRoute("/_authenticated/insights")({ component: Insights });

function Insights() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const generate = useServerFn(generateAiInsights);
  const fetchTrend = useServerFn(getWeeklyTrend);
  const sendReport = useServerFn(sendWeeklyReportFn);
  const weeklyReport = useMutation({
    mutationFn: async () => sendReport(),
    onSuccess: (r) => toast.success(`Weekly report sent · $${Math.round((r.summary.cash) / 100).toLocaleString()} cash, ${r.summary.closes} closes`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: trend } = useQuery({
    queryKey: ["weekly-trend", orgId],
    enabled: !!orgId,
    queryFn: () => fetchTrend(),
  });

  const { data: ruleAlerts } = useQuery({
    queryKey: ["rule-alerts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400e3).toISOString();
      const [calls, content] = await Promise.all([
        supabase.from("calls").select("showed, closed").eq("org_id", orgId!).gte("scheduled_for", since),
        supabase.from("content_metrics").select("hook_retention_pct, views").eq("org_id", orgId!).gte("captured_at", since),
      ]);
      const alerts: Array<{ severity: "warn"|"info"|"crit"; title: string; detail: string }> = [];
      const total = calls.data?.length ?? 0;
      const showed = calls.data?.filter(c => c.showed).length ?? 0;
      const showRate = total ? (showed / total) * 100 : 100;
      if (total > 5 && showRate < 70) alerts.push({ severity: "warn", title: "Show rate below 70%", detail: `Currently ${showRate.toFixed(1)}% across ${total} calls. Tighten confirmation cadence.` });
      const avgRet = content.data?.length ? content.data.reduce((s,m) => s + (m.hook_retention_pct ?? 0), 0) / content.data.length : 0;
      if (content.data?.length && avgRet < 40) alerts.push({ severity: "warn", title: "Hook retention slipping", detail: `Avg 3-sec hold at ${avgRet.toFixed(1)}%. Test contrarian + curiosity openers.` });
      if (alerts.length === 0) alerts.push({ severity: "info", title: "All systems green", detail: "No threshold breaches in the last 30 days." });
      return alerts;
    },
  });

  const { data: aiInsights } = useQuery({
    queryKey: ["ai-insights", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockAiInsightRows();
      const { data } = await supabase.from("ai_insights").select("*").eq("org_id", orgId!).eq("dismissed", false).order("created_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  const run = useMutation({
    mutationFn: async () => {
      if (devBypass) {
        const rows = await withMockDelay(mockAiInsightRows());
        qc.setQueryData(["ai-insights", orgId, devBypass], rows);
        return { inserted: rows.length };
      }
      return generate();
    },
    onSuccess: (r) => { toast.success(`Generated ${r.inserted} insights`); if (!devBypass) qc.invalidateQueries({ queryKey: ["ai-insights"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) { qc.setQueryData<any[]>(["ai-insights", orgId, devBypass], (prev) => (prev ?? []).filter((i) => i.id !== id)); return; }
      const { error } = await supabase.from("ai_insights").update({ dismissed: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["ai-insights"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to dismiss"),
  });
  const save = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) { qc.setQueryData<any[]>(["ai-insights", orgId, devBypass], (prev) => (prev ?? []).map((i) => (i.id === id ? { ...i, saved: true } : i))); return; }
      const { error } = await supabase.from("ai_insights").update({ saved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); if (!devBypass) qc.invalidateQueries({ queryKey: ["ai-insights"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <>
      <TopBar title="AI Insights" subtitle="Rule engine + Gemini grounded analysis" />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-accent" />
            <div className="text-sm font-semibold">Rule engine</div>
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">deterministic</span></div>
          <div className="space-y-2">
            {(ruleAlerts ?? []).map((a, i) => (
              <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-background/40 p-3">
                {a.severity === "warn" ? <AlertTriangle className="h-4 w-4 text-[color:var(--color-warning)]" /> : <TrendingUp className="h-4 w-4 text-[color:var(--color-success)]" />}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{a.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Page hero (B1) — the weekly trend strip, promoted into a bento hero.
            Presentation only: every trend-direction color below is a genuine
            state signal (declining vs growing), not a funnel-position value,
            so none of it is touched. */}
        <BentoGrid cols={2} rowHeight="9.5rem">
          <BentoCell span="hero">
        <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-4">
          <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
          <div className="relative flex flex-1 flex-col">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-4 w-4 text-accent" />
            <div className="text-sm font-semibold">4-week trend patterns</div>
            <span className="text-3xs uppercase tracking-wide text-muted-foreground">multi-week direction</span>
          </div>
          {trend?.trends && trend.trends.length > 0 && (
            <div className="mb-3 space-y-1">
              {trend.trends.map((t, i) => {
                const declining = /declined|down/.test(t);
                return (
                  <div key={i} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${declining ? "bg-destructive/10 text-destructive" : "bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]"}`}>
                    {declining ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                    {t}
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: "cash", label: "Cash collected", color: "var(--color-success)", fmt: (v: number) => `$${Math.round(v/100).toLocaleString()}` },
              { key: "totalCalls", label: "Calls booked", color: "var(--chart-2)", fmt: (v: number) => String(v) },
              { key: "views", label: "Content views", color: "var(--chart-1)", fmt: (v: number) => v.toLocaleString() },
            ].map(m => {
              const data = (trend?.weeks ?? []).map(w => ({ week: w.weekStart.slice(5), value: Number((w as unknown as Record<string, unknown>)[m.key]) }));
              const last = data[data.length - 1]?.value ?? 0;
              const prev = data[data.length - 2]?.value ?? 0;
              const delta = prev > 0 ? ((last - prev) / prev) * 100 : 0;
              return (
                <div key={m.key} className="rounded-md border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-2xs uppercase tracking-wider text-muted-foreground">{m.label}</div>
                    <div className={`text-2xs font-mono ${delta > 0 ? "text-[color:var(--color-success)]" : delta < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(0)}%
                    </div>
                  </div>
                  <div className="font-mono text-lg font-semibold mt-0.5">{m.fmt(last)}</div>
                  <div className="h-16 mt-1">
                    <ResponsiveContainer>
                      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="week" hide />
                        <YAxis hide />
                        <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, boxShadow: "var(--shadow-md)" }} />
                        <Line type="monotone" dataKey="value" stroke={m.color} strokeWidth={2} dot={{ r: 2 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
          {(!trend?.weeks || trend.weeks.length === 0) && (
            <div className="text-xs text-muted-foreground text-center py-6">Need at least one week of activity to surface trend patterns.</div>
          )}
          </div>
        </div>
          </BentoCell>
        </BentoGrid>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-muted-foreground">Grounded analysis on the last 30 days of revenue, calls, content, and rep activity.</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => weeklyReport.mutate()} disabled={weeklyReport.isPending}>{weeklyReport.isPending ? "Sending…" : "Send weekly report"}</Button>
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Analyzing…" : "Regenerate analysis"}</Button>
          </div>
        </div>

        {(() => {
          const all = aiInsights ?? [];
          const bottlenecks = all.filter(i => String(i.module ?? "").startsWith("bottleneck"));
          const doubleDown = all.filter(i => String(i.module ?? "").startsWith("double_down"));
          const unclassified = all.filter(i => !String(i.module ?? "").includes(":"));

          const renderCard = (i: typeof all[number], tone: "bottleneck" | "double_down") => (
            <div key={i.id} className={`rounded-lg border p-3.5 transition ${tone === "bottleneck" ? "border-destructive/30 bg-destructive/[0.04] hover:border-destructive/50" : "border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/[0.04] hover:border-[color:var(--color-success)]/50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {tone === "bottleneck" ? <TrendingDown className="h-4 w-4 text-destructive shrink-0" /> : <TrendingUp className="h-4 w-4 text-[color:var(--color-success)] shrink-0" />}
                    <div className="text-sm font-semibold">{i.title}</div>
                  </div>
                  <div className="text-xs text-muted-foreground leading-relaxed">{i.body}</div>
                  {i.recommendation && (
                    <div className="text-xs mt-2 rounded-md bg-background/60 px-2.5 py-1.5 border border-border/60">
                      <span className={`uppercase tracking-wide text-3xs font-semibold mr-1.5 ${tone === "bottleneck" ? "text-destructive" : "text-[color:var(--color-success)]"}`}>action</span>
                      {i.recommendation}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-3xs uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">{String(i.module ?? "").split(":")[1] || i.module}</span>
                    <span className="text-3xs font-mono text-muted-foreground">conf {Math.round(Number(i.confidence) * 100)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button title="Save" onClick={() => save.mutate(i.id)} className="text-muted-foreground hover:text-foreground"><Bookmark className={`h-4 w-4 ${i.saved ? "fill-current text-accent" : ""}`} /></button>
                  <button title="Dismiss" onClick={() => dismiss.mutate(i.id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                </div>
              </div>
            </div>
          );

          return (
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-destructive/30 bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-destructive/10">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-destructive" />
                    <div className="text-sm font-semibold">Current bottlenecks</div>
                    <span className="text-3xs uppercase tracking-wide text-muted-foreground">what's leaking revenue</span>
                  </div>
                  <span className="text-xs font-mono text-destructive">{bottlenecks.length + unclassified.length}</span>
                </div>
                <div className="p-3 space-y-2 max-h-[640px] overflow-y-auto">
                  {[...bottlenecks, ...unclassified].map(i => renderCard(i, "bottleneck"))}
                  {bottlenecks.length + unclassified.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No bottlenecks surfaced. Hit <span className="text-foreground">Regenerate analysis</span> to scan again.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--color-success)]/30 bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-[color:var(--color-success)]/10">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-[color:var(--color-success)]" />
                    <div className="text-sm font-semibold">Double down on these</div>
                    <span className="text-3xs uppercase tracking-wide text-muted-foreground">what's working — pour fuel</span>
                  </div>
                  <span className="text-xs font-mono text-[color:var(--color-success)]">{doubleDown.length}</span>
                </div>
                <div className="p-3 space-y-2 max-h-[640px] overflow-y-auto">
                  {doubleDown.map(i => renderCard(i, "double_down"))}
                  {doubleDown.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No wins surfaced yet. Generate analysis once you have a few weeks of data.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}

