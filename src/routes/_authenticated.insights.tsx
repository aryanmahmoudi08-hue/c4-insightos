import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, TrendingUp, X, Bookmark } from "lucide-react";
import { generateAiInsights } from "@/lib/insights.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/insights")({ component: Insights });

function Insights() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const generate = useServerFn(generateAiInsights);

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
    queryKey: ["ai-insights", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("ai_insights").select("*").eq("org_id", orgId!).eq("dismissed", false).order("created_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  const run = useMutation({
    mutationFn: async () => generate(),
    onSuccess: (r) => { toast.success(`Generated ${r.inserted} insights`); qc.invalidateQueries({ queryKey: ["ai-insights"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => { await supabase.from("ai_insights").update({ dismissed: true }).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-insights"] }),
  });
  const save = useMutation({
    mutationFn: async (id: string) => { await supabase.from("ai_insights").update({ saved: true }).eq("id", id); },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["ai-insights"] }); },
  });

  return (
    <>
      <TopBar title="AI Insights" subtitle="Rule engine + Gemini grounded analysis" />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-accent" />
            <div className="text-sm font-semibold">Rule engine</div>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">deterministic</span></div>
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

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-accent" /><div className="text-sm font-semibold">Gemini grounded insights</div></div>
            <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Analyzing…" : "Generate insights"}</Button>
          </div>
          <div className="divide-y divide-border">
            {(aiInsights ?? []).map((i) => (
              <div key={i.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{i.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{i.body}</div>
                    {i.recommendation && <div className="text-xs mt-1.5"><span className="text-accent uppercase tracking-wide text-[10px] font-semibold mr-1.5">action</span>{i.recommendation}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] uppercase tracking-wider rounded bg-muted px-1.5 py-0.5">{i.module}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">conf {Math.round(Number(i.confidence) * 100)}%</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button title="Save" onClick={() => save.mutate(i.id)} className="text-muted-foreground hover:text-foreground"><Bookmark className={`h-4 w-4 ${i.saved ? "fill-current text-accent" : ""}`} /></button>
                    <button title="Dismiss" onClick={() => dismiss.mutate(i.id)} className="text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            ))}
            {(!aiInsights || aiInsights.length === 0) && <div className="p-8 text-center text-sm text-muted-foreground">No AI insights yet. Click <span className="text-foreground">Generate insights</span> to run grounded analysis on your last 30 days.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
