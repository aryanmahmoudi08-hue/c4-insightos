import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { ArrowRight, Film, Users, PhoneCall, DollarSign } from "lucide-react";

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
          <StatCard label="Content touches" value={(data?.touches ?? 0).toLocaleString()} />
          <StatCard label="Leads" value={(data?.leads ?? 0).toLocaleString()} accent="accent" />
          <StatCard label="Attributed" value={`${attrRate.toFixed(0)}%`} accent="primary" hint={`${data?.attributed ?? 0} of ${data?.leads ?? 0}`} />
          <StatCard label="Closes" value={(data?.closes ?? 0).toLocaleString()} accent="success" />
          <StatCard label="Contract value" value={"$" + Math.round((data?.cash ?? 0) / 100).toLocaleString()} accent="success" />
        </div>

        {/* Funnel river view */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <div className="text-xs font-semibold uppercase tracking-wider">Content → Cash river</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Each band is proportional to volume. Drop-off between stages = leakage.</div>
          </div>
          <div className="p-6 space-y-2">
            <FunnelBand icon={<Film className="h-4 w-4" />} label="Views" value={totalPathViews} max={totalPathViews} unit="views" color="oklch(0.55 0.18 250)" />
            <DropArrow from={totalPathViews} to={totalPathLeads} label="view → lead" />
            <FunnelBand icon={<Users className="h-4 w-4" />} label="Leads generated" value={totalPathLeads} max={totalPathViews} unit="leads" color="oklch(0.62 0.16 200)" />
            <DropArrow from={totalPathLeads} to={totalPathCloses} label="lead → close" />
            <FunnelBand icon={<PhoneCall className="h-4 w-4" />} label="Closes" value={totalPathCloses} max={totalPathViews} unit="closes" color="oklch(0.68 0.15 150)" />
            <DropArrow from={totalPathCloses} to={Math.round(totalPathCash / 1000)} label="cash collected" suffix="$" />
            <FunnelBand icon={<DollarSign className="h-4 w-4" />} label="Revenue attributed" value={Math.round(totalPathCash / 100)} max={totalPathViews} unit="$" color="oklch(0.72 0.18 100)" displayAs="money" />
          </div>
        </div>

        {/* Top content paths */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider">Top revenue-driving content paths</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
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
                  <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 text-xs uppercase">{p.platform}</td>
                    <td className="p-3 text-right font-mono">{p.views.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-accent">{p.leads}</td>
                    <td className="p-3 text-right font-mono text-primary">{p.closes}</td>
                    <td className="p-3 text-right font-mono text-[color:var(--color-success)]">${Math.round(p.cash / 100).toLocaleString()}</td>
                    <td className="p-3"><div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-[color:var(--color-success)]" style={{ width: `${w}%` }} /></div></td>
                  </tr>
                );
              })}
              {(data?.paths ?? []).length === 0 && <tr><td colSpan={8} className="p-10 text-center text-xs text-muted-foreground">No attributed content yet. Log content_metrics rows with leads_generated + cash_collected_cents to populate this.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FunnelBand({ icon, label, value, max, unit, color, displayAs }: { icon: React.ReactNode; label: string; value: number; max: number; unit: string; color: string; displayAs?: "money" }) {
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  const display = displayAs === "money" ? `$${value.toLocaleString()}` : `${value.toLocaleString()} ${unit}`;
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 flex items-center gap-2 text-xs font-medium shrink-0">{icon}{label}</div>
      <div className="flex-1 h-9 rounded bg-muted/20 overflow-hidden">
        <div className="h-full rounded flex items-center justify-end pr-3 text-xs font-mono font-semibold text-background" style={{ width: `${pct}%`, background: color }}>
          {display}
        </div>
      </div>
    </div>
  );
}

function DropArrow({ from, to, label, suffix }: { from: number; to: number; label: string; suffix?: string }) {
  const conv = from > 0 ? (to / from) * 100 : 0;
  return (
    <div className="flex items-center gap-3 pl-32 text-[10px] text-muted-foreground">
      <ArrowRight className="h-3 w-3" />
      <span>{label}: <span className="font-mono text-accent">{conv.toFixed(1)}%</span> {suffix && `(${suffix}${to.toLocaleString()})`}</span>
    </div>
  );
}
