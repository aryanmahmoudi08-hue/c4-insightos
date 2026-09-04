import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { useServerFn } from "@tanstack/react-start";
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
import { Plus, Trophy, Activity as ActivityIcon, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { AttributionPathPanel, type AttributionPath } from "@/components/attribution-path-panel";
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
} from "@/lib/trend";
import { clusterObjectionsFn } from "@/lib/objection-clustering.functions";
import { applyObjectionClusters } from "@/lib/objection-clustering";
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
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { PlatformIcon } from "@/components/platform-icon";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { Clock3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closer")({ component: Closer });

const fmtMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%");
const fmtN0 = (n: number) => Math.round(n).toLocaleString();
const CLOSER_SOURCES = ["Instagram Spiderweb", "Keyword", "Inbound", "Referral", "Ads", "Other"];

interface CloserLbPerson {
  name: string;
  cash: number;
  closes: number;
  closeRate: number;
  showRate: number;
  offers: number;
  avgCashCall: number;
  deposits: number;
}

// Part C3 — exact per-role metric option list for Closer's leaderboard selector.
const CLOSER_METRICS: RepMetricOption<CloserLbPerson>[] = [
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => fmtMoney(p.cash),
    secondary: (p) => `${p.closeRate.toFixed(0)}% close`,
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
    primary: (p) => `${p.closeRate.toFixed(0)}%`,
    secondary: (p) => `${p.closes} closes`,
    rankBy: (p) => p.closeRate,
  },
  {
    key: "showRate",
    label: "Show Rate",
    spectrum: "mid",
    primary: (p) => `${p.showRate.toFixed(0)}%`,
    secondary: (p) => `${p.offers} offers`,
    rankBy: (p) => p.showRate,
  },
  {
    key: "offers",
    label: "Offers Made",
    spectrum: "mid",
    primary: (p) => `${p.offers} offers`,
    secondary: (p) => `${p.closeRate.toFixed(0)}% close`,
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
    secondary: (p) => `${p.closeRate.toFixed(0)}% close`,
    rankBy: (p) => p.deposits,
  },
];

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
  { value: "partner_spouse", label: "Partner / Spouse" },
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

const OBJECTION_CATEGORY_OPTIONS = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "trust", label: "Trust" },
  { value: "partner_spouse", label: "Partner / Spouse" },
  { value: "competitor", label: "Competitor" },
  { value: "product_fit", label: "Product Fit" },
  { value: "no_need", label: "No Need" },
  { value: "unqualified", label: "Unqualified" },
  { value: "other", label: "Other" },
] as const;

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

function Closer() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{ kind: "close" | "money"; index: number } | null>(null);

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
    if (actionSearch.action === "log-call") {
      setOpen(true);
      paletteNav({ search: {} as never, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSearch.action]);
  const { range } = useDateRange();
  const [member, setMember] = useState<string>(ALL_MEMBERS);
  const [platformFilter, setPlatformFilter] = useState("all");
  // Part C3 — leaderboard's own metric selector + independent date range,
  // defaulting to inherit the page range until explicitly overridden.
  const [lbMetric, setLbMetric] = useState<string>("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? range;

  const { data: calls } = useQuery({
    queryKey: ["calls", orgId, range.from, range.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass)
        return mockCalls() as unknown as {
          id: string;
          scheduled_for: string | null;
          status: string;
          showed: boolean;
          offer_made: boolean;
          closed: boolean;
          contract_value_cents: number | null;
          cash_collected_cents: number | null;
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
          leads: { full_name: string | null; handle: string | null; email: string | null } | null;
        }[];
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, scheduled_for, status, showed, offer_made, closed, contract_value_cents, cash_collected_cents, deposit_cents, payment_plan, call_summary, recording_url, closer_name, lead_email, time_to_close_seconds, key_moment, disposition, duration_seconds, talk_seconds, recovered_from_call_id, setter_id, source_platform, source_format, source_content_id, source_campaign, leads(full_name, handle, email)",
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

  // Leaderboard's own independently-ranged query (Part C3) — separate from the
  // page-range `calls` query above so overriding the leaderboard's date range
  // never touches the rest of the page.
  const { data: lbCalls } = useQuery({
    queryKey: ["closer-lb-calls", orgId, lbRange.from, lbRange.to, devBypass],
    enabled: !!orgId,
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
      closeRate: x.showed ? (x.closes / x.showed) * 100 : 0,
      showRate: x.booked ? (x.showed / x.booked) * 100 : 0,
      offers: x.offers,
      avgCashCall: x.booked ? x.cash / x.booked : 0,
      deposits: x.deposits,
    }));
  }, [lbCalls]);

  // Pull setter/dialer day-log aggregates so the Closer Dashboard isn't empty
  // when closes & cash are logged through DM Setter / Inbound Dialer daily entries.
  const { data: setterAgg } = useQuery({
    queryKey: ["closer-setter-agg", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("setter_activity")
        .select(
          "activity_date, calls_on_calendar, live_calls, closes, downsells, cash_collected_cents, total_revenue_cents",
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
    queryKey: ["calls-prev", orgId, prevRange.from, prevRange.to, devBypass],
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
          scheduled_for: string | null;
        }[];
      const { data, error } = await supabase
        .from("calls")
        .select(
          "closer_name, showed, offer_made, closed, status, cash_collected_cents, contract_value_cents, deposit_cents, scheduled_for",
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
    queryKey: ["closer-setter-agg-prev", orgId, prevRange.from, prevRange.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("setter_activity")
        .select(
          "activity_date, calls_on_calendar, live_calls, closes, downsells, cash_collected_cents, total_revenue_cents",
        )
        .eq("org_id", orgId!)
        .gte("activity_date", prevRange.from)
        .lte("activity_date", prevRange.to);
      return data ?? [];
    },
  });

  const { data: objections } = useQuery({
    queryKey: ["call-objections", orgId, range.from, range.to],
    enabled: !!orgId,
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

  const list = (calls ?? []).filter((c) => {
    const matchesMember = member === ALL_MEMBERS || c.closer_name === member;
    const source = String((c as Record<string, unknown>).source_platform ?? "").trim();
    return (
      matchesMember &&
      platformMatches(source, platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all")
    );
  });
  const {
    page: callsPage,
    setPage: setCallsPage,
    pageCount: callsPageCount,
    paged: pagedCalls,
    total: callsTotal,
    pageSize: callsPageSize,
  } = usePagination(list, 25);
  // Per-call totals
  const callsBooked = list.length;
  const callsShowed = list.filter((c) => c.showed).length;
  const callsOffers = list.filter((c) => c.offer_made).length;
  const callsClosed = list.filter((c) => c.closed || c.status === "closed").length;
  const callsCash = list.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const callsRev = list.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
  // Day-log totals (org-wide, no per-rep filter — these aren't attributed per-closer)
  const setterRows = setterAgg ?? [];
  const setBooked = setterRows.reduce((s, r) => s + (r.calls_on_calendar ?? 0), 0);
  const setShowed = setterRows.reduce((s, r) => s + (r.live_calls ?? 0), 0);
  const setClosed = setterRows.reduce((s, r) => s + (r.closes ?? 0), 0);
  const setDowns = setterRows.reduce((s, r) => s + (r.downsells ?? 0), 0);
  const setCash = setterRows.reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
  const setRev = setterRows.reduce((s, r) => s + (r.total_revenue_cents ?? 0), 0);
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
    const paymentPlanCalls = list.filter(
      (c) => c.payment_plan && (c.contract_value_cents ?? 0) > 0,
    );
    const depositedCalls = paymentPlanCalls.filter((c) => (c.deposit_cents ?? 0) > 0);
    const fullyPaid = depositedCalls.filter(
      (c) => (collectedByCall.get(c.id) ?? 0) >= (c.contract_value_cents ?? 0),
    );
    const futureScheduledCents = paymentPlanCalls.reduce((sum, c) => {
      const remaining = (c.contract_value_cents ?? 0) - (collectedByCall.get(c.id) ?? 0);
      return sum + Math.max(0, remaining);
    }, 0);
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
    return {
      total,
      failedCount: failed,
      onTimeRatePct: total ? (onTime / total) * 100 : null,
      failedRatePct: total ? (failed / total) * 100 : null,
      recoveredFailedCount: recoveredCalls.size,
      depositToFullPaymentPct: depositedCalls.length
        ? (fullyPaid.length / depositedCalls.length) * 100
        : null,
      futureScheduledCents,
    };
  }, [callPayments, list]);

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
  const closerLifecyclePath: AttributionPath[] = useMemo(
    () => [
      {
        id: "closer-lifecycle",
        label:
          "Channel → campaign/content → capture mechanism → setter/dialer → booked → offer → payment plan → cash",
        stages: [
          {
            key: "channel",
            label: "Original Channel",
            value:
              new Set(
                list.map((c) => (c as Record<string, unknown>).source_platform).filter(Boolean),
              ).size || null,
            detail: "Distinct source platforms on these calls",
          },
          {
            key: "campaign",
            label: "Campaign / Content",
            value:
              new Set(
                list
                  .map(
                    (c) =>
                      (c as Record<string, unknown>).source_campaign ??
                      (c as Record<string, unknown>).source_content_id,
                  )
                  .filter(Boolean),
              ).size || null,
            detail: "Distinct campaigns / content pieces",
          },
          {
            key: "capture",
            label: "Capture Mechanism",
            value:
              new Set(list.map((c) => (c as Record<string, unknown>).source_format).filter(Boolean))
                .size || null,
            detail: "Distinct capture formats",
          },
          {
            key: "setter",
            label: "Setter / Dialer",
            value: list.filter((c) => c.setter_id).length,
            detail: "Calls with a setter/dialer attached",
          },
          { key: "booked", label: "Booked Call", value: list.length, detail: "Calls in range" },
          {
            key: "offer",
            label: "Offer / Product",
            value: list.filter((c) => c.offer_made).length,
            detail: "Offer made",
          },
          {
            key: "payment",
            label: "Payment Plan",
            value: paymentPlanCount,
            detail: "Payment-plan calls",
          },
          {
            key: "cash",
            label: "Cash Collected",
            value: cashCents ? Math.round(cashCents / 100) : 0,
            detail: fmtMoney(cashCents),
          },
          {
            key: "retention",
            label: "Retention / Refund",
            value: null,
            detail: "Lives on Mentees & Renewals, not on calls — not connected here",
          },
        ],
      },
    ],
    [list, paymentPlanCount, cashCents],
  );
  const avgCashPerBooked = onCalendar ? cashCents / onCalendar : 0;
  const avgCashPerShowed = showed ? cashCents / showed : 0;
  const avgCashPerClosed = closes ? cashCents / closes : 0;

  // Prior-period totals — same dual-source max() logic as the current period above.
  const prevList = (prevCalls ?? []).filter((c) => {
    const matchesMember = member === ALL_MEMBERS || c.closer_name === member;
    const source = String((c as Record<string, unknown>).source_platform ?? "").trim();
    return (
      matchesMember &&
      platformMatches(source, platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all")
    );
  });
  const prevCallsBooked = prevList.length;
  const prevCallsShowed = prevList.filter((c) => c.showed).length;
  const prevCallsOffers = prevList.filter((c) => c.offer_made).length;
  const prevCallsClosed = prevList.filter((c) => c.closed || c.status === "closed").length;
  const prevCallsCash = prevList.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const prevCallsRev = prevList.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0);
  const prevDepositCount = prevList.filter((c) => (c.deposit_cents ?? 0) > 0).length;
  const prevSetterRows = prevSetterAgg ?? [];
  const prevSetBooked = prevSetterRows.reduce((s, r) => s + (r.calls_on_calendar ?? 0), 0);
  const prevSetShowed = prevSetterRows.reduce((s, r) => s + (r.live_calls ?? 0), 0);
  const prevSetClosed = prevSetterRows.reduce((s, r) => s + (r.closes ?? 0), 0);
  const prevSetCash = prevSetterRows.reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
  const prevSetRev = prevSetterRows.reduce((s, r) => s + (r.total_revenue_cents ?? 0), 0);
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
          showRate: _booked ? (_showed / _booked) * 100 : 0,
          closeRate: _showed ? (_closes / _showed) * 100 : 0,
          offerToClose: _offers ? (_closes / _offers) * 100 : 0,
          cash: _cash,
          avgDeal: _closes ? _cash / _closes : 0,
        };
      })
      .sort((a, b) => b.cash - a.cash);
  }, [calls, devBypass]);

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

  // Follow-up pipeline (calls flagged as follow_up across whole range)
  const followUps = useMemo(() => list.filter((c) => c.status === "follow_up"), [list]);
  // Active vs overdue split (spec section 5) — overdue = the follow-up's last
  // touch was more than 7 days ago, matching the existing red/default chip
  // threshold already used in the follow-up pipeline table below.
  const overdueFollowUps = useMemo(
    () =>
      followUps.filter(
        (c) => c.scheduled_for && Date.now() - new Date(c.scheduled_for).getTime() > 7 * 86400e3,
      ),
    [followUps],
  );
  const activeFollowUpsCount = followUps.length - overdueFollowUps.length;
  // Deals expected to close this week — offer made or in follow-up, with a
  // real scheduled date landing in the next 7 days. Not a fabricated
  // forecast: only counts calls with an actual scheduled_for timestamp.
  const dealsExpectedThisWeek = useMemo(() => {
    const now = Date.now();
    const weekOut = now + 7 * 86400e3;
    return list.filter((c) => {
      if (!["offer_made", "follow_up", "booked"].includes(c.status)) return false;
      if (!c.scheduled_for) return false;
      const t = new Date(c.scheduled_for).getTime();
      return t >= now && t <= weekOut;
    });
  }, [list]);
  // No-show recovery (mirrors the Dialer appointment-quality logic) — scoped
  // to this closer's own calls.
  const noShowRecovery = useMemo(() => {
    const noShows = list.filter((c) => c.status === "no_show");
    const recovered = noShows.filter((c) => list.some((c2) => c2.recovered_from_call_id === c.id));
    const recoveredClosed = recovered.filter((c) => {
      const followUp = list.find((c2) => c2.recovered_from_call_id === c.id);
      return followUp?.closed;
    });
    return {
      noShowCount: noShows.length,
      recoveredShowRate: noShows.length ? (recovered.length / noShows.length) * 100 : null,
      recoveredCloseRate: recovered.length
        ? (recoveredClosed.length / recovered.length) * 100
        : null,
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
      const payload = {
        org_id: orgId!,
        lead_id: (f.get("lead_id") as string) || null,
        closer_name: String(f.get("closer_name") || "") || null,
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
              tone: closes / Math.max(1, showed) >= 0.3 ? "success" : "warning",
            },
          ]}
        />

        {/* Leaderboard with metric selector + independent date range (Part C3) + spectrum activity heatmap (Part C4) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            titlePrefix="Closer leaderboard"
            metrics={CLOSER_METRICS}
            metricKey={lbMetric}
            onMetricChange={setLbMetric}
            people={lbPeople}
            emptyLabel="No closers in range."
            dateRange={lbRange}
            onDateRangeChange={setLbOverride}
            overridden={!!lbOverride}
            onResetRange={() => setLbOverride(null)}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-3">
              <ActivityIcon className="h-3.5 w-3.5 text-accent" /> Rep activity heatmap · calls by
              weekday
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

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <TeamMemberFilter role="closer" value={member} onChange={setMember} />
            <Select value={platformFilter} onValueChange={setPlatformFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Platform: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Platform: All</SelectItem>
                {SOCIAL_PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    <span className="flex items-center gap-1.5">
                      <PlatformIcon platform={platform} /> {platform}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
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
            return true;
          };
          const callRowsFor = (kind: string): CallRow[] => {
            const filtered = list.filter(stageFilter(kind));
            const byCash = kind === "cash";
            return [...filtered]
              .sort((a, b) =>
                byCash
                  ? (b.cash_collected_cents ?? 0) - (a.cash_collected_cents ?? 0)
                  : String(b.scheduled_for ?? "").localeCompare(String(a.scheduled_for ?? "")),
              )
              .slice(0, 50);
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
          } else if (selected) {
            const stage = closeStages[selected.index];
            const kind = ["oncal", "showed", "offers", "closes"][selected.index];
            panel = stage
              ? {
                  title: stage.label,
                  columns: callColumns(stage.label, () => "✓"),
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

          const kpiItems: KpiBandItem[] = [
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
              key: "cash",
              label: "Cash Collected",
              value: fmtMoney(cashCents),
              spectrum: "hot",
              featured: true,
              wide: true,
              deltaPct: pctDelta(cashCents, prevCashCents),
              priorValue: fmtMoney(prevCashCents),
              empty: cashCents === 0,
              emptyHint: "Log a closed call with cash collected to see this populate.",
              onClick: () => setSelected({ kind: "money", index: 0 }),
            },
            {
              key: "revenue",
              label: "Revenue Generated",
              value: fmtMoney(revCents),
              spectrum: "hot",
              featured: true,
              wide: true,
              deltaPct: pctDelta(revCents, prevRevCents),
              priorValue: fmtMoney(prevRevCents),
              empty: revCents === 0,
              emptyHint: "Total contract value shows up once a deal closes.",
              onClick: () => setSelected({ kind: "money", index: 0 }),
            },
          ];

          const showPct = onCalendar ? (showed / onCalendar) * 100 : 0;
          const prevShowPct = prevOnCalendar ? (prevShowed / prevOnCalendar) * 100 : 0;
          const offerPct = showed ? (offers / showed) * 100 : 0;
          const prevOfferPct = prevShowed ? (prevOffers / prevShowed) * 100 : 0;
          const offerToClosePct = offers ? (closes / offers) * 100 : 0;
          const prevOfferToClosePct = prevOffers ? (prevClosed / prevOffers) * 100 : 0;
          // Closes ÷ Showed — the sheet's "Average Close Rate." Distinct from
          // Offer → Close Rate: this skips the Offers stage entirely, so it
          // isn't an adjacent-stage conv% the funnel bars produce on their own.
          const closeRatePct = showed ? (closes / showed) * 100 : 0;
          const prevCloseRatePct = prevShowed ? (prevClosed / prevShowed) * 100 : 0;
          const cashRatePct = revCents ? (cashCents / revCents) * 100 : 0;

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
              deltaPct: pctDelta(showPct, prevShowPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "close", index: 1 }),
            },
            {
              key: "offerrate",
              label: "Offer Rate",
              points: seriesRatePoints(heroSeries, "offers", "showed"),
              currentPct: offerPct,
              deltaPct: pctDelta(offerPct, prevOfferPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "close", index: 2 }),
            },
            {
              key: "closerate",
              label: "Close Rate",
              points: seriesRatePoints(heroSeries, "closed", "showed"),
              currentPct: closeRatePct,
              deltaPct: pctDelta(closeRatePct, prevCloseRatePct),
              spectrum: "hot",
              onClick: () => setSelected({ kind: "close", index: 3 }),
            },
            {
              key: "offertoclose",
              label: "Offer → Close Rate",
              points: seriesRatePoints(heroSeries, "closed", "offers"),
              currentPct: offerToClosePct,
              deltaPct: pctDelta(offerToClosePct, prevOfferToClosePct),
              spectrum: "hot",
              onClick: () => setSelected({ kind: "close", index: 3 }),
            },
          ];

          return (
            <>
              <KpiBand items={chartedKpiItems} title="Closer · Key Metrics" />
              <div className="grid gap-4 lg:grid-cols-2">
                <FunnelInstrument
                  title="Close"
                  subtitle="Booked → Closed"
                  stages={closeStages}
                  onStageClick={(i) => setSelected({ kind: "close", index: i })}
                />
                <MoneyInstrument
                  series={moneySeries}
                  payoutPct={10}
                  payoutCents={payoutCents}
                  cashRatePct={cashRatePct}
                  onCashClick={() => setSelected({ kind: "money", index: 0 })}
                  fmtMoney={fmtMoney}
                />
              </div>
              <RateSmallMultiples charts={rateCharts} />
              <KpiBand
                title="Additional Stats"
                items={[
                  {
                    key: "avgCashBooked",
                    label: "Avg Cash / Booked",
                    value: fmtMoney(avgCashPerBooked),
                    spectrum: "mid",
                    empty: !avgCashPerBooked,
                    emptyHint: "No booked-call cash in this range.",
                  },
                  {
                    key: "avgCashShowed",
                    label: "Avg Cash / Showed",
                    value: fmtMoney(avgCashPerShowed),
                    spectrum: "mid",
                    empty: !avgCashPerShowed,
                    emptyHint: "No showed-call cash in this range.",
                  },
                  {
                    key: "avgCashClosed",
                    label: "Avg Cash / Closed",
                    value: fmtMoney(avgCashPerClosed),
                    spectrum: "hot",
                    empty: !avgCashPerClosed,
                    emptyHint: "No closed-call cash in this range.",
                  },
                  {
                    key: "deposits",
                    label: "Deposits",
                    value: depositCount.toLocaleString(),
                    spectrum: "hot",
                    empty: !depositCount,
                    emptyHint: "No deposits logged in this range.",
                  },
                  {
                    key: "depositAmount",
                    label: "Deposit Amount",
                    value: depositAmountCents ? fmtMoney(depositAmountCents) : "—",
                    spectrum: "hot",
                    empty: !depositAmountCents,
                    emptyHint: "No deposit amount logged in this range.",
                  },
                  {
                    key: "depositConversion",
                    label: "Deposit → Close",
                    value:
                      depositConversionPct == null ? "—" : `${depositConversionPct.toFixed(1)}%`,
                    spectrum: "hot",
                    empty: depositConversionPct == null,
                    emptyHint: "Requires a closed call and a logged deposit.",
                  },
                  {
                    key: "averageDepositPct",
                    label: "Avg Deposit %",
                    value: averageDepositPct == null ? "—" : `${averageDepositPct.toFixed(1)}%`,
                    spectrum: "mid",
                    empty: averageDepositPct == null,
                    emptyHint: "Requires deposit and contract values.",
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
                  },
                  {
                    key: "onTimeRate",
                    label: "On-Time Payment Rate",
                    value:
                      paymentQualityStats.onTimeRatePct == null
                        ? "Unavailable"
                        : `${paymentQualityStats.onTimeRatePct.toFixed(1)}%`,
                    spectrum: "mid",
                    empty: paymentQualityStats.onTimeRatePct == null,
                    emptyHint: "No payment records for these calls yet.",
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
                  },
                  {
                    key: "failedPaymentCount",
                    label: "Failed Payments",
                    value: fmtN0(paymentQualityStats.failedCount),
                    spectrum: "hot",
                    empty: paymentQualityStats.total === 0,
                    emptyHint: "No payment records for these calls yet.",
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
                    emptyHint: "Requires a deposit and payment records for these calls.",
                  },
                  {
                    key: "futureScheduledCash",
                    label: "Future Scheduled Cash",
                    value: fmtMoney(paymentQualityStats.futureScheduledCents),
                    spectrum: "mid",
                    empty: paymentQualityStats.futureScheduledCents === 0,
                    emptyHint: "No outstanding payment-plan balance in this range.",
                  },
                  {
                    key: "downsells",
                    label: "Downsells",
                    value: downsells.toLocaleString(),
                    spectrum: "mid",
                    empty: !downsells,
                    emptyHint: "No downsells logged in this range.",
                  },
                ]}
              />
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
                      <div
                        key={item.value}
                        className="rounded-lg border border-border/70 bg-background/40 p-3"
                      >
                        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-1 font-mono text-xl font-semibold">{item.count}</div>
                        <div className="mt-1 text-3xs text-muted-foreground">
                          {pct(item.count, list.length)} of calls
                        </div>
                      </div>
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
                      <div
                        key={item.value}
                        className={`rounded-lg border p-3 ${item.value === "not_logged" ? "border-dashed border-border/50 bg-background/20" : "border-border/70 bg-background/40"}`}
                      >
                        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                          {item.label}
                        </div>
                        <div className="mt-1 font-mono text-xl font-semibold">{item.count}</div>
                        <div className="mt-1 text-3xs text-muted-foreground">
                          {pct(item.count, list.length)} of calls
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                    No calls in this date range.
                  </div>
                )}
              </div>
              <KpiBand
                title="Sales activity quality"
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
                  {
                    key: "callsReviewed",
                    label: "Calls Reviewed",
                    value: coachingReviewCount.toLocaleString(),
                    spectrum: "hot",
                    empty: coachingReviewCount === 0,
                    emptyHint: "No coaching reviews logged in this range.",
                  },
                ]}
              />
              <AttributionPathPanel
                title="Closer lifecycle attribution"
                subtitle="Same calls as everywhere else on this page, read along one lifecycle axis — not an additional revenue source"
                paths={closerLifecyclePath}
              />
              <CoachingPanel orgId={orgId} range={range} />
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

        {/* Insight tabs */}
        <Tabs defaultValue="objections">
          <TabsList>
            <TabsTrigger value="objections">Objection frequency</TabsTrigger>
            <TabsTrigger value="scorecard">Closer scorecard</TabsTrigger>
            <TabsTrigger value="ttc">Time-to-close trend</TabsTrigger>
            <TabsTrigger value="followups">Follow-up pipeline · {followUps.length}</TabsTrigger>
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
                        <span className="font-mono">{count}</span>
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
                    const count = (objections ?? []).filter((o) => o.category === c.value).length;
                    if (!count) return null;
                    return (
                      <div key={c.value} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{c.label}</span>
                        <span className="font-mono">{count}</span>
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

          <TabsContent value="scorecard">
            <GlassTableShell maxHeight="420px">
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Closer</th>
                    <th className="text-right p-3 font-mono">Booked</th>
                    <th className="text-right p-3 font-mono">Showed</th>
                    <th className="text-right p-3 font-mono">Closes</th>
                    <th className="text-right p-3 font-mono">Show %</th>
                    <th className="text-right p-3 font-mono">Close %</th>
                    <th className="text-right p-3 font-mono">Offer→Close</th>
                    <th className="text-right p-3 font-mono">Avg deal</th>
                    <th className="text-right p-3 font-mono">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.map((s) => (
                    <tr key={s.name} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-right font-mono">{s.booked}</td>
                      <td className="p-3 text-right font-mono">{s.showed}</td>
                      <td className="p-3 text-right font-mono">{s.closes}</td>
                      <td className="p-3 text-right font-mono">{s.showRate.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{s.closeRate.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">{s.offerToClose.toFixed(1)}%</td>
                      <td className="p-3 text-right font-mono">
                        {s.avgDeal ? fmtMoney(s.avgDeal) : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-[color:var(--color-success)]">
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
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "var(--shadow-md)",
                        }}
                      />
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

          <TabsContent value="followups">
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Active Follow-ups
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">{activeFollowUpsCount}</div>
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Overdue Follow-ups
                </div>
                <div className="mt-1 font-mono text-lg font-semibold text-destructive">
                  {overdueFollowUps.length}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Expected to Close This Week
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {dealsExpectedThisWeek.length}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Recovered Show Rate
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {noShowRecovery.recoveredShowRate == null
                    ? "—"
                    : `${noShowRecovery.recoveredShowRate.toFixed(0)}%`}
                </div>
                <div className="mt-1 text-3xs text-muted-foreground">
                  {noShowRecovery.noShowCount} no-shows in range
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Recovered Close Rate
                </div>
                <div className="mt-1 font-mono text-lg font-semibold">
                  {noShowRecovery.recoveredCloseRate == null
                    ? "—"
                    : `${noShowRecovery.recoveredCloseRate.toFixed(0)}%`}
                </div>
              </div>
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
                    <th className="text-left p-3">Last call</th>
                    <th className="text-left p-3">Summary</th>
                    <th className="text-right p-3 font-mono">Pending $</th>
                  </tr>
                </thead>
                <tbody>
                  {followUps.map((c) => {
                    const daysAgo = c.scheduled_for
                      ? Math.floor((Date.now() - new Date(c.scheduled_for).getTime()) / 86400e3)
                      : null;
                    return (
                      <tr key={c.id} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3 font-medium">{c.closer_name || "—"}</td>
                        <td className="p-3 text-xs">{c.lead_email || c.leads?.full_name || "—"}</td>
                        <td className="p-3 text-xs">
                          {c.scheduled_for ? new Date(c.scheduled_for).toLocaleDateString() : "—"}
                          {daysAgo !== null && (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-3xs ${daysAgo > 7 ? CHIP_TONE_CLASSES.destructive : CHIP_TONE_CLASSES.default}`}
                            >
                              {daysAgo}d ago
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground max-w-[320px] truncate">
                          {c.call_summary || "—"}
                        </td>
                        <td className="p-3 text-right font-mono">
                          {c.contract_value_cents
                            ? "$" + (c.contract_value_cents / 100).toLocaleString()
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {followUps.length === 0 && (
                    <tr>
                      <td colSpan={5}>
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
          </TabsContent>
        </Tabs>

        {/* Closer Input Log */}
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
                <th className="text-right p-2.5 font-mono">Cash Collected</th>
                <th className="text-right p-2.5 font-mono">Total Revenue</th>
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
                  <td className="p-2.5 text-right font-mono text-[color:var(--color-success)]">
                    {c.cash_collected_cents
                      ? "$" + (c.cash_collected_cents / 100).toLocaleString()
                      : "—"}
                  </td>
                  <td className="p-2.5 text-right font-mono">
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
          "id, rep_name, reviewer_name, what_learned, what_went_wrong, behavior_change, gap_category, created_at",
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
              <div className="mt-1 font-mono text-xl font-semibold">{g.count}</div>
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
