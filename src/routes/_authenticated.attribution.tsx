import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import { useMoney } from "@/hooks/use-money";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { buildDemoAttributionDataset } from "@/lib/demo-fixtures";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { TopBar } from "@/components/app-sidebar";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { GlassTableShell, FilterPills } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { ChartTooltip } from "@/components/chart-tooltip";
import { PlatformIcon } from "@/components/platform-icon";
import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from "recharts";
import { Route as RouteIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildAttributionPathsForModel,
  ATTRIBUTION_MODELS,
  ATTRIBUTION_MODEL_LABELS,
  aggregateCashByContent,
  aggregateCashByPlatform,
  identifyTopAttributionJourneys,
} from "@/lib/content-attribution";
import { normalizeAcquisitionSource, acquisitionSourceOptions } from "@/lib/acquisition-source";
import {
  socialPlatformOptions,
  normalizeSocialPlatform,
  type SocialPlatform,
} from "@/lib/social-platform";
import type { AttributionModel, CanonicalLifecycleAttributionPath } from "@/lib/acquisition";

/** All-optional so every other page can deep-link with only the params it
 * actually has a real value for (e.g. `search={{ vslId }}`) without being
 * forced to fabricate the rest. */
export type AttributionSearch = {
  model?: string;
  platform?: string;
  source?: string;
  campaign?: string;
  contentId?: string;
  setterId?: string;
  dialerId?: string;
  closerId?: string;
  offerId?: string;
  webinarId?: string;
  vslId?: string;
  menteeId?: string;
};

export const Route = createFileRoute("/_authenticated/attribution")({
  component: AttributionCommandCenter,
  validateSearch: (s: Record<string, unknown>): AttributionSearch => ({
    model: typeof s.model === "string" ? s.model : undefined,
    platform: typeof s.platform === "string" ? s.platform : undefined,
    source: typeof s.source === "string" ? s.source : undefined,
    campaign: typeof s.campaign === "string" ? s.campaign : undefined,
    contentId: typeof s.contentId === "string" ? s.contentId : undefined,
    setterId: typeof s.setterId === "string" ? s.setterId : undefined,
    dialerId: typeof s.dialerId === "string" ? s.dialerId : undefined,
    closerId: typeof s.closerId === "string" ? s.closerId : undefined,
    offerId: typeof s.offerId === "string" ? s.offerId : undefined,
    webinarId: typeof s.webinarId === "string" ? s.webinarId : undefined,
    vslId: typeof s.vslId === "string" ? s.vslId : undefined,
    menteeId: typeof s.menteeId === "string" ? s.menteeId : undefined,
  }),
});

const MODEL_EXPLANATIONS: Record<AttributionModel, string> = {
  first_touch: "The earliest known acquisition touchpoint.",
  lead_source: "The source credited with creating the lead.",
  booking_source: "The source credited with generating the booked call.",
  last_touch: "The most recent qualifying touchpoint before conversion.",
  assisted_touch:
    "Additional known touchpoints that contributed to the journey but are not receiving direct single-touch credit.",
};

const isValidModel = (m: string | undefined): m is AttributionModel =>
  !!m && (ATTRIBUTION_MODELS as string[]).includes(m);

function AttributionCommandCenter() {
  const search = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { range } = useDateRange();
  const money = useMoney();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;

  const [model, setModel] = useState<AttributionModel>(
    isValidModel(search.model) ? search.model : "first_touch",
  );
  const [platformFilter, setPlatformFilter] = useState<string>(search.platform ?? "all");
  const [sourceFilter, setSourceFilter] = useState<string>(search.source ?? "all");
  const [setterFilter, setSetterFilter] = useState<string>(
    search.setterId ?? search.dialerId ?? "all",
  );
  const [closerFilter, setCloserFilter] = useState<string>(search.closerId ?? "all");
  const [recordsOpen, setRecordsOpen] = useState(false);

  // Seed local filter state from an incoming deep link exactly once — every
  // other page in this app links here with real, already-resolved values
  // (never fabricated), so it's safe to trust them as the initial state.
  useEffect(() => {
    if (isValidModel(search.model)) setModel(search.model);
    if (search.platform) setPlatformFilter(search.platform);
    if (search.source) setSourceFilter(search.source);
    if (search.setterId || search.dialerId) setSetterFilter(search.setterId ?? search.dialerId!);
    if (search.closerId) setCloserFilter(search.closerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { demoMode } = useDemoMode();

  const { data, isLoading } = useQuery({
    queryKey: ["attribution-command-center", orgId, range.from, range.to, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      // Demo / Preview Data mode: a deterministic in-memory fixture dataset
      // fed through the exact same code below (canonical engine included) —
      // never a second engine, never a Supabase read/write. Every other
      // page in the app ignores this flag and always queries real data.
      let leadRows: Array<{
        id: string;
        created_at: string;
        source_content_id: string | null;
        first_touch_content_id: string | null;
        traffic_source_id: string | null;
      }>;
      let callRows: Array<{
        id: string;
        lead_id: string | null;
        created_at: string | null;
        closed: boolean | null;
        source_content_id: string | null;
        contract_value_cents: number | null;
        cash_collected_cents: number | null;
        setter_id: string | null;
        closer_id: string | null;
        showed: boolean | null;
      }>;
      let touchRows: Array<{ id: string; lead_id: string; content_id: string; touched_at: string }>;
      let contentRows: Array<{
        id: string;
        title: string | null;
        platform: string | null;
        source_platform: string | null;
      }>;
      let trafficRows: Array<{ id: string; category: string }>;
      let repNameById: Record<string, string>;

      if (demoMode) {
        const demo = buildDemoAttributionDataset();
        leadRows = demo.leadRows;
        callRows = demo.callRows;
        touchRows = demo.touchRows;
        contentRows = demo.contentRows;
        trafficRows = demo.trafficRows;
        repNameById = demo.repNameById;
      } else {
        const [leadsRes, callsRes, touchesRes, contentRes, trafficRes] = await Promise.all([
          supabase
            .from("leads")
            .select("id, created_at, source_content_id, first_touch_content_id, traffic_source_id")
            .eq("org_id", orgId!)
            .gte("created_at", fromISO)
            .lte("created_at", toISO),
          supabase
            .from("calls")
            .select(
              "id, lead_id, created_at, closed, source_content_id, contract_value_cents, cash_collected_cents, setter_id, closer_id, showed",
            )
            .eq("org_id", orgId!)
            .gte("created_at", fromISO)
            .lte("created_at", toISO),
          supabase
            .from("lead_content_touches")
            .select("id, lead_id, content_id, touched_at")
            .eq("org_id", orgId!)
            .gte("touched_at", fromISO)
            .lte("touched_at", toISO),
          supabase
            .from("content_pieces")
            .select("id, title, platform, source_platform")
            .eq("org_id", orgId!),
          supabase.from("traffic_sources").select("id, category").eq("org_id", orgId!),
        ]);

        leadRows = leadsRes.data ?? [];
        callRows = callsRes.data ?? [];
        touchRows = touchesRes.data ?? [];
        contentRows = contentRes.data ?? [];
        trafficRows = trafficRes.data ?? [];

        const repIds = Array.from(
          new Set(
            [...callRows.map((c) => c.setter_id), ...callRows.map((c) => c.closer_id)].filter(
              (v): v is string => !!v,
            ),
          ),
        );
        const profilesRes = repIds.length
          ? await supabase.from("profiles").select("id, display_name").in("id", repIds)
          : { data: [] as Array<{ id: string; display_name: string | null }> };
        repNameById = {};
        for (const p of profilesRes.data ?? []) repNameById[p.id] = p.display_name ?? p.id;
      }

      const closedRows = callRows.filter((c) => c.closed);

      const platformByContentId: Record<string, string | null> = {};
      const titleByContentId: Record<string, string> = {};
      for (const c of contentRows) {
        // `content_pieces.platform` is actually a FORMAT enum
        // (reel/tiktok/youtube/carousel/...), not a platform name —
        // `source_platform` carries the real platform-name evidence.
        // Resolve through the same `normalizeSocialPlatform(platform,
        // source_platform)` call content-command-center.tsx's
        // `pieceSocialPlatform` already uses, so this page's platform
        // filter/pills match the same real values everywhere else in the app.
        platformByContentId[c.id] = normalizeSocialPlatform(c.platform, c.source_platform);
        titleByContentId[c.id] = c.title ?? "(untitled)";
      }

      const trafficCategoryByLeadId: Record<string, string | null> = {};
      const trafficCategoryById: Record<string, string> = {};
      for (const t of trafficRows) trafficCategoryById[t.id] = t.category;
      for (const l of leadRows) {
        trafficCategoryByLeadId[l.id] = l.traffic_source_id
          ? (trafficCategoryById[l.traffic_source_id] ?? null)
          : null;
      }

      const modelInput = {
        leads: leadRows.map((l) => ({
          id: l.id,
          created_at: l.created_at,
          source_content_id: l.source_content_id,
        })),
        calls: closedRows.map((c) => ({
          id: c.id,
          lead_id: c.lead_id,
          created_at: c.created_at,
          closed: true,
          source_content_id: c.source_content_id,
        })),
        touches: touchRows,
        sampleSize: closedRows.length,
      };
      const pathsByModel = Object.fromEntries(
        ATTRIBUTION_MODELS.map((m) => [m, buildAttributionPathsForModel(m, modelInput)]),
      ) as Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;

      const callCashById: Record<string, number> = {};
      const callContractById: Record<string, number> = {};
      // Not tracked anywhere in this schema today — `calls` has no source
      // for the acquisition channel a call closed against; only content has
      // a source_content_id. Honestly null rather than guessed.
      const callSourceCategory: Record<string, string | null> = {};
      const callMetaById: Record<
        string,
        {
          cashCents: number | null;
          contractValueCents: number | null;
          setterId: string | null;
          dialerId: string | null;
          closerId: string | null;
          showed: boolean | null;
          refunded: boolean | null;
        }
      > = {};
      for (const c of callRows) {
        if (c.cash_collected_cents != null) callCashById[c.id] = c.cash_collected_cents;
        if (c.contract_value_cents != null) callContractById[c.id] = c.contract_value_cents;
        callSourceCategory[c.id] = c.lead_id ? (trafficCategoryByLeadId[c.lead_id] ?? null) : null;
        callMetaById[c.id] = {
          cashCents: c.cash_collected_cents ?? null,
          contractValueCents: c.contract_value_cents ?? null,
          // This schema has one rep column ("setter_id") shared by DM Setter
          // and Inbound Dialer bookings — there is no separate dialer_id
          // column, so a "dialerId" filter/deep-link is matched against the
          // same field rather than fabricating a second one.
          setterId: c.setter_id,
          dialerId: c.setter_id,
          closerId: c.closer_id,
          showed: c.showed,
          // No refund/default/chargeback signal exists on `calls` — honestly
          // null, never inferred from payment-plan or other unrelated state.
          refunded: null,
        };
      }

      return {
        leadRows,
        callRows,
        closedRows,
        pathsByModel,
        callCashById,
        callContractById,
        callSourceCategory,
        callMetaById,
        platformByContentId,
        titleByContentId,
        repNameById,
      };
    },
  });

  const currentPaths = useMemo(() => data?.pathsByModel[model] ?? [], [data, model]);

  // Resolve each path's platform/source/setter/closer via the external join
  // maps above — buildAttributionPathsForModel never populates these fields
  // itself (confirmed: every call site leaves them null), matching the same
  // platformByContentId pattern content-command-center.tsx already uses.
  const resolvedPaths = useMemo(() => {
    if (!data) return [];
    return currentPaths.map((p) => {
      const platform = p.contentId ? (data.platformByContentId[p.contentId] ?? null) : null;
      const meta = p.callId ? data.callMetaById[p.callId] : undefined;
      const sourceCategory = p.callId ? data.callSourceCategory[p.callId] : null;
      return {
        path: p,
        platform,
        source: normalizeAcquisitionSource(sourceCategory),
        setterId: meta?.setterId ?? null,
        dialerId: meta?.dialerId ?? null,
        closerId: meta?.closerId ?? null,
      };
    });
  }, [data, currentPaths]);

  const filteredPaths = useMemo(() => {
    return resolvedPaths.filter((r) => {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
      if (setterFilter !== "all" && r.setterId !== setterFilter && r.dialerId !== setterFilter)
        return false;
      if (
        closerFilter !== "all" &&
        r.closerId !== closerFilter &&
        (data?.repNameById[r.closerId ?? ""] ?? "") !== closerFilter
      )
        return false;
      return true;
    });
  }, [resolvedPaths, platformFilter, sourceFilter, setterFilter, closerFilter, data]);
  const filteredCanonicalPaths = useMemo(() => filteredPaths.map((r) => r.path), [filteredPaths]);

  const platformOptions = useMemo(
    () => Array.from(new Set(resolvedPaths.map((r) => r.platform).filter(Boolean))) as string[],
    [resolvedPaths],
  );
  const setterOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const c of data.callRows) if (c.setter_id) ids.add(c.setter_id);
    return Array.from(ids).map((id) => ({ id, name: data.repNameById[id] ?? id }));
  }, [data]);
  const closerOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const c of data.callRows) if (c.closer_id) ids.add(c.closer_id);
    return Array.from(ids).map((id) => ({ id, name: data.repNameById[id] ?? id }));
  }, [data]);

  // --- A. Overview KPIs (ground truth, independent of the selected model) ---
  const totalCashCents = (data?.closedRows ?? []).reduce(
    (s, c) => s + (c.cash_collected_cents ?? 0),
    0,
  );
  const totalContractCents = (data?.closedRows ?? []).reduce(
    (s, c) => s + (c.contract_value_cents ?? 0),
    0,
  );
  const attributedCallIds = useMemo(
    () => new Set(currentPaths.map((p) => p.callId).filter(Boolean)),
    [currentPaths],
  );
  const attributedCashCents = (data?.closedRows ?? [])
    .filter((c) => attributedCallIds.has(c.id))
    .reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const unattributedCashCents = Math.max(0, totalCashCents - attributedCashCents);

  const cashByAcquisitionSource = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const c of data?.closedRows ?? []) {
      const category = c.lead_id ? (data?.callSourceCategory[c.id] ?? null) : null;
      const bucket = normalizeAcquisitionSource(category);
      buckets[bucket] = (buckets[bucket] ?? 0) + (c.cash_collected_cents ?? 0);
    }
    return buckets;
  }, [data]);
  // The standardized taxonomy (acquisition-source.ts) is channel-level
  // (Meta Ads, TikTok, Instagram, YouTube, LinkedIn, Google, Email,
  // Referral / Partner, Direct / Organic, Other) rather than a paid/organic/
  // referral macro-split — a TikTok or Instagram lead could genuinely be
  // either paid or organic and this data model doesn't distinguish that per
  // channel, so "Paid" here only counts the two channels that are
  // unambiguously ad-spend by name; it is not a full paid-media total.
  const organicCash = cashByAcquisitionSource["Direct / Organic"] ?? 0;
  const referralCash = cashByAcquisitionSource["Referral / Partner"] ?? 0;
  const paidCash =
    (cashByAcquisitionSource["Meta Ads"] ?? 0) + (cashByAcquisitionSource["Google"] ?? 0);

  const kpiItems: KpiBandItem[] = [
    {
      key: "leads",
      label: "Total Leads",
      value: (data?.leadRows.length ?? 0).toLocaleString(),
      spectrum: "cold",
    },
    {
      key: "booked",
      label: "Booked Calls",
      value: (data?.callRows.length ?? 0).toLocaleString(),
      spectrum: "cold",
    },
    {
      key: "shows",
      label: "Shows",
      value: (data?.callRows.filter((c) => c.showed).length ?? 0).toLocaleString(),
      spectrum: "mid",
    },
    {
      key: "closes",
      label: "Closes",
      value: (data?.closedRows.length ?? 0).toLocaleString(),
      spectrum: "hot",
    },
    {
      key: "revenue",
      label: "Revenue Generated",
      value: money(totalContractCents),
      spectrum: "hot",
    },
    { key: "cash", label: "Cash Collected", value: money(totalCashCents), spectrum: "hot" },
    {
      key: "attributed",
      label: "Attributed Cash",
      value: money(attributedCashCents),
      spectrum: "mid",
      emptyHint: `${ATTRIBUTION_MODEL_LABELS[model]} basis`,
    },
    {
      key: "unattributed",
      label: "Unattributed Cash",
      value: money(unattributedCashCents),
      spectrum: "cold",
      empty: totalCashCents === 0,
      emptyHint: "No closed-call cash in range",
    },
    { key: "organic", label: "Organic Cash", value: money(organicCash), spectrum: "cold" },
    { key: "paid", label: "Paid Cash", value: money(paidCash), spectrum: "hot" },
    { key: "referral", label: "Referral Cash", value: money(referralCash), spectrum: "mid" },
  ];

  // --- C. Master Attribution Flow (Sankey) ---
  const sankeyData = useMemo(() => {
    const rows = filteredPaths.filter((r) => r.path.callId && data?.callCashById[r.path.callId!]);
    if (!rows.length) return null;
    const platformNames = Array.from(new Set(rows.map((r) => r.platform ?? "Unknown")));
    const closerNames = Array.from(
      new Set(
        rows.map((r) => (r.closerId ? (data?.repNameById[r.closerId] ?? r.closerId) : "Unknown")),
      ),
    );
    const nodes = [
      ...platformNames.map((n) => ({ name: n })),
      ...closerNames.map((n) => ({ name: n })),
      { name: "Cash Collected" },
    ];
    const platformIndex = (n: string) => platformNames.indexOf(n);
    const closerIndex = (n: string) => platformNames.length + closerNames.indexOf(n);
    const cashIndex = nodes.length - 1;
    const linkMap = new Map<string, number>();
    for (const r of rows) {
      const cash = data!.callCashById[r.path.callId!] ?? 0;
      if (cash <= 0) continue;
      const platform = r.platform ?? "Unknown";
      const closer = r.closerId ? (data?.repNameById[r.closerId] ?? r.closerId) : "Unknown";
      const k1 = `${platformIndex(platform)}>${closerIndex(closer)}`;
      linkMap.set(k1, (linkMap.get(k1) ?? 0) + cash);
      const k2 = `${closerIndex(closer)}>${cashIndex}`;
      linkMap.set(k2, (linkMap.get(k2) ?? 0) + cash);
    }
    const links = Array.from(linkMap.entries()).map(([k, value]) => {
      const [source, target] = k.split(">").map(Number);
      return { source, target, value };
    });
    if (!links.length) return null;
    return { nodes, links };
  }, [filteredPaths, data]);

  // --- D. Channel -> Cash ---
  const channelRows = useMemo(() => {
    if (!data) return [];
    const cashAgg = aggregateCashByPlatform(
      filteredCanonicalPaths,
      data.callCashById,
      data.platformByContentId,
    );
    const contractAgg = aggregateCashByPlatform(
      filteredCanonicalPaths,
      data.callContractById,
      data.platformByContentId,
    );
    const contractByPlatform = new Map(contractAgg.map((r) => [r.platform, r.cashCents]));
    return cashAgg
      .map((r) => {
        const rowsForPlatform = filteredPaths.filter((fp) => fp.platform === r.platform);
        const strengths = rowsForPlatform.map((fp) => fp.path.evidence.strength);
        const modalStrength =
          strengths.sort(
            (a, b) =>
              strengths.filter((s) => s === b).length - strengths.filter((s) => s === a).length,
          )[0] ?? "unknown";
        return {
          platform: r.platform,
          cashCents: r.cashCents,
          contractCents: contractByPlatform.get(r.platform) ?? 0,
          closes: r.callCount,
          strength: modalStrength,
        };
      })
      .sort((a, b) => b.cashCents - a.cashCents);
  }, [data, filteredCanonicalPaths, filteredPaths]);

  // --- E. Content -> Cash ---
  const contentRows = useMemo(() => {
    if (!data) return [];
    return aggregateCashByContent(filteredCanonicalPaths, data.callCashById)
      .map((r) => ({ ...r, title: data.titleByContentId[r.contentId] ?? r.contentId }))
      .sort((a, b) => b.cashCents - a.cashCents);
  }, [data, filteredCanonicalPaths]);

  // --- F. Top Customer Journeys ---
  const journeyRows = useMemo(() => {
    if (!data) return [];
    return identifyTopAttributionJourneys(
      filteredCanonicalPaths,
      data.callMetaById,
      data.platformByContentId,
    ).slice(0, 15);
  }, [data, filteredCanonicalPaths]);

  // --- G. Coverage & Confidence ---
  const coverageBreakdown = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of filteredPaths)
      buckets[r.path.evidence.coverage] = (buckets[r.path.evidence.coverage] ?? 0) + 1;
    return buckets;
  }, [filteredPaths]);
  const strengthBreakdown = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (const r of filteredPaths)
      buckets[r.path.evidence.strength] = (buckets[r.path.evidence.strength] ?? 0) + 1;
    return buckets;
  }, [filteredPaths]);

  const repLabel = (id: string | null) => (id ? (data?.repNameById[id] ?? id) : "Unknown");

  return (
    <>
      <TopBar
        title="Attribution Command Center"
        subtitle="Every dollar's real, model-consistent origin — content, channel, and rep"
        showDateRange
      />
      <div className="space-y-6 p-6">
        <DemoModeBanner demoMode={demoMode} />
        <KpiBand title="Overview" items={kpiItems} />

        {/* B. Model + global filters */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Attribution model
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {ATTRIBUTION_MODELS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    model === m
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-background/40 hover:border-border"
                  }`}
                >
                  <div className="text-xs font-semibold">{ATTRIBUTION_MODEL_LABELS[m]}</div>
                  <div className="mt-0.5 text-3xs text-muted-foreground">
                    {MODEL_EXPLANATIONS[m]}
                  </div>
                </button>
              ))}
            </div>
            {model === "assisted_touch" && (
              <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-3xs text-amber-300">
                Assisted credit is inferred, not direct: the same call's cash can be attributed to
                more than one assisting piece here, so totals will legitimately exceed a single
                call's real amount. Never presented as a clean aggregate.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                Platform
              </div>
              <FilterPills
                options={[
                  { key: "all", label: "All platforms" },
                  ...(socialPlatformOptions() as SocialPlatform[])
                    .filter((p) => platformOptions.includes(p))
                    .map((p) => ({ key: p, label: p })),
                ]}
                value={platformFilter}
                onChange={setPlatformFilter}
              />
            </div>
            <div>
              <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                Acquisition source
              </div>
              <FilterPills
                options={[
                  { key: "all", label: "All sources" },
                  ...acquisitionSourceOptions().map((s) => ({ key: s, label: s })),
                ]}
                value={sourceFilter}
                onChange={setSourceFilter}
              />
            </div>
            {setterOptions.length > 0 && (
              <div>
                <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                  Setter / Dialer
                </div>
                <FilterPills
                  options={[
                    { key: "all", label: "All reps" },
                    ...setterOptions.map((o) => ({ key: o.id, label: o.name })),
                  ]}
                  value={setterFilter}
                  onChange={setSetterFilter}
                />
              </div>
            )}
            {closerOptions.length > 0 && (
              <div>
                <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                  Closer
                </div>
                <FilterPills
                  options={[
                    { key: "all", label: "All closers" },
                    ...closerOptions.map((o) => ({ key: o.id, label: o.name })),
                  ]}
                  value={closerFilter}
                  onChange={setCloserFilter}
                />
              </div>
            )}
          </div>
          {(search.campaign ||
            search.offerId ||
            search.webinarId ||
            search.vslId ||
            search.menteeId) && (
            <p className="mt-3 text-3xs text-muted-foreground">
              This view arrived with additional context (
              {[
                search.campaign && "campaign",
                search.offerId && "offer",
                search.webinarId && "webinar",
                search.vslId && "VSL",
                search.menteeId && "mentee",
              ]
                .filter(Boolean)
                .join(", ")}
              ) that isn't tracked as a dedicated filter dimension in this data model yet — not
              fabricated to avoid dropping it silently.
            </p>
          )}
        </div>

        {/* C. Master Attribution Flow */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-2">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Master Attribution Flow — {ATTRIBUTION_MODEL_LABELS[model]} basis
            </div>
            <div className="mt-0.5 text-base font-semibold">Platform → Closer → Cash</div>
          </div>
          <div className="h-72">
            {sankeyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <Sankey
                  data={sankeyData}
                  nodePadding={18}
                  nodeWidth={10}
                  linkCurvature={0.5}
                  link={{ stroke: "var(--spectrum-hot)", strokeOpacity: 0.25 }}
                  node={<FlowNodeLabel />}
                >
                  <Tooltip content={<ChartTooltip formatter={(v: number) => money(v)} />} />
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={<RouteIcon className="h-4 w-4" />}
                title="No attributed cash for this model/filter combination"
                description="Widen the date range or clear a filter to see the flow."
              />
            )}
          </div>
        </div>

        {/* D. Channel -> Cash */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Channel → Cash
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Channel</th>
                <th className="p-3 text-right font-sans tabular-nums">Closes</th>
                <th className="p-3 text-right font-sans tabular-nums">Revenue</th>
                <th className="p-3 text-right font-sans tabular-nums">Cash</th>
                <th className="p-3 text-right font-sans tabular-nums">Collection Rate</th>
                <th className="p-3 text-left">Attribution Strength</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((r) => (
                <tr
                  key={r.platform}
                  className="cursor-pointer border-t border-border/70 hover:bg-muted/20"
                  onClick={() => setPlatformFilter(r.platform)}
                >
                  <td className="p-3">
                    <span className="flex items-center gap-1.5 font-medium">
                      <PlatformIcon
                        platform={r.platform as SocialPlatform}
                        className="h-3.5 w-3.5"
                      />
                      {r.platform}
                    </span>
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums">{r.closes}</td>
                  <td className="p-3 text-right font-sans tabular-nums">
                    {money(r.contractCents)}
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums text-spectrum-hot">
                    {money(r.cashCents)}
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums">
                    {r.contractCents > 0
                      ? `${Math.round((r.cashCents / r.contractCents) * 100)}%`
                      : "—"}
                  </td>
                  <td className="p-3 text-2xs uppercase text-muted-foreground">{r.strength}</td>
                </tr>
              ))}
              {channelRows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      icon={<RouteIcon className="h-4 w-4" />}
                      title="No channel-level cash for this model/filter combination"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        {/* E. Content -> Cash */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Content → Cash
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Content</th>
                <th className="p-3 text-right font-sans tabular-nums">Closes</th>
                <th className="p-3 text-right font-sans tabular-nums">Cash</th>
              </tr>
            </thead>
            <tbody>
              {contentRows.slice(0, 20).map((r) => (
                <tr key={r.contentId} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-3 font-medium">{r.title}</td>
                  <td className="p-3 text-right font-sans tabular-nums">{r.callCount}</td>
                  <td className="p-3 text-right font-sans tabular-nums text-spectrum-hot">
                    {money(r.cashCents)}
                  </td>
                </tr>
              ))}
              {contentRows.length === 0 && (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<RouteIcon className="h-4 w-4" />}
                      title="No content-level cash for this model/filter combination"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        {/* F. Top Customer Journeys */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Top Customer Journeys
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Platform</th>
                {/* Priority 7 — "Acquisition Source", never bare "Source",
                    sitting right next to the Platform column. */}
                <th className="p-3 text-left">Acquisition Source</th>
                <th className="p-3 text-left">Rep</th>
                <th className="p-3 text-left">Closer</th>
                <th className="p-3 text-right font-sans tabular-nums">Calls</th>
                <th className="p-3 text-right font-sans tabular-nums">Revenue</th>
                <th className="p-3 text-right font-sans tabular-nums">Cash</th>
                <th className="p-3 text-right font-sans tabular-nums">Collection Rate</th>
              </tr>
            </thead>
            <tbody>
              {journeyRows.map((r) => (
                <tr key={r.key} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-3">{r.platform ?? "Unknown"}</td>
                  <td className="p-3">{r.source ?? "Unknown"}</td>
                  <td className="p-3">{repLabel(r.setterOrDialerId)}</td>
                  <td className="p-3">{repLabel(r.closerId)}</td>
                  <td className="p-3 text-right font-sans tabular-nums">{r.callCount}</td>
                  <td className="p-3 text-right font-sans tabular-nums">
                    {money(r.contractValueCents)}
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums text-spectrum-hot">
                    {money(r.cashCents)}
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums">
                    {r.contractValueCents > 0
                      ? `${Math.round((r.cashCents / r.contractValueCents) * 100)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
              {journeyRows.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<RouteIcon className="h-4 w-4" />}
                      title="No recurring journeys for this model/filter combination"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        {/* G. Coverage & Confidence */}
        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:grid-cols-2">
          <div>
            <div className="mb-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Coverage — {ATTRIBUTION_MODEL_LABELS[model]}
            </div>
            <div className="space-y-1.5">
              {(["direct", "partial", "inferred", "unavailable"] as const).map((c) => (
                <div key={c} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{c}</span>
                  <span className="font-sans tabular-nums">{coverageBreakdown[c] ?? 0}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-xs">
                <span className="text-muted-foreground">Unattributed (no path)</span>
                <span className="font-sans tabular-nums">
                  {(data?.closedRows.length ?? 0) - attributedCallIds.size}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="mb-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Strength
            </div>
            <div className="space-y-1.5">
              {(["high", "medium", "low", "unknown"] as const).map((s) => (
                <div key={s} className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted-foreground">{s}</span>
                  <span className="font-sans tabular-nums">{strengthBreakdown[s] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* H. Detailed records */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <button
            onClick={() => setRecordsOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-semibold">Detailed records ({filteredPaths.length})</span>
            {recordsOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {recordsOpen && (
            <div className="mt-3">
              <GlassTableShell maxHeight="420px">
                <table className="w-full text-xs">
                  <thead className="sticky-thead bg-muted/40 text-3xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Content</th>
                      <th className="p-2 text-left">Platform</th>
                      <th className="p-2 text-left">Rep</th>
                      <th className="p-2 text-left">Closer</th>
                      <th className="p-2 text-right font-sans tabular-nums">Cash</th>
                      <th className="p-2 text-left">Coverage</th>
                      <th className="p-2 text-left">Strength</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaths.slice(0, 200).map((r, i) => (
                      <tr
                        key={`${r.path.callId}:${r.path.contentId}:${i}`}
                        className="border-t border-border/70"
                      >
                        <td className="p-2">
                          {r.path.contentId
                            ? (data?.titleByContentId[r.path.contentId] ?? r.path.contentId)
                            : "Unattributed"}
                        </td>
                        <td className="p-2">{r.platform ?? "Unknown"}</td>
                        <td className="p-2">{repLabel(r.setterId)}</td>
                        <td className="p-2">{repLabel(r.closerId)}</td>
                        <td className="p-2 text-right font-sans tabular-nums">
                          {money(r.path.callId ? (data?.callCashById[r.path.callId] ?? 0) : 0)}
                        </td>
                        <td className="p-2 capitalize">{r.path.evidence.coverage}</td>
                        <td className="p-2 capitalize">{r.path.evidence.strength}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </GlassTableShell>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="text-center text-xs text-muted-foreground">Loading attribution data…</div>
        )}
      </div>
    </>
  );
}

function FlowNodeLabel(props: unknown) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: { name: string };
  };
  const isOut = payload.name === "Cash Collected";
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--spectrum-hot)"
        fillOpacity={0.8}
      />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        className="fill-foreground text-[10px]"
      >
        {payload.name}
      </text>
    </Layer>
  );
}
