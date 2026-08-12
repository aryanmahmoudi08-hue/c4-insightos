import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { ArrowRight, Film, Users, PhoneCall, DollarSign, Route as RouteIcon } from "lucide-react";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";

export const Route = createFileRoute("/_authenticated/attribution")({ component: Attribution });

function Attribution() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

  const { data } = useQuery({
    queryKey: ["attr", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [touches, leads, closed, contentPaths] = await Promise.all([
        supabase.from("lead_content_touches").select("id").eq("org_id", orgId!),
        supabase.from("leads").select("id, first_touch_content_id").eq("org_id", orgId!),
        supabase.from("calls").select("id, contract_value_cents, cash_collected_cents, lead_id").eq("org_id", orgId!).eq("closed", true),
        // Top performing content paths
        supabase.from("content_pieces")
          .select("id, title, platform, content_metrics(views, leads_generated, closes, cash_collected_cents)")
          .eq("org_id", orgId!)
          .limit(100),
      ]);

      // Aggregate per content
      const paths = (contentPaths.data ?? []).map(c => {
        const metrics = Array.isArray(c.content_metrics) ? c.content_metrics : [];
        const views = metrics.reduce((s: number, m) => s + (m.views ?? 0), 0);
        const leads = metrics.reduce((s: number, m) => s + (m.leads_generated ?? 0), 0);
        const closes = metrics.reduce((s: number, m) => s + (m.closes ?? 0), 0);
        const cash = metrics.reduce((s: number, m) => s + (m.cash_collected_cents ?? 0), 0);
        return { id: c.id, title: c.title ?? "(untitled)", platform: c.platform, views, leads, closes, cash };
      }).filter(p => p.cash > 0 || p.leads > 0).sort((a, b) => b.cash - a.cash);

      return {
        touches: touches.data?.length ?? 0,
        leads: leads.data?.length ?? 0,
        attributed: leads.data?.filter(l => l.first_touch_content_id).length ?? 0,
        closes: closed.data?.length ?? 0,
        cash: (closed.data ?? []).reduce((s, c) => s + (c.contract_value_cents ?? 0), 0),
        cashCollected: (closed.data ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0),
        paths,
      };
    },
  });

  const attrRate = (data?.leads ?? 0) > 0 ? ((data!.attributed / data!.leads) * 100) : 0;
  const totalPathCash = (data?.paths ?? []).reduce((s, p) => s + p.cash, 0);
  const totalPathLeads = (data?.paths ?? []).reduce((s, p) => s + p.leads, 0);
  const totalPathViews = (data?.paths ?? []).reduce((s, p) => s + p.views, 0);
  const totalPathCloses = (data?.paths ?? []).reduce((s, p) => s + p.closes, 0);

  return (
    <>
      <TopBar title="Lead Attribution" subtitle="Content → lead → call → cash" />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <StatCard label="Content touches" value={(data?.touches ?? 0).toLocaleString()} spectrum="cold" />
          <StatCard label="Leads" value={(data?.leads ?? 0).toLocaleString()} spectrum="cold" />
          <StatCard label="Attributed" value={`${attrRate.toFixed(0)}%`} spectrum="mid" hint={`${data?.attributed ?? 0} of ${data?.leads ?? 0}`} />
          <StatCard label="Closes" value={(data?.closes ?? 0).toLocaleString()} spectrum="hot" />
          <StatCard label="Contract value" value={"$" + Math.round((data?.cash ?? 0) / 100).toLocaleString()} spectrum="hot" />
        </div>

        {/* Funnel river — the page's hero moment (B1), promoted from a plain card into
            a bento hero. Bands now take their funnel position (B4) instead of the old
            arbitrary chart-1/chart-2/chart-3/success assignment. */}
        <BentoGrid rowHeight="9.5rem">
          <BentoCell span="hero">
            <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative mb-2">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Content → Cash River</div>
                <div className="display-serif mt-0.5 text-2xl">Each band is proportional to volume</div>
              </div>
              <div className="relative flex-1 flex flex-col justify-center space-y-2">
                <FunnelBand icon={<Film className="h-4 w-4" />} label="Views" value={totalPathViews} max={totalPathViews} unit="views" spectrum="cold" />
                <DropArrow from={totalPathViews} to={totalPathLeads} label="view → lead" />
                <FunnelBand icon={<Users className="h-4 w-4" />} label="Leads generated" value={totalPathLeads} max={totalPathViews} unit="leads" spectrum="cold" />
                <DropArrow from={totalPathLeads} to={totalPathCloses} label="lead → close" />
                <FunnelBand icon={<PhoneCall className="h-4 w-4" />} label="Closes" value={totalPathCloses} max={totalPathViews} unit="closes" spectrum="mid" />
                <DropArrow from={totalPathCloses} to={Math.round(totalPathCash / 1000)} label="cash collected" suffix="$" />
                <FunnelBand icon={<DollarSign className="h-4 w-4" />} label="Revenue attributed" value={Math.round(totalPathCash / 100)} max={totalPathViews} unit="$" spectrum="hot" displayAs="money" />
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        {/* Top content paths */}
        <GlassTableShell toolbar={<div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Top revenue-driving content paths</div>}>
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Content</th>
                <th className="text-left p-3">Platform</th>
                <th className="text-right p-3 font-mono">Views</th>
                <th className="text-right p-3 font-mono">Leads</th>
                <th className="text-right p-3 font-mono">Closes</th>
                <th className="text-right p-3 font-mono">Cash</th>
                <th className="text-left p-3 w-40">Path strength</th>
              </tr>
            </thead>
            <tbody>
              {(data?.paths ?? []).slice(0, 20).map((p, i) => {
                const w = Math.max(4, Math.round((p.cash / Math.max(1, data!.paths[0].cash)) * 100));
                return (
                  <tr key={p.id} className="border-t border-border/70 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 text-xs uppercase">{p.platform}</td>
                    <td className="p-3 text-right font-mono">{p.views.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-spectrum-cold">{p.leads}</td>
                    <td className="p-3 text-right font-mono text-spectrum-mid">{p.closes}</td>
                    <td className="p-3 text-right font-mono text-spectrum-hot">${Math.round(p.cash / 100).toLocaleString()}</td>
                    <td className="p-3"><div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-spectrum-hot" style={{ width: `${w}%` }} /></div></td>
                  </tr>
                );
              })}
              {(data?.paths ?? []).length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={<RouteIcon className="h-4 w-4" />} title="No attributed content yet" description="Log content_metrics rows with leads_generated + cash_collected_cents to populate this." />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>
      </div>
    </>
  );
}

function FunnelBand({ icon, label, value, max, unit, spectrum, displayAs }: { icon: React.ReactNode; label: string; value: number; max: number; unit: string; spectrum: SpectrumPosition; displayAs?: "money" }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  const display = displayAs === "money" ? `$${value.toLocaleString()}` : `${value.toLocaleString()} ${unit}`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 flex items-center gap-2 text-xs font-medium shrink-0">{icon}{label}</div>
      <div className="flex-1 h-9 rounded bg-muted/20 overflow-hidden">
        <div className="h-full rounded flex items-center justify-end pr-3 text-xs font-mono font-semibold text-background" style={{ width: `${pct}%`, background: SPECTRUM_VAR[spectrum] }}>
          {display}
        </div>
      </div>
    </div>
  );
}

function DropArrow({ from, to, label, suffix }: { from: number; to: number; label: string; suffix?: string }) {
  const conv = from > 0 ? (to / from) * 100 : 0;
  return (
    <div className="flex items-center gap-3 pl-32 text-3xs text-muted-foreground">
      <ArrowRight className="h-3 w-3" />
      <span>{label}: <span className="font-mono text-accent">{conv.toFixed(1)}%</span> {suffix && `(${suffix}${to.toLocaleString()})`}</span>
    </div>
  );
}
