import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useResourcePermissions } from "@/hooks/use-resource-permission";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { buildDemoCoreDataset } from "@/lib/demo-fixtures";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { useServerFn } from "@tanstack/react-start";
import { getHistoricalFxRatesFn } from "@/lib/fx.functions";
import { collectFxPairs, sumNormalizedCents } from "@/lib/currency";
import { autoIngestCallSignalFn } from "@/lib/content-signals.functions";
import { captureCallLifecycleEventsFn } from "@/lib/dispatch.functions";
import { evaluateAttributionEvidence } from "@/lib/acquisition";
import { CLOSER_DISPOSITIONS, normalizeCloserDisposition } from "@/lib/operating-workflows";
import { AttributionEvidencePanel } from "@/components/attribution-evidence-panel";
import { useState, useMemo, useEffect } from "react";
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
  Trophy,
  Activity as ActivityIcon,
  PhoneCall,
  ChevronDown,
  Video,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { AttributionPathPanel, type AttributionPath } from "@/components/attribution-path-panel";
import { groupBySourcePlatform } from "@/lib/attribution-flow";
import { TeamMemberFilter, ALL_MEMBERS } from "@/components/team-member-filter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { PageHero } from "@/components/page-hero";
import { FunnelInstrument } from "@/components/funnel-instrument";
import { MoneyInstrument, type MoneyPoint } from "@/components/money-instrument";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { RateSmallMultiples, type RateChartSpec } from "@/components/rate-small-multiples";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import {
  ObjectionInstrument,
  type ObjectionEntry,
  type FaqVideoLite,
} from "@/components/objection-instrument";
import { scoreText, pickTop, type MechanismKey } from "@/lib/content-mechanisms";
import {
  dailySeries,
  seriesRatePoints,
  mergeBySourceTotal,
  priorPeriod,
  pctDelta,
  formatRangeLabel,
  rateDelta,
} from "@/lib/trend";
import { clusterObjectionsFn } from "@/lib/objection-clustering.functions";
import { applyObjectionClusters } from "@/lib/objection-clustering";
import {
  OBJECTION_CATEGORIES,
  objectionCategoryBucket,
  objectionCategoryLabel,
  OTHER_OBJECTION_VALUE,
} from "@/lib/objection-taxonomy";
import { followUpTypeLabel } from "@/lib/eod-reports";
import {
  deriveCap,
  deriveWorking,
  deriveMoneyCap,
  deriveMoneyWorking,
  type FunnelStage,
} from "@/lib/funnel-derivation";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";
import { HeatmapGrid } from "@/components/heatmap-grid";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import type { DateRange } from "@/components/date-range-picker";
import { mockCalls, mockCallObjectionStats } from "@/lib/dev-mock-data";
import { normalizeSocialPlatform, SOCIAL_PLATFORMS, platformMatches } from "@/lib/social-platform";
import { WebinarFilterBranches } from "@/components/webinar-filter";
import { useWebinars } from "@/hooks/use-webinars";
import {
  ALL_WEBINARS_FILTER,
  matchesWebinarFilter,
  webinarFilterLabel,
  type WebinarFilterValue,
} from "@/lib/webinar-filter";
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { PlatformIcon } from "@/components/platform-icon";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { Clock3 } from "lucide-react";
import { KpiTargetCard } from "@/components/kpi-target-card";
import { fetchRepKpiTargets } from "@/lib/rep-kpi-targets";
import {
  KPI_DEFINITIONS,
  computeTargetProgress,
  currentTargetsAsOf,
  periodWindow,
} from "@/lib/kpi-targets";
import { actualFromCalls, sliceCallsToWindow, type CallActualRow } from "@/lib/rep-kpi-actuals";
import { useMoney } from "@/hooks/use-money";
import { ChartTooltip } from "@/components/chart-tooltip";

export const Route = createFileRoute("/_authenticated/closer")({ component: Closer });

// Em-dash, not "0.0%", with no denominator — the same convention dev-mock-data's
// own `pct` already uses. All three call sites render this string directly.
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");
const fmtN0 = (n: number) => Math.round(n).toLocaleString();
// Same 5-color palette as the Setter Scorecard's radar
// (src/components/activity-module.tsx) — kept as its own local copy here
// rather than a shared export since that file doesn't currently export it;
// duplicating 5 color values is simpler than introducing a new shared
// module for it, and keeps the two scorecards visually identical.
const CLOSER_RADAR_COLORS = [
  "oklch(0.7 0.2 258)",
  "oklch(0.72 0.18 25)",
  "oklch(0.7 0.18 145)",
  "oklch(0.72 0.18 60)",
  "oklch(0.7 0.18 320)",
];
const CLOSER_SOURCES = ["Instagram Spiderweb", "Keyword", "Inbound", "Referral", "Ads", "Other"];

interface CloserLbPerson {
  name: string;
  cash: number;
  closes: number;
  /** Null when the rate has no denominator — a closer with no shows has no close rate. */
  closeRate: number | null;
  showRate: number | null;
  offers: number;
  avgCashCall: number;
  deposits: number;
}

// Part C3 — exact per-role metric option list for Closer's leaderboard selector.
// Factory (not a static array) so the dollar-formatted entries can be built
// with the live display-currency formatter rather than a fixed USD helper.
function buildCloserMetrics(
  fmtMoney: (cents: number) => string,
): RepMetricOption<CloserLbPerson>[] {
  return [
    {
      key: "cash",
      label: "Cash Collected",
      spectrum: "hot",
      primary: (p) => fmtMoney(p.cash),
      secondary: (p) => (p.closeRate === null ? "— close" : `${p.closeRate.toFixed(0)}% close`),
      rankBy: (p) => p.cash,
    },
    {
      key: "closes",
      label: "Closes",
      spectrum: "hot",
      primary: (p) => `${p.closes} closes`,
      secondary: (p) => fmtMoney(p.cash),
      rankBy: (p) => p.closes,
    },
    {
      key: "closeRate",
      label: "Close Rate",
      spectrum: "hot",
      primary: (p) => (p.closeRate === null ? "—" : `${p.closeRate.toFixed(0)}%`),
      secondary: (p) => `${p.closes} closes`,
      rankBy: (p) => p.closeRate ?? 0,
    },
    {
      key: "showRate",
      label: "Show Rate",
      spectrum: "mid",
      primary: (p) => (p.showRate === null ? "—" : `${p.showRate.toFixed(0)}%`),
      secondary: (p) => `${p.offers} offers`,
      rankBy: (p) => p.showRate ?? 0,
    },
    {
      key: "offers",
      label: "Offers Made",
      spectrum: "mid",
      primary: (p) => `${p.offers} offers`,
      secondary: (p) => (p.closeRate === null ? "— close" : `${p.closeRate.toFixed(0)}% close`),
      rankBy: (p) => p.offers,
    },
    {
      key: "avgCashCall",
      label: "Avg Cash-Call",
      spectrum: "hot",
      primary: (p) => fmtMoney(p.avgCashCall),
      secondary: (p) => `${p.closes} closes`,
      rankBy: (p) => p.avgCashCall,
    },
    {
      key: "deposits",
      label: "Deposits",
      spectrum: "mid",
      primary: (p) => `${p.deposits} deposits`,
      secondary: (p) => (p.closeRate === null ? "— close" : `${p.closeRate.toFixed(0)}% close`),
      rankBy: (p) => p.deposits,
    },
  ];
}

// All 8 real values of the `call_status` DB enum — the dropdown previously
// exposed only 4, which meant "Showed"/"No Show"/"Offer Made"/"Rescheduled"
// were only ever reachable by editing a row some other way, never from this
// form. Values/order match the actual enum, not a second invented list.
const STATUS_OPTIONS = [
  { value: "booked", label: "Booked" },
  { value: "showed", label: "Showed" },
  { value: "no_show", label: "No Show" },
  { value: "offer_made", label: "Offer Made" },
  { value: "closed", label: "Closed Won" },
  { value: "disqualified", label: "DQ" },
  { value: "follow_up", label: "Follow Up" },
  { value: "rescheduled", label: "Rescheduled" },
] as const;

// Spec section 5's exact multiple-choice disposition list — the closer's own
// reason for the outcome, distinct from `status` (call lifecycle state).
const DISPOSITION_OPTIONS = [
  { value: "closed", label: "Closed" },
  { value: "follow_up", label: "Follow-up" },
  { value: "nurture", label: "Nurture" },
  { value: "no_decision", label: "No Decision" },
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "partner_spouse", label: "Partner/Spouse" },
  { value: "upsell", label: "Upsell" },
  { value: "unqualified", label: "Unqualified" },
  { value: "competitor", label: "Competitor" },
  { value: "other", label: "Other" },
] as const;

const OBJECTION_STAGE_OPTIONS = [
  { value: "rapport", label: "Rapport" },
  { value: "discovery", label: "Discovery" },
  { value: "presentation", label: "Presentation" },
  { value: "offer", label: "Offer" },
  { value: "close", label: "Close" },
  { value: "follow_up", label: "Follow-up" },
  { value: "unspecified", label: "Unspecified" },
] as const;

// Canonical objection taxonomy (src/lib/objection-taxonomy.ts) — the same
// list the Closer EOD's structured Objections? field uses, so this
// dialog's "Objection category" picker and the "By category" breakdown
// below never drift from the EOD form's own list.
const OBJECTION_CATEGORY_OPTIONS = OBJECTION_CATEGORIES;

const GAP_CATEGORY_OPTIONS = [
  { value: "discovery", label: "Discovery" },
  { value: "objection_handling", label: "Objection Handling" },
  { value: "closing", label: "Closing" },
  { value: "follow_up", label: "Follow-up" },
  { value: "rapport", label: "Rapport" },
  { value: "offer_framing", label: "Offer Framing" },
  { value: "other", label: "Other" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  booked: "Booked",
  showed: "Showed",
  no_show: "No Show",
  offer_made: "Offer Made",
  closed: "Closed Won",
  disqualified: "DQ",
  follow_up: "Follow Up",
  rescheduled: "Rescheduled",
};
const STATUS_TONE_KEY: Record<string, ChipTone> = {
  booked: "info",
  showed: "info",
  no_show: "warning",
  offer_made: "info",
  closed: "success",
  disqualified: "destructive",
  follow_up: "warning",
  rescheduled: "warning",
};

/**
 * Demo / Preview Data mode (Priority 5) — this page's own real `calls`
 * query shape, sliced from the shared `buildDemoCoreDataset()` fixture.
 * Fields the fixture doesn't model (time_to_close_seconds, key_moment,
 * source_format/content_id, recovered_from_call_id) stay `null`, same
 * honest state a real call without that data already shows — never
 * invented to look more complete than the fixture actually is.
 */
function demoCloserCalls(from: string, to: string) {
  const demo = buildDemoCoreDataset();
  const leadById = new Map(demo.leads.map((l) => [l.id, l]));
  return demo.calls
    .filter((c) => c.scheduled_for >= `${from}T00:00:00` && c.scheduled_for <= `${to}T23:59:59`)
    .map((c) => {
      const lead = leadById.get(c.lead_id);
      return {
        id: c.id,
        scheduled_for: c.scheduled_for,
        status: c.status,
        showed: c.showed,
        offer_made: c.offer_made,
        closed: c.closed,
        contract_value_cents: c.contract_value_cents,
        cash_collected_cents: c.cash_collected_cents,
        deposit_cents: c.deposit_cents,
        original_currency: "USD",
        payment_plan: c.payment_plan,
        call_summary: null as string | null,
        recording_url: null as string | null,
        closer_name: c.closer_name,
        lead_email: c.lead_email,
        time_to_close_seconds: null as number | null,
        key_moment: null as string | null,
        disposition: c.disposition,
        duration_seconds: c.duration_seconds,
        talk_seconds: c.talk_seconds,
        recovered_from_call_id: null as string | null,
        setter_id: c.setter_id,
        source_platform: c.source_platform,
        source_format: null as string | null,
        source_content_id: null as string | null,
        source_campaign: c.source_campaign,
        // Demo Mode never fabricates follow-up detail data (spec: "Do not
        // use mock data") — these render the honest "—" empty state.
        eod_lead_status: null as string | null,
        requested_followup_at: null as string | null,
        followup_amount_pitched_cents: null as number | null,
        followup_reason: null as string | null,
        followup_reason_other: null as string | null,
        followup_notes: null as string | null,
        leads: lead
          ? { id: lead.id, full_name: lead.full_name, handle: lead.handle, email: lead.email }
          : null,
      };
    });
}

function Closer() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { demoMode } = useDemoMode();
  const qc = useQueryClient();
  const { getPerm } = useResourcePermissions();
  const canLogCall = getPerm("closer").can_edit;
  // Shadows the old module-level USD-only helper of the same name — every
  // existing fmtMoney(...) call site below is unchanged, but now resolves
  // through the global display-currency selection.
  const fmtMoney = useMoney();
  const closerMetrics = useMemo(() => buildCloserMetrics(fmtMoney), [fmtMoney]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<
    | { kind: "close" | "pipeline"; index: number; metric?: string }
    | { kind: "money"; metric?: "cash" | "revenue" | "cashRate" }
    | { kind: "noshow"; index: 0 | 1 | 2 | 3 }
    | { kind: "attribution"; stageKey: string; sourceValue?: string }
    | { kind: "disposition"; source: "status" | "manual"; value: string; label: string }
    | {
        kind: "payment";
        metric:
          | "deposits"
          | "depositAmount"
          | "depositConversion"
          | "averageDepositPct"
          | "paymentPlanUptake"
          | "onTimeRate"
          | "failedPaymentRate"
          | "failedPaymentCount"
          | "recoveredFailedPayments"
          | "depositToFullPayment"
          | "futureScheduledCash";
      }
    | null
  >(null);

  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass
        ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS)
        : settingsFn({ data: { orgId: orgId! } }),
  });
  const minCapSample =
    workspaceSettings?.funnel_instrument.minCapSample ??
    DEFAULT_WORKSPACE_SETTINGS.funnel_instrument.minCapSample;
  // Command palette's "Log Call" quick action lands here with ?action=log-call.
  const actionSearch = useSearch({ strict: false }) as { action?: string };
  const paletteNav = useNavigate();
  useEffect(() => {
    if (actionSearch.action === "log-call" && canLogCall) {
      setOpen(true);
      paletteNav({ search: {} as never, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSearch.action]);
  const { range } = useDateRange();
  const [member, setMember] = useState<string>(ALL_MEMBERS);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [webinarFilter, setWebinarFilter] = useState<WebinarFilterValue>(ALL_WEBINARS_FILTER);
  const { webinars, paidWebinars, organicWebinars, unclassifiedWebinars, webinarsById } =
    useWebinars();
  // Part C3 — leaderboard's own metric selector + independent date range,
  // defaulting to inherit the page range until explicitly overridden.
  const [lbMetric, setLbMetric] = useState<string>("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? range;

  const { data: calls } = useQuery({
    queryKey: ["calls", orgId, range.from, range.to, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (demoMode) return demoCloserCalls(range.from, range.to);
      type MockCallRow = {
        id: string;
        scheduled_for: string | null;
        status: string;
        showed: boolean;
        offer_made: boolean;
        closed: boolean;
        contract_value_cents: number | null;
        cash_collected_cents: number | null;
        original_currency?: string | null;
        deposit_cents: number | null;
        payment_plan: boolean | null;
        call_summary: string | null;
        recording_url: string | null;
        closer_name: string | null;
        lead_email: string | null;
        time_to_close_seconds: number | null;
        key_moment: string | null;
        disposition: string | null;
        duration_seconds: number | null;
        talk_seconds: number | null;
        recovered_from_call_id: string | null;
        setter_id: string | null;
        source_platform: string | null;
        source_format: string | null;
        source_content_id: string | null;
        source_campaign: string | null;
        // Follow-up detail fields (20260918090000_closer_followup_details.sql)
        // — optional and left unpopulated by every mock row below (Dev
        // Bypass/Demo Mode never fabricate follow-up data for this
        // feature), so they render the same honest "—" empty state real
        // legacy follow-up records without these fields do.
        eod_lead_status?: string | null;
        requested_followup_at?: string | null;
        followup_amount_pitched_cents?: number | null;
        followup_reason?: string | null;
        followup_reason_other?: string | null;
        followup_notes?: string | null;
        leads: {
          id: string;
          full_name: string | null;
          handle: string | null;
          email: string | null;
        } | null;
      };
      if (devBypass) {
        // mockCalls() only fills the base scorecard fields — no lifecycle
        // attribution columns, no payment-plan flag, and no no-show/recovery
        // pairs — so under dev bypass (the only auth path available in this
        // sandbox) the No-show Recovery section and the lifecycle
        // attribution drilldowns added here would have nothing to show, not
        // because the feature is broken but because the shared mock fixture
        // never populates those columns. This enriches this page's own copy
        // of the mock rows with the same kind of data the real columns hold
        // (lifecycle tags, a payment-plan flag, a couple of no-show/recovery
        // pairs) — additive to the existing dev-only fixture, doesn't touch
        // dev-mock-data.ts (shared with hub-operating-metrics.tsx), and
        // changes nothing about how real org data is queried or computed.
        const platforms = ["instagram", "youtube", "referral"];
        const formats = ["reel", "post", "story"];
        const base: MockCallRow[] = (mockCalls() as MockCallRow[]).map((c, i) => ({
          ...c,
          payment_plan: i % 4 === 0,
          duration_seconds: c.showed ? 1800 + (i % 5) * 120 : null,
          talk_seconds: c.showed ? 1500 + (i % 5) * 90 : null,
          setter_id: i % 3 === 0 ? null : `mock-setter-${i % 3}`,
          source_platform: platforms[i % platforms.length],
          source_format: formats[i % formats.length],
          source_campaign: `Campaign ${String.fromCharCode(65 + (i % 3))}`,
          leads: {
            id: `mock-call-lead-${i}`,
            full_name: `Lead ${i + 1}`,
            handle: null,
            email: null,
          },
        }));
        const now = Date.now();
        const noShowPairs: MockCallRow[] = [
          {
            id: "mock-noshow-1",
            scheduled_for: new Date(now - 6 * 86400e3).toISOString(),
            status: "no_show",
            showed: false,
            offer_made: false,
            closed: false,
            contract_value_cents: 0,
            cash_collected_cents: 0,
            deposit_cents: 0,
            payment_plan: false,
            call_summary: null,
            recording_url: null,
            closer_name: "Dev Closer",
            lead_email: null,
            time_to_close_seconds: null,
            key_moment: null,
            disposition: "no_show",
            duration_seconds: null,
            talk_seconds: null,
            recovered_from_call_id: null,
            setter_id: "mock-setter-1",
            source_platform: "instagram",
            source_format: "reel",
            source_content_id: null,
            source_campaign: "Campaign A",
            leads: {
              id: "mock-noshow-lead-1",
              full_name: "Riley Sanders",
              handle: null,
              email: null,
            },
          },
          {
            id: "mock-recovered-1",
            scheduled_for: new Date(now - 3 * 86400e3).toISOString(),
            status: "closed",
            showed: true,
            offer_made: true,
            closed: true,
            contract_value_cents: 500_000,
            cash_collected_cents: 500_000,
            deposit_cents: 0,
            payment_plan: false,
            call_summary: null,
            recording_url: null,
            closer_name: "Dev Closer",
            lead_email: null,
            time_to_close_seconds: 1800,
            key_moment: null,
            disposition: "closed",
            duration_seconds: 2100,
            talk_seconds: 1800,
            recovered_from_call_id: "mock-noshow-1",
            setter_id: "mock-setter-1",
            source_platform: "instagram",
            source_format: "reel",
            source_content_id: null,
            source_campaign: "Campaign A",
            leads: {
              id: "mock-noshow-lead-1",
              full_name: "Riley Sanders",
              handle: null,
              email: null,
            },
          },
          {
            id: "mock-noshow-2",
            scheduled_for: new Date(now - 5 * 86400e3).toISOString(),
            status: "no_show",
            showed: false,
            offer_made: false,
            closed: false,
            contract_value_cents: 0,
            cash_collected_cents: 0,
            deposit_cents: 0,
            payment_plan: false,
            call_summary: null,
            recording_url: null,
            closer_name: "Dev Closer",
            lead_email: null,
            time_to_close_seconds: null,
            key_moment: null,
            disposition: "no_show",
            duration_seconds: null,
            talk_seconds: null,
            recovered_from_call_id: null,
            setter_id: "mock-setter-2",
            source_platform: "youtube",
            source_format: "post",
            source_content_id: null,
            source_campaign: "Campaign B",
            leads: {
              id: "mock-noshow-lead-2",
              full_name: "Drew Callahan",
              handle: null,
              email: null,
            },
          },
          {
            id: "mock-recovered-2",
            scheduled_for: new Date(now - 2 * 86400e3).toISOString(),
            status: "completed",
            showed: true,
            offer_made: true,
            closed: false,
            contract_value_cents: 0,
            cash_collected_cents: 0,
            deposit_cents: 0,
            payment_plan: false,
            call_summary: null,
            recording_url: null,
            closer_name: "Dev Closer",
            lead_email: null,
            time_to_close_seconds: null,
            key_moment: null,
            disposition: "no_close",
            duration_seconds: 1500,
            talk_seconds: 1200,
            recovered_from_call_id: "mock-noshow-2",
            setter_id: "mock-setter-2",
            source_platform: "youtube",
            source_format: "post",
            source_content_id: null,
            source_campaign: "Campaign B",
            leads: {
              id: "mock-noshow-lead-2",
              full_name: "Drew Callahan",
              handle: null,
              email: null,
            },
          },
          {
            id: "mock-noshow-3",
            scheduled_for: new Date(now - 4 * 86400e3).toISOString(),
            status: "no_show",
            showed: false,
            offer_made: false,
            closed: false,
            contract_value_cents: 0,
            cash_collected_cents: 0,
            deposit_cents: 0,
            payment_plan: false,
            call_summary: null,
            recording_url: null,
            closer_name: "Dev Closer",
            lead_email: null,
            time_to_close_seconds: null,
            key_moment: null,
            disposition: "no_show",
            duration_seconds: null,
            talk_seconds: null,
            recovered_from_call_id: null,
            setter_id: "mock-setter-1",
            source_platform: "referral",
            source_format: "story",
            source_content_id: null,
            source_campaign: "Campaign C",
            leads: { id: "mock-noshow-lead-3", full_name: "Avery Chen", handle: null, email: null },
          },
        ];
        return [...base, ...noShowPairs];
      }
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, scheduled_for, status, showed, offer_made, closed, contract_value_cents, cash_collected_cents, deposit_cents, original_currency, payment_plan, call_summary, recording_url, closer_name, lead_email, time_to_close_seconds, key_moment, disposition, duration_seconds, talk_seconds, recovered_from_call_id, setter_id, source_platform, source_format, source_content_id, source_campaign, eod_lead_status, requested_followup_at, followup_amount_pitched_cents, followup_reason, followup_reason_other, followup_notes, leads(id, full_name, handle, email)",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`)
        .order("scheduled_for", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Rep KPI Target Engine (Priority 2) — "as of today," independent of this
  // page's own `range` (a separate, historical-browsing concept; see
  // kpi-targets.ts's periodWindow doc comment). One org-scoped fetch of this
  // month's raw call rows; each target slices its own daily/weekly/monthly
  // window out of the same batch.
  const targetAnchor = new Date().toISOString().slice(0, 10);
  const targetWindowStart = `${targetAnchor.slice(0, 7)}-01`;
  const { data: repKpiTargetsRaw } = useQuery({
    queryKey: ["rep-kpi-targets", orgId, "closer"],
    enabled: !!orgId && !devBypass,
    queryFn: () => fetchRepKpiTargets(orgId!, "closer"),
  });
  const { data: targetCallRows = [] } = useQuery({
    queryKey: ["target-call-rows", orgId, targetWindowStart, targetAnchor, devBypass],
    enabled: !!orgId,
    queryFn: async (): Promise<CallActualRow[]> => {
      if (devBypass) return mockCalls() as unknown as CallActualRow[];
      const { data, error } = await supabase
        .from("calls")
        .select(
          "closer_name, scheduled_for, showed, offer_made, closed, cash_collected_cents, contract_value_cents, status, original_currency",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${targetWindowStart}T00:00:00`)
        .lte("scheduled_for", `${targetAnchor}T23:59:59`)
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as CallActualRow[];
    },
  });
  const currentCloserTargets = useMemo(
    () => currentTargetsAsOf(repKpiTargetsRaw ?? [], targetAnchor),
    [repKpiTargetsRaw, targetAnchor],
  );
  const memberTargetCards = useMemo(() => {
    if (member === ALL_MEMBERS) return [];
    const forMember = currentCloserTargets.filter((t) => t.teamMemberName === member);
    return KPI_DEFINITIONS.closer.flatMap((def) => {
      const matches = forMember.filter((t) => t.metricKey === def.key);
      if (matches.length === 0) {
        return [
          {
            key: def.key,
            label: def.label,
            progress: computeTargetProgress({
              format: def.format,
              period: "monthly",
              anchorISODate: targetAnchor,
              targetValue: null,
              actualValue: actualFromCalls(targetCallRows, member, def.key),
            }),
          },
        ];
      }
      return matches.map((t) => {
        const window = periodWindow(t.period, targetAnchor);
        const sliced = sliceCallsToWindow(targetCallRows, window.start, window.end);
        return {
          key: `${def.key}-${t.period}`,
          label: def.label,
          progress: computeTargetProgress({
            format: def.format,
            period: t.period,
            anchorISODate: targetAnchor,
            targetValue: t.targetValue,
            actualValue: actualFromCalls(sliced, member, def.key),
          }),
        };
      });
    });
  }, [member, currentCloserTargets, targetCallRows, targetAnchor]);

  // Leaderboard's own independently-ranged query (Part C3) — separate from the
  // page-range `calls` query above so overriding the leaderboard's date range
  // never touches the rest of the page.
  const { data: lbCalls } = useQuery({
    queryKey: ["closer-lb-calls", orgId, lbRange.from, lbRange.to, devBypass],
    // Mock Data ON must never leave this leaderboard silently showing real
    // org data next to the page's own demo-gated KPIs (item 14) — dev-mock-
    // data.ts fixtures are documented dev-bypass-only, so rather than
    // reusing them here, demo mode just doesn't fetch real rows and the
    // leaderboard shows an honest "not connected" state instead.
    enabled: !!orgId && !demoMode,
    queryFn: async () => {
      if (devBypass)
        return mockCalls() as unknown as {
          closer_name: string | null;
          showed: boolean;
          offer_made: boolean;
          closed: boolean;
          status: string;
          cash_collected_cents: number | null;
          deposit_cents: number | null;
        }[];
      const { data, error } = await supabase
        .from("calls")
        .select(
          "closer_name, showed, offer_made, closed, status, cash_collected_cents, deposit_cents",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${lbRange.from}T00:00:00`)
        .lte("scheduled_for", `${lbRange.to}T23:59:59`)
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const lbPeople = useMemo<CloserLbPerson[]>(() => {
    const byName = new Map<
      string,
      {
        booked: number;
        showed: number;
        offers: number;
        closes: number;
        cash: number;
        deposits: number;
      }
    >();
    for (const c of lbCalls ?? []) {
      if (!c.closer_name) continue;
      const x = byName.get(c.closer_name) ?? {
        booked: 0,
        showed: 0,
        offers: 0,
        closes: 0,
        cash: 0,
        deposits: 0,
      };
      x.booked += 1;
      if (c.showed) x.showed += 1;
      if (c.offer_made) x.offers += 1;
      if (c.closed || c.status === "closed") x.closes += 1;
      x.cash += c.cash_collected_cents ?? 0;
      if ((c.deposit_cents ?? 0) > 0) x.deposits += 1;
      byName.set(c.closer_name, x);
    }
    return Array.from(byName.entries()).map(([name, x]) => ({
      name,
      cash: x.cash,
      closes: x.closes,
      closeRate: x.showed ? (x.closes / x.showed) * 100 : null,
      showRate: x.booked ? (x.showed / x.booked) * 100 : null,
      offers: x.offers,
      avgCashCall: x.booked ? x.cash / x.booked : 0,
      deposits: x.deposits,
    }));
  }, [lbCalls]);

  // Pull setter/dialer day-log aggregates so the Closer Dashboard isn't empty
  // when closes & cash are logged through DM Setter / Inbound Dialer daily entries.
  const { data: setterAgg } = useQuery({
    queryKey: ["closer-setter-agg", orgId, range.from, range.to, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (demoMode) {
        return buildDemoCoreDataset()
          .setterActivity.filter(
            (a) => a.activity_date >= range.from && a.activity_date <= range.to,
          )
          .map((a) => ({
            activity_date: a.activity_date,
            calls_on_calendar: a.calls_on_calendar,
            live_calls: a.live_calls,
            closes: a.closes,
            downsells: 0,
            cash_collected_cents: a.cash_collected_cents,
            total_revenue_cents: a.total_revenue_cents,
            original_currency: "USD",
          }));
      }
      const { data } = await supabase
        .from("setter_activity")
        .select(
          "activity_date, calls_on_calendar, live_calls, closes, downsells, cash_collected_cents, total_revenue_cents, original_currency",
        )
        .eq("org_id", orgId!)
        .gte("activity_date", range.from)
        .lte("activity_date", range.to);
      return data ?? [];
    },
  });

  // Prior equivalent period — real deltas + trend sparklines on the hero and
  // "Enterprise metric visualizer" tiles (Part 2), replacing the hardcoded
  // decorative arrays this page shipped with during the visual redesign.
  const prevRange = useMemo(() => priorPeriod(range.from, range.to), [range.from, range.to]);
  const { data: prevCalls } = useQuery({
    queryKey: ["calls-prev", orgId, prevRange.from, prevRange.to, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass)
        return [] as {
          closer_name: string | null;
          showed: boolean;
          offer_made: boolean;
          closed: boolean;
          status: string;
          cash_collected_cents: number | null;
          contract_value_cents: number | null;
          deposit_cents: number | null;
          original_currency?: string | null;
          scheduled_for: string | null;
        }[];
      if (demoMode) return demoCloserCalls(prevRange.from, prevRange.to);
      const { data, error } = await supabase
        .from("calls")
        .select(
          "closer_name, showed, offer_made, closed, status, cash_collected_cents, contract_value_cents, deposit_cents, original_currency, scheduled_for",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${prevRange.from}T00:00:00`)
        .lte("scheduled_for", `${prevRange.to}T23:59:59`)
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const { data: prevSetterAgg } = useQuery({
    queryKey: ["closer-setter-agg-prev", orgId, prevRange.from, prevRange.to, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (demoMode) {
        return buildDemoCoreDataset()
          .setterActivity.filter(
            (a) => a.activity_date >= prevRange.from && a.activity_date <= prevRange.to,
          )
          .map((a) => ({
            activity_date: a.activity_date,
            calls_on_calendar: a.calls_on_calendar,
            live_calls: a.live_calls,
            closes: a.closes,
            downsells: 0,
            cash_collected_cents: a.cash_collected_cents,
            total_revenue_cents: a.total_revenue_cents,
            original_currency: "USD",
          }));
      }
      const { data } = await supabase
        .from("setter_activity")
        .select(
          "activity_date, calls_on_calendar, live_calls, closes, downsells, cash_collected_cents, total_revenue_cents, original_currency",
        )
        .eq("org_id", orgId!)
        .gte("activity_date", prevRange.from)
        .lte("activity_date", prevRange.to);
      return data ?? [];
    },
  });

  const { data: objections } = useQuery({
    queryKey: ["call-objections", orgId, range.from, range.to],
    // Same demo-mode isolation as the leaderboard above (item 14) — no
    // real objection records surfaced while Mock Data is on.
    enabled: !!orgId && !demoMode,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_objections")
        .select("objection, resolved, created_at, call_stage, category, call_id")
        .eq("org_id", orgId!)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      return data ?? [];
    },
  });

  // Prior-window objection counts, for the "rising/falling" trend on the
  // objection instrument — same objection text, matched by exact string.
  const { data: prevObjections } = useQuery({
    queryKey: ["call-objections-prev", orgId, prevRange.from, prevRange.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("call_objections")
        .select("objection")
        .eq("org_id", orgId!)
        .gte("created_at", `${prevRange.from}T00:00:00`)
        .lte("created_at", `${prevRange.to}T23:59:59`);
      return data ?? [];
    },
  });

  const { data: faqVideosRaw } = useQuery({
    queryKey: ["faq-videos-lite", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("faq_videos")
        .select("id, title, mechanism")
        .eq("org_id", orgId!)
        .eq("active", true);
      return data ?? [];
    },
  });
  const faqVideos: FaqVideoLite[] = (faqVideosRaw ?? []).map((f) => ({
    id: f.id,
    title: f.title,
    mechanism: (f.mechanism as MechanismKey | null) ?? null,
  }));

  const { data: leadList } = useQuery({
    queryKey: ["leads-min", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, full_name, handle, email")
        .eq("org_id", orgId!)
        .limit(200);
      return data ?? [];
    },
  });

  // calls.source_webinar_id is real (the additive analytics migration) but
  // not yet in the generated client type snapshot, and isn't worth losing
  // the main `calls` query's strict typing over — fetched as its own small,
  // narrowly-typed lookup instead (same eslint-disable convention already
  // used by webinar-analytics.tsx for these untyped webinar tables/columns).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webinarLinkDb = supabase as any;
  const { data: callWebinarLinks } = useQuery({
    queryKey: ["calls-webinar-links", orgId, range.from, range.to, devBypass, demoMode],
    enabled: !!orgId && (calls?.length ?? 0) > 0,
    queryFn: async (): Promise<Array<{ id: string; source_webinar_id: string | null }>> => {
      if (devBypass || demoMode) return [];
      const { data, error } = await webinarLinkDb
        .from("calls")
        .select("id, source_webinar_id")
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`)
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; source_webinar_id: string | null }>;
    },
  });
  const callWebinarById = useMemo(
    () => new Map((callWebinarLinks ?? []).map((c) => [c.id, c.source_webinar_id])),
    [callWebinarLinks],
  );

  const list = (calls ?? []).filter((c) => {
    const matchesMember = member === ALL_MEMBERS || c.closer_name === member;
    const source = String((c as Record<string, unknown>).source_platform ?? "").trim();
    // Webinar is a nested branch of Platform, not a separate filter — only
    // one of the two facets is active at a time, matching the merged control.
    const matchesPlatformOrWebinar =
      platformFilter === "__webinar__"
        ? matchesWebinarFilter(webinarFilter, callWebinarById.get(c.id) ?? null, webinarsById)
        : platformMatches(source, platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all");
    return matchesMember && matchesPlatformOrWebinar;
  });
  const {
    page: callsPage,
    setPage: setCallsPage,
    pageCount: callsPageCount,
    paged: pagedCalls,
    total: callsTotal,
    pageSize: callsPageSize,
  } = usePagination(list, 25);
  // Closer Scorecard tab's own detail table — the closer equivalent of
  // "DM Setter Input," row-per-call for the same date range, unfiltered by
  // the member/platform picker (same convention as the radar above it).
  const {
    page: scorecardTablePage,
    setPage: setScorecardTablePage,
    pageCount: scorecardTablePageCount,
    paged: pagedScorecardCalls,
    total: scorecardTableTotal,
  } = usePagination((calls ?? []) as typeof list, 25);
  // Per-call totals
  const callsBooked = list.length;
  const callsShowed = list.filter((c) => c.showed).length;
  const callsOffers = list.filter((c) => c.offer_made).length;
  const callsClosed = list.filter((c) => c.closed || c.status === "closed").length;
  // Day-log totals (org-wide, no per-rep filter — these aren't attributed per-closer)
  const setterRows = setterAgg ?? [];
  const setBooked = setterRows.reduce((s, r) => s + (r.calls_on_calendar ?? 0), 0);
  const setShowed = setterRows.reduce((s, r) => s + (r.live_calls ?? 0), 0);
  const setClosed = setterRows.reduce((s, r) => s + (r.closes ?? 0), 0);
  const setDowns = setterRows.reduce((s, r) => s + (r.downsells ?? 0), 0);
  // Remediation (metric-dictionary audit): calls.cash_collected_cents/
  // contract_value_cents and setter_activity.cash_collected_cents/
  // total_revenue_cents store whatever amount was typed in, tagged with a
  // real original_currency but never converted — summing raw cents across
  // mixed-currency rows previously treated non-USD amounts as USD. Normalize
  // each source to USD cents before the existing Math.max() dedup (left
  // otherwise untouched — that's a separate, already-reviewed "which source
  // is bigger" choice, not part of this fix).
  const getFxFn = useServerFn(getHistoricalFxRatesFn);
  const currFxPairs = useMemo(() => {
    const dedupe = new Map<string, { currency: string; date: string }>();
    for (const p of [
      ...collectFxPairs(
        list,
        (c) => c.original_currency,
        (c) => c.scheduled_for?.slice(0, 10),
      ),
      ...collectFxPairs(
        setterRows,
        (r) => r.original_currency,
        (r) => r.activity_date,
      ),
    ]) {
      dedupe.set(`${p.currency}|${p.date}`, p);
    }
    return Array.from(dedupe.values());
  }, [list, setterRows]);
  const { data: currFxResult } = useQuery({
    queryKey: ["closer-fx", currFxPairs.map((p) => `${p.currency}|${p.date}`).join(",")],
    enabled: currFxPairs.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: () => getFxFn({ data: { pairs: currFxPairs } }),
  });
  const currFxRates = currFxResult?.rates ?? {};
  const callsCashSum = useMemo(
    () =>
      sumNormalizedCents(
        list,
        (c) => c.cash_collected_cents,
        (c) => c.original_currency,
        (c) => c.scheduled_for?.slice(0, 10),
        currFxRates,
      ),
    [list, currFxRates],
  );
  const callsRevSum = useMemo(
    () =>
      sumNormalizedCents(
        list,
        (c) => c.contract_value_cents,
        (c) => c.original_currency,
        (c) => c.scheduled_for?.slice(0, 10),
        currFxRates,
      ),
    [list, currFxRates],
  );
  const setCashSum = useMemo(
    () =>
      sumNormalizedCents(
        setterRows,
        (r) => r.cash_collected_cents,
        (r) => r.original_currency,
        (r) => r.activity_date,
        currFxRates,
      ),
    [setterRows, currFxRates],
  );
  const setRevSum = useMemo(
    () =>
      sumNormalizedCents(
        setterRows,
        (r) => r.total_revenue_cents,
        (r) => r.original_currency,
        (r) => r.activity_date,
        currFxRates,
      ),
    [setterRows, currFxRates],
  );
  const callsCash = callsCashSum.usdCents;
  const callsRev = callsRevSum.usdCents;
  const setCash = setCashSum.usdCents;
  const setRev = setRevSum.usdCents;
  const moneyFxIncomplete =
    !callsCashSum.isComplete ||
    !callsRevSum.isComplete ||
    !setCashSum.isComplete ||
    !setRevSum.isComplete;
  // Use max() of each source to avoid double-counting same dollars while still
  // surfacing whichever source actually has data. Per-rep filter falls back to call rows.
  const useDayLogs = member === ALL_MEMBERS;
  const onCalendar = useDayLogs ? Math.max(callsBooked, setBooked) : callsBooked;
  const showed = useDayLogs ? Math.max(callsShowed, setShowed) : callsShowed;
  const offers = callsOffers;
  const closes = useDayLogs ? Math.max(callsClosed, setClosed) : callsClosed;
  const downsells = useDayLogs ? setDowns : 0;
  const cashCents = useDayLogs ? Math.max(callsCash, setCash) : callsCash;
  const revCents = useDayLogs ? Math.max(callsRev, setRev) : callsRev;
  const depositCount = list.filter((c) => (c.deposit_cents ?? 0) > 0).length;
  const depositAmountCents = list.reduce((sum, call) => sum + (call.deposit_cents ?? 0), 0);
  const paymentPlanCount = list.filter((call) => call.payment_plan === true).length;
  const depositConversionPct = closes > 0 ? (depositCount / closes) * 100 : null;
  const averageDepositPct =
    depositCount > 0 ? (depositAmountCents / Math.max(1, revCents)) * 100 : null;
  const dispositionMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const call of list) {
      const disposition = normalizeCloserDisposition(call.status, call.closed, call.offer_made);
      counts.set(disposition, (counts.get(disposition) ?? 0) + 1);
    }
    return CLOSER_DISPOSITIONS.map((item) => ({
      ...item,
      count: counts.get(item.value) ?? 0,
    })).filter((item) => item.count > 0 || list.length === 0);
  }, [list]);
  // Canonical disqualification count (Priority 2) — the exact same
  // normalizeCloserDisposition("not_qualified") mapping the disposition mix
  // above already uses for `status === "disqualified"`, so this tile and
  // that chart can never disagree. No second taxonomy, no new column.
  // (prevDqCount is computed further below, once prevList exists.)
  const dqCount = useMemo(
    () =>
      list.filter(
        (c) => normalizeCloserDisposition(c.status, c.closed, c.offer_made) === "not_qualified",
      ).length,
    [list],
  );
  // Closer-logged disposition mix (spec section 5's exact taxonomy) — the
  // closer's own reason for the outcome, separate from the verified
  // status-derived dispositionMix above. "Not logged" covers calls entered
  // before this field existed, or where the closer skipped it.
  const manualDispositionMix = useMemo(() => {
    const counts = new Map<string, number>();
    let notLogged = 0;
    for (const call of list) {
      if (!call.disposition) {
        notLogged += 1;
        continue;
      }
      counts.set(call.disposition, (counts.get(call.disposition) ?? 0) + 1);
    }
    const rows: { value: string; label: string; count: number }[] = DISPOSITION_OPTIONS.map(
      (item) => ({ ...item, count: counts.get(item.value) ?? 0 }),
    ).filter((item) => item.count > 0);
    if (notLogged) rows.push({ value: "not_logged", label: "Not logged", count: notLogged });
    return rows;
  }, [list]);
  const callDurations = list.map((c) => c.duration_seconds).filter((v): v is number => v != null);
  const callTalkSeconds = list.map((c) => c.talk_seconds).filter((v): v is number => v != null);
  const avgCallDurationSeconds = callDurations.length
    ? callDurations.reduce((s, v) => s + v, 0) / callDurations.length
    : null;
  const avgTalkSeconds = callTalkSeconds.length
    ? callTalkSeconds.reduce((s, v) => s + v, 0) / callTalkSeconds.length
    : null;
  // Talk/listen ratio needs both talk time AND total duration on the same
  // call to be meaningful (listen time = duration - talk time).
  const talkListenPairs = list.filter(
    (c) => c.duration_seconds != null && c.talk_seconds != null && c.duration_seconds > 0,
  );
  const avgTalkListenRatioPct = talkListenPairs.length
    ? (talkListenPairs.reduce((s, c) => s + c.talk_seconds! / c.duration_seconds!, 0) /
        talkListenPairs.length) *
      100
    : null;
  // Payment-plan quality (spec section 5) — real payments ledger, joined by
  // call_id, scoped to this range's calls. Was previously hardcoded
  // "Unavailable"; the payments table exists and is queryable, so this is
  // wired for real instead of left as a permanent placeholder.
  const listCallIds = useMemo(() => list.map((c) => c.id), [list]);
  const { data: callPayments = [] } = useQuery({
    queryKey: ["closer-call-payments", orgId, listCallIds.join(",")],
    enabled: !!orgId && listCallIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("call_id, amount_cents, status, collected_at")
        .eq("org_id", orgId!)
        .in("call_id", listCallIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  // Remediation (metric-dictionary audit, SALE-0395–0400): none of the five
  // processor webhooks (stripe/paypal/fanbasis/wise/whop) carry any
  // call-identifying field in their payloads — verified by inspecting all
  // five handlers — so `payments.call_id` is never set today. That makes
  // `callPayments` above permanently empty, which previously made
  // "Future Scheduled Cash" silently compute the FULL contract value as
  // still-owed (as if $0 had ever been collected) instead of admitting the
  // linkage is missing. This org-wide check (independent of the current
  // date range/call list) tells us whether call-level linkage is
  // functioning AT ALL for this org, so the stats below can distinguish
  // "no payments happened" from "payments happened but aren't linked to a
  // call yet" — never silently treating the latter as $0 collected.
  const { data: orgHasLinkedPayments = false } = useQuery({
    queryKey: ["closer-org-has-linked-payments", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", orgId!)
        .not("call_id", "is", null)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
  const paymentQualityStats = useMemo(() => {
    const total = callPayments.length;
    const failedPayments = callPayments.filter((p) => p.status === "failed");
    const failed = failedPayments.length;
    const onTime = callPayments.filter((p) => p.status === "paid").length;
    const collectedByCall = new Map<string, number>();
    for (const p of callPayments) {
      if (p.status !== "paid" || !p.call_id) continue;
      collectedByCall.set(p.call_id, (collectedByCall.get(p.call_id) ?? 0) + p.amount_cents);
    }
    // True only when we have real evidence that call-level payment linkage
    // works for this org (either a linked payment fell inside this range,
    // or the org-wide check above found one elsewhere). Everything below
    // that depends on "how much has actually been collected against this
    // call" must stay null/Unavailable when this is false — a payment
    // existing with no call_id is evidence of a missing link, not evidence
    // that $0 was collected.
    const hasReliableCallLinkage = collectedByCall.size > 0 || orgHasLinkedPayments;
    const paymentPlanCalls = list.filter(
      (c) => c.payment_plan && (c.contract_value_cents ?? 0) > 0,
    );
    const depositedCalls = paymentPlanCalls.filter((c) => (c.deposit_cents ?? 0) > 0);
    const fullyPaid = depositedCalls.filter(
      (c) => (collectedByCall.get(c.id) ?? 0) >= (c.contract_value_cents ?? 0),
    );
    const futureScheduledCents = hasReliableCallLinkage
      ? paymentPlanCalls.reduce((sum, c) => {
          const remaining = (c.contract_value_cents ?? 0) - (collectedByCall.get(c.id) ?? 0);
          return sum + Math.max(0, remaining);
        }, 0)
      : null;
    // Recovered failed payments: schema has no explicit retry/recovery link
    // between payment rows, so this is inferred — real evidence (a later
    // "paid" payment on the same call as a real "failed" one), not a direct
    // recovery record. Labeled as inferred wherever it's shown.
    const recoveredCalls = new Set<string>();
    for (const failedPayment of failedPayments) {
      if (!failedPayment.call_id) continue;
      const recoveredLater = callPayments.some(
        (p) =>
          p.call_id === failedPayment.call_id &&
          p.status === "paid" &&
          new Date(p.collected_at).getTime() > new Date(failedPayment.collected_at).getTime(),
      );
      if (recoveredLater) recoveredCalls.add(failedPayment.call_id);
    }
    const futureScheduledCallIds = hasReliableCallLinkage
      ? paymentPlanCalls
          .filter((c) => (c.contract_value_cents ?? 0) - (collectedByCall.get(c.id) ?? 0) > 0)
          .map((c) => c.id)
      : [];
    return {
      total,
      failedCount: failed,
      onTimeRatePct: total ? (onTime / total) * 100 : null,
      failedRatePct: total ? (failed / total) * 100 : null,
      recoveredFailedCount: recoveredCalls.size,
      recoveredCallIds: Array.from(recoveredCalls),
      // Unavailable (not 0%) when we have deposited calls but no reliable
      // evidence of how much has actually been collected against them —
      // "0 of N reached full payment" would otherwise misreport a linkage
      // gap as a real payment-quality signal.
      depositToFullPaymentPct:
        depositedCalls.length && hasReliableCallLinkage
          ? (fullyPaid.length / depositedCalls.length) * 100
          : null,
      depositedCallIds: depositedCalls.map((c) => c.id),
      hasReliableCallLinkage,
      futureScheduledCents,
      futureScheduledCallIds,
    };
  }, [callPayments, list, orgHasLinkedPayments]);

  const { data: coachingReviewCount = 0 } = useQuery({
    queryKey: ["coaching-review-count", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("call_coaching_reviews")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      if (error) throw error;
      return count ?? 0;
    },
  });
  // Closer lifecycle attribution (spec section 5) — one linear read of this
  // same `list`, so it complements (doesn't add to) the other attribution
  // views: it's the same calls counted along a different axis, not a second
  // revenue source layered on top.
  // Real per-platform breakdown feeding the lifecycle below (Priority 5) —
  // replaces a single "Original Channel: N" aggregate count, which visually
  // implied one linear path when the reality is several distinct real
  // sources (Instagram/TikTok/YouTube/...) converging on the same downstream
  // campaign/capture/setter/booked/cash sequence. Every group here is a real
  // count over `list` (the same calls driving every other number on this
  // page) — normalizeSocialPlatform never invents a platform, it only
  // classifies what source_platform/source_connector actually say, with
  // "Unknown / Unattributed" for calls that have neither.
  const channelSources = useMemo(
    () =>
      groupBySourcePlatform(
        list.filter((c) => c.source_platform),
        (c) => c.source_platform,
      ),
    [list],
  );

  const closerLifecyclePath: AttributionPath[] = useMemo(
    () => [
      {
        id: "closer-lifecycle",
        label:
          "Channel → campaign/content → capture mechanism → setter/dialer → booked → offer → payment plan → cash",
        sources: channelSources.map((s) => ({
          key: s.label,
          label: s.label,
          value: s.count,
          onOpenRecords: () =>
            setSelected({ kind: "attribution", stageKey: "channel", sourceValue: s.label }),
        })),
        stages: (() => {
          const openStage = (key: string) => () =>
            setSelected({ kind: "attribution", stageKey: key });
          const campaignCount =
            new Set(
              list
                .map(
                  (c) =>
                    (c as Record<string, unknown>).source_campaign ??
                    (c as Record<string, unknown>).source_content_id,
                )
                .filter(Boolean),
            ).size || null;
          const captureCount =
            new Set(list.map((c) => (c as Record<string, unknown>).source_format).filter(Boolean))
              .size || null;
          const setterCount = list.filter((c) => c.setter_id).length;
          const offerCount = list.filter((c) => c.offer_made).length;
          return [
            {
              key: "campaign",
              label: "Campaign / Content",
              value: campaignCount,
              detail: "Distinct campaigns / content pieces",
              onOpenRecords: campaignCount ? openStage("campaign") : undefined,
            },
            {
              key: "capture",
              label: "Capture Mechanism",
              value: captureCount,
              detail: "Distinct capture formats",
              onOpenRecords: captureCount ? openStage("capture") : undefined,
            },
            {
              key: "setter",
              label: "Setter / Dialer",
              value: setterCount,
              detail: "Calls with a setter/dialer attached",
              onOpenRecords: setterCount ? openStage("setter") : undefined,
            },
            {
              key: "booked",
              label: "Booked Call",
              value: list.length,
              detail: "Calls in range",
              onOpenRecords: list.length ? openStage("booked") : undefined,
            },
            {
              key: "offer",
              label: "Offer / Product",
              value: offerCount,
              detail: "Offer made",
              onOpenRecords: offerCount ? openStage("offer") : undefined,
            },
            {
              key: "payment",
              label: "Payment Plan",
              value: paymentPlanCount,
              detail: "Payment-plan calls",
              onOpenRecords: paymentPlanCount ? openStage("payment") : undefined,
            },
            {
              key: "cash",
              label: "Cash Collected",
              value: cashCents ? Math.round(cashCents / 100) : 0,
              detail: fmtMoney(cashCents),
              onOpenRecords: cashCents ? openStage("cash") : undefined,
            },
            {
              key: "retention",
              label: "Retention / Refund",
              value: null,
              detail: "Lives on Payments' mentee renewal panel, not on calls — not connected here",
            },
          ];
        })(),
      },
    ],
    [list, paymentPlanCount, cashCents, channelSources, fmtMoney],
  );
  // Revenue Source Mix (Section F) — the same per-channel groups as
  // channelSources above, read as a money-first table instead of a lifecycle
  // path. No new query: every figure below is derived from `list`, the same
  // calls already driving every other number on this page. `calls` has no
  // refund/default column (see supabase/migrations), so that column is
  // honestly reported as untracked rather than backed into from payment
  // status, which would conflate a different concept (payment-plan failure).
  const revenueSourceMix = useMemo(
    () =>
      channelSources.map((s) => {
        const rows = list.filter(
          (c) => c.source_platform && normalizeSocialPlatform(c.source_platform) === s.label,
        );
        const shows = rows.filter((c) => c.showed).length;
        const qualified = rows.filter((c) => c.showed && c.status !== "disqualified").length;
        const offersForSource = rows.filter((c) => c.offer_made).length;
        const closesForSource = rows.filter((c) => c.closed || c.status === "closed").length;
        const contractedCents = rows.reduce((sum, c) => sum + (c.contract_value_cents ?? 0), 0);
        const cashForSource = rows.reduce((sum, c) => sum + (c.cash_collected_cents ?? 0), 0);
        return {
          label: s.label,
          shows,
          qualified,
          offers: offersForSource,
          closes: closesForSource,
          closeRatePct: shows ? (closesForSource / shows) * 100 : null,
          contractedCents,
          cashCollectedCents: cashForSource,
          collectionRatePct: contractedCents ? (cashForSource / contractedCents) * 100 : null,
        };
      }),
    [list, channelSources],
  );
  const avgCashPerBooked = onCalendar ? cashCents / onCalendar : 0;
  const avgCashPerShowed = showed ? cashCents / showed : 0;
  const avgCashPerClosed = closes ? cashCents / closes : 0;

  // Prior-period totals — same dual-source max() logic as the current period
  // above. This query doesn't select `id`, so there's no join path to
  // `source_webinar_id` here — Webinar stays a no-op on this facet rather
  // than fabricating a match (or zeroing every prior-period row out).
  const prevList = (prevCalls ?? []).filter((c) => {
    const matchesMember = member === ALL_MEMBERS || c.closer_name === member;
    const source = String((c as Record<string, unknown>).source_platform ?? "").trim();
    return (
      matchesMember &&
      (platformFilter === "__webinar__" ||
        platformMatches(source, platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all"))
    );
  });
  const prevCallsBooked = prevList.length;
  const prevCallsShowed = prevList.filter((c) => c.showed).length;
  const prevCallsOffers = prevList.filter((c) => c.offer_made).length;
  const prevCallsClosed = prevList.filter((c) => c.closed || c.status === "closed").length;
  const prevDqCount = prevList.filter(
    (c) => normalizeCloserDisposition(c.status, c.closed, c.offer_made) === "not_qualified",
  ).length;
  const prevDepositCount = prevList.filter((c) => (c.deposit_cents ?? 0) > 0).length;
  const prevSetterRows = prevSetterAgg ?? [];
  const prevSetBooked = prevSetterRows.reduce((s, r) => s + (r.calls_on_calendar ?? 0), 0);
  const prevSetShowed = prevSetterRows.reduce((s, r) => s + (r.live_calls ?? 0), 0);
  const prevSetClosed = prevSetterRows.reduce((s, r) => s + (r.closes ?? 0), 0);
  // Remediation (metric-dictionary audit): same currency-normalization as
  // the current-period cash/revenue totals above, applied to the prior
  // period so the delta comparison isn't itself mixing raw cents.
  const prevFxPairs = useMemo(() => {
    const dedupe = new Map<string, { currency: string; date: string }>();
    for (const p of [
      ...collectFxPairs(
        prevList,
        (c) => c.original_currency,
        (c) => c.scheduled_for?.slice(0, 10),
      ),
      ...collectFxPairs(
        prevSetterRows,
        (r) => r.original_currency,
        (r) => r.activity_date,
      ),
    ]) {
      dedupe.set(`${p.currency}|${p.date}`, p);
    }
    return Array.from(dedupe.values());
  }, [prevList, prevSetterRows]);
  const { data: prevFxResult } = useQuery({
    queryKey: ["closer-fx-prev", prevFxPairs.map((p) => `${p.currency}|${p.date}`).join(",")],
    enabled: prevFxPairs.length > 0,
    staleTime: 1000 * 60 * 60,
    queryFn: () => getFxFn({ data: { pairs: prevFxPairs } }),
  });
  const prevFxRates = prevFxResult?.rates ?? {};
  const prevCallsCash = sumNormalizedCents(
    prevList,
    (c) => c.cash_collected_cents,
    (c) => c.original_currency,
    (c) => c.scheduled_for?.slice(0, 10),
    prevFxRates,
  ).usdCents;
  const prevCallsRev = sumNormalizedCents(
    prevList,
    (c) => c.contract_value_cents,
    (c) => c.original_currency,
    (c) => c.scheduled_for?.slice(0, 10),
    prevFxRates,
  ).usdCents;
  const prevSetCash = sumNormalizedCents(
    prevSetterRows,
    (r) => r.cash_collected_cents,
    (r) => r.original_currency,
    (r) => r.activity_date,
    prevFxRates,
  ).usdCents;
  const prevSetRev = sumNormalizedCents(
    prevSetterRows,
    (r) => r.total_revenue_cents,
    (r) => r.original_currency,
    (r) => r.activity_date,
    prevFxRates,
  ).usdCents;
  const prevOnCalendar = useDayLogs ? Math.max(prevCallsBooked, prevSetBooked) : prevCallsBooked;
  const prevShowed = useDayLogs ? Math.max(prevCallsShowed, prevSetShowed) : prevCallsShowed;
  const prevOffers = prevCallsOffers;
  const prevClosed = useDayLogs ? Math.max(prevCallsClosed, prevSetClosed) : prevCallsClosed;
  const prevCashCents = useDayLogs ? Math.max(prevCallsCash, prevSetCash) : prevCallsCash;
  const prevRevCents = useDayLogs ? Math.max(prevCallsRev, prevSetRev) : prevCallsRev;
  const prevAvgCashPerBooked = prevOnCalendar ? prevCashCents / prevOnCalendar : 0;
  const prevAvgCashPerShowed = prevShowed ? prevCashCents / prevShowed : 0;
  const prevAvgCashPerClosed = prevClosed ? prevCashCents / prevClosed : 0;

  // Real day-bucketed series for the hero stats + featured MetricCard row, merging
  // per-call data with setter/dialer day-logs by daily max (mirrors the totals above).
  const callsSeries = useMemo(
    () =>
      dailySeries(list, range.from, range.to, (c) => c.scheduled_for, {
        booked: () => 1,
        showed: (c) => (c.showed ? 1 : 0),
        closed: (c) => (c.closed || c.status === "closed" ? 1 : 0),
        offers: (c) => (c.offer_made ? 1 : 0),
        cash: (c) => c.cash_collected_cents ?? 0,
        revenue: (c) => c.contract_value_cents ?? 0,
        deposits: (c) => ((c.deposit_cents ?? 0) > 0 ? 1 : 0),
      }),
    [list, range.from, range.to],
  );
  const setterSeries = useMemo(
    () =>
      dailySeries(setterAgg ?? [], range.from, range.to, (r) => r.activity_date, {
        booked: (r) => r.calls_on_calendar ?? 0,
        showed: (r) => r.live_calls ?? 0,
        closed: (r) => r.closes ?? 0,
        offers: () => 0,
        cash: (r) => r.cash_collected_cents ?? 0,
        revenue: (r) => r.total_revenue_cents ?? 0,
        deposits: () => 0,
      }),
    [setterAgg, range.from, range.to],
  );
  // mergeBySourceTotal (not mergeMax): picks one winning source per metric
  // for the whole range, matching how the headline KPI totals above
  // (onCalendar/showed/closes/cashCents/revCents) are computed — each is
  // Math.max(callsTotal, setterTotal). A per-day max (mergeMax) can pick a
  // different "winning" source on different days within the same range,
  // which makes the chart's implied sum disagree with that headline number
  // even though both claim to represent the same metric.
  const heroSeries = useDayLogs
    ? mergeBySourceTotal(callsSeries, setterSeries, [
        "booked",
        "showed",
        "closed",
        "cash",
        "revenue",
      ])
    : callsSeries;

  // Objection frequency (org-wide in range, ignores member filter). Mechanism
  // is keyword-inferred (content-mechanisms.ts scoreText/pickTop), never
  // stored ground truth — the instrument always labels it "(inferred)".
  // Raw exact-string buckets — zero normalization ("price," "too expensive,"
  // and "can't afford it" are 3 separate rows), fed to the AI clustering pass
  // below. Kept as its own memo (not inlined in objectionEntries) since the
  // clustering query needs the distinct raw texts as its key.
  const rawObjectionCounts = useMemo(() => {
    const counts = new Map<string, { total: number; resolved: number }>();
    for (const o of objections ?? []) {
      const key = String(o.objection).trim().toLowerCase();
      if (!key) continue;
      const cur = counts.get(key) ?? { total: 0, resolved: 0 };
      cur.total += 1;
      if (o.resolved) cur.resolved += 1;
      counts.set(key, cur);
    }
    return Array.from(counts.entries()).map(([key, v]) => ({
      key,
      total: v.total,
      resolved: v.resolved,
    }));
  }, [objections]);
  const rawPrevObjectionCounts = useMemo(() => {
    const prevCounts = new Map<string, number>();
    for (const o of prevObjections ?? []) {
      const key = String(o.objection).trim().toLowerCase();
      if (key) prevCounts.set(key, (prevCounts.get(key) ?? 0) + 1);
    }
    return prevCounts;
  }, [prevObjections]);

  const clusterObjections = useServerFn(clusterObjectionsFn);
  const distinctObjectionTexts = useMemo(
    () =>
      rawObjectionCounts
        .map((r) => r.key)
        .sort()
        .join("|"),
    [rawObjectionCounts],
  );
  const { data: objectionClusterData } = useQuery({
    queryKey: ["objection-clusters", orgId, distinctObjectionTexts],
    enabled: !!orgId && !devBypass && rawObjectionCounts.length > 0,
    queryFn: () =>
      clusterObjections({
        data: { rawCounts: rawObjectionCounts.map((r) => ({ text: r.key, count: r.total })) },
      }),
  });

  // AI-clustered canonical buckets (Part 2, item 4) — falls back to today's
  // exact-string bucketing whenever clustering hasn't resolved yet or the AI
  // gateway isn't configured (applyObjectionClusters returns raw 1:1 on null).
  const objectionEntries = useMemo<ObjectionEntry[]>(() => {
    if (devBypass) {
      return mockCallObjectionStats().map((o) => ({
        key: o.objection.toLowerCase(),
        label: o.objection,
        count: o.count,
        resolvedPct: o.resolved_pct,
        mechanism: pickTop(scoreText(o.objection)),
      }));
    }
    const grouped = applyObjectionClusters(
      rawObjectionCounts,
      rawPrevObjectionCounts,
      objectionClusterData?.clusters,
    );
    return grouped
      .map((g) => ({
        key: g.key,
        label: g.label.length > 28 ? g.label.slice(0, 28) + "…" : g.label,
        count: g.total,
        resolvedPct: g.total ? Math.round((g.resolved / g.total) * 100) : 0,
        prevCount: g.prevTotal,
        mechanism: pickTop(scoreText(g.label)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rawObjectionCounts, rawPrevObjectionCounts, objectionClusterData, devBypass]);

  // Per-closer scorecard — derives naturally from `calls`, which is already mocked under devBypass.
  const scorecard = useMemo(() => {
    const byName = new Map<string, typeof list>();
    for (const c of calls ?? []) {
      if (!c.closer_name) continue;
      const arr = byName.get(c.closer_name) ?? [];
      arr.push(c);
      byName.set(c.closer_name, arr);
    }
    return Array.from(byName.entries())
      .map(([name, rows]) => {
        const _booked = rows.length;
        const _showed = rows.filter((r) => r.showed).length;
        const _offers = rows.filter((r) => r.offer_made).length;
        const _closes = rows.filter((r) => r.closed || r.status === "closed").length;
        const _cash = rows.reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
        return {
          name,
          booked: _booked,
          showed: _showed,
          closes: _closes,
          showRate: _booked ? (_showed / _booked) * 100 : null,
          closeRate: _showed ? (_closes / _showed) * 100 : null,
          offerToClose: _offers ? (_closes / _offers) * 100 : null,
          cash: _cash,
          avgDeal: _closes ? _cash / _closes : 0,
        };
      })
      .sort((a, b) => b.cash - a.cash);
  }, [calls, devBypass]);

  // Closer Scorecard radar — six axes covering the full closer funnel, not
  // just show/qual/offer/close. Three of these (Close Rate, Offer → Close
  // Rate) are already real 0-100 percentages by construction, same as the
  // Setter Scorecard's own rate axes. The other three (Cash Collected,
  // Revenue Generated, Calls on Calendar, # of Closes) are dollars/counts on
  // completely different scales, so — exactly like the Setter Scorecard
  // scales its own `Sets` axis relative to the top performer
  // (src/components/activity-module.tsx) — each is normalized to the top
  // closer in range rather than plotted as a raw number next to a
  // percentage. `raw` carries the real, unnormalized value per axis/closer
  // (real dollars, real counts) for the tooltip — the radar's own plotted
  // numbers are never shown to the user as-is for these four axes.
  const closerRadar = useMemo(() => {
    const byName = new Map<string, typeof list>();
    for (const c of calls ?? []) {
      if (!c.closer_name) continue;
      const arr = byName.get(c.closer_name) ?? [];
      arr.push(c);
      byName.set(c.closer_name, arr);
    }
    // Closers with zero booked calls in range are dropped entirely rather
    // than plotted as a flat 0% shape — a real closer with no activity this
    // period isn't the same as a closer who scored 0 on every axis, and the
    // radar can't visually distinguish "no data" from "measured zero."
    const people = Array.from(byName.entries())
      .filter(([, rows]) => rows.length > 0)
      .map(([name, rows]) => {
        const booked = rows.length;
        const showed = rows.filter((r) => r.showed).length;
        const offers = rows.filter((r) => r.offer_made).length;
        const closes = rows.filter((r) => r.closed || r.status === "closed").length;
        const cashCents = rows.reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
        const revenueCents = rows.reduce((s, r) => s + (r.contract_value_cents ?? 0), 0);
        return {
          name,
          booked,
          closes,
          cashCents,
          revenueCents,
          closeRate: showed ? Math.round((closes / showed) * 100) : 0,
          offerToCloseRate: offers ? Math.round((closes / offers) * 100) : 0,
        };
      });

    const maxBooked = Math.max(1, ...people.map((p) => p.booked));
    const maxCloses = Math.max(1, ...people.map((p) => p.closes));
    const maxCash = Math.max(1, ...people.map((p) => p.cashCents));
    const maxRevenue = Math.max(1, ...people.map((p) => p.revenueCents));

    const axes = [
      "Close Rate",
      "Cash Collected",
      "Revenue Generated",
      "Offer → Close Rate",
      "Calls on Calendar",
      "# of Closes",
    ] as const;

    const normalized = people.map((p) => ({
      name: p.name,
      "Close Rate": p.closeRate,
      "Cash Collected": Math.round((p.cashCents / maxCash) * 100),
      "Revenue Generated": Math.round((p.revenueCents / maxRevenue) * 100),
      "Offer → Close Rate": p.offerToCloseRate,
      "Calls on Calendar": Math.round((p.booked / maxBooked) * 100),
      "# of Closes": Math.round((p.closes / maxCloses) * 100),
    }));

    const raw: Record<(typeof axes)[number], Record<string, string>> = {
      "Close Rate": {},
      "Cash Collected": {},
      "Revenue Generated": {},
      "Offer → Close Rate": {},
      "Calls on Calendar": {},
      "# of Closes": {},
    };
    for (const p of people) {
      raw["Close Rate"][p.name] = `${p.closeRate}%`;
      raw["Cash Collected"][p.name] = `$${Math.round(p.cashCents / 100).toLocaleString()}`;
      raw["Revenue Generated"][p.name] = `$${Math.round(p.revenueCents / 100).toLocaleString()}`;
      raw["Offer → Close Rate"][p.name] = `${p.offerToCloseRate}%`;
      raw["Calls on Calendar"][p.name] = `${p.booked}`;
      raw["# of Closes"][p.name] = `${p.closes}`;
    }

    const rows = axes.map((axis) => {
      const row: Record<string, number | string> = { axis };
      for (const p of normalized) row[p.name] = p[axis];
      return row;
    });
    return { rows, names: people.map((p) => p.name), raw };
  }, [calls]);

  // Custom tooltip for the radar: Recharts would otherwise show the
  // normalized 0-100 plotted value, which is meaningless for the
  // dollar/count axes — this looks up the real value from `closerRadar.raw`
  // instead, e.g. "Cash Collected: $18,500".
  const ClosingRadarTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ name?: string; color?: string; value?: number | string }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
        <div className="mb-1 font-semibold text-foreground">{label}</div>
        <div className="space-y-0.5">
          {payload.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium tabular-nums text-foreground">
                {(label &&
                  entry.name &&
                  closerRadar.raw[label as keyof typeof closerRadar.raw]?.[entry.name]) ??
                  entry.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Closer x weekday call-volume heatmap — derives naturally from `calls`/`scorecard`.
  // Confirmed real bug (Sales Tracking Part 2): row *labels* previously came
  // from unfiltered `scorecard` while the per-cell *data* already correctly
  // iterated the member-filtered `list` — selecting one rep still showed 6
  // rows with 5 of them silently zeroed instead of just that rep's row.
  // Deriving labels from names actually present in `list` fixes both at once
  // (a no-op when `member === ALL_MEMBERS`, since `list` then equals every
  // call and the existing scorecard ranking order is preserved).
  const activityHeatmap = useMemo(() => {
    const namesInFilteredList = new Set(
      list.map((c) => c.closer_name).filter((n): n is string => !!n),
    );
    const names = scorecard
      .map((s) => s.name)
      .filter((n) => namesInFilteredList.has(n))
      .slice(0, 6);
    const cols = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const data = names.map((name) => {
      const row = new Array(7).fill(0);
      for (const c of list) {
        if (c.closer_name !== name || !c.scheduled_for) continue;
        const day = (new Date(c.scheduled_for).getDay() + 6) % 7; // Mon=0..Sun=6
        row[day] += 1;
      }
      return row;
    });
    return { rows: names, cols, data };
  }, [scorecard, list, devBypass]);

  // Time-to-close trend
  const ttcTrend = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const c of list) {
      if (!c.time_to_close_seconds || !c.scheduled_for) continue;
      const day = c.scheduled_for.slice(0, 10);
      const arr = byDay.get(day) ?? [];
      arr.push(c.time_to_close_seconds / 60); // minutes
      byDay.set(day, arr);
    }
    return Array.from(byDay.entries())
      .map(([date, mins]) => ({
        date,
        avgMin: Math.round(mins.reduce((s, x) => s + x, 0) / mins.length),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [list]);

  // Follow-up pipeline (calls flagged as follow_up across whole range).
  // requestedFollowUpDate() is the single source of truth for "when is this
  // follow-up actually due" everywhere below (sorting, overdue/active
  // split, the per-row chip) — the requested_followup_at a closer enters on
  // the EOD's Follow-Up Details step when available, falling back to the
  // original call's scheduled_for only for follow-up records logged before
  // that field existed (never substituting one for the other when both are
  // known).
  const requestedFollowUpDate = (c: {
    requested_followup_at?: string | null;
    scheduled_for: string | null;
  }) => c.requested_followup_at ?? c.scheduled_for;
  const followUps = useMemo(
    () =>
      [...list]
        .filter((c) => c.status === "follow_up")
        .sort((a, b) => {
          const da = requestedFollowUpDate(a);
          const db = requestedFollowUpDate(b);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return new Date(da).getTime() - new Date(db).getTime();
        }),
    [list],
  );
  // Overdue = the requested follow-up date has already passed (spec
  // section 7) — not a fixed "7+ days since the original call" heuristic
  // anymore, since that was only ever a proxy for a real target date this
  // schema didn't have yet.
  const overdueFollowUps = useMemo(
    () =>
      followUps.filter((c) => {
        const due = requestedFollowUpDate(c);
        return !!due && new Date(due).getTime() < Date.now();
      }),
    [followUps],
  );
  const activeFollowUpsCount = followUps.length - overdueFollowUps.length;
  // Deals expected to close — offer made or in follow-up, with a real
  // scheduled date landing inside the page's selected date range. Not a
  // fabricated forecast: only counts calls with an actual scheduled_for
  // timestamp. Was hardcoded to "now + 7 days" regardless of the selected
  // range (label always said "This Week" even when the range changed) —
  // now genuinely scoped to range.from/range.to, matching every other
  // metric on this page.
  const dealsExpectedToClose = useMemo(() => {
    const from = new Date(`${range.from}T00:00:00`).getTime();
    const to = new Date(`${range.to}T23:59:59`).getTime();
    return list.filter((c) => {
      if (!["offer_made", "follow_up", "booked"].includes(c.status)) return false;
      if (!c.scheduled_for) return false;
      const t = new Date(c.scheduled_for).getTime();
      return t >= from && t <= to;
    });
  }, [list, range.from, range.to]);
  // No-show recovery (mirrors the Dialer appointment-quality logic) — scoped
  // to this closer's own calls.
  const noShowRecovery = useMemo(() => {
    const noShows = list.filter((c) => c.status === "no_show");
    const followUpFor = (c: (typeof list)[number]) =>
      list.find((c2) => c2.recovered_from_call_id === c.id);
    // "Rebooked" = a follow-up call was logged against this no-show at all
    // (whether or not it went on to show). "Recovered" is the stricter,
    // brief-exact definition — the rebooking itself subsequently showed —
    // since a rebooked call can still no-show again. Kept distinct so
    // "Recovered Show Rate" never double-counts a rebooking that didn't show.
    const rebooked = noShows.filter((c) => !!followUpFor(c));
    const recovered = noShows.filter((c) => !!followUpFor(c)?.showed);
    const recoveredClosed = recovered.filter((c) => !!followUpFor(c)?.closed);
    return {
      noShowCount: noShows.length,
      rebookedCount: rebooked.length,
      recoveredShowRate: noShows.length ? (recovered.length / noShows.length) * 100 : null,
      recoveredCloseRate: recovered.length
        ? (recoveredClosed.length / recovered.length) * 100
        : null,
      // Row sets for the drilldowns below — same filters as the rates above,
      // so the card and its drilldown can never disagree.
      noShows,
      rebooked,
      recovered,
      recoveredClosed,
    };
  }, [list]);

  const autoIngest = useServerFn(autoIngestCallSignalFn);
  const captureCallLifecycle = useServerFn(captureCallLifecycleEventsFn);
  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const status = f.get("status") as
        | "booked"
        | "showed"
        | "no_show"
        | "offer_made"
        | "closed"
        | "disqualified"
        | "follow_up"
        | "rescheduled";
      const closed = status === "closed";
      const mutationAt = new Date().toISOString();
      const closerName = String(f.get("closer_name") || "") || null;
      // Remediation (metric-dictionary audit, Task 4 — canonical Closer
      // identity): calls.closer_id is a real uuid column, read by Team,
      // Attribution, Team Calendars, Mentee Renewal lifecycle evidence, and
      // dispatch routing — but no write path anywhere ever set it (confirmed
      // by repo-wide search), so it has been permanently null for every real
      // call. team_members.user_id is the real, deterministic link between
      // the picked closer_name and their auth identity (same bridge used for
      // the Speed-to-Lead Targets fix) — resolved here so closer_id starts
      // being populated for every NEW call going forward, without touching
      // historical name-only rows (never backfilled/guessed).
      let closerId: string | null = null;
      if (closerName) {
        const { data: teamMember } = await supabase
          .from("team_members" as never)
          .select("user_id")
          .eq("org_id", orgId!)
          .eq("role", "closer")
          .eq("name", closerName)
          .maybeSingle();
        closerId = (teamMember as { user_id: string | null } | null)?.user_id ?? null;
      }
      const payload = {
        org_id: orgId!,
        lead_id: (f.get("lead_id") as string) || null,
        closer_name: closerName,
        closer_id: closerId,
        lead_email: String(f.get("lead_email") || "") || null,
        status,
        scheduled_for: f.get("date_of_call")
          ? new Date(String(f.get("date_of_call"))).toISOString()
          : null,
        showed: f.get("showed") === "on",
        showed_at: f.get("showed") === "on" ? mutationAt : null,
        offer_made: f.get("offer_made") === "on",
        offer_at: f.get("offer_made") === "on" ? mutationAt : null,
        closed,
        contract_value_cents: Math.round(Number(f.get("total_revenue") || 0) * 100),
        cash_collected_cents: Math.round(Number(f.get("cash_collected") || 0) * 100),
        deposit_cents: Math.round(Number(f.get("deposit") || 0) * 100),
        call_summary: String(f.get("summary") || "") || null,
        recording_url: String(f.get("recording_url") || "") || null,
        time_to_close_seconds:
          Number(f.get("ttc_min") || 0) > 0 ? Math.round(Number(f.get("ttc_min")) * 60) : null,
        key_moment: String(f.get("key_moment") || "") || null,
        disposition: (f.get("disposition") as string) || null,
        duration_seconds:
          Number(f.get("duration_min") || 0) > 0
            ? Math.round(Number(f.get("duration_min")) * 60)
            : null,
        talk_seconds:
          Number(f.get("talk_min") || 0) > 0 ? Math.round(Number(f.get("talk_min")) * 60) : null,
        cancelled: f.get("cancelled") === "on",
        // Remediation (metric-dictionary audit, SALE-0394): explicit closer
        // intent, not inferred from deposit_cents/contract_value_cents.
        payment_plan: f.get("payment_plan") === "on",
      };
      const { data: callRow, error } = await supabase
        .from("calls")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      if (callRow?.id) {
        await captureCallLifecycle({ data: { callId: callRow.id } });
      }
      // No-show recovery — this call recovers an earlier no-show for the same
      // lead. Back-links the new call to the most recent no_show call for
      // that lead rather than requiring the closer to hunt down and re-open
      // the old row themselves.
      if (f.get("recovered_no_show") === "on" && payload.lead_id && callRow?.id) {
        const { data: priorNoShow } = await supabase
          .from("calls")
          .select("id")
          .eq("org_id", orgId!)
          .eq("lead_id", payload.lead_id)
          .eq("status", "no_show")
          .neq("id", callRow.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (priorNoShow?.id) {
          await supabase
            .from("calls")
            .update({ recovered_from_call_id: priorNoShow.id })
            .eq("id", callRow.id);
        }
      }
      // Objections — comma-separated, written to call_objections table.
      // call_stage/category apply to the whole batch logged with this call —
      // per-objection stage/category would need a multi-row sub-form, out of
      // scope here; one call almost always centers on one main objection
      // moment anyway.
      const objRaw = String(f.get("objections") || "");
      const parts = objRaw
        .split(/[,;\n|]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length && callRow) {
        const objectionStage = (f.get("objection_stage") as string) || null;
        const objectionCategory = (f.get("objection_category") as string) || null;
        await supabase.from("call_objections").insert(
          parts.map((p) => ({
            org_id: orgId!,
            call_id: callRow.id,
            objection: p,
            resolved: closed,
            call_stage: objectionStage,
            category: objectionCategory,
          })),
        );
      }

      // 2.8 — screen the call summary for limiting beliefs/objections automatically,
      // same extraction the manual-paste flow on Content Signals uses. Best-effort:
      // never block "call logged" if AI screening fails or isn't configured.
      if (payload.call_summary && !devBypass) {
        autoIngest({
          data: {
            call_id: callRow?.id ?? null,
            closer_name: payload.closer_name || "Unknown",
            call_date: payload.scheduled_for ? payload.scheduled_for.slice(0, 10) : undefined,
            call_summary: payload.call_summary,
            lead_id: payload.lead_id,
          },
        }).catch((e) => console.warn("Auto setter-signal screening failed", e));
      }
    },
    onSuccess: () => {
      toast.success("Call logged");
      qc.invalidateQueries({ queryKey: ["calls"] });
      qc.invalidateQueries({ queryKey: ["call-objections"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar
        title="Closer Dashboard"
        subtitle="Calls, offers, deposits, cash collected — per-call tracking"
        showDateRange
      />
      <div className="p-4 md:p-6 space-y-4">
        <PageHero
          icon={<PhoneCall className="h-5 w-5" />}
          eyebrow="Rep Efficiency"
          title="Closer Dashboard"
          subtitle="Calls, offers, deposits, cash collected — per-call tracking."
          status={[
            { label: `${scorecard.length} active closers`, tone: "default" },
            {
              label: `${pct(closes, showed)} close rate`,
              tone: showed === 0 ? "default" : closes / showed >= 0.3 ? "success" : "warning",
            },
          ]}
        />

        {/* Leaderboard + activity heatmap + scorecard live in "E · Pipeline &
            team visibility" below, alongside pipeline/outcome and follow-up
            data — no longer stranded above the closer's own primary
            performance metrics. */}

        {member !== ALL_MEMBERS && (
          <div className="space-y-2">
            <div className="text-sm font-bold uppercase tracking-[0.16em] text-foreground">
              {member} · Targets
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {memberTargetCards.map((c) => (
                <KpiTargetCard
                  key={c.key}
                  label={c.label}
                  progress={c.progress}
                  onClick={() =>
                    document
                      .getElementById("closer-input-log")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <TeamMemberFilter role="closer" value={member} onChange={setMember} />
            {/* Platform — merges the reusable Webinar hierarchy as a nested
                branch rather than a separate control, since a webinar isn't
                a flat platform name the way Instagram/TikTok/etc. are. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-[190px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-sm shadow-sm ring-offset-background transition-all hover:border-ring/30 focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                >
                  <span className="flex min-w-0 items-center gap-1.5 truncate">
                    {platformFilter === "__webinar__" ? (
                      <>
                        <Video className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {webinarFilterLabel(webinarFilter, webinarsById)}
                      </>
                    ) : platformFilter === "all" ? (
                      "Platform: All"
                    ) : (
                      <>
                        <PlatformIcon
                          platform={platformFilter as (typeof SOCIAL_PLATFORMS)[number]}
                        />
                        {platformFilter}
                      </>
                    )}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[220px]">
                <DropdownMenuItem
                  onClick={() => {
                    setPlatformFilter("all");
                    setWebinarFilter(ALL_WEBINARS_FILTER);
                  }}
                >
                  Platform: All
                </DropdownMenuItem>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <DropdownMenuItem key={platform} onClick={() => setPlatformFilter(platform)}>
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={platform} /> {platform}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Webinar</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-[240px]">
                    <DropdownMenuItem
                      onClick={() => {
                        setPlatformFilter("__webinar__");
                        setWebinarFilter(ALL_WEBINARS_FILTER);
                      }}
                    >
                      All Webinars
                    </DropdownMenuItem>
                    <WebinarFilterBranches
                      onChange={(next) => {
                        setPlatformFilter("__webinar__");
                        setWebinarFilter(next);
                      }}
                      paidWebinars={paidWebinars}
                      organicWebinars={organicWebinars}
                      unclassifiedWebinars={unclassifiedWebinars}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Dialog open={open && canLogCall} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                disabled={!canLogCall}
                title={canLogCall ? undefined : "You don't have edit access to this page."}
              >
                <Plus className="h-4 w-4" />
                Log call
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Log a sales call</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Closer name</Label>
                    <TeamMemberPicker role="closer" name="closer_name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date of call</Label>
                    <Input
                      name="date_of_call"
                      type="datetime-local"
                      defaultValue={new Date().toISOString().slice(0, 16)}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Lead (optional)</Label>
                    <Select
                      name="lead_id"
                      onValueChange={(v) => {
                        const l = (leadList ?? []).find((x) => x.id === v);
                        const el = document.querySelector<HTMLInputElement>(
                          'input[name="lead_email"]',
                        );
                        if (el && l?.email) el.value = l.email;
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Pick lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {(leadList ?? []).map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.full_name || l.handle || l.id.slice(0, 6)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Lead email</Label>
                    <Input name="lead_email" type="email" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Lead status</Label>
                  <Select name="status" defaultValue="closed">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Disposition</Label>
                  <Select name="disposition">
                    <SelectTrigger>
                      <SelectValue placeholder="Why did the call end this way?" />
                    </SelectTrigger>
                    <SelectContent>
                      {DISPOSITION_OPTIONS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showed" defaultChecked /> Showed
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="offer_made" defaultChecked /> Offer made (True)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="cancelled" /> Cancelled (not just no-show)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="recovered_no_show" /> Recovers a prior no-show for
                    this lead
                  </label>
                  {/* Remediation (metric-dictionary audit, SALE-0394): calls.payment_plan
                      is a real column but nothing in this form ever wrote to it —
                      explicit checkbox, not inferred from deposit/installment amounts. */}
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="payment_plan" /> Payment plan (not paid in full)
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Cash collected $</Label>
                    <Input
                      name="cash_collected"
                      type="number"
                      step="0.01"
                      defaultValue={0}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Deposit $</Label>
                    <Input name="deposit" type="number" step="0.01" defaultValue={0} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total revenue $</Label>
                    <Input
                      name="total_revenue"
                      type="number"
                      step="0.01"
                      defaultValue={0}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Time-to-close (min on call)</Label>
                    <Input name="ttc_min" type="number" step="1" placeholder="e.g. 45" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Key moment</Label>
                    <Input name="key_moment" placeholder="What unlocked the close?" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Call length (min)</Label>
                    <Input name="duration_min" type="number" step="1" placeholder="e.g. 52" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rep talk time (min)</Label>
                    <Input name="talk_min" type="number" step="1" placeholder="e.g. 31" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Objections (comma-separated)</Label>
                  <Textarea
                    name="objections"
                    rows={2}
                    placeholder="price, timing, spouse, need to think…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Where in the call</Label>
                    <Select name="objection_stage">
                      <SelectTrigger>
                        <SelectValue placeholder="Call stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {OBJECTION_STAGE_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Objection category</Label>
                    <Select name="objection_category">
                      <SelectTrigger>
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {OBJECTION_CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Call recording URL</Label>
                  <Input name="recording_url" type="url" placeholder="https://" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Call summary</Label>
                  <Textarea name="summary" rows={3} required />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {create.isPending ? "…" : "Log call"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Composed instruments, not atomized tiles. Every rate ("show rate",
            "close rate", "offer→close rate"...) is the conv% between two
            adjacent funnel stages, not a separate box. Click a stage or Cash
            Collected to see what produced it, what's capping it, and what's
            working. Deposits/downsells — no predecessor stage of their own —
            stay as plain captions rather than a fabricated click target. */}
        {(() => {
          const closeStages: FunnelStage[] = [
            { key: "oncal", label: "Calls on Calendar", value: onCalendar, spectrum: "mid" },
            { key: "showed", label: "Showed", value: showed, spectrum: "mid" },
            { key: "offers", label: "Offers Made", value: offers, spectrum: "mid" },
            { key: "closes", label: "Closes", value: closes, spectrum: "hot" },
          ];
          const prevCloseStages: FunnelStage[] = [
            { key: "oncal", label: "Calls on Calendar", value: prevOnCalendar, spectrum: "mid" },
            { key: "showed", label: "Showed", value: prevShowed, spectrum: "mid" },
            { key: "offers", label: "Offers Made", value: prevOffers, spectrum: "mid" },
            { key: "closes", label: "Closes", value: prevClosed, spectrum: "hot" },
          ];
          const payoutCents = cashCents * 0.1;

          type CallRow = (typeof list)[number];
          const stageFilter = (kind: string) => (c: CallRow) => {
            if (kind === "showed") return !!c.showed;
            if (kind === "offers") return !!c.offer_made;
            if (kind === "closes") return !!(c.closed || c.status === "closed");
            if (kind === "cash") return (c.cash_collected_cents ?? 0) > 0;
            if (kind === "revenue") return (c.contract_value_cents ?? 0) > 0;
            return true;
          };
          const callRowsFor = (kind: string): CallRow[] => {
            const filtered = list.filter(stageFilter(kind));
            return [...filtered]
              .sort((a, b) => {
                if (kind === "cash") {
                  return (b.cash_collected_cents ?? 0) - (a.cash_collected_cents ?? 0);
                }
                if (kind === "revenue") {
                  return (b.contract_value_cents ?? 0) - (a.contract_value_cents ?? 0);
                }
                return String(b.scheduled_for ?? "").localeCompare(String(a.scheduled_for ?? ""));
              })
              .slice(0, 50);
          };
          // Close-stage KPI cards that share a funnel index (0=oncal,
          // 1=showed, 2=offers, 3=closes) but each need their own title and
          // value column instead of the funnel-stage fallback's generic "✓"
          // (item 2 — a clicked card must show the data that actually
          // produced IT, not just its stage's raw membership).
          const CLOSE_METRIC_OVERRIDES: Record<
            string,
            { title: string; label: string; render: (c: CallRow) => React.ReactNode }
          > = {
            avgContractValue: {
              title: "Avg Contract Value",
              label: "Contract value",
              render: (c) => fmtMoney(c.contract_value_cents ?? 0),
            },
            avgCashPerBooked: {
              title: "Avg Cash / Booked",
              label: "Cash collected",
              render: (c) => fmtMoney(c.cash_collected_cents ?? 0),
            },
            avgCashPerShowed: {
              title: "Avg Cash / Showed",
              label: "Cash collected",
              render: (c) => fmtMoney(c.cash_collected_cents ?? 0),
            },
            avgCashPerClosed: {
              title: "Avg Cash / Closed",
              label: "Cash collected",
              render: (c) => fmtMoney(c.cash_collected_cents ?? 0),
            },
            closeRate: { title: "Close Rate", label: "Closed", render: () => "✓" },
            offerToCloseRate: {
              title: "Offer → Close Rate",
              label: "Closed",
              render: () => "✓",
            },
            showRate: { title: "Show Rate", label: "Showed", render: () => "✓" },
            offerRate: { title: "Offer Rate", label: "Offer made", render: () => "✓" },
          };
          const callColumns = (
            label: string,
            render: (c: CallRow) => React.ReactNode,
          ): DetailColumn<CallRow>[] => [
            { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
            {
              key: "date",
              label: "Date",
              render: (c) =>
                c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—",
            },
            {
              key: "lead",
              label: "Lead",
              render: (c) => c.lead_email ?? c.leads?.full_name ?? "—",
            },
            {
              key: "status",
              label: "Status",
              render: (c) =>
                STATUS_LABEL[c.status] ??
                normalizeCloserDisposition(c.status, c.closed, c.offer_made),
            },
            { key: "value", label, align: "right", render },
            {
              key: "evidence",
              label: "Attribution evidence",
              render: (c) => {
                const leadEvidenceKey = c.leads?.email ?? c.lead_email ?? null;
                const evidence = evaluateAttributionEvidence({
                  model: "booking_source",
                  supportingEvents: ["call"],
                  knownTouchpoints: leadEvidenceKey ? 1 : 0,
                  sampleSize: 1,
                  directOutcomeLinked: !!leadEvidenceKey,
                  drilldownKey: leadEvidenceKey ?? c.id,
                });
                return <AttributionEvidencePanel evidence={evidence} title="Evidence" compact />;
              },
            },
          ];

          let panel: {
            title: string;
            columns: DetailColumn<CallRow>[];
            rows: CallRow[];
            cap: ReturnType<typeof deriveCap>;
            working: ReturnType<typeof deriveWorking>;
          } | null = null;
          if (selected?.kind === "money") {
            if (selected.metric === "revenue") {
              const avgRevPerClosed = closes ? revCents / closes : 0;
              const prevAvgRevPerClosed = prevClosed ? prevRevCents / prevClosed : 0;
              panel = {
                title: "Revenue Generated",
                columns: callColumns("Revenue", (c) => fmtMoney(c.contract_value_cents ?? 0)),
                rows: callRowsFor("revenue"),
                cap: deriveMoneyCap(
                  closes,
                  avgRevPerClosed,
                  revCents,
                  minCapSample,
                  fmtMoney,
                  "Revenue Generated",
                ),
                working: deriveMoneyWorking(
                  avgRevPerClosed,
                  prevAvgRevPerClosed,
                  closes,
                  prevClosed,
                  minCapSample,
                  fmtMoney,
                  "revenue",
                ),
              };
            } else if (selected.metric === "cashRate") {
              panel = {
                title: "Cash Collection Rate",
                columns: callColumns(
                  "Cash / Contract",
                  (c) =>
                    `${fmtMoney(c.cash_collected_cents ?? 0)} / ${fmtMoney(c.contract_value_cents ?? 0)}`,
                ),
                rows: callRowsFor("cash"),
                cap: {
                  status: "insufficient_data",
                  sentence:
                    "A ratio of Cash Collected ÷ Revenue Generated, not a funnel stage — no prior-stage constraint to derive.",
                },
                working: {
                  status: "insufficient_data",
                  sentence:
                    "A ratio of two other metrics — no prior-period comparison to derive on its own.",
                },
              };
            } else {
              panel = {
                title: "Cash Collected",
                columns: callColumns("Cash", (c) => fmtMoney(c.cash_collected_cents ?? 0)),
                rows: callRowsFor("cash"),
                cap: deriveMoneyCap(closes, avgCashPerClosed, cashCents, minCapSample, fmtMoney),
                working: deriveMoneyWorking(
                  avgCashPerClosed,
                  prevAvgCashPerClosed,
                  closes,
                  prevClosed,
                  minCapSample,
                  fmtMoney,
                ),
              };
            }
          } else if (selected?.kind === "pipeline" && selected.index === 0) {
            // A pipeline snapshot, not a funnel conversion stage — there's no
            // adjacent-stage constraint to derive "what's capping it" from,
            // so both come back honestly "insufficient_data" rather than
            // forcing a funnel-shaped narrative onto a metric that isn't one.
            panel = {
              title: `Deals Expected to Close (${formatRangeLabel(range)})`,
              columns: callColumns("Scheduled for", (c) =>
                c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—",
              ),
              rows: dealsExpectedToClose,
              cap: {
                status: "insufficient_data",
                sentence:
                  "This is a pipeline snapshot, not a funnel stage — no prior-stage constraint to derive.",
              },
              working: {
                status: "insufficient_data",
                sentence:
                  "This is a pipeline snapshot, not a funnel stage — no prior-period comparison to derive.",
              },
            };
          } else if (selected?.kind === "pipeline" && selected.index === 1) {
            // Overdue Follow-ups (the closest existing analog to "Overdue
            // Payments" — there's no overdue-payment concept in this
            // schema). Real record-level drilldown, not a placeholder.
            // Follow-up-specific columns appended to the shared base set —
            // this is the existing detail drawer, reused rather than a new
            // one, per-row secondary detail (reason, amount pitched,
            // notes) belongs here, not crammed into the dense pipeline
            // table below.
            panel = {
              title: "Overdue Follow-ups (requested follow-up date has passed)",
              columns: [
                ...callColumns("Requested follow-up", (c) => {
                  const due = requestedFollowUpDate(c);
                  return due
                    ? new Date(due).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—";
                }),
                {
                  key: "followup_type",
                  label: "Type",
                  render: (c) => followUpTypeLabel(c.eod_lead_status) ?? "—",
                },
                {
                  key: "followup_reason",
                  label: "Reason",
                  render: (c) =>
                    c.followup_reason
                      ? c.followup_reason === OTHER_OBJECTION_VALUE && c.followup_reason_other
                        ? `${objectionCategoryLabel(c.followup_reason)} (${c.followup_reason_other})`
                        : objectionCategoryLabel(c.followup_reason)
                      : "—",
                },
                {
                  key: "followup_amount",
                  label: "Pitched",
                  align: "right",
                  render: (c) =>
                    c.followup_amount_pitched_cents
                      ? "$" + (c.followup_amount_pitched_cents / 100).toLocaleString()
                      : "—",
                },
                {
                  key: "followup_notes",
                  label: "Notes",
                  render: (c) => c.followup_notes || "—",
                },
              ],
              rows: overdueFollowUps,
              cap: {
                status: "insufficient_data",
                sentence:
                  "A pipeline snapshot, not a funnel stage — no prior-stage constraint to derive.",
              },
              working: {
                status: "insufficient_data",
                sentence:
                  "A pipeline snapshot, not a funnel stage — no prior-period comparison to derive.",
              },
            };
          } else if (selected?.kind === "noshow") {
            // Rate-based metrics show numerator AND denominator records
            // together (a "Recovered" column on the full no-show set, or a
            // "Closed" column on the recovered set) so the rate's arithmetic
            // is visible, not just its result.
            const followUpFor = (c: CallRow) =>
              list.find((c2) => c2.recovered_from_call_id === c.id);
            const leadOf = (c: CallRow) => c.lead_email ?? c.leads?.full_name ?? "—";
            const dateOf = (c: CallRow) =>
              c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—";
            if (selected.index === 0) {
              panel = {
                title: "No-shows in range",
                columns: [
                  { key: "lead", label: "Lead", render: leadOf },
                  { key: "date", label: "No-show date", render: dateOf },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  {
                    key: "recovered",
                    label: "Recovered",
                    render: (c) => (followUpFor(c) ? "Yes" : "No"),
                  },
                ],
                rows: noShowRecovery.noShows,
                cap: {
                  status: "insufficient_data",
                  sentence:
                    "A raw count, not a funnel stage — no prior-stage constraint to derive.",
                },
                working: {
                  status: "insufficient_data",
                  sentence:
                    "A raw count, not a funnel stage — no prior-period comparison to derive.",
                },
              };
            } else if (selected.index === 1) {
              panel = {
                title: `Recovered Show Rate (${noShowRecovery.recovered.length} of ${noShowRecovery.noShows.length})`,
                columns: [
                  { key: "lead", label: "Lead", render: leadOf },
                  { key: "date", label: "Original no-show", render: dateOf },
                  {
                    key: "rescheduled",
                    label: "Rescheduled to",
                    render: (c) => {
                      const f = followUpFor(c);
                      return f?.scheduled_for
                        ? new Date(f.scheduled_for).toLocaleDateString()
                        : "—";
                    },
                  },
                  {
                    key: "showed",
                    label: "Showed on reschedule",
                    render: (c) => (followUpFor(c)?.showed ? "Yes" : followUpFor(c) ? "No" : "—"),
                  },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  {
                    key: "outcome",
                    label: "Outcome",
                    render: (c) => {
                      const f = followUpFor(c);
                      if (!f) return "Not recovered";
                      return (
                        STATUS_LABEL[f.status] ??
                        normalizeCloserDisposition(f.status, f.closed, f.offer_made)
                      );
                    },
                  },
                ],
                rows: noShowRecovery.noShows,
                cap: {
                  status: "insufficient_data",
                  sentence:
                    "A recovery rate, not a funnel stage — no prior-stage constraint to derive.",
                },
                working: {
                  status: "insufficient_data",
                  sentence:
                    "A recovery rate, not a funnel stage — no prior-period comparison to derive.",
                },
              };
            } else if (selected.index === 2) {
              panel = {
                title: `Recovered Close Rate (${noShowRecovery.recoveredClosed.length} of ${noShowRecovery.recovered.length})`,
                columns: [
                  { key: "lead", label: "Lead", render: leadOf },
                  { key: "date", label: "Recovered appointment", render: dateOf },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  {
                    key: "offer",
                    label: "Offer made",
                    render: (c) => (c.offer_made ? "Yes" : "No"),
                  },
                  { key: "closed", label: "Closed", render: (c) => (c.closed ? "Yes" : "No") },
                  {
                    key: "cash",
                    label: "Cash",
                    align: "right",
                    render: (c) => fmtMoney(c.cash_collected_cents ?? 0),
                  },
                ],
                rows: noShowRecovery.recovered,
                cap: {
                  status: "insufficient_data",
                  sentence:
                    "A recovery rate, not a funnel stage — no prior-stage constraint to derive.",
                },
                working: {
                  status: "insufficient_data",
                  sentence:
                    "A recovery rate, not a funnel stage — no prior-period comparison to derive.",
                },
              };
            } else {
              panel = {
                title: `No-shows Rebooked (${noShowRecovery.rebookedCount} of ${noShowRecovery.noShowCount})`,
                columns: [
                  { key: "lead", label: "Lead", render: leadOf },
                  { key: "date", label: "Original no-show", render: dateOf },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  {
                    key: "rescheduled",
                    label: "Rescheduled to",
                    render: (c) => {
                      const f = followUpFor(c);
                      return f?.scheduled_for
                        ? new Date(f.scheduled_for).toLocaleDateString()
                        : "—";
                    },
                  },
                  {
                    key: "showed",
                    label: "Showed on reschedule",
                    render: (c) => (followUpFor(c)?.showed ? "Yes" : followUpFor(c) ? "No" : "—"),
                  },
                ],
                rows: noShowRecovery.rebooked,
                cap: {
                  status: "insufficient_data",
                  sentence:
                    "A raw count, not a funnel stage — no prior-stage constraint to derive.",
                },
                working: {
                  status: "insufficient_data",
                  sentence:
                    "A raw count, not a funnel stage — no prior-period comparison to derive.",
                },
              };
            }
          } else if (selected?.kind === "attribution") {
            const stageRowsFor = (key: string): CallRow[] => {
              if (key === "channel") {
                if (selected.sourceValue) {
                  return list.filter(
                    (c) => normalizeSocialPlatform(c.source_platform) === selected.sourceValue,
                  );
                }
                return list.filter((c) => c.source_platform);
              }
              if (key === "campaign")
                return list.filter((c) => c.source_campaign || c.source_content_id);
              if (key === "capture") return list.filter((c) => c.source_format);
              if (key === "setter") return list.filter((c) => c.setter_id);
              if (key === "booked") return list;
              if (key === "offer") return list.filter((c) => c.offer_made);
              if (key === "payment") return list.filter((c) => c.payment_plan === true);
              if (key === "cash") return list.filter((c) => (c.cash_collected_cents ?? 0) > 0);
              return [];
            };
            const attrColumnFor = (key: string): DetailColumn<CallRow> => {
              if (key === "channel")
                return { key: "value", label: "Channel", render: (c) => c.source_platform ?? "—" };
              if (key === "campaign")
                return {
                  key: "value",
                  label: "Campaign / content",
                  render: (c) => c.source_campaign ?? c.source_content_id ?? "—",
                };
              if (key === "capture")
                return {
                  key: "value",
                  label: "Capture format",
                  render: (c) => c.source_format ?? "—",
                };
              if (key === "setter")
                return {
                  key: "value",
                  label: "Setter / dialer",
                  render: (c) => (c.setter_id ? `Rep ${c.setter_id.slice(0, 8)}` : "—"),
                };
              if (key === "offer") return { key: "value", label: "Offer made", render: () => "✓" };
              if (key === "payment")
                return { key: "value", label: "Payment plan", render: () => "✓" };
              if (key === "cash")
                return {
                  key: "value",
                  label: "Cash",
                  align: "right",
                  render: (c) => fmtMoney(c.cash_collected_cents ?? 0),
                };
              return { key: "value", label: "Booked", render: () => "✓" };
            };
            // "channel" no longer lives in `stages` (Priority 5: it's now the
            // real per-platform `sources` breakdown merging into stages[0]
            // instead of one flat aggregate count) — synthesize its label so
            // clicking a source node still opens a real, correctly-titled panel.
            const stageMeta =
              selected.stageKey === "channel"
                ? { key: "channel", label: "Original Channel" }
                : closerLifecyclePath[0].stages.find((s) => s.key === selected.stageKey);
            panel = stageMeta
              ? {
                  title: selected.sourceValue
                    ? `${stageMeta.label}: ${selected.sourceValue}`
                    : stageMeta.label,
                  columns: [
                    { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                    {
                      key: "date",
                      label: "Date",
                      render: (c) =>
                        c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—",
                    },
                    {
                      key: "lead",
                      label: "Lead",
                      render: (c) => c.lead_email ?? c.leads?.full_name ?? "—",
                    },
                    attrColumnFor(selected.stageKey),
                  ],
                  rows: stageRowsFor(selected.stageKey).slice(0, 50),
                  cap: {
                    status: "insufficient_data",
                    sentence: `Reads the same ${range.label.toLowerCase()} call set along the ${stageMeta.label.toLowerCase()} axis — not a funnel stage, so no prior-stage constraint to derive.`,
                  },
                  working: {
                    status: "insufficient_data",
                    sentence:
                      "An attribution-lifecycle read of these calls, not a funnel stage — no prior-period comparison to derive.",
                  },
                }
              : null;
          } else if (selected?.kind === "disposition") {
            const rows =
              selected.source === "status"
                ? list.filter(
                    (c) =>
                      normalizeCloserDisposition(c.status, c.closed, c.offer_made) ===
                      selected.value,
                  )
                : list.filter((c) =>
                    selected.value === "not_logged"
                      ? !c.disposition
                      : c.disposition === selected.value,
                  );
            panel = {
              title: `Disposition: ${selected.label}`,
              columns: [
                { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                {
                  key: "date",
                  label: "Date",
                  render: (c) =>
                    c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—",
                },
                {
                  key: "lead",
                  label: "Lead",
                  render: (c) => c.lead_email ?? c.leads?.full_name ?? "—",
                },
                {
                  key: "status",
                  label: "Status",
                  render: (c) =>
                    STATUS_LABEL[c.status] ??
                    normalizeCloserDisposition(c.status, c.closed, c.offer_made),
                },
              ],
              rows,
              cap: {
                status: "insufficient_data",
                sentence:
                  "A disposition breakdown, not a funnel stage — no prior-stage constraint to derive.",
              },
              working: {
                status: "insufficient_data",
                sentence:
                  "A disposition breakdown, not a funnel stage — no prior-period comparison to derive.",
              },
            };
          } else if (selected?.kind === "payment") {
            const leadOfPayment = (c: CallRow) => c.lead_email ?? c.leads?.full_name ?? "—";
            const dateOfPayment = (c: CallRow) =>
              c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—";
            const noUpstream = {
              status: "insufficient_data" as const,
              sentence:
                "A payment-quality metric, not a funnel stage — no prior-stage constraint to derive.",
            };
            const noPriorPeriod = {
              status: "insufficient_data" as const,
              sentence:
                "A payment-quality metric, not a funnel stage — no prior-period comparison to derive.",
            };
            if (
              selected.metric === "deposits" ||
              selected.metric === "depositAmount" ||
              selected.metric === "averageDepositPct"
            ) {
              const rows = list.filter((c) => (c.deposit_cents ?? 0) > 0);
              panel = {
                title:
                  selected.metric === "deposits"
                    ? "Deposits"
                    : selected.metric === "depositAmount"
                      ? "Deposit Amount"
                      : "Avg Deposit %",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  {
                    key: "deposit",
                    label: "Deposit",
                    align: "right",
                    render: (c) => fmtMoney(c.deposit_cents ?? 0),
                  },
                  {
                    key: "contract",
                    label: "Contract Value",
                    align: "right",
                    render: (c) => fmtMoney(c.contract_value_cents ?? 0),
                  },
                ],
                rows,
                cap: noUpstream,
                working: noPriorPeriod,
              };
            } else if (selected.metric === "depositConversion") {
              const rows = list.filter((c) => (c.deposit_cents ?? 0) > 0);
              panel = {
                title: "Deposit → Close",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  { key: "closed", label: "Closed", render: (c) => (c.closed ? "Yes" : "No") },
                ],
                rows,
                cap: noUpstream,
                working: noPriorPeriod,
              };
            } else if (selected.metric === "paymentPlanUptake") {
              panel = {
                title: "Payment Plan Uptake",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  {
                    key: "contract",
                    label: "Contract Value",
                    align: "right",
                    render: (c) => fmtMoney(c.contract_value_cents ?? 0),
                  },
                ],
                rows: list.filter((c) => c.payment_plan === true),
                cap: noUpstream,
                working: noPriorPeriod,
              };
            } else if (
              selected.metric === "onTimeRate" ||
              selected.metric === "failedPaymentRate" ||
              selected.metric === "failedPaymentCount"
            ) {
              const status = selected.metric === "onTimeRate" ? "paid" : "failed";
              const rows = list.filter((c) =>
                callPayments.some((p) => p.call_id === c.id && p.status === status),
              );
              panel = {
                title:
                  selected.metric === "onTimeRate"
                    ? "Payment Success Rate"
                    : selected.metric === "failedPaymentCount"
                      ? "Failed Payments"
                      : "Failed / Default Rate",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  {
                    key: "amount",
                    label: "Payment Amount",
                    align: "right",
                    render: (c) => {
                      const p = callPayments.find(
                        (pp) => pp.call_id === c.id && pp.status === status,
                      );
                      return fmtMoney(p?.amount_cents ?? 0);
                    },
                  },
                ],
                rows,
                cap: noUpstream,
                working: noPriorPeriod,
              };
            } else if (selected.metric === "recoveredFailedPayments") {
              panel = {
                title: "Recovered Failed Payments (inferred)",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                ],
                rows: list.filter((c) => paymentQualityStats.recoveredCallIds.includes(c.id)),
                cap: noUpstream,
                working: {
                  status: "insufficient_data",
                  sentence:
                    "Inferred from a later successful payment on the same call — not a direct retry record, so there's no prior-period comparison to derive.",
                },
              };
            } else if (selected.metric === "depositToFullPayment") {
              panel = {
                title: "Deposit → Full Payment",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  {
                    key: "contract",
                    label: "Contract Value",
                    align: "right",
                    render: (c) => fmtMoney(c.contract_value_cents ?? 0),
                  },
                ],
                rows: list.filter((c) => paymentQualityStats.depositedCallIds.includes(c.id)),
                cap: noUpstream,
                working: noPriorPeriod,
              };
            } else if (selected.metric === "futureScheduledCash") {
              panel = {
                title: "Future Scheduled Cash",
                columns: [
                  { key: "lead", label: "Lead", render: leadOfPayment },
                  { key: "closer", label: "Closer", render: (c) => c.closer_name ?? "—" },
                  { key: "date", label: "Date", render: dateOfPayment },
                  {
                    key: "contract",
                    label: "Contract Value",
                    align: "right",
                    render: (c) => fmtMoney(c.contract_value_cents ?? 0),
                  },
                ],
                rows: list.filter((c) => paymentQualityStats.futureScheduledCallIds.includes(c.id)),
                cap: noUpstream,
                working: noPriorPeriod,
              };
            }
          } else if (selected && selected.kind === "close") {
            const stage = closeStages[selected.index];
            const kind = ["oncal", "showed", "offers", "closes"][selected.index];
            const override = selected.metric ? CLOSE_METRIC_OVERRIDES[selected.metric] : undefined;
            panel = stage
              ? {
                  title: override?.title ?? stage.label,
                  columns: callColumns(
                    override?.label ?? stage.label,
                    override?.render ?? (() => "✓"),
                  ),
                  rows: callRowsFor(kind),
                  cap: deriveCap(closeStages, selected.index, minCapSample),
                  working: deriveWorking(closeStages, prevCloseStages, minCapSample),
                }
              : null;
          }

          const moneySeries: MoneyPoint[] = heroSeries.map((p) => ({
            d: p.d,
            cash: Number(p.cash ?? 0),
            revenue: Number(p.revenue ?? 0),
          }));

          // Money-first (Priority 4): Cash Collected and Revenue lead the page,
          // followed by the two rate/derived money metrics, then core closing
          // activity (Closes/Shows/Offers) — replacing the old activity-first
          // order (oncal/showed/offers/closes/cash/revenue) that buried both
          // dollar figures behind four count tiles and a full section header.
          const cashRatePctNow = revCents ? (cashCents / revCents) * 100 : null;
          const prevCashRatePctNow = prevRevCents ? (prevCashCents / prevRevCents) * 100 : null;
          const avgContractValueCents = closes ? revCents / closes : null;
          const prevAvgContractValueCents = prevClosed ? prevRevCents / prevClosed : null;
          const kpiItems: KpiBandItem[] = [
            {
              key: "cash",
              label: "Cash Collected",
              value: moneyFxIncomplete
                ? `${fmtMoney(cashCents)} · FX incomplete`
                : fmtMoney(cashCents),
              spectrum: "hot",
              featured: true,
              emphasis: "strong",
              wide: true,
              deltaPct: pctDelta(cashCents, prevCashCents),
              priorValue: fmtMoney(prevCashCents),
              empty: cashCents === 0 && !moneyFxIncomplete,
              emptyHint: moneyFxIncomplete
                ? "Some non-USD rows couldn't be converted (no historical FX rate available) and are excluded from this total."
                : "Log a closed call with cash collected to see this populate.",
              onClick: () => setSelected({ kind: "money", metric: "cash" }),
            },
            {
              key: "revenue",
              label: "Revenue Generated",
              value: moneyFxIncomplete
                ? `${fmtMoney(revCents)} · FX incomplete`
                : fmtMoney(revCents),
              spectrum: "hot",
              featured: true,
              emphasis: "subtle",
              wide: true,
              deltaPct: pctDelta(revCents, prevRevCents),
              priorValue: fmtMoney(prevRevCents),
              empty: revCents === 0 && !moneyFxIncomplete,
              emptyHint: moneyFxIncomplete
                ? "Some non-USD rows couldn't be converted (no historical FX rate available) and are excluded from this total."
                : "Total contract value shows up once a deal closes.",
              onClick: () => setSelected({ kind: "money", metric: "revenue" }),
            },
            {
              key: "cashCollectionRate",
              label: "Cash Collection Rate",
              value: cashRatePctNow == null ? "—" : `${cashRatePctNow.toFixed(1)}%`,
              spectrum: "hot",
              featured: true,
              deltaPct:
                cashRatePctNow != null && prevCashRatePctNow != null
                  ? pctDelta(cashRatePctNow, prevCashRatePctNow)
                  : undefined,
              empty: cashRatePctNow == null,
              emptyHint: "Requires revenue on at least one closed call.",
              onClick: () => setSelected({ kind: "money", metric: "cashRate" }),
            },
            {
              key: "avgContractValue",
              label: "Avg Contract Value",
              value: avgContractValueCents == null ? "—" : fmtMoney(avgContractValueCents),
              spectrum: "hot",
              featured: true,
              deltaPct:
                avgContractValueCents != null && prevAvgContractValueCents != null
                  ? pctDelta(avgContractValueCents, prevAvgContractValueCents)
                  : undefined,
              empty: avgContractValueCents == null,
              emptyHint: "Revenue ÷ closes — needs at least one close in range.",
              onClick: () => setSelected({ kind: "close", index: 3, metric: "avgContractValue" }),
            },
            {
              key: "closes",
              label: "Closes",
              value: fmtN0(closes),
              spectrum: "hot",
              featured: true,
              deltaPct: pctDelta(closes, prevClosed),
              priorValue: fmtN0(prevClosed),
              empty: closes === 0,
              emptyHint: "No closes yet this range — they'll show up here.",
              onClick: () => setSelected({ kind: "close", index: 3 }),
            },
            {
              // Priority 2 (disqualification tracking) — canonical source is
              // `calls.status === "disqualified"`, the closer's own EOD/Log
              // Call selection (Lead Status "Lost"/"Bad Fit"/"DQ" or the
              // status dropdown's "DQ"), same value the Post-call disposition
              // mix below already reports as "Not Qualified". Clicking opens
              // that exact same drilldown — one canonical event, one place
              // it's ever filtered or counted.
              key: "disqualified",
              label: "Disqualified Leads",
              value: fmtN0(dqCount),
              spectrum: "mid",
              deltaPct: pctDelta(dqCount, prevDqCount),
              priorValue: fmtN0(prevDqCount),
              invert: true,
              empty: dqCount === 0,
              emptyHint: "No disqualified leads logged yet this range.",
              // Rate denominator = calls that showed, not total leads — a
              // closer only disqualifies a call that actually happened
              // (spec: the denominator must reflect the stage being
              // measured, never a blind ÷ total leads).
              supportingOverride: showed
                ? `${((dqCount / showed) * 100).toFixed(1)}% of ${fmtN0(showed)} shows · ${fmtN0(prevDqCount)} prior`
                : undefined,
              onClick: () =>
                setSelected({
                  kind: "disposition",
                  source: "status",
                  value: "not_qualified",
                  label: "Disqualified Leads",
                }),
            },
            {
              key: "oncal",
              label: "Calls Booked",
              value: fmtN0(onCalendar),
              spectrum: "mid",
              deltaPct: pctDelta(onCalendar, prevOnCalendar),
              priorValue: fmtN0(prevOnCalendar),
              empty: onCalendar === 0,
              emptyHint: "Nothing on the calendar yet for this range.",
              onClick: () => setSelected({ kind: "close", index: 0 }),
            },
            {
              key: "showed",
              label: "Showed",
              value: fmtN0(showed),
              spectrum: "mid",
              emphasis: "subtle",
              deltaPct: pctDelta(showed, prevShowed),
              priorValue: fmtN0(prevShowed),
              empty: showed === 0,
              emptyHint: 'Mark a call as "Showed" when logging it to populate.',
              onClick: () => setSelected({ kind: "close", index: 1 }),
            },
            {
              key: "offers",
              label: "Offers Made",
              value: fmtN0(offers),
              spectrum: "mid",
              deltaPct: pctDelta(offers, prevOffers),
              priorValue: fmtN0(prevOffers),
              empty: offers === 0,
              emptyHint: 'Mark "Offer made" on a logged call to populate.',
              onClick: () => setSelected({ kind: "close", index: 2 }),
            },
          ];

          const showPct = onCalendar ? (showed / onCalendar) * 100 : null;
          const prevShowPct = prevOnCalendar ? (prevShowed / prevOnCalendar) * 100 : null;
          const offerPct = showed ? (offers / showed) * 100 : null;
          const prevOfferPct = prevShowed ? (prevOffers / prevShowed) * 100 : null;
          const offerToClosePct = offers ? (closes / offers) * 100 : null;
          const prevOfferToClosePct = prevOffers ? (prevClosed / prevOffers) * 100 : null;
          // Closes ÷ Showed — the sheet's "Average Close Rate." Distinct from
          // Offer → Close Rate: this skips the Offers stage entirely, so it
          // isn't an adjacent-stage conv% the funnel bars produce on their own.
          const closeRatePct = showed ? (closes / showed) * 100 : null;
          const prevCloseRatePct = prevShowed ? (prevClosed / prevShowed) * 100 : null;
          const cashRatePct = revCents ? (cashCents / revCents) * 100 : null;

          const closerChartFields: Record<
            string,
            { values: number[]; labels: string[]; variant: "line" | "bar" }
          > = {
            oncal: {
              values: heroSeries.map((point) => Number(point.booked ?? 0)),
              labels: heroSeries.map((point) => point.d),
              variant: "bar",
            },
            showed: {
              values: heroSeries.map((point) => Number(point.showed ?? 0)),
              labels: heroSeries.map((point) => point.d),
              variant: "bar",
            },
            offers: {
              values: heroSeries.map((point) => Number(point.offers ?? 0)),
              labels: heroSeries.map((point) => point.d),
              variant: "bar",
            },
            closes: {
              values: heroSeries.map((point) => Number(point.closed ?? 0)),
              labels: heroSeries.map((point) => point.d),
              variant: "bar",
            },
            cash: {
              values: moneySeries.map((point) => Number(point.cash ?? 0)),
              labels: moneySeries.map((point) => point.d),
              variant: "line",
            },
            revenue: {
              values: moneySeries.map((point) => Number(point.revenue ?? 0)),
              labels: moneySeries.map((point) => point.d),
              variant: "line",
            },
          };
          const chartedKpiItems = kpiItems.map((item) => {
            const chart = closerChartFields[item.key];
            return chart
              ? {
                  ...item,
                  spark: chart.values,
                  sparkLabels: chart.labels,
                  sparkVariant: chart.variant,
                }
              : item;
          });

          const rateCharts: RateChartSpec[] = [
            {
              key: "showrate",
              label: "Show Rate",
              points: seriesRatePoints(heroSeries, "showed", "booked"),
              currentPct: showPct,
              deltaPct: rateDelta(showPct, prevShowPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "close", index: 1, metric: "showRate" }),
            },
            {
              key: "offerrate",
              label: "Offer Rate",
              points: seriesRatePoints(heroSeries, "offers", "showed"),
              currentPct: offerPct,
              deltaPct: rateDelta(offerPct, prevOfferPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "close", index: 2, metric: "offerRate" }),
            },
            {
              key: "closerate",
              label: "Close Rate",
              points: seriesRatePoints(heroSeries, "closed", "showed"),
              currentPct: closeRatePct,
              deltaPct: rateDelta(closeRatePct, prevCloseRatePct),
              spectrum: "hot",
              onClick: () => setSelected({ kind: "close", index: 3, metric: "closeRate" }),
            },
            {
              key: "offertoclose",
              label: "Offer → Close Rate",
              points: seriesRatePoints(heroSeries, "closed", "offers"),
              currentPct: offerToClosePct,
              deltaPct: rateDelta(offerToClosePct, prevOfferToClosePct),
              spectrum: "hot",
              onClick: () => setSelected({ kind: "close", index: 3, metric: "offerToCloseRate" }),
            },
          ];

          const sectionHeader = (label: string) => (
            <div className="mt-6 mb-1 text-sm font-bold uppercase tracking-[0.16em] text-foreground first:mt-0">
              {label}
            </div>
          );

          return (
            <>
              {sectionHeader("A · Money & closing performance")}
              <KpiBand items={chartedKpiItems} title="Closer · Key Metrics" />
              <MoneyInstrument
                series={moneySeries}
                payoutPct={10}
                payoutCents={payoutCents}
                cashRatePct={cashRatePct}
                onCashClick={() => setSelected({ kind: "money", metric: "cash" })}
                fmtMoney={fmtMoney}
              />
              <FunnelInstrument
                title="Close"
                subtitle="Booked → Closed"
                stages={closeStages}
                onStageClick={(i) => setSelected({ kind: "close", index: i })}
              />
              <RateSmallMultiples charts={rateCharts} />

              {sectionHeader("B · Payment quality")}
              <KpiBand
                title="Payment quality"
                items={[
                  {
                    key: "avgCashBooked",
                    label: "Avg Cash / Booked",
                    value: fmtMoney(avgCashPerBooked),
                    spectrum: "mid",
                    empty: !avgCashPerBooked,
                    emptyHint: "No booked-call cash in this range.",
                    onClick: () =>
                      setSelected({ kind: "close", index: 0, metric: "avgCashPerBooked" }),
                  },
                  {
                    key: "avgCashShowed",
                    label: "Avg Cash / Showed",
                    value: fmtMoney(avgCashPerShowed),
                    spectrum: "mid",
                    empty: !avgCashPerShowed,
                    emptyHint: "No showed-call cash in this range.",
                    onClick: () =>
                      setSelected({ kind: "close", index: 1, metric: "avgCashPerShowed" }),
                  },
                  {
                    key: "avgCashClosed",
                    label: "Avg Cash / Closed",
                    value: fmtMoney(avgCashPerClosed),
                    spectrum: "hot",
                    empty: !avgCashPerClosed,
                    emptyHint: "No closed-call cash in this range.",
                    onClick: () =>
                      setSelected({ kind: "close", index: 3, metric: "avgCashPerClosed" }),
                  },
                  {
                    key: "deposits",
                    label: "Deposits",
                    value: depositCount.toLocaleString(),
                    spectrum: "hot",
                    empty: !depositCount,
                    emptyHint: "No deposits logged in this range.",
                    onClick: () => setSelected({ kind: "payment", metric: "deposits" }),
                  },
                  {
                    key: "depositAmount",
                    label: "Deposit Amount",
                    value: depositAmountCents ? fmtMoney(depositAmountCents) : "—",
                    spectrum: "hot",
                    empty: !depositAmountCents,
                    emptyHint: "No deposit amount logged in this range.",
                    onClick: () => setSelected({ kind: "payment", metric: "depositAmount" }),
                  },
                  {
                    key: "depositConversion",
                    label: "Deposit → Close",
                    value:
                      depositConversionPct == null ? "—" : `${depositConversionPct.toFixed(1)}%`,
                    spectrum: "hot",
                    empty: depositConversionPct == null,
                    emptyHint: "Requires a closed call and a logged deposit.",
                    onClick: () => setSelected({ kind: "payment", metric: "depositConversion" }),
                  },
                  {
                    key: "averageDepositPct",
                    label: "Avg Deposit %",
                    value: averageDepositPct == null ? "—" : `${averageDepositPct.toFixed(1)}%`,
                    spectrum: "mid",
                    empty: averageDepositPct == null,
                    emptyHint: "Requires deposit and contract values.",
                    onClick: () => setSelected({ kind: "payment", metric: "averageDepositPct" }),
                  },
                  {
                    key: "paymentPlanUptake",
                    label: "Payment Plan Uptake",
                    value: list.length
                      ? `${((paymentPlanCount / list.length) * 100).toFixed(1)}%`
                      : "—",
                    spectrum: "mid",
                    empty: !list.length,
                    emptyHint: "No calls in this date range.",
                    onClick: () => setSelected({ kind: "payment", metric: "paymentPlanUptake" }),
                  },
                  {
                    key: "onTimeRate",
                    // Renamed from "On-Time Payment Rate" — payments has no
                    // due_date column anywhere in the schema, so this can
                    // only ever measure paid-vs-not, never genuine timing.
                    label: "Payment Success Rate",
                    value:
                      paymentQualityStats.onTimeRatePct == null
                        ? "Unavailable"
                        : `${paymentQualityStats.onTimeRatePct.toFixed(1)}%`,
                    spectrum: "mid",
                    empty: paymentQualityStats.onTimeRatePct == null,
                    emptyHint:
                      paymentQualityStats.onTimeRatePct == null
                        ? "No payment records for these calls yet."
                        : "Share of payments that came through, not pending/failed — not a due-date timing measure.",
                    onClick: () => setSelected({ kind: "payment", metric: "onTimeRate" }),
                  },
                  {
                    key: "failedPaymentRate",
                    label: "Failed / Default Rate",
                    value:
                      paymentQualityStats.failedRatePct == null
                        ? "Unavailable"
                        : `${paymentQualityStats.failedRatePct.toFixed(1)}%`,
                    spectrum: "hot",
                    empty: paymentQualityStats.failedRatePct == null,
                    emptyHint: "No payment records for these calls yet.",
                    onClick: () => setSelected({ kind: "payment", metric: "failedPaymentRate" }),
                  },
                  {
                    key: "failedPaymentCount",
                    label: "Failed Payments",
                    value: fmtN0(paymentQualityStats.failedCount),
                    spectrum: "hot",
                    empty: paymentQualityStats.total === 0,
                    emptyHint: "No payment records for these calls yet.",
                    onClick: () => setSelected({ kind: "payment", metric: "failedPaymentCount" }),
                  },
                  {
                    key: "recoveredFailedPayments",
                    label: "Recovered Failed Payments (inferred)",
                    value: fmtN0(paymentQualityStats.recoveredFailedCount),
                    spectrum: "mid",
                    empty: paymentQualityStats.failedCount === 0,
                    emptyHint:
                      paymentQualityStats.failedCount === 0
                        ? "No failed payments in this range."
                        : "Inferred from a later successful payment on the same call — not a direct retry record.",
                    onClick: () =>
                      setSelected({ kind: "payment", metric: "recoveredFailedPayments" }),
                  },
                  {
                    key: "depositToFullPayment",
                    label: "Deposit → Full Payment",
                    value:
                      paymentQualityStats.depositToFullPaymentPct == null
                        ? "Unavailable"
                        : `${paymentQualityStats.depositToFullPaymentPct.toFixed(1)}%`,
                    spectrum: "hot",
                    empty: paymentQualityStats.depositToFullPaymentPct == null,
                    emptyHint: paymentQualityStats.hasReliableCallLinkage
                      ? "Requires a deposit and payment records for these calls."
                      : "Not connected — no payment has ever been linked to a call yet (processor webhooks record payments, but not which call produced them).",
                    onClick: () => setSelected({ kind: "payment", metric: "depositToFullPayment" }),
                  },
                  {
                    key: "futureScheduledCash",
                    label: "Future Scheduled Cash",
                    value:
                      paymentQualityStats.futureScheduledCents == null
                        ? "Unavailable"
                        : fmtMoney(paymentQualityStats.futureScheduledCents),
                    spectrum: "mid",
                    empty:
                      paymentQualityStats.futureScheduledCents == null ||
                      paymentQualityStats.futureScheduledCents === 0,
                    emptyHint: paymentQualityStats.hasReliableCallLinkage
                      ? "No outstanding payment-plan balance in this range."
                      : "Not connected — no payment has ever been linked to a call yet, so remaining balance can't be calculated. This is NOT the same as $0 collected.",
                    onClick: () => setSelected({ kind: "payment", metric: "futureScheduledCash" }),
                  },
                  {
                    // Pulled out of the old catch-all "Secondary stats"
                    // section — this is deal-quality/revenue information, so
                    // it lives with the rest of payment quality, not a
                    // generic leftover bucket. Not duplicated anywhere else.
                    key: "downsells",
                    label: "Downsells",
                    value: downsells.toLocaleString(),
                    spectrum: "mid",
                    empty: !downsells,
                    emptyHint: "No downsells logged in this range.",
                  },
                ]}
              />

              {sectionHeader("C · No-show recovery")}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  disabled={noShowRecovery.noShowCount === 0}
                  onClick={() => setSelected({ kind: "noshow", index: 0 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-card"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    No-shows in range
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {noShowRecovery.noShowCount}
                  </div>
                </button>
                <button
                  type="button"
                  disabled={noShowRecovery.rebookedCount === 0}
                  onClick={() => setSelected({ kind: "noshow", index: 3 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-card"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    No-shows Rebooked
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {noShowRecovery.rebookedCount}
                  </div>
                  <div className="mt-1 text-3xs text-muted-foreground">
                    A follow-up call was logged — not yet counted as recovered
                  </div>
                </button>
                <button
                  type="button"
                  disabled={noShowRecovery.noShowCount === 0}
                  onClick={() => setSelected({ kind: "noshow", index: 1 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-card"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Recovered Show Rate
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {noShowRecovery.recoveredShowRate == null
                      ? "—"
                      : `${noShowRecovery.recoveredShowRate.toFixed(0)}%`}
                  </div>
                  <div className="mt-1 text-3xs text-muted-foreground">
                    Rescheduled and re-attended after a no-show
                  </div>
                </button>
                <button
                  type="button"
                  disabled={noShowRecovery.recovered.length === 0}
                  onClick={() => setSelected({ kind: "noshow", index: 2 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-card"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Recovered Close Rate
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {noShowRecovery.recoveredCloseRate == null
                      ? "—"
                      : `${noShowRecovery.recoveredCloseRate.toFixed(0)}%`}
                  </div>
                </button>
              </div>

              {sectionHeader("D · Call quality & coaching")}
              <KpiBand
                title="Call quality"
                items={[
                  {
                    key: "avgCallDuration",
                    label: "Average Call Duration",
                    value:
                      avgCallDurationSeconds == null
                        ? "Not logged"
                        : `${Math.round(avgCallDurationSeconds / 60)}m`,
                    spectrum: "cold",
                    empty: avgCallDurationSeconds == null,
                    emptyHint: "No call-length data logged in this range.",
                  },
                  {
                    key: "avgTalkTime",
                    label: "Average Talk Time",
                    value:
                      avgTalkSeconds == null ? "Not logged" : `${Math.round(avgTalkSeconds / 60)}m`,
                    spectrum: "cold",
                    empty: avgTalkSeconds == null,
                    emptyHint: "No talk-time data logged in this range.",
                  },
                  {
                    key: "talkListenRatio",
                    label: "Talk / Listen Ratio",
                    value:
                      avgTalkListenRatioPct == null
                        ? "Not logged"
                        : `${Math.round(avgTalkListenRatioPct)}% talk`,
                    spectrum: "mid",
                    empty: avgTalkListenRatioPct == null,
                    emptyHint: "Needs both call length and talk time on the same call.",
                  },
                ]}
              />
              <KpiBand
                title="Coaching"
                items={[
                  {
                    key: "callsReviewed",
                    label: "Calls Reviewed",
                    value: coachingReviewCount.toLocaleString(),
                    spectrum: "hot",
                    empty: coachingReviewCount === 0,
                    emptyHint: "No coaching reviews logged in this range.",
                    // The real reviewed-call records are already rendered
                    // unconditionally in CoachingPanel just below — jump
                    // there instead of opening a second panel that would
                    // just duplicate the same rows.
                    onClick: () =>
                      document
                        .getElementById("coaching-panel")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  },
                ]}
              />
              <div id="coaching-panel">
                <CoachingPanel orgId={orgId} range={range} />
              </div>

              {sectionHeader("E · Pipeline & team visibility")}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setSelected({ kind: "pipeline", index: 0 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/20"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Deals Expected to Close · {formatRangeLabel(range)}
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {dealsExpectedToClose.length}
                  </div>
                </button>
                <div className="rounded-lg border border-border/70 bg-card p-3">
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Active Follow-ups
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold">
                    {activeFollowUpsCount}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected({ kind: "pipeline", index: 1 })}
                  className="rounded-lg border border-border/70 bg-card p-3 text-left transition hover:border-destructive/50 hover:bg-muted/20"
                >
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Overdue Follow-ups
                  </div>
                  <div className="mt-1 font-sans tabular-nums text-lg font-semibold text-destructive">
                    {overdueFollowUps.length}
                  </div>
                </button>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Post-call disposition mix</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Canonical taxonomy from recorded call status and offer fields
                    </div>
                  </div>
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                    {list.length} calls
                  </span>
                </div>
                {list.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {dispositionMix.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        disabled={item.count === 0}
                        onClick={() =>
                          setSelected({
                            kind: "disposition",
                            source: "status",
                            value: item.value,
                            label: item.label,
                          })
                        }
                        className="rounded-lg border border-border/70 bg-background/40 p-3 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-background/40"
                      >
                        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-1 font-sans tabular-nums text-xl font-semibold">
                          {item.count}
                        </div>
                        <div className="mt-1 text-3xs text-muted-foreground">
                          {pct(item.count, list.length)} of calls
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No post-call dispositions in this date range.
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">Closer-logged disposition mix</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      The closer's own reason for the outcome — not inferred from status
                    </div>
                  </div>
                </div>
                {manualDispositionMix.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {manualDispositionMix.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        disabled={item.count === 0}
                        onClick={() =>
                          setSelected({
                            kind: "disposition",
                            source: "manual",
                            value: item.value,
                            label: item.label,
                          })
                        }
                        className={`text-left transition hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background/20 rounded-lg border p-3 ${item.value === "not_logged" ? "border-dashed border-border/50 bg-background/20" : "border-border/70 bg-background/40"}`}
                      >
                        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-1 font-sans tabular-nums text-xl font-semibold">
                          {item.count}
                        </div>
                        <div className="mt-1 text-3xs text-muted-foreground">
                          {pct(item.count, list.length)} of calls
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No calls in this date range.
                  </div>
                )}
              </div>
              <GlassTableShell
                toolbar={
                  <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Follow-up pipeline · {followUps.length} calls awaiting next touch
                  </div>
                }
                maxHeight="420px"
              >
                <table className="w-full text-sm">
                  <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Closer</th>
                      <th className="text-left p-3">Lead</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-left p-3">Follow-up date</th>
                      <th className="text-left p-3">Reason</th>
                      <th className="text-left p-3">Summary</th>
                      <th className="text-right p-3 font-sans tabular-nums">Pitched $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {followUps.map((c) => {
                      // requested_followup_at when the closer captured one
                      // (Follow-Up Details step) — never scheduled_for (the
                      // original call date) substituted in its place, only
                      // used as a fallback for follow-up records logged
                      // before this field existed.
                      const dueRaw = requestedFollowUpDate(c);
                      const dueDate = dueRaw ? new Date(dueRaw) : null;
                      const daysDiff = dueDate
                        ? Math.floor((dueDate.getTime() - Date.now()) / 86400e3)
                        : null;
                      const typeLabel = followUpTypeLabel(c.eod_lead_status);
                      const reasonLabel = c.followup_reason
                        ? objectionCategoryLabel(c.followup_reason)
                        : null;
                      const reasonTitle =
                        c.followup_reason === OTHER_OBJECTION_VALUE && c.followup_reason_other
                          ? c.followup_reason_other
                          : undefined;
                      const pitchedCents =
                        c.followup_amount_pitched_cents ?? c.contract_value_cents;
                      return (
                        <tr key={c.id} className="border-t border-border/70 hover:bg-muted/20">
                          <td className="p-3 font-medium">{c.closer_name || "—"}</td>
                          <td className="p-3 text-xs">
                            {c.lead_email || c.leads?.full_name || "—"}
                          </td>
                          <td className="p-3 text-xs">
                            {typeLabel ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-3xs uppercase tracking-wide ${CHIP_TONE_CLASSES.default}`}
                              >
                                {typeLabel}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="p-3 text-xs">
                            {dueDate ? dueDate.toLocaleDateString() : "—"}
                            {daysDiff !== null && (
                              <span
                                className={`ml-2 rounded px-1.5 py-0.5 text-3xs ${
                                  daysDiff < 0
                                    ? CHIP_TONE_CLASSES.destructive
                                    : daysDiff === 0
                                      ? CHIP_TONE_CLASSES.warning
                                      : CHIP_TONE_CLASSES.default
                                }`}
                              >
                                {daysDiff < 0
                                  ? `${Math.abs(daysDiff)}d overdue`
                                  : daysDiff === 0
                                    ? "Due today"
                                    : `in ${daysDiff}d`}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-xs" title={reasonTitle}>
                            {reasonLabel ?? "—"}
                          </td>
                          <td className="p-3 text-xs text-muted-foreground max-w-[280px] truncate">
                            {c.call_summary || "—"}
                            {c.followup_notes && (
                              <span className="block truncate text-3xs italic">
                                {c.followup_notes}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-right font-sans tabular-nums">
                            {pitchedCents ? "$" + (pitchedCents / 100).toLocaleString() : "—"}
                          </td>
                        </tr>
                      );
                    })}
                    {followUps.length === 0 && (
                      <tr>
                        <td colSpan={7}>
                          <EmptyState
                            icon={<Clock3 className="h-4 w-4" />}
                            title="No follow-ups pending"
                            description='Tag calls as "Follow Up" to surface them here.'
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </GlassTableShell>
              <div className="grid gap-4 lg:grid-cols-2">
                <RepLeaderboard
                  titlePrefix="Closer leaderboard"
                  metrics={closerMetrics}
                  metricKey={lbMetric}
                  onMetricChange={setLbMetric}
                  people={lbPeople}
                  emptyLabel={
                    demoMode
                      ? "Demo data not connected for this leaderboard."
                      : "No closers in range."
                  }
                  dateRange={lbRange}
                  onDateRangeChange={setLbOverride}
                  overridden={!!lbOverride}
                  onResetRange={() => setLbOverride(null)}
                />
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-3">
                    <ActivityIcon className="h-3.5 w-3.5 text-accent" /> Rep activity heatmap ·
                    calls by weekday
                  </div>
                  <HeatmapGrid
                    rowLabels={activityHeatmap.rows}
                    colLabels={activityHeatmap.cols}
                    data={activityHeatmap.data}
                    valueFmt={(v) => `${v} calls`}
                    variant="spectrum"
                  />
                </div>
              </div>
              <GlassTableShell
                toolbar={
                  <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Closer scorecard
                  </div>
                }
                maxHeight="420px"
              >
                <table className="w-full text-sm">
                  <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Closer</th>
                      <th className="text-right p-3 font-sans tabular-nums">Booked</th>
                      <th className="text-right p-3 font-sans tabular-nums">Showed</th>
                      <th className="text-right p-3 font-sans tabular-nums">Closes</th>
                      <th className="text-right p-3 font-sans tabular-nums">Show %</th>
                      <th className="text-right p-3 font-sans tabular-nums">Close %</th>
                      <th className="text-right p-3 font-sans tabular-nums">Offer→Close</th>
                      <th className="text-right p-3 font-sans tabular-nums">Avg deal</th>
                      <th className="text-right p-3 font-sans tabular-nums">Cash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scorecard.map((s) => (
                      <tr key={s.name} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3 font-medium">{s.name}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.booked}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.showed}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.closes}</td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.showRate === null ? "—" : `${s.showRate.toFixed(1)}%`}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.closeRate === null ? "—" : `${s.closeRate.toFixed(1)}%`}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.offerToClose === null ? "—" : `${s.offerToClose.toFixed(1)}%`}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.avgDeal ? fmtMoney(s.avgDeal) : "—"}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums text-[color:var(--color-success)]">
                          {fmtMoney(s.cash)}
                        </td>
                      </tr>
                    ))}
                    {scorecard.length === 0 && (
                      <tr>
                        <td colSpan={9}>
                          <EmptyState
                            icon={<Trophy className="h-4 w-4" />}
                            title="No closers in range"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </GlassTableShell>

              {sectionHeader("F · Attribution")}
              <GlassTableShell
                toolbar={
                  <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                    Revenue Source Mix
                  </div>
                }
              >
                <table className="w-full text-sm">
                  <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left p-3">Source</th>
                      <th className="text-right p-3 font-sans tabular-nums">Shows</th>
                      <th className="text-right p-3 font-sans tabular-nums">Qualified Opps</th>
                      <th className="text-right p-3 font-sans tabular-nums">Offers</th>
                      <th className="text-right p-3 font-sans tabular-nums">Closes</th>
                      <th className="text-right p-3 font-sans tabular-nums">Close Rate</th>
                      <th className="text-right p-3 font-sans tabular-nums">Contracted Revenue</th>
                      <th className="text-right p-3 font-sans tabular-nums">Cash Collected</th>
                      <th className="text-right p-3 font-sans tabular-nums">Collection Rate</th>
                      <th className="text-right p-3 font-sans tabular-nums">Refund/Default Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueSourceMix.map((s) => (
                      <tr key={s.label} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3 font-medium">{s.label}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.shows}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.qualified}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.offers}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{s.closes}</td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.closeRatePct == null ? "—" : `${s.closeRatePct.toFixed(1)}%`}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {fmtMoney(s.contractedCents)}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums text-[color:var(--color-success)]">
                          {fmtMoney(s.cashCollectedCents)}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
                          {s.collectionRatePct == null ? "—" : `${s.collectionRatePct.toFixed(1)}%`}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums text-muted-foreground">
                          Not tracked
                        </td>
                      </tr>
                    ))}
                    {revenueSourceMix.length === 0 && (
                      <tr>
                        <td colSpan={10}>
                          <EmptyState
                            icon={<Trophy className="h-4 w-4" />}
                            title="No attributed sources in range"
                          />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </GlassTableShell>
              <div className="mt-2">
                <Link
                  to="/attribution"
                  search={{
                    ...(platformFilter !== "all" ? { platform: platformFilter } : {}),
                    ...(member !== ALL_MEMBERS ? { closerId: member } : {}),
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  View Full Attribution →
                </Link>
              </div>

              {panel && (
                <MetricDetailPanel
                  open={!!selected}
                  onOpenChange={(v) => !v && setSelected(null)}
                  title={panel.title}
                  subtitle={`${range.from} → ${range.to}`}
                  columns={panel.columns}
                  rows={panel.rows}
                  rowKey={(c) => c.id}
                  cap={panel.cap}
                  working={panel.working}
                  emptyRowsLabel="No calls in this date range."
                />
              )}
            </>
          );
        })()}

        <Tabs defaultValue="objections">
          <TabsList>
            <TabsTrigger value="objections">Objection frequency</TabsTrigger>
            <TabsTrigger value="ttc">Time-to-close trend</TabsTrigger>
            <TabsTrigger value="scorecard">Scorecard</TabsTrigger>
          </TabsList>

          <TabsContent value="objections">
            <ObjectionInstrument
              title="Most-logged objections · what's stopping closes"
              entries={objectionEntries}
              totalLogged={
                devBypass
                  ? objectionEntries.reduce((s, e) => s + e.count, 0)
                  : (objections?.length ?? 0)
              }
              resolvedTracked
              faqVideos={faqVideos}
              emptyLabel="No objections logged yet. Add them when logging calls (comma-separated) to feed content + script strategy."
            />
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-sm font-semibold">By call stage</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Where in the call the objection came up
                </div>
                <div className="mt-3 space-y-1.5">
                  {OBJECTION_STAGE_OPTIONS.map((s) => {
                    const count = (objections ?? []).filter((o) => o.call_stage === s.value).length;
                    if (!count) return null;
                    return (
                      <div key={s.value} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-sans tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                  {(objections ?? []).every((o) => !o.call_stage) && (
                    <div className="text-xs text-muted-foreground">
                      No call-stage data logged yet.
                    </div>
                  )}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="text-sm font-semibold">By category</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Multi-choice objection type
                </div>
                <div className="mt-3 space-y-1.5">
                  {OBJECTION_CATEGORY_OPTIONS.map((c) => {
                    // Rolls legacy category values (e.g. "price" — retired
                    // when the taxonomy synced to "money") into their
                    // canonical bucket, so historical rows still count
                    // toward a real total instead of vanishing.
                    const count = (objections ?? []).filter(
                      (o) => objectionCategoryBucket(o.category) === c.value,
                    ).length;
                    if (!count) return null;
                    return (
                      <div key={c.value} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="font-sans tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                  {(objections ?? []).every((o) => !o.category) && (
                    <div className="text-xs text-muted-foreground">
                      No category data logged yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="ttc">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2">
                <div className="text-sm font-semibold">
                  Time-to-close trend (avg minutes per call)
                </div>
                <div className="text-xs text-muted-foreground">
                  Shorter ≠ better. Watch for spikes when scripts/offers change.
                </div>
              </div>
              {ttcTrend.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  Log time-to-close on each call to see the trend.
                </div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ttcTrend} margin={{ left: 8, right: 16, top: 8 }}>
                      <CartesianGrid stroke="var(--border)" />
                      <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                      <Tooltip content={<ChartTooltip />} />
                      <Line
                        type="monotone"
                        dataKey="avgMin"
                        stroke="var(--chart-2)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Closer Scorecard — mirrors src/components/activity-module.tsx's
              Setter Scorecard tab (same RadarChart config, same normalized
              0-100 axes, same up-to-5-reps legend, same detail table right
              underneath), adapted to the closer funnel: Show → Qual → Offer
              → Close instead of Sets/Show/Close/Qual. */}
          <TabsContent value="scorecard">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">
                  Closer scorecard · Close Rate / Cash Collected / Revenue / Offer→Close / Calls on
                  Calendar / Closes
                </div>
                <div className="text-xs text-muted-foreground">
                  Normalized 0–100. Close Rate and Offer → Close Rate are real percentages already
                  on that scale; Cash Collected, Revenue Generated, Calls on Calendar, and # of
                  Closes are scaled relative to the top closer in range (same method the Setter
                  Scorecard uses for Sets) since dollars and counts can't be compared directly
                  against percentages. Hover a point for the real underlying value.
                </div>
              </div>
              {closerRadar.names.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No booked calls in this date range yet.
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={closerRadar.rows}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis
                        dataKey="axis"
                        stroke="var(--muted-foreground)"
                        fontSize={11}
                      />
                      <PolarRadiusAxis
                        stroke="var(--muted-foreground)"
                        fontSize={9}
                        angle={30}
                        domain={[0, 100]}
                      />
                      {closerRadar.names.slice(0, 5).map((name, i) => (
                        <Radar
                          key={name}
                          name={name}
                          dataKey={name}
                          stroke={CLOSER_RADAR_COLORS[i]}
                          fill={CLOSER_RADAR_COLORS[i]}
                          fillOpacity={0.25}
                        />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip content={<ClosingRadarTooltip />} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="mt-4" id="closer-scorecard-input" />
            <GlassTableShell
              toolbar={
                <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Closer Scorecard Input · {scorecardTableTotal} rows
                </div>
              }
              footer={
                scorecardTableTotal > 0 ? (
                  <Pagination
                    page={scorecardTablePage}
                    pageCount={scorecardTablePageCount}
                    onPage={setScorecardTablePage}
                    total={scorecardTableTotal}
                    pageSize={25}
                  />
                ) : undefined
              }
            >
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-2.5">Closer</th>
                    <th className="text-left p-2.5">Date</th>
                    <th className="text-left p-2.5">Source</th>
                    <th className="text-center p-2.5">Showed</th>
                    <th className="text-center p-2.5">Offer</th>
                    <th className="text-center p-2.5">Closed</th>
                    <th className="text-center p-2.5">Recovered</th>
                    <th className="text-right p-2.5 font-sans tabular-nums">Cash</th>
                    <th className="text-right p-2.5 font-sans tabular-nums">Revenue</th>
                    <th className="text-right p-2.5 font-sans tabular-nums">Deposit</th>
                    <th className="text-left p-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedScorecardCalls.map((c) => (
                    <tr key={c.id} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-2.5 font-medium">{c.closer_name || "—"}</td>
                      <td className="p-2.5 text-xs text-muted-foreground">
                        {c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—"}
                      </td>
                      <td className="p-2.5 text-xs">{c.source_platform || "—"}</td>
                      <td className="p-2.5 text-center font-mono text-xs">
                        {c.showed ? "TRUE" : "FALSE"}
                      </td>
                      <td className="p-2.5 text-center font-mono text-xs">
                        {c.offer_made ? "TRUE" : "FALSE"}
                      </td>
                      <td className="p-2.5 text-center font-mono text-xs">
                        {c.closed || c.status === "closed" ? "TRUE" : "FALSE"}
                      </td>
                      <td className="p-2.5 text-center font-mono text-xs">
                        {c.recovered_from_call_id ? "TRUE" : "FALSE"}
                      </td>
                      <td className="p-2.5 text-right font-sans tabular-nums text-[color:var(--color-success)]">
                        {c.cash_collected_cents
                          ? "$" + (c.cash_collected_cents / 100).toLocaleString()
                          : "—"}
                      </td>
                      <td className="p-2.5 text-right font-sans tabular-nums">
                        {c.contract_value_cents
                          ? "$" + (c.contract_value_cents / 100).toLocaleString()
                          : "—"}
                      </td>
                      <td className="p-2.5 text-right font-sans tabular-nums">
                        {c.deposit_cents ? "$" + (c.deposit_cents / 100).toLocaleString() : "—"}
                      </td>
                      <td className="p-2.5 text-xs text-muted-foreground max-w-[240px] truncate">
                        {c.call_summary || "—"}
                      </td>
                    </tr>
                  ))}
                  {scorecardTableTotal === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState
                          icon={<PhoneCall className="h-4 w-4" />}
                          title="No calls in this date range"
                          description="Log your first call."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>
        </Tabs>

        {/* Closer Input Log */}
        <div id="closer-input-log" />
        <GlassTableShell
          toolbar={
            <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
              Closer Input · {callsTotal} calls
            </div>
          }
          footer={
            callsTotal > 0 ? (
              <Pagination
                page={callsPage}
                pageCount={callsPageCount}
                onPage={setCallsPage}
                total={callsTotal}
                pageSize={callsPageSize}
              />
            ) : undefined
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Closer Name</th>
                <th className="text-left p-2.5">Date Of Call</th>
                <th className="text-left p-2.5">Lead Email</th>
                <th className="text-left p-2.5">Call Summary</th>
                <th className="text-center p-2.5">Offer</th>
                <th className="text-left p-2.5">Lead Status</th>
                <th className="text-right p-2.5 font-sans tabular-nums">Cash Collected</th>
                <th className="text-right p-2.5 font-sans tabular-nums">Total Revenue</th>
                <th className="text-left p-2.5">Call Recording</th>
              </tr>
            </thead>
            <tbody>
              {pagedCalls.map((c) => (
                <tr key={c.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-2.5 font-medium">{c.closer_name || "—"}</td>
                  <td className="p-2.5 text-xs text-muted-foreground">
                    {c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-2.5 text-xs">{c.lead_email || c.leads?.email || "—"}</td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[280px] truncate">
                    {c.call_summary || "—"}
                  </td>
                  <td className="p-2.5 text-center font-mono">{c.offer_made ? "TRUE" : "FALSE"}</td>
                  <td className="p-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-3xs uppercase tracking-wide ${CHIP_TONE_CLASSES[STATUS_TONE_KEY[c.status] ?? "default"]}`}
                    >
                      {STATUS_LABEL[c.status] ??
                        normalizeCloserDisposition(c.status, c.closed, c.offer_made)}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-sans tabular-nums text-[color:var(--color-success)]">
                    {c.cash_collected_cents
                      ? "$" + (c.cash_collected_cents / 100).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-2.5 text-right font-sans tabular-nums">
                    {c.contract_value_cents
                      ? "$" + (c.contract_value_cents / 100).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-2.5 text-xs">
                    {c.recording_url ? (
                      <a
                        className="text-primary hover:underline"
                        href={c.recording_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {callsTotal === 0 && (
                <tr>
                  <td colSpan={9}>
                    <EmptyState
                      icon={<PhoneCall className="h-4 w-4" />}
                      title="No calls in this date range"
                      description="Log your first call."
                    />
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

/** Sales activity coaching (spec section 5) — real coaching-review records
 * tied to a rep/call, plus recurring-gap counts aggregated honestly from the
 * gap_category the reviewer actually picked (never inferred from free text). */
function CoachingPanel({ orgId, range }: { orgId: string | undefined; range: DateRange }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: reviews = [] } = useQuery({
    queryKey: ["coaching-reviews", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_coaching_reviews")
        .select(
          "id, call_id, rep_name, reviewer_name, what_learned, what_went_wrong, behavior_change, gap_category, created_at",
        )
        .eq("org_id", orgId!)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent calls to review against — optional linkage only (spec section 7:
  // "connect the selected objection(s) to the call-review/coaching record
  // when the underlying data supports it"). call_coaching_reviews.call_id
  // has existed since the table was created but nothing wrote it, so this
  // is what makes that connection real going forward without touching any
  // existing review's data.
  const { data: reviewableCalls = [] } = useQuery({
    queryKey: ["coaching-reviewable-calls", orgId, range.from, range.to],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("id, closer_name, lead_email, scheduled_for")
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`)
        .order("scheduled_for", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Objections for whichever reviewed calls actually have one logged —
  // batched by the distinct call_ids already on these reviews, not a
  // per-row query. Reviews with no call_id (the vast majority today, since
  // linking is brand new) simply show nothing here, same as before.
  const reviewedCallIds = useMemo(
    () => Array.from(new Set(reviews.map((r) => r.call_id).filter((id): id is string => !!id))),
    [reviews],
  );
  const { data: reviewedCallObjections = [] } = useQuery({
    queryKey: ["coaching-review-objections", orgId, reviewedCallIds.join(",")],
    enabled: !!orgId && reviewedCallIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_objections")
        .select("call_id, objection, category")
        .in("call_id", reviewedCallIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const objectionsByCallId = useMemo(() => {
    const m = new Map<string, { objection: string; category: string | null }[]>();
    for (const o of reviewedCallObjections) {
      if (!o.call_id) continue;
      const arr = m.get(o.call_id) ?? [];
      arr.push({ objection: o.objection, category: o.category });
      m.set(o.call_id, arr);
    }
    return m;
  }, [reviewedCallObjections]);

  const recurringGaps = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of reviews) {
      if (!r.gap_category) continue;
      counts.set(r.gap_category, (counts.get(r.gap_category) ?? 0) + 1);
    }
    return GAP_CATEGORY_OPTIONS.map((g) => ({ ...g, count: counts.get(g.value) ?? 0 }))
      .filter((g) => g.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [reviews]);

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("call_coaching_reviews").insert({
        org_id: orgId!,
        call_id: String(f.get("call_id") || "") || null,
        rep_name: String(f.get("rep_name") || ""),
        reviewer_name: String(f.get("reviewer_name") || "") || null,
        what_learned: String(f.get("what_learned") || "") || null,
        what_went_wrong: String(f.get("what_went_wrong") || "") || null,
        behavior_change: String(f.get("behavior_change") || ""),
        gap_category: (f.get("gap_category") as string) || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Coaching review logged");
      qc.invalidateQueries({ queryKey: ["coaching-reviews", orgId] });
      qc.invalidateQueries({ queryKey: ["coaching-review-count", orgId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Coaching reviews</div>
          <div className="mt-1 text-xs text-muted-foreground">
            One record per reviewed call — what the rep learned, what to fix, the specific behavior
            change
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-3.5 w-3.5" /> Log review
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Log a coaching review</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label>Call reviewed (optional)</Label>
                <Select name="call_id">
                  <SelectTrigger>
                    <SelectValue placeholder="Link this review to a specific call" />
                  </SelectTrigger>
                  <SelectContent>
                    {reviewableCalls.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.lead_email ?? "Unknown lead") +
                          (c.scheduled_for
                            ? ` · ${new Date(c.scheduled_for).toLocaleDateString()}`
                            : "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-2xs text-muted-foreground">
                  Optional — link a call to show its objection(s) and outcome alongside this review.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rep</Label>
                  <TeamMemberPicker role="closer" name="rep_name" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Reviewer (optional)</Label>
                  <Input name="reviewer_name" placeholder="Who reviewed this call" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Recurring gap category</Label>
                <Select name="gap_category">
                  <SelectTrigger>
                    <SelectValue placeholder="What kind of gap is this?" />
                  </SelectTrigger>
                  <SelectContent>
                    {GAP_CATEGORY_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>What the rep learned</Label>
                <Textarea name="what_learned" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>What went wrong / could improve</Label>
                <Textarea name="what_went_wrong" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label>Specific behavior they'll change going forward</Label>
                <Textarea name="behavior_change" rows={2} required />
              </div>
              <Button type="submit" className="w-full" disabled={create.isPending}>
                {create.isPending ? "…" : "Log review"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {recurringGaps.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {recurringGaps.map((g) => (
            <div key={g.value} className="rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                {g.label}
              </div>
              <div className="mt-1 font-sans tabular-nums text-xl font-semibold">{g.count}</div>
              <div className="mt-1 text-3xs text-muted-foreground">recurring gap · this range</div>
            </div>
          ))}
        </div>
      )}
      {reviews.length ? (
        <div className="divide-y divide-border/60">
          {reviews.slice(0, 10).map((r) => (
            <div key={r.id} className="py-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.rep_name}</span>
                <span className="text-3xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.reviewer_name ? ` · reviewed by ${r.reviewer_name}` : ""}
                </span>
              </div>
              {r.gap_category && (
                <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground">
                  {GAP_CATEGORY_OPTIONS.find((g) => g.value === r.gap_category)?.label ??
                    r.gap_category}
                </span>
              )}
              {r.call_id && (objectionsByCallId.get(r.call_id)?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="text-3xs text-muted-foreground">Objection(s):</span>
                  {objectionsByCallId.get(r.call_id)!.map((o, i) => (
                    <span
                      key={i}
                      className="rounded bg-spectrum-hot/10 px-1.5 py-0.5 text-3xs text-spectrum-hot"
                    >
                      {o.objection}
                    </span>
                  ))}
                </div>
              )}
              {r.what_learned && (
                <p className="mt-1 text-muted-foreground">
                  <span className="font-medium text-foreground">Learned:</span> {r.what_learned}
                </p>
              )}
              <p className="mt-1 text-muted-foreground">
                <span className="font-medium text-foreground">Will change:</span>{" "}
                {r.behavior_change}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          No coaching reviews logged in this range.
        </div>
      )}
    </div>
  );
}
