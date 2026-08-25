import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockTrafficBreakdown } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  TrendingUp,
  Target,
  Sparkles,
  Signpost,
  MoreVertical,
  Copy,
  Power,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const DONUT_COLORS = [
  "var(--spectrum-hot)",
  "var(--spectrum-mid)",
  "var(--spectrum-cold)",
  "var(--accent)",
  "var(--primary)",
  "var(--color-warning)",
  "var(--color-success)",
];

export const Route = createFileRoute("/_authenticated/traffic")({ component: Traffic });

const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

/** Tracking URL generator (Sales Tracking Part 7) — appends whichever UTM
 * params were actually filled in; returns null rather than a broken/partial
 * URL when there's no base_url to build against. */
function buildTrackingUrl(
  baseUrl: string | null,
  utmSource: string | null,
  utmMedium: string | null,
  utmCampaign: string | null,
): string | null {
  if (!baseUrl) return null;
  const params = new URLSearchParams();
  if (utmSource) params.set("utm_source", utmSource);
  if (utmMedium) params.set("utm_medium", utmMedium);
  if (utmCampaign) params.set("utm_campaign", utmCampaign);
  const qs = params.toString();
  return qs ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}${qs}` : baseUrl;
}

function Traffic() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { range } = useDateRange();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;

  // Catalog of sources — not time-scoped, this is the config list itself.
  const { data: sources } = useQuery({
    queryKey: ["traffic-sources", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("traffic_sources")
        .select("id, name, category, is_active, utm_source, utm_medium, utm_campaign, base_url")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data;
    },
  });

  // Leads acquired + calls booked in the selected range, by source.
  const { data: leads } = useQuery({
    queryKey: ["leads-by-source", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, traffic_source_id, status")
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data;
    },
  });

  // Pull calls + clients to compute close rate, avg deal, and LTV per source
  const { data: calls } = useQuery({
    queryKey: ["traffic-calls", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("lead_id, closed, contract_value_cents, cash_collected_cents")
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: clients } = useQuery({
    queryKey: ["traffic-clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("lead_id, contract_value_cents")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("traffic_sources").insert({
        org_id: orgId!,
        name: String(f.get("name") || ""),
        category: String(f.get("category") || "organic"),
        utm_source: String(f.get("utm_source") || "") || null,
        utm_medium: String(f.get("utm_medium") || "") || null,
        utm_campaign: String(f.get("utm_campaign") || "") || null,
        base_url: String(f.get("base_url") || "") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Source added");
      qc.invalidateQueries({ queryKey: ["traffic-sources"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("traffic_sources")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["traffic-sources"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const deleteSource = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("traffic_sources").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Channel removed");
      qc.invalidateQueries({ queryKey: ["traffic-sources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const breakdown = useMemo(() => {
    const leadsBySource = new Map<string, string[]>(); // sourceId -> leadIds
    for (const l of leads ?? []) {
      if (!l.traffic_source_id) continue;
      const arr = leadsBySource.get(l.traffic_source_id) ?? [];
      arr.push(l.id);
      leadsBySource.set(l.traffic_source_id, arr);
    }
    const callsByLead = new Map<string, typeof calls>();
    for (const c of calls ?? []) {
      if (!c.lead_id) continue;
      const arr = callsByLead.get(c.lead_id) ?? [];
      arr.push(c);
      callsByLead.set(c.lead_id, arr);
    }
    const clientsByLead = new Map<string, number>();
    for (const cl of clients ?? []) {
      if (!cl.lead_id) continue;
      clientsByLead.set(
        cl.lead_id,
        (clientsByLead.get(cl.lead_id) ?? 0) + (cl.contract_value_cents ?? 0),
      );
    }

    // Real computation always runs (all 4 queries fire real requests, even
    // under devBypass — same reasoning as attribution.tsx's own devBypass
    // fix: a full short-circuit here would've silently broken the /traffic
    // date-range regression test, which verifies a real request re-fires
    // with new bounds). Only the *display* falls back to a mock breakdown
    // when the real, RLS-empty-under-devBypass result has nothing to show.
    const real = (sources ?? []).map((s) => {
      const leadIds = leadsBySource.get(s.id) ?? [];
      const matched = (leads ?? []).filter((l) => l.traffic_source_id === s.id);
      const won = matched.filter((l) => l.status === "closed").length;
      let totalDealCents = 0;
      let dealCount = 0;
      let ltvCents = 0;
      for (const lid of leadIds) {
        const cs = callsByLead.get(lid) ?? [];
        for (const c of cs) {
          if (c.closed) {
            totalDealCents += c.contract_value_cents ?? 0;
            dealCount += 1;
          }
        }
        ltvCents += clientsByLead.get(lid) ?? 0;
      }
      const closeRate = matched.length ? (won / matched.length) * 100 : 0;
      const avgDeal = dealCount ? totalDealCents / dealCount : 0;
      const revenuePerLead = matched.length ? (totalDealCents + ltvCents) / matched.length : 0;
      // Score: close rate (%) × avg deal ($, in thousands) — surfaces revenue-efficient channels
      const score = closeRate * (avgDeal / 100000);
      return {
        id: s.id,
        name: s.name,
        category: s.category,
        isActive: s.is_active,
        trackingUrl: buildTrackingUrl(s.base_url, s.utm_source, s.utm_medium, s.utm_campaign),
        leads: matched.length,
        clients: won,
        closeRate: Number(closeRate.toFixed(1)),
        avgDeal: Math.round(avgDeal / 100),
        ltv: Math.round(ltvCents / 100),
        revenue: Math.round((totalDealCents + ltvCents) / 100),
        revenuePerLead: Math.round(revenuePerLead / 100),
        score: Number(score.toFixed(2)),
      };
    });
    return devBypass && real.length === 0 ? mockTrafficBreakdown() : real;
  }, [sources, leads, calls, clients, devBypass]);

  const unattributed = (leads ?? []).filter((l) => !l.traffic_source_id).length;
  const totalLeads = leads?.length ?? 0;
  // Confirmed real bug while verifying: this read the real (RLS-empty under
  // devBypass) `sources` query directly, showing "0 channels" right next to
  // a breakdown grid full of channels once `breakdown` fell back to its
  // mock. `breakdown` is the actual effective source of truth for what's
  // displayed (real when real data exists, mock only as a last resort), so
  // this now derives from the same place every other number on this page does.
  const totalSources = breakdown.length;

  // Best source: highest score, requires at least 3 leads to avoid noise
  const bestSource = useMemo(() => {
    const eligible = breakdown.filter((b) => b.leads >= 3);
    return eligible.sort((a, b) => b.score - a.score)[0] ?? null;
  }, [breakdown]);

  const ranked = useMemo(
    () =>
      [...breakdown].sort((a, b) => b.revenuePerLead - a.revenuePerLead || b.revenue - a.revenue),
    [breakdown],
  );
  const totalRevenue = ranked.reduce((s, b) => s + b.revenue, 0);
  const attributedLeads = ranked.reduce((s, b) => s + b.leads, 0);
  const avgRevPerLead = attributedLeads ? Math.round(totalRevenue / attributedLeads) : 0;

  const verdict = (b: (typeof ranked)[number]) => {
    if (b.leads < 3)
      return { label: "Not enough data", tone: "border-border text-muted-foreground bg-muted/40" };
    if (b.revenuePerLead >= avgRevPerLead * 1.25)
      return {
        label: "Double down",
        tone: "border-[color:var(--color-success)]/40 text-[color:var(--color-success)] bg-[color:var(--color-success)]/10",
      };
    if (b.revenuePerLead >= avgRevPerLead * 0.6)
      return { label: "Keep steady", tone: "border-border text-foreground bg-muted/40" };
    if (b.leads >= 10 && b.clients === 0)
      return {
        label: "Cut or fix",
        tone: "border-destructive/40 text-destructive bg-destructive/10",
      };
    return {
      label: "Needs work",
      tone: "border-[color:var(--color-warning)]/40 text-[color:var(--color-warning)] bg-[color:var(--color-warning)]/10",
    };
  };

  return (
    <>
      <TopBar
        title="Traffic"
        subtitle="Where leads come from — and which channels actually turn into cash"
        showDateRange
      />
      <div className="p-4 md:p-6 space-y-5">
        {/* Plain-language headline numbers */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Revenue from tracked channels"
            value={fmtMoney(totalRevenue * 100)}
            spectrum="hot"
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <StatCard
            label="Revenue per lead"
            value={`$${avgRevPerLead.toLocaleString()}`}
            spectrum="hot"
            hint="Across every tracked channel"
          />
          <StatCard
            label="Leads tracked"
            value={attributedLeads}
            spectrum="cold"
            hint={`${totalSources} channels`}
          />
          {/* Threshold-based at-risk signal (unattributed share crossing 25%) — a
              genuine state indicator, not a funnel-position miscolor. */}
          <StatCard
            label="Leads with no source"
            value={unattributed}
            accent={unattributed > totalLeads / 4 ? "warning" : "primary"}
            hint={
              totalLeads
                ? `${Math.round((unattributed / totalLeads) * 100)}% of all leads — tag these`
                : ""
            }
          />
        </div>

        {/* Page hero (B1) — the "what the data says" read, promoted into a bento
            hero. Same content as before, richer container. */}
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="wide">
            {bestSource ? (
              <div className="hover-lift relative flex h-full flex-col justify-center overflow-hidden rounded-2xl border border-border bg-card p-5">
                <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
                <div className="relative flex items-start gap-3">
                  <Target className="mt-0.5 h-5 w-5 shrink-0 text-spectrum-hot" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> What the data says
                    </div>
                    <p className="display-serif text-lg leading-snug">
                      <span className="font-semibold text-spectrum-hot">{bestSource.name}</span> is
                      your strongest channel: {bestSource.leads} leads turned into{" "}
                      {bestSource.clients} clients ({bestSource.closeRate}% close rate) at{" "}
                      <span className="font-mono text-base">
                        ${bestSource.avgDeal.toLocaleString()}
                      </span>{" "}
                      per deal.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Put more time and budget here first.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center rounded-2xl border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
                Tag at least 3 leads to a channel and close one deal — then this box tells you
                exactly where to double down.
              </div>
            )}
          </BentoCell>
        </BentoGrid>

        {/* Share of leads — real donut chart (recharts PieChart, this app's
            existing chart library — no new dependency), replacing the old
            proportional-bar list per Sales Tracking Part 7. */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="text-2xs font-semibold uppercase tracking-wider">
              Share of leads by channel
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 text-2xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add channel
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New traffic channel</DialogTitle>
                </DialogHeader>
                <AddChannelForm onSubmit={(f) => create.mutate(f)} pending={create.isPending} />
              </DialogContent>
            </Dialog>
          </div>
          <div className="p-4">
            {ranked.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={ranked.map((b) => ({ name: b.name, value: b.leads }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius="55%"
                        outerRadius="90%"
                        paddingAngle={2}
                      >
                        {ranked.map((b, i) => (
                          <Cell key={b.id} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip formatter={(v: number) => `${v} leads`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-1.5">
                  {ranked.map((b, i) => {
                    const share = attributedLeads ? (b.leads / attributedLeads) * 100 : 0;
                    return (
                      <div key={b.id} className="flex items-center gap-2 text-xs">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        />
                        <span className="flex-1 truncate font-medium">{b.name}</span>
                        <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                          {b.leads} · {share.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Signpost className="h-4 w-4" />}
                title="No channels yet"
                description="Add a channel, then tag leads to it to see the share of leads breakdown."
                action={
                  <Button size="sm" onClick={() => setOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first channel
                  </Button>
                }
              />
            )}
          </div>
        </section>

        {/* Channel cards — the readable version of the old multi-metric chart */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ranked.map((b) => {
            const v = verdict(b);
            const bar = Math.min(
              100,
              avgRevPerLead ? (b.revenuePerLead / (avgRevPerLead * 2)) * 100 : 0,
            );
            return (
              <div key={b.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{b.name}</div>
                    <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                      {b.category}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wider ${v.tone}`}
                    >
                      {v.label}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          aria-label="Channel actions"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {b.trackingUrl && (
                          <DropdownMenuItem
                            onClick={() => {
                              navigator.clipboard.writeText(b.trackingUrl!);
                              toast.success("Tracking URL copied");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5 mr-2" /> Copy tracking URL
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => toggleActive.mutate({ id: b.id, is_active: b.isActive })}
                        >
                          <Power className="h-3.5 w-3.5 mr-2" />{" "}
                          {b.isActive ? "Deactivate" : "Activate"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Remove ${b.name}?`)) deleteSource.mutate(b.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                      Revenue per lead
                    </span>
                    <span className="font-mono text-lg font-semibold text-spectrum-hot">
                      ${b.revenuePerLead.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full bg-spectrum-hot"
                      style={{ width: `${Math.max(2, bar)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-3xs text-muted-foreground">
                    Workspace average ${avgRevPerLead.toLocaleString()}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Leads" value={b.leads.toString()} />
                  <Stat label="Became clients" value={b.clients.toString()} />
                  <Stat label="Close rate" value={`${b.closeRate}%`} />
                  <Stat label="Avg deal" value={`$${b.avgDeal.toLocaleString()}`} />
                  <Stat label="Total revenue" value={`$${b.revenue.toLocaleString()}`} />
                  <Stat label="Client LTV" value={`$${b.ltv.toLocaleString()}`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Ranked table — plain-English headers */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="text-2xs font-semibold uppercase tracking-wider">
              Every channel, best to worst
            </div>
            <div className="mt-0.5 text-2xs text-muted-foreground">
              Sorted by revenue per lead — the honest measure of a channel.
            </div>
          </div>
          <GlassTableShell>
            <table className="w-full text-sm">
              <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">#</th>
                  <th className="p-3 text-left">Channel</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right font-mono">Leads</th>
                  <th className="p-3 text-right font-mono">Clients</th>
                  <th className="p-3 text-right font-mono">Close rate</th>
                  <th className="p-3 text-right font-mono">Avg deal</th>
                  <th className="p-3 text-right font-mono">Revenue / lead</th>
                  <th className="p-3 text-left">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((b, i) => {
                  const v = verdict(b);
                  return (
                    <tr key={b.id} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="p-3 font-medium">{b.name}</td>
                      <td className="p-3 text-xs uppercase text-muted-foreground">{b.category}</td>
                      <td className="p-3 text-right font-mono">{b.leads}</td>
                      <td className="p-3 text-right font-mono text-spectrum-hot">{b.clients}</td>
                      <td className="p-3 text-right font-mono">{b.closeRate}%</td>
                      <td className="p-3 text-right font-mono">${b.avgDeal.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-semibold">
                        ${b.revenuePerLead.toLocaleString()}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-3xs uppercase tracking-wider ${v.tone}`}
                        >
                          {v.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {ranked.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState
                        icon={<Signpost className="h-4 w-4" />}
                        title="No channels yet"
                        description="Add one, then tag leads to it."
                        action={
                          <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add channel
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border px-2 py-1.5">
      <div className="text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm">{value}</div>
    </div>
  );
}

function AddChannelForm({
  onSubmit,
  pending,
}: {
  onSubmit: (f: FormData) => void;
  pending: boolean;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const trackingUrl = buildTrackingUrl(
    baseUrl || null,
    utmSource || null,
    utmMedium || null,
    utmCampaign || null,
  );

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input name="name" placeholder="Instagram Reels / YouTube Long / Meta Ads" required />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select name="category" defaultValue="organic">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["organic", "paid", "referral", "email", "affiliate", "partnership", "other"].map(
              (c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Landing page URL (optional)</Label>
        <Input
          name="base_url"
          type="url"
          placeholder="https://yoursite.com/offer"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1.5">
          <Label className="text-2xs">UTM source</Label>
          <Input
            name="utm_source"
            placeholder="instagram"
            value={utmSource}
            onChange={(e) => setUtmSource(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-2xs">UTM medium</Label>
          <Input
            name="utm_medium"
            placeholder="reel"
            value={utmMedium}
            onChange={(e) => setUtmMedium(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-2xs">UTM campaign</Label>
          <Input
            name="utm_campaign"
            placeholder="q3-launch"
            value={utmCampaign}
            onChange={(e) => setUtmCampaign(e.target.value)}
          />
        </div>
      </div>
      {trackingUrl && (
        <div className="space-y-1.5">
          <Label className="text-2xs">Generated tracking URL</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate rounded border border-border bg-muted/30 px-2 py-1.5 font-mono text-2xs">
              {trackingUrl}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(trackingUrl);
                toast.success("Tracking URL copied");
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
