import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { Button } from "@/components/ui/button";
import { Send, Loader2, FileText, TriangleAlert, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWeeklyReportFn, sendWeeklyReportFn } from "@/lib/weekly-report.functions";
import { MECHANISMS, type MechanismKey } from "@/lib/content-mechanisms";
import { mockWeeklyReport, withMockDelay } from "@/lib/dev-mock-data";
import { useAuth } from "@/hooks/use-auth";
import type { RepRow } from "@/lib/weekly-report.server";
import type { Derivation } from "@/lib/funnel-derivation";

export const Route = createFileRoute("/_authenticated/weekly-report")({
  component: WeeklyReportPage,
  head: () => ({
    meta: [
      { title: "Weekly Report | C4 InsightOS" },
      { name: "description", content: "Cash, calls, funnel, content, rep performance, client health and hiring — the past 7 days, one page, real numbers." },
    ],
  }),
});

function fmtMoneyCents(cents: number) { return "$" + Math.round(cents / 100).toLocaleString(); }

function WeeklyReportPage() {
  const { devBypass } = useAuth();
  const getReport = useServerFn(getWeeklyReportFn);
  const sendReport = useServerFn(sendWeeklyReportFn);

  const { data: report, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["weekly-report", devBypass],
    queryFn: () => (devBypass ? withMockDelay(mockWeeklyReport()) : getReport()),
    retry: false,
  });

  const send = useMutation({
    mutationFn: () => (devBypass ? withMockDelay({ ok: true as const }) : sendReport()),
    onSuccess: () => toast.success("Weekly report sent to your connected channel"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <TopBar title="Weekly Report" subtitle="Cash, calls, funnel, content, reps, clients, hiring — the last 7 days, one page" />
      <div className="p-6 space-y-5 max-w-[1400px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            {report ? `${report.weekStart} → ${report.weekEnd}` : "Loading…"}
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => send.mutate()} disabled={send.isPending || !report}>
            {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send to Discord
          </Button>
        </div>

        {isLoading && <div className="py-16 text-center text-xs text-muted-foreground"><Loader2 className="h-5 w-5 mx-auto animate-spin" /></div>}
        {isError && (
          <div className="rounded-md border border-destructive/45 bg-destructive/5 p-4 text-sm">
            <div className="font-semibold text-destructive">Couldn't build this week's report</div>
            <div className="mt-1 text-xs text-muted-foreground">{error instanceof Error ? error.message : "Unknown error"}</div>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>Retry</Button>
          </div>
        )}

        {report && (
          <div className="space-y-5">
            {report.trends.length > 0 && (
              <div className="rounded-md border border-border bg-card p-4 space-y-1.5">
                <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"><TriangleAlert className="h-3.5 w-3.5" /> What moved this week</div>
                <ul className="space-y-1 text-sm">
                  {report.trends.map((t, i) => <li key={i}>· {t}</li>)}
                </ul>
              </div>
            )}

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Cash Collected" value={fmtMoneyCents(report.cash.curr)} spectrum="hot" hint={report.cash.deltaPct !== undefined ? `${report.cash.deltaPct >= 0 ? "+" : ""}${report.cash.deltaPct.toFixed(0)}% vs prior week` : "No prior-week cash to compare"} />
              <StatCard label="New Leads" value={report.newLeads.toLocaleString()} spectrum="cold" />
              <StatCard label="Calls Booked → Closed" value={`${report.calls.booked} → ${report.calls.closes}`} spectrum="mid" hint={`${report.calls.showRate.toFixed(0)}% showed · ${report.calls.closeRate.toFixed(0)}% closed on show`} />
              <StatCard label="Content mix" value={report.contentMix.insufficientData ? "Limited data" : "On track"} spectrum={report.contentMix.insufficientData ? undefined : "hot"} hint={`Weight ${report.contentMix.totalWeight.toFixed(0)} of ${report.contentMix.minTotalWeight} min`} />
            </div>

            <BentoGrid cols={2} rowHeight="10rem">
              <BentoCell>
                <DerivationCard title="What's capping growth" d={report.funnelHealth.cap} />
              </BentoCell>
              <BentoCell>
                <DerivationCard title="What's working" d={report.funnelHealth.working} />
              </BentoCell>
            </BentoGrid>

            <div className="grid gap-4 lg:grid-cols-2">
              <RepTable title="Closers" rows={report.repPerformance.closers} />
              <RepTable title="Setters" rows={report.repPerformance.setters} />
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> Content mix this week</div>
              {report.contentMix.insufficientData && (
                <div className="text-xs text-muted-foreground italic">Total signal weight {report.contentMix.totalWeight.toFixed(0)} is below the configured minimum of {report.contentMix.minTotalWeight} — this mix is real, just resting on thin signal.</div>
              )}
              <div className="grid gap-2 sm:grid-cols-4">
                {(Object.keys(report.contentMix.mix) as MechanismKey[]).map((k) => (
                  <div key={k} className="rounded-md border border-border p-2.5">
                    <div className="text-2xs text-muted-foreground">{MECHANISMS[k]?.label ?? k}</div>
                    <div className="font-mono text-lg font-semibold">{report.contentMix.mix[k]}%</div>
                  </div>
                ))}
              </div>
              <div className="text-2xs text-muted-foreground">
                {report.weeklyContentCheck.total} pieces posted this week
                {report.weeklyContentCheck.missing.length > 0 && ` · missing: ${report.weeklyContentCheck.missing.map((m) => MECHANISMS[m]?.label ?? m).join(", ")}`}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Client renewal stages</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(report.clientHealth.renewalStageBreakdown).map(([stage, count]) => (
                    <div key={stage} className="flex items-center justify-between rounded border border-border/60 px-2.5 py-1.5">
                      <span className="text-2xs text-muted-foreground capitalize">{stage.replace(/_/g, " ")}</span>
                      <span className="font-mono font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
                {report.clientHealth.atRiskCount > 0 && <div className="text-2xs text-destructive">{report.clientHealth.atRiskCount} active client{report.clientHealth.atRiskCount === 1 ? "" : "s"} at risk</div>}
              </div>
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Hiring pipeline</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {Object.entries(report.hiringPipeline.stageBreakdown).map(([stage, count]) => (
                    <div key={stage} className="flex items-center justify-between rounded border border-border/60 px-2.5 py-1.5">
                      <span className="text-2xs text-muted-foreground capitalize">{stage.replace(/_/g, " ")}</span>
                      <span className="font-mono font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
                <div className="text-2xs text-muted-foreground">{report.hiringPipeline.newApplicantsThisWeek} new applicant{report.hiringPipeline.newApplicantsThisWeek === 1 ? "" : "s"} this week</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function DerivationCard({ title, d }: { title: string; d: Derivation }) {
  return (
    <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</div>
      <p className={cn("relative mt-2 text-sm", d.status === "insufficient_data" ? "text-muted-foreground italic" : "text-foreground")}>{d.sentence}</p>
    </div>
  );
}

function RepTable({ title, rows }: { title: string; rows: RepRow[] }) {
  return (
    <GlassTableShell toolbar={<div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">{title}</div>}>
      <table className="w-full text-sm">
        <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-2.5">Name</th>
            {title === "Setters" && <th className="text-right p-2.5 font-mono">Sets</th>}
            <th className="text-right p-2.5 font-mono">Closes</th>
            <th className="text-right p-2.5 font-mono">Cash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border/70">
              <td className="p-2.5 font-medium">{r.name}</td>
              {title === "Setters" && <td className="p-2.5 text-right font-mono">{r.sets}</td>}
              <td className="p-2.5 text-right font-mono">{r.closes}</td>
              <td className="p-2.5 text-right font-mono text-spectrum-hot">{fmtMoneyCents(r.cashCents)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={title === "Setters" ? 4 : 3}><EmptyState icon={<FileText className="h-4 w-4" />} title={`No ${title.toLowerCase()} activity this week`} description="Nothing logged in the last 7 days." /></td></tr>
          )}
        </tbody>
      </table>
    </GlassTableShell>
  );
}
