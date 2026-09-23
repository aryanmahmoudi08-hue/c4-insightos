import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockTrafficHierarchy } from "@/lib/dev-mock-data";
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
import { TaxonomySelect } from "@/components/taxonomy-select";
import { Plus, TrendingUp, Signpost, MoreVertical, Copy, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { PlatformIcon } from "@/components/platform-icon";
import { FunnelInstrument } from "@/components/funnel-instrument";
import { FUNNEL_STAGES, type FunnelStage } from "@/lib/content-taxonomy";
import {
  MECHANISMS,
  MECHANISM_KEYS,
  MECHANISM_COLORS,
  variationLabel,
  type MechanismKey,
} from "@/lib/content-mechanisms";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  buildTrafficHierarchy,
  rollupByFunnelStage,
  resolveLead,
  QUALIFIED_OR_LATER,
  type TrafficHierarchy,
  type TrafficPlatformNode,
  type TrafficFormatNode,
  type TrafficContentNode,
  type TrafficMetrics,
  type Resolved,
} from "@/lib/traffic-hierarchy";
import { deriveCap, type Derivation } from "@/lib/funnel-derivation";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { ChartTooltip } from "@/components/chart-tooltip";
import { usdCentsForRow } from "@/lib/currency";
import { useFxRates } from "@/hooks/use-fx-rates";

const DONUT_COLORS = [
  "var(--spectrum-hot)",
  "var(--spectrum-mid)",
  "var(--spectrum-cold)",
  "var(--accent)",
  "var(--primary)",
  "var(--color-warning)",
  "var(--color-success)",
];

/** Every drill-down on this page narrows to one of these dimensions —
 * shared at module scope so both the page component and the platform/format
 * section components below can open the same panel with the same filter
 * shape (module-level rather than exported: Traffic-page-internal only). */
type DrillFilter = {
  platform?: string;
  format?: string;
  contentKey?: string;
  funnelStage?: FunnelStage | "unknown";
};
type DrillMetric = "leads" | "qualified" | "bookings" | "shows" | "closes" | "revenue" | "cash";
type OpenDrillFn = (
  filter: DrillFilter,
  metric: DrillMetric,
  title: string,
  subtitle: string,
) => void;

export const Route = createFileRoute("/_authenticated/traffic")({ component: Traffic });

const fmt = (n: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
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

// Minimum sample before a platform is compared/verdicted — same nominal
// threshold the rest of the app uses for "don't read noise as signal."
const MIN_SAMPLE = 3;

// No prior-period query exists on this page (Traffic answers "where are
// leads coming from right now," not a trend page) — "what's working" stays
// honestly unevaluated here rather than fabricating a comparison; "what's
// capping it" is real (deriveCap only needs the current period's funnel
// stages) wherever a drill-down came from the Funnel Instrument.
const NOT_EVALUATED: Derivation = {
  status: "insufficient_data",
  sentence: "Not evaluated on this page — see Content Command Center's funnel trend for that.",
};

type SortKey = "leads" | "qualifiedLeads" | "bookings" | "shows" | "closes" | "collectedCents";

/** Single source of truth for the sort-metric label — used by the sort
 * buttons in "What's doing best" and by the "sorted by" indicator on the
 * platform-sections hierarchy, so both always agree on what "top performer"
 * currently means. Never hard-code cash as the definition of performance —
 * this is whichever metric the user has actually selected. */
const SORT_KEY_LABELS: Record<SortKey, string> = {
  leads: "Leads",
  qualifiedLeads: "Qualified",
  bookings: "Bookings",
  shows: "Shows",
  closes: "Closes",
  collectedCents: "Cash",
};
const SORT_KEY_ORDER: SortKey[] = [
  "leads",
  "qualifiedLeads",
  "bookings",
  "shows",
  "closes",
  "collectedCents",
];

/** Standalone route wrapper — just the page chrome (TopBar) around the real
 * content below. Content Command Center embeds `TrafficPageContent`
 * directly instead (`embedded`), so there's exactly one implementation of
 * Traffic's data/filters/drill-downs, never a second copy. */
function Traffic() {
  return <TrafficPageContent />;
}

export function TrafficPageContent({ embedded = false }: { embedded?: boolean } = {}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { range } = useDateRange();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;

  const [platformFilter, setPlatformFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [funnelFilter, setFunnelFilter] = useState<FunnelStage | "unknown" | "all">("all");
  // Mechanism/variation are cross-cutting filters, not another nesting level
  // in the hierarchy below — a mechanism can legitimately occur at any
  // funnel stage, never assumed to correlate with one.
  const [mechanismFilter, setMechanismFilter] = useState<MechanismKey | "all">("all");
  const [variationFilter, setVariationFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("collectedCents");

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
      return data ?? [];
    },
  });

  // Leads in range, with the fields the platform-first hierarchy needs to
  // resolve real platform/format/campaign (see traffic-hierarchy.ts).
  const { data: leads } = useQuery({
    queryKey: ["leads-by-source", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, full_name, email, status, created_at, traffic_source_id, source_content_id, first_touch_content_id, source_platform, source_format, source_campaign",
        )
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: calls } = useQuery({
    queryKey: ["traffic-calls", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, lead_id, closed, showed, scheduled_for, contract_value_cents, cash_collected_cents, original_currency",
        )
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contentPieces } = useQuery({
    queryKey: ["traffic-content-pieces", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, source_platform, funnel_stage, mechanism, variation")
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
      toast.success("Source removed");
      qc.invalidateQueries({ queryKey: ["traffic-sources"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  // Remediation (currency-mixing audit,
  // docs/ascendos-currency-mixing-audit.md): calls.contract_value_cents/
  // cash_collected_cents carry a real original_currency never converted
  // before this fix — traffic-hierarchy.ts's addCallToMetrics() sums them
  // raw (a `+=` accumulation the original audit's `.reduce()`-only grep
  // missed). Normalize each call to USD cents here, before it reaches that
  // pure aggregation function, same proven sumNormalizedCents infrastructure
  // as closer.tsx (usdCentsForRow is its per-row counterpart).
  const trafficFxRates = useFxRates({
    rows: calls ?? [],
    getCurrency: (c: NonNullable<typeof calls>[number]) => c.original_currency,
    getDate: (c: NonNullable<typeof calls>[number]) => c.scheduled_for?.slice(0, 10),
  });
  const { normalizedCalls, callsFxIncomplete } = useMemo(() => {
    let incomplete = false;
    const rows = (calls ?? []).map((c) => {
      const day = c.scheduled_for?.slice(0, 10);
      const cash = usdCentsForRow(c.cash_collected_cents, c.original_currency, day, trafficFxRates);
      const contract = usdCentsForRow(
        c.contract_value_cents,
        c.original_currency,
        day,
        trafficFxRates,
      );
      if (cash.excluded || contract.excluded) incomplete = true;
      return { ...c, cash_collected_cents: cash.usd, contract_value_cents: contract.usd };
    });
    return { normalizedCalls: rows, callsFxIncomplete: incomplete };
  }, [calls, trafficFxRates]);

  // Real computation always runs (every query above fires for real, even
  // under devBypass) — only the *display* falls back to a deterministic
  // fixture when the real, RLS-empty-under-devBypass result has nothing to
  // show. Same rule this page has followed since before this pass.
  const realHierarchy = useMemo(
    () =>
      buildTrafficHierarchy(
        (leads ?? []).map((l) => ({ ...l, status: l.status as string })),
        normalizedCalls,
        contentPieces ?? [],
        (sources ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category,
          utm_source: s.utm_source,
          utm_campaign: s.utm_campaign,
        })),
      ),
    [leads, normalizedCalls, contentPieces, sources],
  );
  const hierarchy: TrafficHierarchy =
    devBypass && realHierarchy.totals.leads === 0 ? mockTrafficHierarchy() : realHierarchy;

  const platformOptions = hierarchy.platforms.map((p) => p.platform);
  const formatOptions = useMemo(() => {
    const scoped =
      platformFilter === "all"
        ? hierarchy.platforms
        : hierarchy.platforms.filter((p) => p.platform === platformFilter);
    const set = new Set<string>();
    for (const p of scoped) for (const f of p.formats) set.add(f.format);
    return Array.from(set);
  }, [hierarchy, platformFilter]);

  // Only real mechanisms/variations actually present in the data — never
  // the full taxonomy regardless of what's tagged, so an option only shows
  // up when there's something real behind it.
  const mechanismOptions = useMemo(() => {
    const set = new Set<MechanismKey>();
    for (const p of hierarchy.platforms)
      for (const f of p.formats) for (const c of f.content) if (c.mechanism) set.add(c.mechanism);
    return MECHANISM_KEYS.filter((k) => set.has(k));
  }, [hierarchy]);
  const variationOptions = useMemo(() => {
    // Keyed by the real per-record (mechanism, variation) pairing — never
    // guessed — so the label is always looked up against the mechanism that
    // content piece actually carries, not whatever the filter happens to be
    // set to.
    const byValue = new Map<string, { mechanism: MechanismKey; variation: string }>();
    for (const p of hierarchy.platforms)
      for (const f of p.formats)
        for (const c of f.content) {
          if (!c.variation || !c.mechanism) continue;
          if (mechanismFilter !== "all" && c.mechanism !== mechanismFilter) continue;
          byValue.set(c.variation, { mechanism: c.mechanism, variation: c.variation });
        }
    return Array.from(byValue.values()).map(({ mechanism, variation }) => ({
      value: variation,
      label: variationLabel(mechanism, variation) ?? variation,
    }));
  }, [hierarchy, mechanismFilter]);

  const filteredPlatforms = useMemo(() => {
    return hierarchy.platforms
      .filter((p) => platformFilter === "all" || p.platform === platformFilter)
      .map((p) => ({
        ...p,
        formats: p.formats
          .filter((f) => formatFilter === "all" || f.format === formatFilter)
          .map((f) => ({
            ...f,
            content: f.content.filter(
              (c) =>
                (funnelFilter === "all" || c.funnelStage === funnelFilter) &&
                (mechanismFilter === "all" || c.mechanism === mechanismFilter) &&
                (variationFilter === "all" || c.variation === variationFilter),
            ),
          }))
          .filter((f) => f.content.length > 0),
      }))
      .filter((p) => p.formats.length > 0);
  }, [hierarchy, platformFilter, formatFilter, funnelFilter, mechanismFilter, variationFilter]);

  const funnelRollup = useMemo(() => rollupByFunnelStage(hierarchy), [hierarchy]);
  const funnelStages = FUNNEL_STAGES.map((stage) => ({
    key: stage,
    label: stage.toUpperCase(),
    value: funnelRollup[stage].leads,
    spectrum:
      stage === "tof" ? ("cold" as const) : stage === "mof" ? ("mid" as const) : ("hot" as const),
  }));

  const comparisonRows = useMemo(
    () => [...hierarchy.platforms].sort((a, b) => b.metrics[sortKey] - a.metrics[sortKey]),
    [hierarchy, sortKey],
  );

  const maxPlatformLeads = Math.max(1, ...hierarchy.platforms.map((p) => p.metrics.leads));

  // --- Drill-down data layer: every meaningful number on this page is a
  // real, filtered slice of these same `leads`/`calls` arrays, resolved via
  // the exact same resolveLead() the hierarchy above was built from — never
  // a second aggregation engine, and every click preserves whatever
  // platform/format/content/funnel-stage dimensions it was scoped to plus
  // the page's own active date range (leads/calls are already range-scoped
  // queries) and the current top-of-page filters (sections only render
  // nodes that already passed those filters).
  const contentById = useMemo(
    () => new Map((contentPieces ?? []).map((c) => [c.id, c])),
    [contentPieces],
  );
  const sourceById = useMemo(() => new Map((sources ?? []).map((s) => [s.id, s])), [sources]);
  const resolvedLeads = useMemo(
    () =>
      (leads ?? []).map((l) => ({
        lead: l,
        resolved: resolveLead({ ...l, status: l.status as string }, contentById, sourceById),
      })),
    [leads, contentById, sourceById],
  );
  const resolvedCalls = useMemo(() => {
    const byLeadId = new Map(resolvedLeads.map((r) => [r.lead.id, r]));
    return (calls ?? []).map((c) => ({
      call: c,
      leadInfo: c.lead_id ? byLeadId.get(c.lead_id) : undefined,
    }));
  }, [calls, resolvedLeads]);

  type DrillState = {
    filter: DrillFilter;
    metric: DrillMetric;
    title: string;
    subtitle: string;
  } | null;
  const [drill, setDrill] = useState<DrillState>(null);

  const matchesDrillFilter = (r: Resolved, f: DrillFilter) => {
    if (f.platform && r.platform !== f.platform) return false;
    if (f.format && r.format !== f.format) return false;
    if (f.contentKey && r.contentKey !== f.contentKey) return false;
    if (f.funnelStage && r.funnelStage !== f.funnelStage) return false;
    return true;
  };

  type DrillRow =
    | { kind: "lead"; lead: (typeof resolvedLeads)[number]["lead"]; resolved: Resolved }
    | {
        kind: "call";
        call: (typeof resolvedCalls)[number]["call"];
        resolved: Resolved;
        leadName: string;
      };

  const drillRows: DrillRow[] = useMemo(() => {
    if (!drill) return [];
    if (drill.metric === "leads" || drill.metric === "qualified") {
      return resolvedLeads
        .filter(
          (r) =>
            matchesDrillFilter(r.resolved, drill.filter) &&
            (drill.metric === "leads" || QUALIFIED_OR_LATER.has(r.lead.status)),
        )
        .map((r) => ({ kind: "lead" as const, lead: r.lead, resolved: r.resolved }));
    }
    return resolvedCalls
      .filter(
        (rc) =>
          rc.leadInfo &&
          matchesDrillFilter(rc.leadInfo.resolved, drill.filter) &&
          (drill.metric === "shows"
            ? !!rc.call.showed
            : drill.metric === "bookings" || !!rc.call.closed),
      )
      .map((rc) => ({
        kind: "call" as const,
        call: rc.call,
        resolved: rc.leadInfo!.resolved,
        leadName: rc.leadInfo!.lead.full_name || rc.leadInfo!.lead.email || "Unnamed lead",
      }));
  }, [drill, resolvedLeads, resolvedCalls]);

  const openDrill = (filter: DrillFilter, metric: DrillMetric, title: string, subtitle: string) =>
    setDrill({ filter, metric, title, subtitle });

  const drillColumns: DetailColumn<DrillRow>[] = [
    {
      key: "who",
      label: "Lead",
      render: (r) =>
        r.kind === "lead" ? r.lead.full_name || r.lead.email || "Unnamed lead" : r.leadName,
    },
    { key: "platform", label: "Platform", render: (r) => r.resolved.platform },
    { key: "format", label: "Format", render: (r) => r.resolved.formatLbl },
    { key: "content", label: "Content / Campaign", render: (r) => r.resolved.contentLabel },
    {
      key: "status",
      label: "Status",
      render: (r) =>
        r.kind === "lead"
          ? r.lead.status
          : r.call.closed
            ? "Closed"
            : r.call.showed
              ? "Showed"
              : "Booked",
    },
    {
      key: "cash",
      label: "Cash",
      align: "right",
      render: (r) => (r.kind === "call" ? fmtMoney(r.call.cash_collected_cents ?? 0) : "—"),
    },
    {
      key: "revenue",
      label: "Revenue",
      align: "right",
      render: (r) =>
        r.kind === "call" ? (
          <span className="text-spectrum-cold">{fmtMoney(r.call.contract_value_cents ?? 0)}</span>
        ) : (
          "—"
        ),
    },
  ];

  const drillCap: Derivation = useMemo(() => {
    if (!drill?.filter.funnelStage || drill.filter.funnelStage === "unknown") return NOT_EVALUATED;
    const index = FUNNEL_STAGES.indexOf(drill.filter.funnelStage);
    if (index < 0) return NOT_EVALUATED;
    return deriveCap(funnelStages, index, MIN_SAMPLE);
  }, [drill, funnelStages]);

  return (
    <>
      {!embedded && (
        <TopBar
          title="Traffic"
          subtitle="Where attention and leads are coming from — platform first"
          showDateRange
        />
      )}
      <div className={embedded ? "space-y-5" : "p-4 md:p-6 space-y-5"}>
        {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-spectrum-mid/30 bg-spectrum-mid/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              This page answers "where are leads coming from." For what content is producing them
              and how it's contributing to the business, see Content Command Center; for how a
              specific lead/booking/revenue outcome moved through the system, see Attribution.
            </span>
            <div className="flex shrink-0 gap-3">
              <Link to="/content" className="font-medium text-primary hover:underline">
                Content Command Center →
              </Link>
              <Link to="/attribution" className="font-medium text-primary hover:underline">
                Attribution →
              </Link>
            </div>
          </div>
        )}

        {/* Overview */}
        <div id="traffic-overview" className="scroll-mt-24 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Leads tracked"
            value={fmt(hierarchy.totals.leads)}
            spectrum="cold"
            emphasis="subtle"
            icon={<TrendingUp className="h-4 w-4" />}
            hint={`${hierarchy.platforms.length} platform${hierarchy.platforms.length === 1 ? "" : "s"}`}
            onClick={() => openDrill({}, "leads", "All leads", "Every lead tracked in this range")}
          />
          <StatCard
            label="Qualified leads"
            value={fmt(hierarchy.totals.qualifiedLeads)}
            spectrum="mid"
            emphasis="subtle"
            hint={
              hierarchy.totals.leads
                ? `${Math.round((hierarchy.totals.qualifiedLeads / hierarchy.totals.leads) * 100)}% of tracked leads`
                : ""
            }
            onClick={() =>
              openDrill({}, "qualified", "Qualified leads", "Leads that reached qualified or later")
            }
          />
          <StatCard
            label="Bookings → shows → closes"
            value={`${fmt(hierarchy.totals.bookings)} → ${fmt(hierarchy.totals.shows)} → ${fmt(hierarchy.totals.closes)}`}
            spectrum="hot"
            emphasis="subtle"
            onClick={() =>
              openDrill(
                {},
                "bookings",
                "Booked calls",
                "Every call booked from a lead in this range",
              )
            }
          />
          <StatCard
            label={callsFxIncomplete ? "Cash collected · FX incomplete" : "Cash collected"}
            value={fmtMoney(hierarchy.totals.collectedCents)}
            spectrum="hot"
            emphasis="strong"
            hint={`${fmtMoney(hierarchy.totals.contractedCents)} contracted`}
            onClick={() =>
              openDrill({}, "cash", "Cash collected", "Closed calls with cash collected")
            }
          />
        </div>
        {hierarchy.unattributedLeads > 0 && (
          <p className="text-3xs text-muted-foreground">
            {hierarchy.unattributedLeads} lead{hierarchy.unattributedLeads === 1 ? "" : "s"} in this
            range have no resolvable platform, content, or source link —{" "}
            <span className="font-medium text-foreground">Unknown / Unattributed</span>, not
            guessed.
          </p>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/50 p-3">
          <span className="mr-1 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Filters
          </span>
          <TaxonomySelect
            label="Platform"
            value={platformFilter}
            onChange={(v) => {
              setPlatformFilter(v);
              setFormatFilter("all");
            }}
            options={platformOptions.map((p) => ({ value: p, label: p }))}
          />
          <TaxonomySelect
            label="Format"
            value={formatFilter}
            onChange={setFormatFilter}
            options={formatOptions.map((f) => ({
              value: f,
              label: f === "unknown" ? "Unidentified" : f.replace(/_/g, " "),
            }))}
          />
          <TaxonomySelect
            label="Funnel stage"
            value={funnelFilter}
            onChange={(v) => setFunnelFilter(v as FunnelStage | "unknown" | "all")}
            options={[
              ...FUNNEL_STAGES.map((s) => ({ value: s, label: s.toUpperCase() })),
              { value: "unknown", label: "Unknown" },
            ]}
          />
          {mechanismOptions.length > 0 && (
            <TaxonomySelect
              label="Mechanism"
              value={mechanismFilter}
              onChange={(v) => {
                setMechanismFilter(v as MechanismKey | "all");
                setVariationFilter("all");
              }}
              options={mechanismOptions.map((k) => ({ value: k, label: MECHANISMS[k].label }))}
            />
          )}
          {variationOptions.length > 0 && (
            <TaxonomySelect
              label="Variation"
              value={variationFilter}
              onChange={setVariationFilter}
              options={variationOptions}
            />
          )}
        </div>

        {/* Share of leads by platform — real donut chart, proportional
            reading is genuinely the point here (unlike a bar list). */}
        <section
          id="traffic-platform-mix"
          className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5"
        >
          <div className="mb-3">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Platform mix
            </div>
            <div className="mt-0.5 text-base font-semibold">Share of leads by platform</div>
          </div>
          {hierarchy.platforms.length === 0 ? (
            <EmptyState icon={<Signpost className="h-4 w-4" />} title="No leads tracked yet" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_1fr]">
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={hierarchy.platforms.map((p) => ({
                        name: p.platform,
                        value: p.metrics.leads,
                      }))}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="90%"
                      paddingAngle={2}
                      onClick={(d: { name?: string }) =>
                        d.name &&
                        openDrill(
                          { platform: d.name },
                          "leads",
                          d.name,
                          `All leads attributed to ${d.name}`,
                        )
                      }
                      className="cursor-pointer"
                    >
                      {hierarchy.platforms.map((p, i) => (
                        <Cell key={p.platform} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={<ChartTooltip formatter={(v: number) => `${v} leads`} />}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center gap-1.5">
                {hierarchy.platforms.map((p, i) => {
                  const share = hierarchy.totals.leads
                    ? (p.metrics.leads / hierarchy.totals.leads) * 100
                    : 0;
                  return (
                    <button
                      key={p.platform}
                      type="button"
                      onClick={() =>
                        openDrill(
                          { platform: p.platform },
                          "leads",
                          p.platform,
                          `All leads attributed to ${p.platform}`,
                        )
                      }
                      className="flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/30"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                      />
                      <span className="flex-1 truncate font-medium">{p.platform}</span>
                      <span className="shrink-0 font-sans tabular-nums text-2xs text-muted-foreground">
                        {p.metrics.leads} · {share.toFixed(0)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Platform-first hierarchy, now full sections instead of a cramped
            nested list — one spacious card per real platform, each with
            clickable KPIs and bigger format sub-cards. */}
        <section id="traffic-platforms" className="scroll-mt-24">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Platform sections
              </div>
              <div className="mt-0.5 text-base font-semibold">
                Platform → format → funnel stage → content
              </div>
            </div>
            <div className="text-3xs text-muted-foreground">
              Content within each funnel stage sorted by{" "}
              <span className="font-semibold text-foreground">{SORT_KEY_LABELS[sortKey]}</span>
            </div>
          </div>
          {hierarchy.platforms.length === 0 ? (
            <EmptyState
              icon={<Signpost className="h-4 w-4" />}
              title="No leads tracked yet"
              description="Once leads carry a platform, content, or source link, they'll show up here grouped by real platform — never by an ad-hoc channel name."
            />
          ) : filteredPlatforms.length === 0 ? (
            <EmptyState
              icon={<Signpost className="h-4 w-4" />}
              title="No leads match the current filters"
              description="Widen the platform, format, or funnel-stage filter above."
            />
          ) : (
            <Accordion
              type="multiple"
              className="space-y-3"
              defaultValue={[filteredPlatforms[0]?.platform]}
            >
              {filteredPlatforms.map((p) => (
                <PlatformSection
                  key={p.platform}
                  node={p}
                  maxLeads={maxPlatformLeads}
                  sortKey={sortKey}
                  onOpenDrill={openDrill}
                />
              ))}
            </Accordion>
          )}
        </section>

        {/* Funnel stage analysis */}
        <section id="traffic-funnel" className="scroll-mt-24 grid gap-3 lg:grid-cols-[1.4fr_0.6fr]">
          <FunnelInstrument
            title="Funnel stage"
            subtitle="Leads by TOF / MOF / BOF, from real content funnel_stage tags"
            stages={funnelStages}
            onStageClick={(i) => {
              const stage = FUNNEL_STAGES[i];
              if (!stage) return;
              openDrill(
                { funnelStage: stage },
                "leads",
                `${stage.toUpperCase()} leads`,
                `Leads whose linked content is tagged ${stage.toUpperCase()}`,
              );
            }}
          />
          <button
            type="button"
            onClick={() =>
              openDrill(
                { funnelStage: "unknown" },
                "leads",
                "Unknown / insufficient data",
                "Leads whose source has no content link, so no funnel_stage tag exists to classify them",
              )
            }
            className="rounded-2xl border border-border bg-background/45 p-4 text-left transition hover:border-ring/40"
          >
            <div className="text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Unknown / insufficient data
            </div>
            <div className="mt-3 font-sans text-2xl font-semibold tabular-nums text-muted-foreground">
              {fmt(funnelRollup.unknown.leads)}
            </div>
            <div className="mt-1 text-3xs leading-relaxed text-muted-foreground">
              Leads whose source has no content link (so no funnel_stage tag exists to classify
              them) — shown separately rather than folded into TOF by default.
            </div>
          </button>
        </section>

        {/* What's doing best — real metrics, no arbitrary score */}
        <section
          id="traffic-comparison"
          className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                What's doing best
              </div>
              <div className="mt-0.5 text-base font-semibold">Platform comparison</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SORT_KEY_ORDER.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={`rounded border px-2 py-1 text-3xs font-medium transition ${
                    sortKey === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {SORT_KEY_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
          {comparisonRows.length === 0 ? (
            <EmptyState icon={<Signpost className="h-4 w-4" />} title="Nothing to compare yet" />
          ) : (
            <GlassTableShell>
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Platform</th>
                    <th className="p-3 text-right font-sans tabular-nums">Leads</th>
                    <th className="p-3 text-right font-sans tabular-nums">Qualified</th>
                    <th className="p-3 text-right font-sans tabular-nums">Bookings</th>
                    <th className="p-3 text-right font-sans tabular-nums">Shows</th>
                    <th className="p-3 text-right font-sans tabular-nums">Closes</th>
                    <th className="p-3 text-right font-sans tabular-nums">Contracted</th>
                    <th className="p-3 text-right font-sans tabular-nums">Cash collected</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((r) => {
                    const cell = (metric: DrillMetric, label: string, value: string, cls = "") => (
                      <td className="p-0 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            openDrill(
                              { platform: r.platform },
                              metric,
                              `${r.platform} — ${label}`,
                              `${label} for ${r.platform} in this range`,
                            )
                          }
                          className={`w-full p-3 text-right font-sans tabular-nums hover:underline ${cls}`}
                        >
                          {value}
                        </button>
                      </td>
                    );
                    return (
                      <tr key={r.platform} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3">
                          <span className="flex items-center gap-1.5 font-medium">
                            <PlatformIcon platform={r.platform} className="h-3.5 w-3.5" />
                            {r.platform}
                            {r.metrics.leads < MIN_SAMPLE && (
                              <span
                                className="rounded border border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10 px-1 py-0.5 text-4xs uppercase tracking-wide text-[color:var(--color-warning)]"
                                title={`Only ${r.metrics.leads} lead${r.metrics.leads === 1 ? "" : "s"} — too small a sample to read as signal.`}
                              >
                                Small sample
                              </span>
                            )}
                          </span>
                        </td>
                        {cell("leads", "Leads", fmt(r.metrics.leads))}
                        {cell("qualified", "Qualified leads", fmt(r.metrics.qualifiedLeads))}
                        {cell("bookings", "Bookings", fmt(r.metrics.bookings))}
                        {cell("shows", "Shows", fmt(r.metrics.shows))}
                        {cell("closes", "Closes", fmt(r.metrics.closes), "text-spectrum-hot")}
                        {cell("cash", "Contracted value", fmtMoney(r.metrics.contractedCents))}
                        {cell(
                          "cash",
                          "Cash collected",
                          fmtMoney(r.metrics.collectedCents),
                          "font-semibold text-spectrum-hot",
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </GlassTableShell>
          )}
        </section>

        {/* Source / tracking-URL management — the genuinely useful CRUD, kept */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wider">
                Manage sources & tracking URLs
              </div>
              <div className="mt-0.5 text-3xs text-muted-foreground">
                Configuration only — performance for these lives in the platform hierarchy above.
              </div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 text-2xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add source
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New traffic source</DialogTitle>
                </DialogHeader>
                <AddChannelForm onSubmit={(f) => create.mutate(f)} pending={create.isPending} />
              </DialogContent>
            </Dialog>
          </div>
          <GlassTableShell>
            <table className="w-full text-sm">
              <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3 text-left">Category</th>
                  <th className="p-3 text-left">Tracking URL</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sources ?? []).map((s) => {
                  const trackingUrl = buildTrackingUrl(
                    s.base_url,
                    s.utm_source,
                    s.utm_medium,
                    s.utm_campaign,
                  );
                  return (
                    <tr key={s.id} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-xs uppercase text-muted-foreground">{s.category}</td>
                      <td className="p-3 max-w-[280px] truncate font-sans text-2xs text-muted-foreground">
                        {trackingUrl ?? "—"}
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-3xs uppercase tracking-wider ${
                            s.is_active
                              ? "border-[color:var(--color-success)]/40 text-[color:var(--color-success)] bg-[color:var(--color-success)]/10"
                              : "border-border text-muted-foreground bg-muted/40"
                          }`}
                        >
                          {s.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                              aria-label="Source actions"
                            >
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {trackingUrl && (
                              <DropdownMenuItem
                                onClick={() => {
                                  navigator.clipboard.writeText(trackingUrl);
                                  toast.success("Tracking URL copied");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5 mr-2" /> Copy tracking URL
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() =>
                                toggleActive.mutate({ id: s.id, is_active: s.is_active })
                              }
                            >
                              <Power className="h-3.5 w-3.5 mr-2" />{" "}
                              {s.is_active ? "Deactivate" : "Activate"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm(`Remove ${s.name}?`)) deleteSource.mutate(s.id);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {(sources ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        icon={<Signpost className="h-4 w-4" />}
                        title="No sources yet"
                        description="Add one to generate a tracking URL for it."
                        action={
                          <Button size="sm" onClick={() => setOpen(true)}>
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add source
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

      <MetricDetailPanel<DrillRow>
        open={!!drill}
        onOpenChange={(v) => !v && setDrill(null)}
        title={drill?.title ?? ""}
        subtitle={drill?.subtitle}
        columns={drillColumns}
        rows={drillRows}
        rowKey={(r) => (r.kind === "lead" ? `lead-${r.lead.id}` : `call-${r.call.id}`)}
        cap={drillCap}
        working={NOT_EVALUATED}
        emptyRowsLabel="No records for this drill-down in the current range."
      />
    </>
  );
}

function MetricRow({ metrics }: { metrics: TrafficMetrics }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs text-muted-foreground">
      <span>{fmt(metrics.leads)} leads</span>
      <span>{fmt(metrics.qualifiedLeads)} qualified</span>
      <span>{fmt(metrics.bookings)} booked</span>
      <span>{fmt(metrics.shows)} showed</span>
      <span>{fmt(metrics.closes)} closed</span>
      <span className="font-medium text-spectrum-hot">{fmtMoney(metrics.collectedCents)} cash</span>
      <span className="font-medium text-spectrum-cold">
        {fmtMoney(metrics.contractedCents)} revenue
      </span>
    </div>
  );
}

function sumMetrics(items: TrafficContentNode[]): TrafficMetrics {
  const totals: TrafficMetrics = {
    leads: 0,
    qualifiedLeads: 0,
    bookings: 0,
    shows: 0,
    closes: 0,
    contractedCents: 0,
    collectedCents: 0,
  };
  for (const item of items) {
    totals.leads += item.metrics.leads;
    totals.qualifiedLeads += item.metrics.qualifiedLeads;
    totals.bookings += item.metrics.bookings;
    totals.shows += item.metrics.shows;
    totals.closes += item.metrics.closes;
    totals.contractedCents += item.metrics.contractedCents;
    totals.collectedCents += item.metrics.collectedCents;
  }
  return totals;
}

const FUNNEL_STAGE_ORDER: (FunnelStage | "unknown")[] = ["tof", "mof", "bof", "unknown"];
const FUNNEL_STAGE_LABELS: Record<FunnelStage | "unknown", string> = {
  tof: "Top of funnel",
  mof: "Middle of funnel",
  bof: "Bottom of funnel",
  unknown: "Unknown stage",
};

/** Groups a format's content leaves by real funnel_stage tag (never
 * assumed from mechanism/platform/format) and sorts each group by whichever
 * metric the page's sort control is currently set to — "top performer"
 * always means the same thing here as it does in "What's doing best" above.
 * Empty stage buckets are dropped, never rendered as a hollow "0" group. */
function groupContentByFunnelStage(content: TrafficContentNode[], sortKey: SortKey) {
  const groups = new Map<FunnelStage | "unknown", TrafficContentNode[]>();
  for (const c of content) {
    const arr = groups.get(c.funnelStage) ?? [];
    arr.push(c);
    groups.set(c.funnelStage, arr);
  }
  return FUNNEL_STAGE_ORDER.filter((stage) => groups.has(stage)).map((stage) => {
    const items = [...groups.get(stage)!].sort((a, b) => b.metrics[sortKey] - a.metrics[sortKey]);
    return { stage, items, metrics: sumMetrics(items) };
  });
}

/** A full, spacious section per real platform, now a real dropdown —
 * collapsed by default reads as a scannable list, expanding reveals the
 * full format → funnel-stage → content drill-down underneath. Clickable KPI
 * tiles and content leaves all drill through the same `onOpenDrill`, so
 * every number here opens the real leads/calls behind it, scoped to
 * platform (+format+content when clicked deeper), never a generic
 * unfiltered list. */
function PlatformSection({
  node,
  maxLeads,
  sortKey,
  onOpenDrill,
}: {
  node: TrafficPlatformNode;
  maxLeads: number;
  sortKey: SortKey;
  onOpenDrill: OpenDrillFn;
}) {
  const width = Math.max(4, Math.round((node.metrics.leads / maxLeads) * 100));
  const tiles: [DrillMetric, string, string][] = [
    ["leads", "Leads", fmt(node.metrics.leads)],
    ["qualified", "Qualified", fmt(node.metrics.qualifiedLeads)],
    ["bookings", "Booked", fmt(node.metrics.bookings)],
    ["shows", "Showed", fmt(node.metrics.shows)],
    ["closes", "Closed", fmt(node.metrics.closes)],
    ["cash", "Cash", fmtMoney(node.metrics.collectedCents)],
    ["revenue", "Revenue", fmtMoney(node.metrics.contractedCents)],
  ];
  return (
    <AccordionItem
      value={node.platform}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <div className="border-b border-border/60 bg-muted/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <AccordionTrigger className="flex-1 py-0 hover:no-underline [&>svg]:h-5 [&>svg]:w-5">
            <div className="flex items-center gap-3">
              <PlatformIcon platform={node.platform} className="h-6 w-6 shrink-0" />
              <span className="text-2xl font-bold">{node.platform}</span>
            </div>
          </AccordionTrigger>
          <span className="shrink-0 font-sans text-xs tabular-nums text-muted-foreground">
            {fmt(node.metrics.leads)} leads
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded bg-muted/60">
          <div className="h-full rounded bg-spectrum-mid" style={{ width: `${width}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px bg-border/60 sm:grid-cols-4 lg:grid-cols-7">
        {tiles.map(([metric, label, value]) => (
          <button
            key={label}
            type="button"
            onClick={() =>
              onOpenDrill(
                { platform: node.platform },
                metric,
                `${node.platform} — ${label}`,
                `${label} for ${node.platform} in this range`,
              )
            }
            className="bg-card p-3 text-left transition hover:bg-muted/30"
          >
            <div className="text-4xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div
              className={`mt-1 font-sans text-base font-semibold tabular-nums ${
                metric === "revenue"
                  ? "text-spectrum-cold"
                  : metric === "cash"
                    ? "text-spectrum-hot"
                    : ""
              }`}
            >
              {value}
            </div>
          </button>
        ))}
      </div>
      <AccordionContent className="p-0">
        <Accordion type="multiple" className="space-y-2 p-4 pt-3">
          {node.formats.map((f) => (
            <FormatCard
              key={f.format}
              node={f}
              platform={node.platform}
              sortKey={sortKey}
              onOpenDrill={onOpenDrill}
            />
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

/** One format's dropdown within a platform section. Expanding it reveals
 * the format's content grouped by real funnel stage (TOF/MOF/BOF/Unknown),
 * each group sorted by the page's active sort metric. */
function FormatCard({
  node,
  platform,
  sortKey,
  onOpenDrill,
}: {
  node: TrafficFormatNode;
  platform: string;
  sortKey: SortKey;
  onOpenDrill: OpenDrillFn;
}) {
  const stageGroups = useMemo(
    () => groupContentByFunnelStage(node.content, sortKey),
    [node.content, sortKey],
  );
  return (
    <AccordionItem
      value={node.format}
      className="rounded-xl border border-border/60 bg-background/40"
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <AccordionTrigger className="flex-1 py-0 hover:no-underline">
          <span className="text-sm font-semibold">{node.formatLabel}</span>
        </AccordionTrigger>
        <button
          type="button"
          onClick={() =>
            onOpenDrill(
              { platform, format: node.format },
              "leads",
              `${platform} · ${node.formatLabel}`,
              `Leads for ${platform} · ${node.formatLabel} in this range`,
            )
          }
          className="shrink-0 rounded px-1.5 py-0.5 font-sans text-2xs tabular-nums text-muted-foreground underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-foreground"
        >
          {fmt(node.metrics.leads)} leads
        </button>
      </div>
      <div className="px-3 pb-2">
        <MetricRow metrics={node.metrics} />
      </div>
      <AccordionContent className="px-3 pb-3">
        <Accordion type="multiple" className="space-y-2">
          {stageGroups.map(({ stage, items, metrics }) => (
            <AccordionItem
              key={stage}
              value={stage}
              className="rounded-lg border border-border/50 bg-muted/10"
            >
              <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                <AccordionTrigger className="flex-1 py-0 hover:no-underline">
                  <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      {FUNNEL_STAGE_LABELS[stage]}
                    </span>
                    <span className="font-sans tabular-nums">{items.length}</span>
                  </div>
                </AccordionTrigger>
              </div>
              <div className="px-2.5 pb-2">
                <MetricRow metrics={metrics} />
              </div>
              <AccordionContent className="px-2.5 pb-2.5">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((c) => (
                    <ContentLeafTile
                      key={c.key}
                      content={c}
                      platform={platform}
                      format={node.format}
                      onOpenDrill={onOpenDrill}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  );
}

/** One content/campaign leaf — shows Mechanism → Variation → Funnel Stage
 * as compact badges (cross-cutting metadata, never a nesting level) plus
 * its real leads/cash, and drills into exactly those leads on click. */
function ContentLeafTile({
  content: c,
  platform,
  format,
  onOpenDrill,
}: {
  content: TrafficContentNode;
  platform: string;
  format: string;
  onOpenDrill: OpenDrillFn;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onOpenDrill(
          { platform, format, contentKey: c.key },
          "leads",
          c.label,
          `Leads for ${platform} · ${format} · ${c.label} in this range`,
        )
      }
      className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/60 px-2.5 py-2 text-left text-3xs transition hover:border-ring/40"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-foreground">{c.label}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-muted-foreground">
          {c.mechanism && (
            <span
              className="rounded px-1 py-px font-medium uppercase"
              style={{
                color: MECHANISM_COLORS[c.mechanism],
                backgroundColor: `color-mix(in oklch, ${MECHANISM_COLORS[c.mechanism]} 15%, transparent)`,
              }}
            >
              {MECHANISMS[c.mechanism].label}
            </span>
          )}
          {c.mechanism && c.variation && (
            <span className="rounded bg-muted px-1 py-px">
              {variationLabel(c.mechanism, c.variation) ?? c.variation}
            </span>
          )}
          <span className="rounded bg-muted px-1 py-px uppercase">
            {c.funnelStage === "unknown" ? "Unknown" : c.funnelStage}
          </span>
          <span className="font-sans tabular-nums">
            {fmt(c.metrics.leads)} leads · {fmtMoney(c.metrics.collectedCents)}
          </span>
        </div>
      </div>
      <PlatformIcon platform={platform} className="h-3 w-3 shrink-0 text-muted-foreground" />
    </button>
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
            <div className="flex-1 truncate rounded border border-border bg-muted/30 px-2 py-1.5 font-sans tabular-nums text-2xs">
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
