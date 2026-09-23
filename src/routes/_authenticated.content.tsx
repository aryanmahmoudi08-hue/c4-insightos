import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import {
  buildDemoAttributionDataset,
  buildDemoContentSignals,
  buildDemoContentPieces,
} from "@/lib/demo-fixtures";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { useMemo, useState, useEffect, Fragment } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Video,
  Layers,
  Pencil,
  ExternalLink,
  Trash2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Eye,
  Flame,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeContent } from "@/lib/analyze-content.functions";
import { coachContentFn } from "@/lib/coach-content.functions";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { PageHero } from "@/components/page-hero";
import {
  mockContentPieces,
  mockContentFunnel,
  mockContentDemand,
  mockWeeklyContentCheck,
  mockVariationHeatmap,
  mockContentCoaching,
  mockContentClassification,
  mockTrafficBreakdown,
  mockStoriesSummary,
  mockBottleneckRead,
  withMockDelay,
} from "@/lib/dev-mock-data";
import {
  MECHANISMS,
  MECHANISM_KEYS,
  questionsFor,
  type MechanismKey,
  type VariationQuestion,
} from "@/lib/content-mechanisms";
import type { Database } from "@/integrations/supabase/types";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { SPECTRUM_VAR, SPECTRUM_CHIP_CLASS, type SpectrumPosition } from "@/lib/spectrum";
import {
  ContentCommandCenter,
  type ContentDemandSummary,
  type ContentWeeklySummary,
  type ContentTrafficSummary,
  type ContentAttributionSummary,
  type ContentStoriesSummary,
} from "@/components/content-command-center";
import {
  contentDemandFn,
  weeklyContentCheckFn,
  analyzeContentSystemFn,
} from "@/lib/content-signals.functions";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";
import type { BottleneckReadResult } from "@/lib/content-taxonomy";
import type { AttributionModel, CanonicalLifecycleAttributionPath } from "@/lib/acquisition";
import { buildAttributionPathsForModel, ATTRIBUTION_MODELS } from "@/lib/content-attribution";
import { computeChannelRevenue } from "@/lib/traffic-channel-revenue";
import { SOCIAL_PLATFORMS } from "@/lib/social-platform";
import { usdCentsForRow } from "@/lib/currency";
import { getHistoricalFxRatesFn } from "@/lib/fx.functions";
import { fetchFxRates } from "@/hooks/use-fx-rates";
import { PlatformIcon } from "@/components/platform-icon";
import { ChartTooltip } from "@/components/chart-tooltip";

type Platform = Database["public"]["Enums"]["content_platform"];
type Angle = Database["public"]["Enums"]["content_angle"];

type PieceRow = {
  id: string;
  title: string | null;
  platform: Platform;
  source_platform?: string | null;
  cta?: string | null;
  hook: string | null;
  angle: Angle | null;
  posted_at: string | null;
  url: string | null;
  funnel_stage: string | null;
  body: string | null;
  pipeline_status: string;
  mechanism?: string | null;
  variation?: string | null;
  variation_answers?: Record<string, string> | null;
  content_metrics:
    | {
        captured_at: string | null;
        views: number | null;
        reach: number | null;
        likes: number | null;
        leads_generated: number | null;
        closes: number | null;
        cash_collected_cents: number | null;
        hook_retention_pct: number | null;
        avg_watch_pct: number | null;
        watch_time_seconds: number | null;
        three_sec_hold_pct: number | null;
        ten_sec_retention_pct: number | null;
        drop_off_seconds: number | null;
        comments: number | null;
        shares: number | null;
        saves: number | null;
        follower_views: number | null;
        non_follower_views: number | null;
        followers_gained: number | null;
        profile_visits: number | null;
        dms_generated: number | null;
        calls_booked: number | null;
        engagement_rate_pct: number | null;
        drop_off_rate_pct: number | null;
        cta_conversion_pct: number | null;
      }[]
    | null;
};

const fmtN = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(n));

// Top/Middle/Bottom-of-funnel is literally the spectrum's own cold/mid/hot
// vocabulary — was previously split across a semantic ChipTone mapping (table)
// and raw hardcoded blue-500/amber-500/emerald-500 (kanban card + calendar),
// the exact banned-default-Tailwind-hue pattern (B7). Unified to spectrum.
const FUNNEL_SPECTRUM: Record<string, SpectrumPosition> = { TOF: "cold", MOF: "mid", BOF: "hot" };
const funnelChip = (stage: string | null) =>
  stage && FUNNEL_SPECTRUM[stage]
    ? SPECTRUM_CHIP_CLASS[FUNNEL_SPECTRUM[stage]]
    : CHIP_TONE_CLASSES.default;

type ContentBusinessBridge = {
  traffic: ContentTrafficSummary;
  attribution: ContentAttributionSummary;
  canonicalPaths: CanonicalLifecycleAttributionPath[];
  canonicalPathsByModel?: Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;
  /** cash_collected_cents per closed call id, in range — the real, verified
   * source the Sankey joins against via canonicalPathsByModel's callId
   * (see Priority 2 correction: content_metrics.cash_collected_cents has no
   * write path anywhere in the app, so the Sankey no longer reads it). */
  callCashById: Record<string, number>;
};

type Prefill = {
  id?: string;
  title?: string;
  hook?: string;
  platform?: Platform;
  source_platform?: string;
  angle?: Angle;
  url?: string;
  transcript?: string;
  mechanism?: string;
  variation?: string;
  variationAnswers?: Record<string, string>;
  funnelStage?: "TOF" | "MOF" | "BOF";
  views?: number;
  reach?: number;
  leads?: number;
  retention?: number;
  avgWatchPct?: number;
  watchTimeSeconds?: number;
  threeSecHoldPct?: number;
  tenSecRetentionPct?: number;
  dropOffSeconds?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followerViews?: number;
  nonFollowerViews?: number;
  followersGained?: number;
  profileVisits?: number;
  dmsGenerated?: number;
  callsBooked?: number;
  engagementRatePct?: number;
  dropOffRatePct?: number;
  ctaConversionPct?: number;
};

/** `section`: an element id on this page to land on and scroll to — same
 * deep-link idiom `content-signals-panel.tsx`/`vsl.tsx` already use
 * (`useSearch({ strict: false })` read on mount), so e.g. `/content?section=
 * traffic-platforms` works as a real link from anywhere in the app. */
export const Route = createFileRoute("/_authenticated/content")({
  component: ContentIntel,
  validateSearch: (s: Record<string, unknown>): { section?: string } => ({
    section: typeof s.section === "string" ? s.section : undefined,
  }),
});

function ContentIntel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { range } = useDateRange();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [slidesFor, setSlidesFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overviewFor, setOverviewFor] = useState<PieceRow | null>(null);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Section deep-link (?section=<id>) — same idiom content-signals-panel.tsx
  // / vsl.tsx already use for landing on and scrolling to a specific part of
  // a page. The embedded Traffic/Attribution sections below carry their own
  // stable ids (traffic-overview, attribution-flow, ...), so a link from
  // anywhere else in the app can jump straight to one.
  const deepLinkSection = useSearch({ strict: false }) as { section?: string };
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    if (!deepLinkSection.section) return;
    requestAnimationFrame(() => scrollToSection(deepLinkSection.section!));
  }, [deepLinkSection.section]);

  const { devBypass } = useAuth();
  const { demoMode } = useDemoMode();
  // Currency-mixing remediation (docs/ascendos-currency-mixing-audit.md):
  // Traffic section sums calls.cash_collected_cents/contract_value_cents,
  // which carry a real original_currency never converted before this fix.
  const fxFn = useServerFn(getHistoricalFxRatesFn);

  const demandFn = useServerFn(contentDemandFn);
  const { data: commandDemand } = useQuery({
    queryKey: ["content-command-demand", orgId, range.from, range.to, devBypass, demoMode],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      demoMode
        ? Promise.resolve(buildDemoContentSignals().demand as unknown as ContentDemandSummary)
        : devBypass
          ? Promise.resolve(mockContentDemand() as unknown as ContentDemandSummary)
          : demandFn({ data: { from: range.from, to: range.to } }),
    retry: false,
  });
  const weeklyFn = useServerFn(weeklyContentCheckFn);
  const { data: commandWeekly } = useQuery({
    queryKey: ["content-command-weekly", orgId, devBypass, demoMode],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      demoMode
        ? Promise.resolve(buildDemoContentSignals().weekly as unknown as ContentWeeklySummary)
        : devBypass
          ? Promise.resolve(mockWeeklyContentCheck() as unknown as ContentWeeklySummary)
          : weeklyFn(),
    retry: false,
  });

  // Weekly reel target — migrated from the standalone Content Signals page.
  // Seeded once from the workspace's saved setting (Settings -> Content
  // Engine); a scratch edit here stays session-local, it doesn't write back.
  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass
        ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS)
        : settingsFn({ data: { orgId: orgId! } }),
  });
  const [reelTarget, setReelTarget] = useState(
    DEFAULT_WORKSPACE_SETTINGS.content_engine.weeklyReelTarget,
  );
  const [reelTargetSeeded, setReelTargetSeeded] = useState(false);
  if (workspaceSettings && !reelTargetSeeded) {
    setReelTarget(workspaceSettings.content_engine.weeklyReelTarget);
    setReelTargetSeeded(true);
  }

  // AI Bottleneck Read — migrated + upgraded from the standalone Content
  // Signals page's "Analyze the system" button. Same analyzeContentSystemFn
  // server logic; the AI call inside it now returns structured insights
  // (Finding/Supporting Data/Why It Matters/Recommended Action/Confidence/
  // Sample Size/Relevant Records/Attribution Limitations) instead of a
  // markdown blob — see content-signals.server.ts's gatewayInsights().
  const analyzeSystemFn = useServerFn(analyzeContentSystemFn);
  const [bottleneckRead, setBottleneckRead] = useState<BottleneckReadResult | undefined>(undefined);
  const analyzeBottlenecks = useMutation({
    mutationFn: async () => {
      if (devBypass) return withMockDelay(mockBottleneckRead());
      const result = await analyzeSystemFn({ data: { from: range.from, to: range.to } });
      return result.insights;
    },
    onSuccess: (insights) => setBottleneckRead(insights),
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: businessBridge } = useQuery({
    queryKey: ["content-business-bridge", orgId, range.from, range.to, devBypass, demoMode],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (demoMode) {
        // Same deterministic fixture Attribution's own demo mode resolves
        // through (buildDemoAttributionDataset) — reusing its leads/calls/
        // touches/content/traffic rows through the exact same
        // computeChannelRevenue()/buildAttributionPathsForModel() real
        // logic below, never a second aggregation engine. Demo leads carry
        // no separate `clients` record in this fixture universe, so
        // clientContractedCents honestly stays $0 rather than being
        // invented from an unrelated dataset.
        const demo = buildDemoAttributionDataset();
        const demoSources = demo.trafficRows.map((t) => ({
          id: t.id,
          name: t.category.charAt(0).toUpperCase() + t.category.slice(1),
          category: t.category,
        }));
        const closedCallIdsByLead = new Set(
          demo.callRows.filter((c) => c.closed).map((c) => c.lead_id),
        );
        const demoLeadsForRevenue = demo.leadRows.map((l) => ({
          id: l.id,
          traffic_source_id: l.traffic_source_id,
          status: closedCallIdsByLead.has(l.id) ? "closed" : "lead",
        }));
        const channels = computeChannelRevenue(demoSources, demoLeadsForRevenue, demo.callRows, []);
        const modelInput = {
          leads: demo.leadRows.map((l) => ({
            id: l.id,
            created_at: l.created_at,
            source_content_id: l.source_content_id,
          })),
          calls: demo.callRows
            .filter((c) => c.closed)
            .map((c) => ({
              id: c.id,
              lead_id: c.lead_id,
              created_at: c.created_at,
              closed: true,
              source_content_id: c.source_content_id,
            })),
          touches: demo.touchRows,
          sampleSize: demo.callRows.filter((c) => c.closed).length,
        };
        const canonicalPathsByModel = Object.fromEntries(
          ATTRIBUTION_MODELS.map((model) => [
            model,
            buildAttributionPathsForModel(model, modelInput),
          ]),
        ) as Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;
        const callCashById: Record<string, number> = {};
        for (const c of demo.callRows) {
          if (c.closed && c.cash_collected_cents > 0) callCashById[c.id] = c.cash_collected_cents;
        }
        const totalLeads = demo.leadRows.length;
        const totalContracted = channels.reduce((sum, row) => sum + row.contractedCents, 0);
        const closedDemoCalls = demo.callRows.filter((c) => c.closed);
        return {
          traffic: {
            leads: totalLeads,
            clients: channels.reduce((sum, row) => sum + row.clients, 0),
            contractedCents: totalContracted,
            collectedCents: channels.reduce((sum, row) => sum + row.collectedCents, 0),
            clientContractedCents: 0,
            revenuePerLeadCents: totalLeads ? Math.round(totalContracted / totalLeads) : 0,
            noSource: demo.leadRows.filter((lead) => !lead.traffic_source_id).length,
            channels: channels.slice(0, 5),
          },
          attribution: {
            touches: demo.touchRows.length,
            leads: totalLeads,
            attributed: demo.leadRows.filter((lead) => lead.first_touch_content_id).length,
            closes: closedDemoCalls.length,
            contractValueCents: closedDemoCalls.reduce((s, c) => s + c.contract_value_cents, 0),
            cashCollectedCents: closedDemoCalls.reduce((s, c) => s + c.cash_collected_cents, 0),
          },
          canonicalPaths: canonicalPathsByModel.first_touch,
          canonicalPathsByModel,
          callCashById,
        } as ContentBusinessBridge;
      }
      if (devBypass) {
        // Mock preview only (never reachable outside dev-bypass) — reshapes
        // mockTrafficBreakdown()'s already-mock numbers into the corrected
        // field split (contracted/collected/client-LTV kept separate) rather
        // than inventing new fabricated figures on top of the existing mock
        // generator.
        const mockChannels = mockTrafficBreakdown();
        const channels = mockChannels.map((r) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          leads: r.leads,
          clients: r.clients,
          closeRate: r.closeRate,
          contractedCents: Math.round(r.revenue * 100 - r.ltv * 100),
          collectedCents: Math.round(r.revenue * 100 - r.ltv * 100),
          clientContractedCents: Math.round(r.ltv * 100),
          revenuePerLeadCents: r.revenuePerLead * 100,
        }));
        const totalLeads = channels.reduce((sum, row) => sum + row.leads, 0);
        const totalContracted = channels.reduce((sum, row) => sum + row.contractedCents, 0);
        return {
          traffic: {
            leads: totalLeads,
            clients: channels.reduce((sum, row) => sum + row.clients, 0),
            contractedCents: totalContracted,
            collectedCents: channels.reduce((sum, row) => sum + row.collectedCents, 0),
            clientContractedCents: channels.reduce(
              (sum, row) => sum + row.clientContractedCents,
              0,
            ),
            revenuePerLeadCents: totalLeads ? Math.round(totalContracted / totalLeads) : 0,
            noSource: 0,
            channels: channels.slice(0, 5),
          },
          attribution: {
            touches: 0,
            leads: totalLeads,
            attributed: 0,
            closes: channels.reduce((sum, row) => sum + row.clients, 0),
            contractValueCents: totalContracted,
            cashCollectedCents: channels.reduce((sum, row) => sum + row.collectedCents, 0),
          },
          canonicalPaths: [],
          callCashById: {},
        } as ContentBusinessBridge;
      }
      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;
      const [sources, leads, calls, clients, touches, closed] = await Promise.all([
        supabase
          .from("traffic_sources")
          .select("id, name, category, is_active")
          .eq("org_id", orgId!),
        supabase
          .from("leads")
          .select(
            "id, traffic_source_id, status, created_at, first_touch_content_id, source_content_id",
          )
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("calls")
          .select(
            "lead_id, closed, contract_value_cents, cash_collected_cents, created_at, original_currency",
          )
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase.from("clients").select("lead_id, contract_value_cents").eq("org_id", orgId!),
        // content_id + touched_at (not just a count) — feeds first_touch/
        // last_touch/assisted_touch attribution models, which need the real
        // per-lead touch sequence, not just a total.
        supabase
          .from("lead_content_touches")
          .select("id, lead_id, content_id, touched_at")
          .eq("org_id", orgId!)
          .gte("touched_at", fromISO)
          .lte("touched_at", toISO),
        supabase
          .from("calls")
          .select(
            "id, created_at, contract_value_cents, cash_collected_cents, lead_id, source_content_id, original_currency",
          )
          .eq("org_id", orgId!)
          .eq("closed", true)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
      ]);
      const sourceRows = sources.data ?? [];
      const leadRows = leads.data ?? [];
      const clientRows = clients.data ?? [];
      // Remediation (currency-mixing audit): both calls queries above carry
      // a real original_currency never converted before this fix — normalize
      // to USD cents once, here, so every downstream consumer (channel
      // revenue, attribution paths, callCashById, the raw contract/cash
      // reduces below) reads an already-correct value. Same proven
      // sumNormalizedCents infrastructure as closer.tsx.
      const trafficFxRates = await fetchFxRates(
        fxFn,
        {
          rows: calls.data ?? [],
          getCurrency: (c: NonNullable<typeof calls.data>[number]) => c.original_currency,
          getDate: (c: NonNullable<typeof calls.data>[number]) => c.created_at?.slice(0, 10),
        },
        {
          rows: closed.data ?? [],
          getCurrency: (c: NonNullable<typeof closed.data>[number]) => c.original_currency,
          getDate: (c: NonNullable<typeof closed.data>[number]) => c.created_at?.slice(0, 10),
        },
      );
      let trafficFxIncomplete = false;
      const normalizeCall = <
        T extends {
          cash_collected_cents: number | null;
          contract_value_cents: number | null;
          created_at: string | null;
          original_currency?: string | null;
        },
      >(
        c: T,
      ): T => {
        const day = c.created_at?.slice(0, 10);
        const cash = usdCentsForRow(
          c.cash_collected_cents,
          c.original_currency,
          day,
          trafficFxRates,
        );
        const contract = usdCentsForRow(
          c.contract_value_cents,
          c.original_currency,
          day,
          trafficFxRates,
        );
        if (cash.excluded || contract.excluded) trafficFxIncomplete = true;
        return { ...c, cash_collected_cents: cash.usd, contract_value_cents: contract.usd };
      };
      const callRows = (calls.data ?? []).map(normalizeCall);
      const closedRowsNormalized = (closed.data ?? []).map(normalizeCall);
      // Priority 1 correction: contractedCents/collectedCents (verified,
      // closed-call basis) and clientContractedCents (a separate LTV
      // concept) are computed independently — never summed into one
      // ambiguous "revenue" figure. See traffic-channel-revenue.ts and its
      // tests for the exact double-count scenario this fixes.
      const channels = computeChannelRevenue(sourceRows, leadRows, callRows, clientRows);
      const modelInput = {
        leads: leadRows.map((l) => ({
          id: l.id,
          created_at: l.created_at,
          source_content_id: l.source_content_id,
        })),
        calls: closedRowsNormalized.map((c) => ({
          id: c.id,
          lead_id: c.lead_id,
          created_at: c.created_at,
          closed: true,
          source_content_id: c.source_content_id,
        })),
        touches: touches.data ?? [],
        sampleSize: closedRowsNormalized.length,
      };
      const canonicalPathsByModel = Object.fromEntries(
        ATTRIBUTION_MODELS.map((model) => [
          model,
          buildAttributionPathsForModel(model, modelInput),
        ]),
      ) as Record<AttributionModel, CanonicalLifecycleAttributionPath[]>;
      const callCashById: Record<string, number> = {};
      for (const c of closedRowsNormalized) {
        if (c.id && c.cash_collected_cents != null) callCashById[c.id] = c.cash_collected_cents;
      }
      const totalLeads = leadRows.length;
      const totalContracted = channels.reduce((sum, row) => sum + row.contractedCents, 0);
      return {
        traffic: {
          leads: totalLeads,
          clients: channels.reduce((sum, row) => sum + row.clients, 0),
          contractedCents: totalContracted,
          collectedCents: channels.reduce((sum, row) => sum + row.collectedCents, 0),
          clientContractedCents: channels.reduce((sum, row) => sum + row.clientContractedCents, 0),
          revenuePerLeadCents: totalLeads ? Math.round(totalContracted / totalLeads) : 0,
          noSource: leadRows.filter((lead) => !lead.traffic_source_id).length,
          channels: channels.slice(0, 5),
          fxIncomplete: trafficFxIncomplete,
        },
        attribution: {
          touches: touches.data?.length ?? 0,
          leads: leadRows.length,
          attributed: leadRows.filter((lead) => lead.first_touch_content_id).length,
          closes: closedRowsNormalized.length,
          contractValueCents: closedRowsNormalized.reduce(
            (sum, row) => sum + (row.contract_value_cents ?? 0),
            0,
          ),
          cashCollectedCents: closedRowsNormalized.reduce(
            (sum, row) => sum + (row.cash_collected_cents ?? 0),
            0,
          ),
        },
        canonicalPaths: canonicalPathsByModel.first_touch,
        canonicalPathsByModel,
        callCashById,
      } as ContentBusinessBridge;
    },
    retry: false,
  });
  const { data: pieces } = useQuery({
    queryKey: ["content", orgId, devBypass, demoMode],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (demoMode) return buildDemoContentPieces() as unknown as PieceRow[];
      if (devBypass) return mockContentPieces() as unknown as PieceRow[];
      const { data, error } = await supabase
        .from("content_pieces")
        .select(
          "id, title, platform, source_platform, cta, post_format, hook, angle, posted_at, url, funnel_stage, body, pipeline_status, mechanism, variation, variation_answers, content_metrics(captured_at, views, reach, likes, leads_generated, closes, cash_collected_cents, hook_retention_pct, avg_watch_pct, watch_time_seconds, three_sec_hold_pct, ten_sec_retention_pct, drop_off_seconds, comments, shares, saves, follower_views, non_follower_views, followers_gained, profile_visits, dms_generated, calls_booked, engagement_rate_pct, drop_off_rate_pct, cta_conversion_pct)",
        )
        .eq("org_id", orgId!)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as PieceRow[];
    },
  });

  // Stories aggregate — real story_slides + slide_metrics tables (see
  // SlidesPanel below for the per-piece management UI). The discovery found
  // the Stories availability card hardcoded to "Not connected" even though
  // this data genuinely exists; this query is what makes that card honest.
  const { data: storiesSummary } = useQuery({
    queryKey: ["content-stories-summary", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async (): Promise<ContentStoriesSummary> => {
      if (devBypass) return mockStoriesSummary();
      const { data, error } = await supabase
        .from("story_slides")
        .select(
          "id, content_id, slide_metrics(views, exits, taps_forward, taps_back, replies, link_clicks)",
        )
        .eq("org_id", orgId!);
      if (error) throw error;
      const slides = data ?? [];
      const totals = slides.reduce(
        (sum, slide) => {
          const m = (slide.slide_metrics ?? [])[0];
          sum.views += m?.views ?? 0;
          sum.exits += m?.exits ?? 0;
          sum.tapsForward += m?.taps_forward ?? 0;
          sum.tapsBack += m?.taps_back ?? 0;
          sum.replies += m?.replies ?? 0;
          sum.linkClicks += m?.link_clicks ?? 0;
          return sum;
        },
        { views: 0, exits: 0, tapsForward: 0, tapsBack: 0, replies: 0, linkClicks: 0 },
      );
      return {
        sequencesTracked: new Set(slides.map((s) => s.content_id)).size,
        totalSlides: slides.length,
        totalViews: totals.views,
        totalExits: totals.exits,
        avgExitRatePct: totals.views > 0 ? (totals.exits / totals.views) * 100 : null,
        totalTapsForward: totals.tapsForward,
        totalTapsBack: totals.tapsBack,
        totalReplies: totals.replies,
        totalLinkClicks: totals.linkClicks,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const editingId = prefill?.id;
      const payload = {
        org_id: orgId!,
        title: String(form.get("title") || ""),
        hook: String(form.get("hook") || "") || null,
        platform: form.get("platform") as Platform,
        source_platform: String(form.get("source_platform") || "") || null,
        angle: (form.get("angle") as Angle) || null,
        url: String(form.get("url") || "") || null,
        body: String(form.get("transcript") || "") || null,
        mechanism: String(form.get("mechanism") || "") || null,
        variation: String(form.get("variation") || "") || null,
        funnel_stage: String(form.get("funnel_stage") || "") || null,
        variation_answers: JSON.parse(String(form.get("variation_answers") || "{}")),
      };
      let contentId = editingId;
      if (editingId) {
        const { error } = await supabase.from("content_pieces").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: piece, error } = await supabase
          .from("content_pieces")
          .insert({ ...payload, posted_at: new Date().toISOString() })
          .select("id")
          .single();
        if (error) throw error;
        contentId = piece.id;
      }
      const metrics = {
        views: Number(form.get("views") || 0),
        reach: Number(form.get("reach") || 0),
        leads_generated: Number(form.get("leads") || 0),
        hook_retention_pct: Number(form.get("retention") || 0),
        avg_watch_pct: Number(form.get("avg_watch_pct") || 0),
        watch_time_seconds: Number(form.get("watch_time_seconds") || 0),
        three_sec_hold_pct: Number(form.get("three_sec_hold_pct") || 0),
        ten_sec_retention_pct: Number(form.get("ten_sec_retention_pct") || 0),
        drop_off_seconds: Number(form.get("drop_off_seconds") || 0),
        likes: Number(form.get("likes") || 0),
        comments: Number(form.get("comments") || 0),
        shares: Number(form.get("shares") || 0),
        saves: Number(form.get("saves") || 0),
        follower_views: Number(form.get("follower_views") || 0),
        non_follower_views: Number(form.get("non_follower_views") || 0),
        followers_gained: Number(form.get("followers_gained") || 0),
        profile_visits: Number(form.get("profile_visits") || 0),
        dms_generated: Number(form.get("dms_generated") || 0),
        calls_booked: Number(form.get("calls_booked") || 0),
        engagement_rate_pct: Number(form.get("engagement_rate_pct") || 0),
        drop_off_rate_pct: Number(form.get("drop_off_rate_pct") || 0),
        cta_conversion_pct: Number(form.get("cta_conversion_pct") || 0),
      };
      if (editingId) {
        const { data: existing } = await supabase
          .from("content_metrics")
          .select("id")
          .eq("content_id", editingId)
          .limit(1)
          .maybeSingle();
        if (existing) {
          await supabase.from("content_metrics").update(metrics).eq("id", existing.id);
        } else {
          await supabase
            .from("content_metrics")
            .insert({ org_id: orgId!, content_id: contentId!, ...metrics });
        }
      } else {
        await supabase
          .from("content_metrics")
          .insert({ org_id: orgId!, content_id: contentId!, ...metrics });
      }
    },
    onSuccess: () => {
      toast.success(prefill?.id ? "Content updated" : "Content logged");
      qc.invalidateQueries({ queryKey: ["content"] });
      setOpen(false);
      setPrefill(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("content_metrics").delete().eq("content_id", id);
      await supabase
        .from("slide_metrics")
        .delete()
        .eq("org_id", orgId!)
        .in(
          "slide_id",
          (await supabase.from("story_slides").select("id").eq("content_id", id)).data?.map(
            (s) => s.id,
          ) ?? [],
        );
      await supabase.from("story_slides").delete().eq("content_id", id);
      await supabase.from("lead_content_touches").delete().eq("content_id", id);
      const { error } = await supabase.from("content_pieces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["content"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const edit = (p: PieceRow) => {
    const m = (p.content_metrics ?? [])[0];
    setPrefill({
      id: p.id,
      title: p.title ?? undefined,
      hook: p.hook ?? undefined,
      platform: p.platform,
      angle: p.angle ?? undefined,
      url: p.url ?? undefined,
      transcript: p.body ?? undefined,
      mechanism: p.mechanism ?? undefined,
      variation: p.variation ?? undefined,
      variationAnswers: p.variation_answers ?? undefined,
      funnelStage: (p.funnel_stage as "TOF" | "MOF" | "BOF" | null) ?? undefined,
      views: m?.views ?? 0,
      reach: m?.reach ?? 0,
      leads: m?.leads_generated ?? 0,
      retention: m?.hook_retention_pct ?? 0,
      avgWatchPct: m?.avg_watch_pct ?? 0,
      watchTimeSeconds: m?.watch_time_seconds ?? 0,
      threeSecHoldPct: m?.three_sec_hold_pct ?? 0,
      tenSecRetentionPct: m?.ten_sec_retention_pct ?? 0,
      dropOffSeconds: m?.drop_off_seconds ?? 0,
      likes: m?.likes ?? 0,
      comments: m?.comments ?? 0,
      shares: m?.shares ?? 0,
      saves: m?.saves ?? 0,
      followerViews: m?.follower_views ?? 0,
      nonFollowerViews: m?.non_follower_views ?? 0,
      followersGained: m?.followers_gained ?? 0,
      profileVisits: m?.profile_visits ?? 0,
      dmsGenerated: m?.dms_generated ?? 0,
      callsBooked: m?.calls_booked ?? 0,
      engagementRatePct: m?.engagement_rate_pct ?? 0,
      dropOffRatePct: m?.drop_off_rate_pct ?? 0,
      ctaConversionPct: m?.cta_conversion_pct ?? 0,
    });
    setOpen(true);
  };

  // Performance overview — funnel totals, top hooks, mechanism x variation heatmap.
  // Totals are scoped to the selected date range (by posted_at); the
  // Pipeline/Table/Calendar tabs below intentionally keep showing every piece
  // regardless of range — it's a pipeline of drafts/scheduled/posted content,
  // not a log, and filtering it would hide in-progress pieces outside the window.
  const rangeToEnd = `${range.to}T23:59:59`;
  // Remediation (metric-dictionary audit, Task 5): the Top KPI row / chart /
  // format mix / post-level table (all rendered inside ContentCommandCenter
  // below) were previously fed the raw, unranged `pieces` query (latest 200
  // by posted_at) instead of this range-filtered list — changing the page's
  // own date-range picker never changed those sections. This is the same
  // filter `perf`'s totals below already compute; now shared so
  // ContentCommandCenter gets it too, filtering happens before aggregation
  // either way. The Pipeline/Table/Calendar tabs elsewhere on this page
  // still intentionally use the unranged `pieces` — see the comment below.
  const rangedPieces = useMemo(
    () =>
      (pieces ?? []).filter(
        (p) => !!p.posted_at && p.posted_at >= range.from && p.posted_at <= rangeToEnd,
      ),
    [pieces, range.from, rangeToEnd],
  );
  const perf = useMemo(() => {
    const all = pieces ?? [];
    const list = rangedPieces;
    const metricsOf = (p: PieceRow) => p.content_metrics?.[0];
    const totals = list.reduce(
      (s, p) => {
        const m = metricsOf(p);
        s.views += m?.views ?? 0;
        s.leads += m?.leads_generated ?? 0;
        s.closes += m?.closes ?? 0;
        s.cash += m?.cash_collected_cents ?? 0;
        return s;
      },
      { views: 0, leads: 0, closes: 0, cash: 0 },
    );

    if (devBypass) {
      const mock = mockContentFunnel();
      const heat = mockVariationHeatmap();
      const top = [...list]
        .sort(
          (a, b) =>
            (metricsOf(b)?.hook_retention_pct ?? 0) - (metricsOf(a)?.hook_retention_pct ?? 0),
        )
        .slice(0, 4);
      return {
        totals: mock,
        topHooks: top,
        heatmapRows: heat.rows,
        heatmapCols: heat.cols,
        heatmapData: heat.data,
        postedThisWeek: 4,
        inReview: 1,
      };
    }

    const top = [...list]
      .filter((p) => metricsOf(p)?.hook_retention_pct != null)
      .sort(
        (a, b) => (metricsOf(b)?.hook_retention_pct ?? 0) - (metricsOf(a)?.hook_retention_pct ?? 0),
      )
      .slice(0, 4);

    const heatRows = MECHANISM_KEYS.map((k) => MECHANISMS[k].label);
    const heatCols = ["Var 1", "Var 2"];
    const heatData = MECHANISM_KEYS.map((k) => {
      const vars = MECHANISMS[k].variations.map((v) => v.value);
      return vars.slice(0, 2).map((vv) => {
        const matches = list.filter((p) => p.mechanism === k && p.variation === vv);
        if (!matches.length) return 0;
        return Math.round(
          matches.reduce((s, p) => s + (metricsOf(p)?.views ?? 0), 0) / matches.length,
        );
      });
    });

    // "In review" is current pipeline state, not time-scoped — counted from
    // every piece regardless of the selected range, same reasoning as the
    // Pipeline tab itself.
    const postedThisWeek = list.length;
    const inReview = all.filter((p) => p.pipeline_status === "in_review").length;

    return {
      totals,
      topHooks: top,
      heatmapRows: heatRows,
      heatmapCols: heatCols,
      heatmapData: heatData,
      postedThisWeek,
      inReview,
    };
  }, [pieces, rangedPieces, devBypass]);

  // Real month-grid calendar with month/year navigation.
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const calendar = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const lead = first.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
    const cells: { date: string; inMonth: boolean; pieces: PieceRow[] }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const dt = new Date(year, month, i - lead + 1);
      const iso = dt.toISOString().slice(0, 10);
      cells.push({ date: iso, inMonth: dt.getMonth() === month, pieces: [] });
    }
    for (const p of pieces ?? []) {
      if (!p.posted_at) continue;
      const iso = p.posted_at.slice(0, 10);
      const slot = cells.find((c) => c.date === iso);
      if (slot) slot.pieces.push(p);
    }
    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [pieces, cursor]);
  const monthLabel = cursor.toLocaleString("default", { month: "long", year: "numeric" });
  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const n = new Date(c);
      n.setMonth(c.getMonth() + delta);
      return n;
    });
  };

  const exportCsv = () => {
    const rows = pieces ?? [];
    const header = [
      "title",
      "platform",
      "status",
      "views",
      "leads",
      "closes",
      "cash_cents",
      "retention_pct",
    ];
    const lines = rows.map((p) => {
      const m = p.content_metrics?.[0];
      return [
        p.title ?? "",
        p.platform,
        p.pipeline_status,
        m?.views ?? 0,
        m?.leads_generated ?? 0,
        m?.closes ?? 0,
        m?.cash_collected_cents ?? 0,
        m?.hook_retention_pct ?? "",
      ].join(",");
    });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content-intelligence.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <TopBar
        title="Content Command Center"
        subtitle="Performance, audience signals, and content-to-cash intelligence"
        showDateRange
      />
      {/* Page-scoped section jumps — additive to the Rail → Panel sidebar
          nav, not a second navigation system. Both dropdowns just scroll
          within this same page to the embedded Traffic/Attribution sections
          below (same DropdownMenu + id/scrollIntoView idiom already used on
          traffic.tsx's row-actions menu and attribution.tsx's journey
          drill-down). */}
      <div className="flex items-center gap-2 border-b border-border/60 px-6 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground">
            Traffic <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => scrollToSection("traffic-overview")}>
              Traffic Overview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("traffic-platform-mix")}>
              Platform Mix
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("traffic-platforms")}>
              Platform Performance
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("traffic-funnel")}>
              Funnel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("traffic-comparison")}>
              What's Working / Comparison
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground">
            Attribution <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => scrollToSection("attribution-overview")}>
              Attribution Overview
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("attribution-flow")}>
              Attribution Flow
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("attribution-journeys")}>
              Customer Journeys
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => scrollToSection("detailed-records")}>
              Detailed Records
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="p-6 space-y-4">
        <DemoModeBanner demoMode={demoMode} />
        <ContentCommandCenter
          pieces={rangedPieces}
          demand={commandDemand as ContentDemandSummary | undefined}
          weekly={commandWeekly as ContentWeeklySummary | undefined}
          canonicalPaths={businessBridge?.canonicalPaths}
          canonicalPathsByModel={businessBridge?.canonicalPathsByModel}
          traffic={businessBridge?.traffic}
          attributionSummary={businessBridge?.attribution}
          callCashById={businessBridge?.callCashById}
          stories={storiesSummary}
          bottleneckRead={bottleneckRead}
          onAnalyzeBottlenecks={() => analyzeBottlenecks.mutate()}
          analyzingBottlenecks={analyzeBottlenecks.isPending}
          signalsRange={range}
          reelTarget={reelTarget}
          onReelTargetChange={setReelTarget}
        />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 pt-3">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setPrefill(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => setPrefill(null)}>
                <Plus className="h-4 w-4" />
                Log content
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {prefill?.id ? "Edit content piece" : "Log content piece"}
                </DialogTitle>
              </DialogHeader>
              <ContentForm
                key={prefill?.id ?? "new"}
                prefill={prefill}
                onSubmit={(fd) => save.mutate(fd)}
                pending={save.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Pipeline (Draft -> Posted) moved to Content Calendar, gated to
            Admin/Growth Operator — see content-pipeline.functions.ts and
            _authenticated.content-calendar.tsx. Content Command Center keeps
            Table + Calendar, which every role that can view this page
            already sees. */}
        <Tabs defaultValue="table" className="space-y-3">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <GlassTableShell>
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-6 p-3"></th>
                    <th className="text-left p-3">Title</th>
                    <th className="text-left p-3">Platform</th>
                    <th className="text-left p-3">Angle</th>
                    <th className="text-center p-3">Funnel</th>
                    <th className="text-center p-3">Link</th>
                    <th className="text-right p-3 font-sans tabular-nums">Views</th>
                    <th className="text-right p-3 font-sans tabular-nums">Leads</th>
                    <th
                      className="text-right p-3 font-sans tabular-nums"
                      title="content_metrics.closes has no write path anywhere in the app"
                    >
                      Closes
                    </th>
                    <th
                      className="text-right p-3 font-sans tabular-nums"
                      title="content_metrics.cash_collected_cents has no write path anywhere in the app — see the Attribution tab's Canonical Content → Cash table for real, attributed cash"
                    >
                      Cash
                    </th>
                    <th className="text-right p-3 font-sans tabular-nums">Retention</th>
                    <th className="text-right p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(pieces ?? []).map((p) => {
                    const m = (p.content_metrics ?? [])[0];
                    const isOpen = expanded.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-t border-border hover:bg-muted/20">
                          <td className="p-3 align-top">
                            <button
                              onClick={() => toggleExpand(p.id)}
                              className="text-muted-foreground hover:text-foreground"
                              title={isOpen ? "Hide transcript" : "Show transcript"}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-start gap-2">
                              <Video className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                              <button
                                onClick={() => setOverviewFor(p)}
                                className="min-w-0 text-left group"
                              >
                                <div className="truncate font-medium group-hover:text-accent group-hover:underline">
                                  {p.title || "(untitled)"}
                                </div>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-xs uppercase text-muted-foreground">
                            {p.platform}
                          </td>
                          <td className="p-3 text-xs">{p.angle ?? "—"}</td>
                          <td className="p-3 text-center">
                            {p.funnel_stage ? (
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-3xs font-mono uppercase ${funnelChip(p.funnel_stage)}`}
                              >
                                {p.funnel_stage}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {p.url ? (
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-accent hover:underline"
                                title={p.url}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3 text-right font-sans tabular-nums">
                            {m?.views?.toLocaleString() ?? "—"}
                          </td>
                          <td className="p-3 text-right font-sans tabular-nums">
                            {m?.leads_generated ?? "—"}
                          </td>
                          {/* closes/cash_collected_cents default to 0 in the DB and have no
                              write path — a literal 0/"$0" here would misread as "zero
                              closes/cash" rather than "not tracked." */}
                          <td className="p-3 text-right font-sans tabular-nums text-muted-foreground">
                            Not tracked
                          </td>
                          <td className="p-3 text-right font-sans tabular-nums text-muted-foreground">
                            Not tracked
                          </td>
                          <td className="p-3 text-right font-sans tabular-nums">
                            {m?.hook_retention_pct ? m.hook_retention_pct + "%" : "—"}
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => edit(p)}
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </Button>
                            {p.platform === "story_sequence" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs"
                                onClick={() => setSlidesFor(p.id)}
                              >
                                <Layers className="h-3 w-3" />
                                Slides
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete "${p.title || "this piece"}"? This cannot be undone.`,
                                  )
                                )
                                  del.mutate(p.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                              Delete
                            </Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={p.id + "-tx"} className="bg-muted/10 border-t border-border/50">
                            <td></td>
                            <td colSpan={11} className="p-3">
                              <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">
                                Transcript
                              </div>
                              <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-64 overflow-y-auto rounded bg-background/50 p-3 border border-border">
                                {p.body || (
                                  <span className="text-muted-foreground italic">
                                    No transcript yet. Add one via Edit.
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {(!pieces || pieces.length === 0) && (
                    <tr>
                      <td colSpan={12}>
                        <EmptyState
                          icon={<Video className="h-4 w-4" />}
                          title="No content yet"
                          description="Log your first piece."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>

          <TabsContent value="calendar">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => shiftMonth(-1)}
                    className="h-8 w-8 p-0"
                  >
                    ‹
                  </Button>
                  <div className="display-serif text-lg min-w-[180px] text-center">
                    {monthLabel}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => shiftMonth(1)}
                    className="h-8 w-8 p-0"
                  >
                    ›
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const d = new Date();
                    d.setDate(1);
                    d.setHours(0, 0, 0, 0);
                    setCursor(d);
                  }}
                >
                  Today
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-3xs uppercase tracking-wider text-muted-foreground mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="p-1 text-center font-semibold">
                    {d}
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                {calendar.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((slot) => {
                      const today = new Date().toISOString().slice(0, 10);
                      const isToday = slot.date === today;
                      const dayNum = Number(slot.date.slice(8, 10));
                      return (
                        <div
                          key={slot.date}
                          className={`min-h-[96px] rounded-md border p-1.5 text-2xs transition ${
                            isToday
                              ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                              : slot.inMonth
                                ? "border-border bg-card hover:bg-muted/20"
                                : "border-border/40 bg-muted/10 text-muted-foreground/50"
                          }`}
                        >
                          <div
                            className={`font-sans tabular-nums mb-1 text-xs ${isToday ? "text-primary font-bold" : slot.inMonth ? "text-foreground/80" : "text-muted-foreground/40"}`}
                          >
                            {dayNum}
                          </div>
                          <div className="space-y-0.5">
                            {slot.pieces.slice(0, 3).map((p) => {
                              const m = (p.content_metrics ?? [])[0];
                              const stage = p.funnel_stage ?? "—";
                              const stageCls = funnelChip(p.funnel_stage);
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => setOverviewFor(p)}
                                  className="w-full flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/10 text-left"
                                  title={p.title ?? ""}
                                >
                                  <span
                                    className={`rounded px-1 py-px text-4xs font-mono uppercase ${stageCls}`}
                                  >
                                    {stage}
                                  </span>
                                  <span className="flex items-center gap-0.5 text-3xs font-sans tabular-nums text-muted-foreground">
                                    <Eye className="h-2.5 w-2.5" />
                                    {m?.views ?? 0}
                                  </span>
                                </button>
                              );
                            })}
                            {slot.pieces.length > 3 && (
                              <div className="text-muted-foreground text-3xs pl-1">
                                +{slot.pieces.length - 3} more
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <SlidesPanel orgId={orgId} contentId={slidesFor} onClose={() => setSlidesFor(null)} />
      <OverviewPanel
        piece={overviewFor}
        onClose={() => setOverviewFor(null)}
        onEdit={(p) => {
          setOverviewFor(null);
          edit(p);
        }}
      />
    </>
  );
}

function ContentForm({
  prefill,
  onSubmit,
  pending,
}: {
  prefill: Prefill | null;
  onSubmit: (fd: FormData) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [hook, setHook] = useState(prefill?.hook ?? "");
  const [platform, setPlatform] = useState<Platform>(prefill?.platform ?? "reel");
  const [sourcePlatform, setSourcePlatform] = useState(prefill?.source_platform ?? "");
  const [angle, setAngle] = useState<Angle>(prefill?.angle ?? "authority");
  const [url, setUrl] = useState(prefill?.url ?? "");
  const [transcript, setTranscript] = useState(prefill?.transcript ?? "");
  const [mechanism, setMechanism] = useState<MechanismKey | "">(
    (prefill?.mechanism as MechanismKey) ?? "",
  );
  const [variation, setVariation] = useState(prefill?.variation ?? "");
  const [funnelStage, setFunnelStage] = useState<"TOF" | "MOF" | "BOF">(
    prefill?.funnelStage ?? "TOF",
  );
  const [answers, setAnswers] = useState<Record<string, string>>(prefill?.variationAnswers ?? {});
  const analyze = useServerFn(analyzeContent);
  const { devBypass } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);

  const questions: VariationQuestion[] = questionsFor(variation);

  const runAnalyze = async () => {
    if (!transcript.trim()) {
      toast.error("Paste the transcript first");
      return;
    }
    setAnalyzing(true);
    try {
      const r = devBypass
        ? await withMockDelay(mockContentClassification())
        : await analyze({ data: { transcript, hook, title } });
      if (!r) {
        toast.error("AI not configured — add LOVABLE_API_KEY to enable this.");
        return;
      }
      setHook(r.hook);
      setAngle(r.angle as Angle);
      toast.success(`Detected: ${r.angle}`, { description: r.rationale });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("platform", platform);
        fd.set("source_platform", sourcePlatform);
        fd.set("angle", angle);
        fd.set("mechanism", mechanism);
        fd.set("variation", variation);
        fd.set("funnel_stage", funnelStage);
        fd.set("variation_answers", JSON.stringify(answers));
        onSubmit(fd);
      }}
    >
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label>Video URL</Label>
        <Input
          name="url"
          type="url"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Full transcript</Label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={runAnalyze}
            disabled={analyzing}
          >
            <Sparkles className="h-3 w-3" />
            {analyzing ? "Analyzing…" : "AI: detect hook + angle"}
          </Button>
        </div>
        <Textarea
          name="transcript"
          rows={6}
          placeholder="Paste the entire reel transcript here…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Hook (first 3 sec)</Label>
        <Textarea name="hook" rows={2} value={hook} onChange={(e) => setHook(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Format</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "reel",
                "story_sequence",
                "post",
                "carousel",
                "youtube",
                "youtube_short",
                "tiktok",
                "vsl",
                "ad_creative",
                "email",
                "dm",
                "other",
              ].map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Platform</Label>
          <Select value={sourcePlatform} onValueChange={setSourcePlatform}>
            <SelectTrigger>
              <SelectValue placeholder="Which network" />
            </SelectTrigger>
            <SelectContent>
              {SOCIAL_PLATFORMS.filter((p) => p !== "Unknown / Unattributed").map((p) => (
                <SelectItem key={p} value={p}>
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformIcon platform={p} /> {p}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Angle</Label>
          <Select value={angle} onValueChange={(v) => setAngle(v as Angle)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                "authority",
                "story",
                "contrarian",
                "tutorial",
                "case_study",
                "aspirational",
                "fear",
                "social_proof",
              ].map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5 rounded-md border border-border bg-muted/20 p-3">
        <Label>Funnel stage</Label>
        <Select
          value={funnelStage}
          onValueChange={(v) => setFunnelStage(v as "TOF" | "MOF" | "BOF")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TOF">TOF · Top of Funnel</SelectItem>
            <SelectItem value="MOF">MOF · Middle of Funnel</SelectItem>
            <SelectItem value="BOF">BOF · Bottom of Funnel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-md border border-accent/30 bg-accent/5 p-3">
        <div className="space-y-1.5">
          <Label>Mechanism</Label>
          <Select
            value={mechanism}
            onValueChange={(v) => {
              setMechanism(v as MechanismKey);
              setVariation("");
              setAnswers({});
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Which of the 4?" />
            </SelectTrigger>
            <SelectContent>
              {MECHANISM_KEYS.map((k) => (
                <SelectItem key={k} value={k}>
                  {MECHANISMS[k].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Variation</Label>
          <Select
            value={variation}
            onValueChange={(v) => {
              setVariation(v);
              setAnswers({});
            }}
            disabled={!mechanism}
          >
            <SelectTrigger>
              <SelectValue placeholder={mechanism ? "Pick a variation" : "Pick mechanism first"} />
            </SelectTrigger>
            <SelectContent>
              {mechanism &&
                MECHANISMS[mechanism].variations.map((v) => (
                  <SelectItem key={v.value} value={v.value}>
                    {v.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {mechanism && variation && (
          <p className="col-span-2 text-2xs text-muted-foreground">
            {MECHANISMS[mechanism].variations.find((v) => v.value === variation)?.hint}
          </p>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
          <div className="text-2xs uppercase tracking-wider text-muted-foreground">
            Tailored for this variation — not the same generic form every time
          </div>
          {questions.map((q) => (
            <div key={q.key} className="space-y-1.5">
              <Label className="text-xs leading-snug">{q.label}</Label>
              {q.type === "textarea" && (
                <Textarea
                  rows={2}
                  placeholder={q.placeholder}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                />
              )}
              {q.type === "text" && (
                <Input
                  placeholder={q.placeholder}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
                />
              )}
              {q.type === "select" && (
                <Select
                  value={answers[q.key] ?? ""}
                  onValueChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(q.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="space-y-1.5">
          <Label>Views</Label>
          <Input name="views" type="number" min={0} defaultValue={prefill?.views ?? 0} />
        </div>
        <div className="space-y-1.5">
          <Label>Reach</Label>
          <Input name="reach" type="number" min={0} defaultValue={prefill?.reach ?? 0} />
        </div>
        <div className="space-y-1.5">
          <Label>Leads</Label>
          <Input name="leads" type="number" min={0} defaultValue={prefill?.leads ?? 0} />
        </div>
        <div className="space-y-1.5">
          <Label>Hook retention %</Label>
          <Input
            name="retention"
            type="number"
            min={0}
            max={100}
            step="0.1"
            defaultValue={prefill?.retention ?? 0}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Avg watch %</Label>
          <Input
            name="avg_watch_pct"
            type="number"
            min={0}
            max={100}
            step="0.1"
            defaultValue={prefill?.avgWatchPct ?? 0}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-2xs uppercase tracking-wider text-muted-foreground">
          Reel-level detail — every metric individually, not aggregate
        </Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Watch time (sec)</Label>
            <Input
              name="watch_time_seconds"
              type="number"
              min={0}
              defaultValue={prefill?.watchTimeSeconds ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">3 sec hold %</Label>
            <Input
              name="three_sec_hold_pct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={prefill?.threeSecHoldPct ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">10 sec retention %</Label>
            <Input
              name="ten_sec_retention_pct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={prefill?.tenSecRetentionPct ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Drop-off seconds</Label>
            <Input
              name="drop_off_seconds"
              type="number"
              min={0}
              defaultValue={prefill?.dropOffSeconds ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Likes</Label>
            <Input name="likes" type="number" min={0} defaultValue={prefill?.likes ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Comments</Label>
            <Input name="comments" type="number" min={0} defaultValue={prefill?.comments ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Shares</Label>
            <Input name="shares" type="number" min={0} defaultValue={prefill?.shares ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Saves</Label>
            <Input name="saves" type="number" min={0} defaultValue={prefill?.saves ?? 0} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Drop-off %</Label>
            <Input
              name="drop_off_rate_pct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={prefill?.dropOffRatePct ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Follower views</Label>
            <Input
              name="follower_views"
              type="number"
              min={0}
              defaultValue={prefill?.followerViews ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Non-follower views</Label>
            <Input
              name="non_follower_views"
              type="number"
              min={0}
              defaultValue={prefill?.nonFollowerViews ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Followers gained</Label>
            <Input
              name="followers_gained"
              type="number"
              min={0}
              defaultValue={prefill?.followersGained ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Profile visits</Label>
            <Input
              name="profile_visits"
              type="number"
              min={0}
              defaultValue={prefill?.profileVisits ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">DMs generated</Label>
            <Input
              name="dms_generated"
              type="number"
              min={0}
              defaultValue={prefill?.dmsGenerated ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Calls booked</Label>
            <Input
              name="calls_booked"
              type="number"
              min={0}
              defaultValue={prefill?.callsBooked ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Engagement rate %</Label>
            <Input
              name="engagement_rate_pct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={prefill?.engagementRatePct ?? 0}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CTA conversion %</Label>
            <Input
              name="cta_conversion_pct"
              type="number"
              min={0}
              max={100}
              step="0.1"
              defaultValue={prefill?.ctaConversionPct ?? 0}
            />
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : "Save"}
      </Button>
    </form>
  );
}

function SlidesPanel({
  orgId,
  contentId,
  onClose,
}: {
  orgId?: string;
  contentId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: slides } = useQuery({
    queryKey: ["slides", contentId],
    enabled: !!contentId && !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("story_slides")
        .select(
          "id, sequence_index, caption, cta, slide_metrics(views, exits, taps_forward, taps_back, replies, link_clicks)",
        )
        .eq("content_id", contentId!)
        .order("sequence_index");
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async (f: FormData) => {
      const seq = Number(f.get("sequence_index") || (slides?.length ?? 0) + 1);
      const { data: slide, error } = await supabase
        .from("story_slides")
        .insert({
          org_id: orgId!,
          content_id: contentId!,
          sequence_index: seq,
          caption: String(f.get("caption") || "") || null,
          cta: String(f.get("cta") || "") || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("slide_metrics").insert({
        org_id: orgId!,
        slide_id: slide.id,
        views: Number(f.get("views") || 0),
        exits: Number(f.get("exits") || 0),
        taps_forward: Number(f.get("taps_forward") || 0),
        taps_back: Number(f.get("taps_back") || 0),
        replies: Number(f.get("replies") || 0),
        link_clicks: Number(f.get("link_clicks") || 0),
      });
    },
    onSuccess: () => {
      toast.success("Slide tracked");
      qc.invalidateQueries({ queryKey: ["slides"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const chartData = (slides ?? []).map((s) => {
    const m = (s.slide_metrics ?? [])[0];
    return { slide: `#${s.sequence_index}`, views: m?.views ?? 0, exits: m?.exits ?? 0 };
  });

  return (
    <Dialog open={!!contentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Story sequence · slide drop-off</DialogTitle>
        </DialogHeader>
        {chartData.length > 0 && (
          <div className="h-48 rounded border border-border bg-card p-2">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="slide" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="views" stroke="var(--chart-1)" strokeWidth={2} />
                <Line type="monotone" dataKey="exits" stroke="var(--destructive)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="space-y-1">
          {(slides ?? []).map((s) => {
            const m = (s.slide_metrics ?? [])[0];
            const dropoff = m?.views ? Math.round(((m.exits ?? 0) / m.views) * 100) : 0;
            return (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded border border-border bg-card/40 p-2 text-xs"
              >
                <span className="font-mono text-accent w-8">#{s.sequence_index}</span>
                <span className="flex-1 truncate">
                  {s.caption ?? <span className="text-muted-foreground">—</span>}
                </span>
                <span className="font-sans tabular-nums">{m?.views ?? 0}v</span>
                <span
                  className={`font-sans tabular-nums ${dropoff > 30 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {dropoff}% exit
                </span>
              </div>
            );
          })}
          {(!slides || slides.length === 0) && (
            <div className="p-6 text-center text-xs text-muted-foreground">No slides yet.</div>
          )}
        </div>
        <form
          className="space-y-2 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(new FormData(e.currentTarget));
            (e.target as HTMLFormElement).reset();
          }}
        >
          <div className="text-2xs uppercase tracking-wider text-muted-foreground">Add slide</div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="sequence_index" type="number" placeholder="Seq #" />
            <Input name="caption" placeholder="Caption" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input name="views" type="number" placeholder="Views" />
            <Input name="exits" type="number" placeholder="Exits" />
            <Input name="taps_forward" type="number" placeholder="Fwd" />
            <Input name="taps_back" type="number" placeholder="Back" />
            <Input name="replies" type="number" placeholder="Replies" />
            <Input name="link_clicks" type="number" placeholder="Clicks" />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={add.isPending}>
            Add slide
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverviewPanel({
  piece,
  onClose,
  onEdit,
}: {
  piece: PieceRow | null;
  onClose: () => void;
  onEdit: (p: PieceRow) => void;
}) {
  const coach = useServerFn(coachContentFn);
  const { devBypass } = useAuth();
  const m = (piece?.content_metrics ?? [])[0];
  const {
    data: coaching,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["coach", piece?.id, devBypass],
    enabled: !!piece,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (devBypass) return withMockDelay(mockContentCoaching());
      return coach({
        data: {
          title: piece!.title,
          hook: piece!.hook,
          transcript: piece!.body,
          angle: piece!.angle,
          funnel_stage: piece!.funnel_stage,
          platform: piece!.platform,
          views: m?.views ?? 0,
          leads: m?.leads_generated ?? 0,
          closes: m?.closes ?? 0,
          cash_cents: m?.cash_collected_cents ?? 0,
          retention_pct: Number(m?.hook_retention_pct ?? 0),
        },
      });
    },
  });

  if (!piece) return null;
  const stage = piece.funnel_stage;
  const answers = piece.variation_answers ?? {};
  const questions = questionsFor(piece.variation);

  return (
    <Dialog open={!!piece} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{piece.title || "(untitled)"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="uppercase text-muted-foreground">{piece.platform}</span>
          {stage && (
            <span
              className={`rounded px-1.5 py-0.5 font-mono uppercase text-3xs ${funnelChip(stage)}`}
            >
              {stage}
            </span>
          )}
          {piece.angle && <span className="rounded bg-muted px-1.5 py-0.5">{piece.angle}</span>}
          {piece.mechanism && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
              {MECHANISMS[piece.mechanism as MechanismKey]?.label ?? piece.mechanism}
              {piece.variation &&
                ` · ${MECHANISMS[piece.mechanism as MechanismKey]?.variations.find((v) => v.value === piece.variation)?.label ?? piece.variation}`}
            </span>
          )}
          {piece.posted_at && (
            <span className="text-muted-foreground">
              · {new Date(piece.posted_at).toLocaleDateString()}
            </span>
          )}
          {piece.url && (
            <a
              href={piece.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ["Views", m?.views?.toLocaleString() ?? "—"],
            ["Leads", m?.leads_generated ?? "—"],
            // closes/cash_collected_cents default to 0 in the DB and have no write
            // path anywhere in the app — an honest "Not tracked" instead of a
            // literal 0/"$0" that would misread as "this piece made zero cash."
            ["Closes", "Not tracked"],
            ["Cash", "Not tracked"],
            ["Retention", m?.hook_retention_pct ? m.hook_retention_pct + "%" : "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-card/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-sans tabular-nums text-sm">{v}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ["Likes", m?.likes ?? "—"],
            ["Comments", m?.comments ?? "—"],
            ["Shares", m?.shares ?? "—"],
            ["Saves", m?.saves ?? "—"],
            ["Follower views", m?.follower_views ?? "—"],
            ["Non-follower views", m?.non_follower_views ?? "—"],
            ["Engagement rate", m?.engagement_rate_pct ? m.engagement_rate_pct + "%" : "—"],
            ["Drop-off rate", m?.drop_off_rate_pct ? m.drop_off_rate_pct + "%" : "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-card/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-sans tabular-nums text-sm">{v}</div>
            </div>
          ))}
        </div>

        {questions.length > 0 && Object.keys(answers).length > 0 && (
          <div className="rounded border border-border bg-card/40 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">
              Variation-specific answers
            </div>
            {questions.map((q) =>
              answers[q.key] ? (
                <div key={q.key}>
                  <div className="text-3xs text-muted-foreground">{q.label}</div>
                  <div className="text-sm whitespace-pre-wrap">{answers[q.key]}</div>
                </div>
              ) : null,
            )}
          </div>
        )}

        {piece.hook && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">
              Hook (first 3s)
            </div>
            <div className="text-sm">{piece.hook}</div>
          </div>
        )}

        {piece.body && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">
              Transcript
            </div>
            <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-48 overflow-y-auto">
              {piece.body}
            </div>
          </div>
        )}

        <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              AI coach review
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              {isFetching ? "Thinking…" : "Re-analyze"}
            </Button>
          </div>
          {isLoading || isFetching ? (
            <div className="text-xs text-muted-foreground">Analyzing transcript and metrics…</div>
          ) : coaching ? (
            <div className="space-y-3 text-sm animate-in fade-in-0 slide-in-from-top-1 duration-300">
              <div>{coaching.summary}</div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-[color:var(--color-success,oklch(0.7_0.16_150))] mb-1">
                  What worked
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  {coaching.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-amber-400 mb-1">
                  How to improve
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  {coaching.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-3xs uppercase tracking-wider text-accent mb-1">
                  Try these hooks next time
                </div>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                  {coaching.next_hook_ideas.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : isError ? (
            <div className="text-xs text-destructive">
              {error instanceof Error ? error.message : "AI coaching failed — try again."}
            </div>
          ) : coaching === null ? (
            <div className="text-xs text-muted-foreground">
              AI coaching is not configured for this workspace (missing API key).
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No review yet.</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(piece)}>
            <Pencil className="h-3 w-3" />
            Edit piece
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
