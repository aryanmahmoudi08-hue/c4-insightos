import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import { useMoney } from "@/hooks/use-money";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { buildDemoAttributionDataset } from "@/lib/demo-fixtures";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { TopBar } from "@/components/app-sidebar";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { GlassTableShell } from "@/components/glass-table";
import { TaxonomySelect } from "@/components/taxonomy-select";
import { EmptyState } from "@/components/empty-state";
import { useFollowCursorTooltipPosition } from "@/components/chart-tooltip";
import { PlatformIcon } from "@/components/platform-icon";
import { AttributionEvidencePanel } from "@/components/attribution-evidence-panel";
import { Sankey, ResponsiveContainer, Rectangle, Layer } from "recharts";
import { Route as RouteIcon, ChevronDown, ChevronUp, Info, X } from "lucide-react";
import {
  buildAttributionPathsForModel,
  ATTRIBUTION_MODELS,
  ATTRIBUTION_MODEL_LABELS,
  identifyTopAttributionJourneys,
} from "@/lib/content-attribution";
import { normalizeAcquisitionSource, acquisitionSourceOptions } from "@/lib/acquisition-source";
import {
  socialPlatformOptions,
  normalizeSocialPlatform,
  type SocialPlatform,
} from "@/lib/social-platform";
import type {
  AttributionModel,
  AttributionEvidence,
  CanonicalLifecycleAttributionPath,
} from "@/lib/acquisition";
import { usdCentsForRow } from "@/lib/currency";
import { getHistoricalFxRatesFn } from "@/lib/fx.functions";
import { fetchFxRates } from "@/hooks/use-fx-rates";
import { useServerFn } from "@tanstack/react-start";

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

const MODEL_EXPLANATIONS: Record<AttributionModel, { question: string; detail: string }> = {
  first_touch: {
    question: "What first got this person's attention?",
    detail: "Credits the earliest known content touchpoint before the lead ever formed.",
  },
  lead_source: {
    question: "What actually created the lead?",
    detail: "Credits the content tagged on the lead record itself at the moment it was captured.",
  },
  booking_source: {
    question: "What produced the booked call?",
    detail:
      "Credits the content tagged on the call itself — may differ from what created the lead.",
  },
  last_touch: {
    question: "What was the last thing they saw before converting?",
    detail: "Credits the most recent touchpoint before the call closed.",
  },
  assisted_touch: {
    question: "What else played a role along the way?",
    detail:
      "Every touchpoint before the final one — always inferred, never direct credit, and the same call's cash can appear under more than one piece here on purpose.",
  },
};

const isValidModel = (m: string | undefined): m is AttributionModel =>
  !!m && (ATTRIBUTION_MODELS as string[]).includes(m);

/** Standalone route wrapper — just the page chrome (TopBar) around the real
 * content below. Content Command Center embeds `AttributionPageContent`
 * directly instead (`embedded`), so there's exactly one implementation of
 * Attribution's data/filters/models/confidence/drill-downs, never a second
 * copy. */
function AttributionCommandCenter() {
  return <AttributionPageContent />;
}

export function AttributionPageContent({ embedded = false }: { embedded?: boolean } = {}) {
  // Route-agnostic deep-link read (same idiom content-signals-panel.tsx /
  // vsl.tsx already use for cross-page search params) rather than this
  // file's own `Route.useSearch()`, so this component works identically
  // whether it's mounted under /attribution or embedded inside /content.
  const search = useSearch({ strict: false }) as AttributionSearch;
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
  // Currency-mixing remediation (docs/ascendos-currency-mixing-audit.md):
  // calls.cash_collected_cents/contract_value_cents carry a real
  // original_currency never converted before summing here — same proven
  // sumNormalizedCents() infrastructure as closer.tsx/weekly-report.server.ts.
  const fxFn = useServerFn(getHistoricalFxRatesFn);

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
        original_currency?: string | null;
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
      // clients.offer_name is the real "Offer/Product" signal (no dedicated
      // offers table/id exists) — joined by lead_id, honestly empty when no
      // client record exists yet for that lead.
      const offerNameByLeadId: Record<string, string | null> = {};

      if (demoMode) {
        const demo = buildDemoAttributionDataset();
        leadRows = demo.leadRows;
        callRows = demo.callRows;
        touchRows = demo.touchRows;
        contentRows = demo.contentRows;
        trafficRows = demo.trafficRows;
        repNameById = demo.repNameById;
      } else {
        const [leadsRes, callsRes, touchesRes, contentRes, trafficRes, clientsRes] =
          await Promise.all([
            supabase
              .from("leads")
              .select(
                "id, created_at, source_content_id, first_touch_content_id, traffic_source_id",
              )
              .eq("org_id", orgId!)
              .gte("created_at", fromISO)
              .lte("created_at", toISO),
            supabase
              .from("calls")
              .select(
                "id, lead_id, created_at, closed, source_content_id, contract_value_cents, cash_collected_cents, setter_id, closer_id, showed, original_currency",
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
            supabase.from("clients").select("lead_id, offer_name").eq("org_id", orgId!),
          ]);

        leadRows = leadsRes.data ?? [];
        callRows = callsRes.data ?? [];
        touchRows = touchesRes.data ?? [];
        contentRows = contentRes.data ?? [];
        trafficRows = trafficRes.data ?? [];
        for (const c of clientsRes.data ?? []) {
          if (c.lead_id) offerNameByLeadId[c.lead_id] = c.offer_name;
        }

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

      // Remediation (currency-mixing audit): calls.cash_collected_cents/
      // contract_value_cents carry a real original_currency, never
      // converted before this point — normalize every call's cash/contract
      // to USD cents here, once, so every downstream consumer (totals,
      // per-source breakdown, per-call evidence lookups) reads an already-
      // correct value without needing to know FX exists. Same proven
      // sumNormalizedCents infrastructure as closer.tsx.
      const attrFxRates = await fetchFxRates(fxFn, {
        rows: callRows,
        getCurrency: (c: (typeof callRows)[number]) => c.original_currency,
        getDate: (c: (typeof callRows)[number]) => c.created_at?.slice(0, 10),
      });
      let attributionFxIncomplete = false;
      const normalizeRow = (c: (typeof callRows)[number]) => {
        const day = c.created_at?.slice(0, 10);
        const cash = usdCentsForRow(c.cash_collected_cents, c.original_currency, day, attrFxRates);
        const contract = usdCentsForRow(
          c.contract_value_cents,
          c.original_currency,
          day,
          attrFxRates,
        );
        if (cash.excluded || contract.excluded) attributionFxIncomplete = true;
        return { ...c, cash_collected_cents: cash.usd, contract_value_cents: contract.usd };
      };
      callRows = callRows.map(normalizeRow);
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
          setterId: c.setter_id,
          closerId: c.closer_id,
          offerName: c.lead_id ? (offerNameByLeadId[c.lead_id] ?? null) : null,
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
        attributionFxIncomplete,
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
      emphasis: "subtle",
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
      emphasis: "subtle",
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
      emphasis: "subtle",
    },
    {
      key: "cash",
      label: data?.attributionFxIncomplete ? "Cash Collected · FX incomplete" : "Cash Collected",
      value: money(totalCashCents),
      spectrum: "hot",
      emphasis: "strong",
    },
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

  // --- C. Master Attribution Flow (Sankey): Platform -> Setter/Dialer ->
  // Closer -> Cash. The one coherent flow diagram for attribution — Content
  // Command Center's MoneyOriginSection already owns the content-origin
  // framing (content -> platform -> cash); this is the rep/outcome framing,
  // extended with a real Setter/Dialer stage now that setterId is threaded
  // through the engine (content-attribution.ts). Offer/Payment/Retention are
  // intentionally NOT Sankey nodes — payment method/plan has no dedicated
  // table, and retention/refund has no signal anywhere in this schema (see
  // callMetaById below); a "Not tracked" node in a flow diagram would imply
  // a connection that doesn't exist, so those stay as plain text instead.
  const sankeyData = useMemo(() => {
    const rows = filteredPaths.filter((r) => r.path.callId && data?.callCashById[r.path.callId!]);
    if (!rows.length) return null;
    // Every fallback label below is unique across all 3 node categories
    // (never a bare "Unknown" reused in two columns) so a name alone is
    // always enough to identify exactly one node — both for the Sankey's own
    // node/link indices and for the hover tooltip, which resolves nodes by
    // name rather than needing to re-derive an index from Recharts' payload.
    const platformNames = Array.from(new Set(rows.map((r) => r.platform ?? "Unknown platform")));
    const repName = (r: (typeof rows)[number]) =>
      r.setterId || r.dialerId
        ? (data?.repNameById[r.setterId ?? r.dialerId ?? ""] ?? (r.setterId ?? r.dialerId)!)
        : "Unknown rep";
    const repNames = Array.from(new Set(rows.map(repName)));
    const closerName = (r: (typeof rows)[number]) =>
      r.closerId ? (data?.repNameById[r.closerId] ?? r.closerId) : "Unknown closer";
    const closerNames = Array.from(new Set(rows.map(closerName)));
    const nodes = [
      ...platformNames.map((n) => ({ name: n })),
      ...repNames.map((n) => ({ name: n })),
      ...closerNames.map((n) => ({ name: n })),
      { name: "Cash Collected" },
    ];
    const platformIndex = (n: string) => platformNames.indexOf(n);
    const repIndex = (n: string) => platformNames.length + repNames.indexOf(n);
    const closerIndex = (n: string) =>
      platformNames.length + repNames.length + closerNames.indexOf(n);
    const cashIndex = nodes.length - 1;
    const linkMap = new Map<string, number>();
    // Reverse-lookup so clicking a rep/closer node can restore the real
    // filter value (a rep id) rather than just its display name.
    const repIdByName = new Map<string, string>();
    const closerIdByName = new Map<string, string>();
    for (const r of rows) {
      const cash = data!.callCashById[r.path.callId!] ?? 0;
      const rid = r.setterId ?? r.dialerId;
      if (rid) repIdByName.set(repName(r), rid);
      if (r.closerId) closerIdByName.set(closerName(r), r.closerId);
      if (cash <= 0) continue;
      const platform = r.platform ?? "Unknown platform";
      const rep = repName(r);
      const closer = closerName(r);
      const k1 = `${platformIndex(platform)}>${repIndex(rep)}`;
      linkMap.set(k1, (linkMap.get(k1) ?? 0) + cash);
      const k2 = `${repIndex(rep)}>${closerIndex(closer)}`;
      linkMap.set(k2, (linkMap.get(k2) ?? 0) + cash);
      const k3 = `${closerIndex(closer)}>${cashIndex}`;
      linkMap.set(k3, (linkMap.get(k3) ?? 0) + cash);
    }
    const links = Array.from(linkMap.entries()).map(([k, value]) => {
      const [source, target] = k.split(">").map(Number);
      return { source, target, value };
    });
    if (!links.length) return null;
    // Category per node name — drives what a click on that node filters by.
    const nodeCategory = new Map<string, "platform" | "rep" | "closer" | "cash">();
    for (const n of platformNames) nodeCategory.set(n, "platform");
    for (const n of repNames) nodeCategory.set(n, "rep");
    for (const n of closerNames) nodeCategory.set(n, "closer");
    nodeCategory.set("Cash Collected", "cash");
    return { nodes, links, nodeCategory, repIdByName, closerIdByName };
  }, [filteredPaths, data]);

  // Total value flowing OUT of each source node, keyed by node name (every
  // node name in this diagram is unique — see the "Unknown platform" /
  // "Unknown rep" / "Unknown closer" disambiguation above) — the denominator
  // for a link's hover "share %" (e.g. "62% of Instagram's attributed cash
  // went to Jordan (Setter)"), computed once here rather than inside the
  // tooltip so hovering doesn't re-scan every link on every mouse move.
  const sankeyOutTotals = useMemo(() => {
    const totals = new Map<string, number>();
    if (!sankeyData) return totals;
    for (const link of sankeyData.links) {
      const name = sankeyData.nodes[link.source]?.name;
      if (!name) continue;
      totals.set(name, (totals.get(name) ?? 0) + link.value);
    }
    return totals;
  }, [sankeyData]);

  // --- D. Top Customer Journeys ---
  const journeyRows = useMemo(() => {
    if (!data) return [];
    return identifyTopAttributionJourneys(
      filteredCanonicalPaths,
      data.callMetaById,
      data.platformByContentId,
    ).slice(0, 15);
  }, [data, filteredCanonicalPaths]);

  // Model-convergence check (spec: "if two models produce the same result,
  // don't visually pretend they're meaningfully different") — real computed
  // overlap, not a guess: for every closed call that both First Touch and
  // Last Touch could resolve, what share of the time do they land on the
  // exact same content?
  const modelConvergence = useMemo(() => {
    if (!data) return null;
    const first = data.pathsByModel.first_touch;
    const last = data.pathsByModel.last_touch;
    const firstByOutcome = new Map(first.map((p) => [p.outcomeKey, p.contentId]));
    const lastByOutcome = new Map(last.map((p) => [p.outcomeKey, p.contentId]));
    const outcomes = Array.from(new Set([...firstByOutcome.keys(), ...lastByOutcome.keys()]));
    if (outcomes.length < 3) return null;
    const matching = outcomes.filter(
      (k) => firstByOutcome.get(k) != null && firstByOutcome.get(k) === lastByOutcome.get(k),
    ).length;
    const pct = Math.round((matching / outcomes.length) * 100);
    return pct >= 80 ? { pct, sample: outcomes.length } : null;
  }, [data]);

  const repLabel = (id: string | null) => (id ? (data?.repNameById[id] ?? id) : "Unknown");

  // Clicking a journey scopes every filter to that exact combination and
  // opens + scrolls to Detailed records, so "inspect underlying records" is
  // real filtering against the same data, not a fabricated drill-down.
  const inspectJourney = (j: (typeof journeyRows)[number]) => {
    setPlatformFilter(j.platform ?? "all");
    setSourceFilter(j.source ?? "all");
    setSetterFilter(j.setterOrDialerId ?? "all");
    setCloserFilter(j.closerId ?? "all");
    setRecordsOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("detailed-records")?.scrollIntoView({ behavior: "smooth" });
    });
  };

  // Clicking a Sankey node scopes Detailed records to exactly that
  // platform/rep/closer, same context-preserving drill-down as clicking a
  // journey row above — never a generic unfiltered list.
  const selectSankeyNode = (name: string) => {
    if (!sankeyData) return;
    const category = sankeyData.nodeCategory.get(name);
    if (category === "platform") setPlatformFilter(name);
    else if (category === "rep") setSetterFilter(sankeyData.repIdByName.get(name) ?? "all");
    else if (category === "closer") setCloserFilter(sankeyData.closerIdByName.get(name) ?? "all");
    setRecordsOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("detailed-records")?.scrollIntoView({ behavior: "smooth" });
    });
  };

  // Sankey hover — driven by our own plain onMouseMove/onMouseLeave on each
  // link/node (see FlowLinkPath/FlowNodeLabel below), not Recharts' built-in
  // Sankey <Tooltip>/onMouseEnter machinery. Confirmed directly in-browser
  // that Recharts' own hover activation never fires on this chart (its
  // internal isTooltipActive state never flips even with a correctly
  // targeted native mouseover event) while onClick on the exact same
  // elements works fine — so this bypasses only the broken enter/leave
  // synthesis, reusing the same real, continuous mousemove events that
  // already drive the cursor-follow position in chart-tooltip.tsx.
  const [sankeyHover, setSankeyHover] = useState<SankeyHoverPayload>(null);

  const [inspectingPath, setInspectingPath] = useState<{
    evidence: AttributionEvidence;
    label: string;
  } | null>(null);

  return (
    <>
      {!embedded && (
        <TopBar
          title="Attribution Command Center"
          subtitle="How a lead, booking, or revenue outcome actually moved through the system — the deep-dive investigation tool"
          showDateRange
        />
      )}
      <div className={embedded ? "space-y-6" : "space-y-6 p-6"}>
        <DemoModeBanner demoMode={demoMode} />
        {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-spectrum-mid/30 bg-spectrum-mid/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              This is the deep-dive: how a specific lead, booking, or revenue outcome moved through
              the system. For the executive summary of content-to-cash performance, see Content
              Command Center; for where leads originate at the platform level, see Traffic.
            </span>
            <div className="flex shrink-0 gap-3">
              <Link to="/content" className="font-medium text-primary hover:underline">
                Content Command Center →
              </Link>
              <Link to="/traffic" className="font-medium text-primary hover:underline">
                Traffic →
              </Link>
            </div>
          </div>
        )}
        <div id="attribution-overview" className="scroll-mt-24">
          <KpiBand title="Overview" items={kpiItems} />
        </div>

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
                  title={MODEL_EXPLANATIONS[m].detail}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    model === m
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-background/40 hover:border-border"
                  }`}
                >
                  <div className="text-xs font-semibold">{ATTRIBUTION_MODEL_LABELS[m]}</div>
                  <div className="mt-0.5 text-3xs italic text-foreground/80">
                    "{MODEL_EXPLANATIONS[m].question}"
                  </div>
                  <div className="mt-0.5 text-3xs text-muted-foreground">
                    {MODEL_EXPLANATIONS[m].detail}
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
            {modelConvergence && (
              <p className="mt-2 flex items-start gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-3xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                First Touch and Last Touch land on the exact same content for {modelConvergence.pct}
                % of the {modelConvergence.sample} closed calls in this window — most journeys here
                only had one identifiable touchpoint, so those two models aren't meaningfully
                different for this range.
              </p>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                Platform
              </div>
              <TaxonomySelect
                label="platforms"
                value={platformFilter}
                onChange={setPlatformFilter}
                options={(socialPlatformOptions() as SocialPlatform[])
                  .filter((p) => platformOptions.includes(p))
                  .map((p) => ({ value: p, label: p }))}
              />
            </div>
            <div>
              <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                Acquisition source
              </div>
              <TaxonomySelect
                label="sources"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={acquisitionSourceOptions().map((s) => ({ value: s, label: s }))}
              />
            </div>
            {setterOptions.length > 0 && (
              <div>
                <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                  Setter / Dialer
                </div>
                <TaxonomySelect
                  label="reps"
                  value={setterFilter}
                  onChange={setSetterFilter}
                  options={setterOptions.map((o) => ({ value: o.id, label: o.name }))}
                />
              </div>
            )}
            {closerOptions.length > 0 && (
              <div>
                <div className="mb-1 text-3xs uppercase tracking-wider text-muted-foreground">
                  Closer
                </div>
                <TaxonomySelect
                  label="closers"
                  value={closerFilter}
                  onChange={setCloserFilter}
                  options={closerOptions.map((o) => ({ value: o.id, label: o.name }))}
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

        {/* C. Master Attribution Flow — the one coherent flow diagram for
            attribution (rep/outcome framed: Platform → Setter/Dialer →
            Closer → Cash). This same component is what Content Command
            Center embeds too — there is no second, competing Sankey. */}
        <div
          id="attribution-flow"
          className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5"
        >
          <div className="mb-2">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Master Attribution Flow — {ATTRIBUTION_MODEL_LABELS[model]} basis
            </div>
            <div className="mt-0.5 text-base font-semibold">
              Platform → Setter/Dialer → Closer → Cash
            </div>
          </div>
          <div className="relative h-72">
            {sankeyData ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankeyData}
                    nodePadding={18}
                    nodeWidth={10}
                    linkCurvature={0.5}
                    link={<FlowLinkPath onHover={setSankeyHover} />}
                    node={<FlowNodeLabel onSelect={selectSankeyNode} onHover={setSankeyHover} />}
                  />
                </ResponsiveContainer>
                <SankeyTooltip
                  hover={sankeyHover}
                  outTotals={sankeyOutTotals}
                  money={money}
                  context={`${range.from} – ${range.to} · ${ATTRIBUTION_MODEL_LABELS[model]} basis`}
                />
              </>
            ) : (
              <EmptyState
                icon={<RouteIcon className="h-4 w-4" />}
                title="No attributed cash for this model/filter combination"
                description="Widen the date range or clear a filter to see the flow."
              />
            )}
          </div>
          <p className="mt-2 text-3xs text-muted-foreground">
            Payment method/plan and retention/refund outcome aren't shown as stages here — this
            schema has no dedicated field for either, so a node would imply a connection that
            doesn't exist. For content-to-cash origin, see Content Command Center's flow instead of
            a second, competing version here.
          </p>
        </div>

        {/* D. Top Customer Journeys */}
        <div id="attribution-journeys" className="scroll-mt-24">
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
                  <th className="p-3 text-left">Offer</th>
                  <th className="p-3 text-right font-sans tabular-nums">Calls</th>
                  <th className="p-3 text-right font-sans tabular-nums">Revenue</th>
                  <th className="p-3 text-right font-sans tabular-nums">Cash</th>
                  <th className="p-3 text-right font-sans tabular-nums">Collection Rate</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {journeyRows.map((r) => {
                  const incomplete = !r.setterOrDialerId || !r.closerId || !r.offerId;
                  return (
                    <tr
                      key={r.key}
                      className="cursor-pointer border-t border-border/70 hover:bg-muted/20"
                      onClick={() => inspectJourney(r)}
                    >
                      <td className="p-3">{r.platform ?? "Unknown"}</td>
                      <td className="p-3">{r.source ?? "Unknown"}</td>
                      <td className="p-3">{repLabel(r.setterOrDialerId)}</td>
                      <td className="p-3">{repLabel(r.closerId)}</td>
                      <td className="p-3">
                        {r.offerId ?? <span className="text-muted-foreground">Not tracked</span>}
                      </td>
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
                      <td className="p-3 text-right">
                        {incomplete && (
                          <span
                            className="rounded border border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10 px-1.5 py-0.5 text-3xs uppercase tracking-wide text-[color:var(--color-warning)]"
                            title="One or more stages in this journey (rep, closer, or offer) has no known value — shown as Unknown/Not tracked above, never guessed."
                          >
                            Incomplete
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {journeyRows.length === 0 && (
                  <tr>
                    <td colSpan={10}>
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
        </div>
        <p className="-mt-3 text-3xs text-muted-foreground">
          Click a journey to filter Detailed records down to exactly the paths behind it.
        </p>

        {/* H. Detailed records — progressive detail: the table stays to the
            fields that identify a record (content/platform/rep/closer/cash/
            coverage), full evidence (model/strength/touchpoints/sample/
            limitations) opens via Inspect using the same
            AttributionEvidencePanel Content Command Center's canonical table
            already uses, instead of a second bespoke evidence UI. */}
        <div
          id="detailed-records"
          className="scroll-mt-24 rounded-2xl border border-border bg-card p-4 shadow-sm"
        >
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
            <div className="mt-3 space-y-3">
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
                      <th className="p-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPaths.slice(0, 200).map((r, i) => {
                      const label = r.path.contentId
                        ? (data?.titleByContentId[r.path.contentId] ?? r.path.contentId)
                        : "Unattributed";
                      return (
                        <tr
                          key={`${r.path.callId}:${r.path.contentId}:${i}`}
                          className="border-t border-border/70"
                        >
                          <td className="p-2">{label}</td>
                          <td className="p-2">{r.platform ?? "Unknown"}</td>
                          <td className="p-2">{repLabel(r.setterId)}</td>
                          <td className="p-2">{repLabel(r.closerId)}</td>
                          <td className="p-2 text-right font-sans tabular-nums">
                            {money(r.path.callId ? (data?.callCashById[r.path.callId] ?? 0) : 0)}
                          </td>
                          <td className="p-2 capitalize">{r.path.evidence.coverage}</td>
                          <td className="p-2 capitalize">{r.path.evidence.strength}</td>
                          <td className="p-2 text-right">
                            <button
                              type="button"
                              className="text-spectrum-mid hover:underline"
                              onClick={() =>
                                setInspectingPath({ evidence: r.path.evidence, label })
                              }
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPaths.length === 0 && (
                      <tr>
                        <td colSpan={8}>
                          <EmptyState
                            icon={<RouteIcon className="h-4 w-4" />}
                            title="No records for this model/filter combination"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </GlassTableShell>
              {inspectingPath && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setInspectingPath(null)}
                    aria-label="Close evidence"
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <AttributionEvidencePanel
                    evidence={inspectingPath.evidence}
                    title={`Evidence — ${inspectingPath.label}`}
                  />
                </div>
              )}
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

/** What's currently hovered on the Sankey — set directly by FlowLinkPath's/
 * FlowNodeLabel's own onMouseMove, never by Recharts' built-in Sankey
 * Tooltip/onMouseEnter (confirmed broken for this chart — see the
 * hoveredSankeyPayload state comment above where this is used). */
type SankeyHoverPayload =
  | { kind: "link"; source: string; target: string; value: number }
  | { kind: "node"; name: string; value: number }
  | null;

/**
 * Bespoke Sankey tooltip — shows source → target, the dollar value, that
 * value's share of the source node's total outgoing flow, and the active
 * date-range + model context, so hovering never leaves the user guessing
 * what a bar meant. Driven entirely by `hover` (lifted state set by
 * FlowLinkPath/FlowNodeLabel's own plain onMouseMove), not by Recharts'
 * Tooltip active/payload props — Recharts' own Sankey hover activation
 * never fires in practice (verified directly: its internal isTooltipActive
 * never flips even given a correctly targeted native mouseover, while
 * onClick on the same elements works fine), so this bypasses that broken
 * enter/leave synthesis rather than depending on it.
 */
function SankeyTooltip({
  hover,
  outTotals,
  money,
  context,
}: {
  hover: SankeyHoverPayload;
  outTotals: Map<string, number>;
  money: (cents: number) => string;
  context: string;
}) {
  const { nodeRef, style } = useFollowCursorTooltipPosition(hover != null);
  if (!hover || !style || typeof document === "undefined") return null;

  const isLink = hover.kind === "link";
  const title = isLink ? `${hover.source} → ${hover.target}` : hover.name;
  const lines: { label: string; value: string }[] = isLink
    ? [
        { label: "Cash", value: money(hover.value) },
        {
          label: `Share of ${hover.source}`,
          value: (() => {
            const total = outTotals.get(hover.source) ?? hover.value;
            return total > 0 ? `${Math.round((hover.value / total) * 100)}%` : "—";
          })(),
        },
      ]
    : [{ label: "Total flow", value: money(hover.value) }];

  return createPortal(
    <div
      ref={nodeRef}
      style={{
        ...style,
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "var(--shadow-md)",
        padding: "8px 10px",
        color: "var(--popover-foreground)",
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {lines.map((l) => (
        <div key={l.label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <span style={{ opacity: 0.7 }}>{l.label}</span>
          <span style={{ fontWeight: 600 }}>{l.value}</span>
        </div>
      ))}
      <div style={{ marginTop: 4, opacity: 0.6, fontSize: 10 }}>{context}</div>
    </div>,
    document.body,
  );
}

function FlowNodeLabel(
  props: {
    onSelect?: (name: string) => void;
    onHover?: (hover: SankeyHoverPayload) => void;
  } & Record<string, unknown>,
) {
  const { onSelect, onHover, ...rest } = props;
  const { x, y, width, height, payload } = rest as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: { name: string; value?: number };
  };
  const isOut = payload.name === "Cash Collected";
  const clickable = !isOut && !!onSelect;
  const handleHover = () =>
    onHover?.({ kind: "node", name: payload.name, value: payload.value ?? 0 });
  const handleLeave = () => onHover?.(null);
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--spectrum-hot)"
        fillOpacity={0.8}
        cursor={clickable ? "pointer" : undefined}
        onClick={clickable ? () => onSelect!(payload.name) : undefined}
        onMouseMove={handleHover}
        onMouseLeave={handleLeave}
      />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        className={`fill-foreground text-[10px] ${clickable ? "cursor-pointer" : ""}`}
        onClick={clickable ? () => onSelect!(payload.name) : undefined}
        onMouseMove={handleHover}
        onMouseLeave={handleLeave}
      >
        {payload.name}
      </text>
    </Layer>
  );
}

/** Custom Sankey link renderer — replaces the plain `link={{ stroke, ... }}`
 * style-object form specifically so it can carry its own real onMouseMove/
 * onMouseLeave (see the SankeyHoverPayload comment above for why this
 * bypasses Recharts' own broken Sankey hover activation). Renders the exact
 * same bezier path Recharts' own default link item draws
 * (recharts/es6/chart/Sankey.js renderLinkItem) — only the interaction
 * wiring changes, not the visual. */
function FlowLinkPath(
  props: {
    onHover?: (hover: SankeyHoverPayload) => void;
  } & Record<string, unknown>,
) {
  const { onHover, ...rest } = props;
  const { sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload } =
    rest as {
      sourceX: number;
      sourceY: number;
      sourceControlX: number;
      targetX: number;
      targetY: number;
      targetControlX: number;
      linkWidth: number;
      payload: { source: { name: string }; target: { name: string }; value: number };
    };
  const d = `M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`;
  return (
    <path
      className="recharts-sankey-link"
      d={d}
      fill="none"
      stroke="var(--spectrum-hot)"
      strokeOpacity={0.25}
      strokeWidth={linkWidth}
      onMouseMove={() =>
        onHover?.({
          kind: "link",
          source: payload.source.name,
          target: payload.target.name,
          value: payload.value,
        })
      }
      onMouseLeave={() => onHover?.(null)}
    />
  );
}
