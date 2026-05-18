import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Sparkles, AlertTriangle, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/insights")({ component: Insights });

function Insights() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

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

  return (
    <>
      <TopBar title="AI Insights" subtitle="Rule engine + grounded LLM analysis" />
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
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-semibold mb-1">Gemini grounded layer</div>
          <p className="text-xs text-muted-foreground">LLM insights pull aggregated metrics as structured context and return <code className="font-mono">{`{insight, confidence, source_refs[]}`}</code>. Wire-up scheduled for the next iteration — Lovable AI Gateway is already enabled.</p>
        </div>
      </div>
    </>
  );
}
