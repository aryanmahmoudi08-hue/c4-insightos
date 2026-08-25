import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { useServerFn } from "@tanstack/react-start";
import { autoIngestCallSignalFn } from "@/lib/content-signals.functions";
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
import { dailySeries, seriesRatePoints, mergeMax, priorPeriod, pctDelta } from "@/lib/trend";
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
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { Clock3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/closer")({ component: Closer });

const fmtMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%");
const fmtN0 = (n: number) => Math.round(n).toLocaleString();

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
          call_summary: string | null;
          recording_url: string | null;
          closer_name: string | null;
          lead_email: string | null;
          time_to_close_seconds: number | null;
          key_moment: string | null;
          leads: { full_name: string | null; handle: string | null; email: string | null } | null;
        }[];
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, scheduled_for, status, showed, offer_made, closed, contract_value_cents, cash_collected_cents, deposit_cents, call_summary, recording_url, closer_name, lead_email, time_to_close_seconds, key_moment, leads(full_name, handle, email)",
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
        .select("objection, resolved, created_at")
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

  const list = (calls ?? []).filter((c) => member === ALL_MEMBERS || c.closer_name === member);
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
  const avgCashPerBooked = onCalendar ? cashCents / onCalendar : 0;
  const avgCashPerShowed = showed ? cashCents / showed : 0;
  const avgCashPerClosed = closes ? cashCents / closes : 0;

  // Prior-period totals — same dual-source max() logic as the current period above.
  const prevList = (prevCalls ?? []).filter(
    (c) => member === ALL_MEMBERS || c.closer_name === member,
  );
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
  const heroSeries = useDayLogs
    ? mergeMax(callsSeries, setterSeries, ["booked", "showed", "closed", "cash", "revenue"])
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

  const autoIngest = useServerFn(autoIngestCallSignalFn);
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
        offer_made: f.get("offer_made") === "on",
        closed,
        contract_value_cents: Math.round(Number(f.get("total_revenue") || 0) * 100),
        cash_collected_cents: Math.round(Number(f.get("cash_collected") || 0) * 100),
        deposit_cents: Math.round(Number(f.get("deposit") || 0) * 100),
        call_summary: String(f.get("summary") || "") || null,
        recording_url: String(f.get("recording_url") || "") || null,
        time_to_close_seconds:
          Number(f.get("ttc_min") || 0) > 0 ? Math.round(Number(f.get("ttc_min")) * 60) : null,
        key_moment: String(f.get("key_moment") || "") || null,
      };
      const { data: callRow, error } = await supabase
        .from("calls")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      // Objections — comma-separated, written to call_objections table
      const objRaw = String(f.get("objections") || "");
      const parts = objRaw
        .split(/[,;\n|]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length && callRow) {
        await supabase
          .from("call_objections")
          .insert(
            parts.map((p) => ({
              org_id: orgId!,
              call_id: callRow.id,
              objection: p,
              resolved: closed,
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
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="showed" defaultChecked /> Showed
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="offer_made" defaultChecked /> Offer made (True)
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
                <div className="space-y-1.5">
                  <Label>Objections (comma-separated)</Label>
                  <Textarea
                    name="objections"
                    rows={2}
                    placeholder="price, timing, spouse, need to think…"
                  />
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
            { key: "status", label: "Status", render: (c) => STATUS_LABEL[c.status] ?? c.status },
            { key: "value", label, align: "right", render },
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
              <KpiBand items={kpiItems} title="Closer · Key Metrics" />
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
              {/* Avg-cash-per-stage attaches to Booked/Showed/Closed the way the plan
                  said it would — cash ÷ that stage's own count — plus deposits/downsells,
                  which have no predecessor stage of their own so stay non-interactive.
                  Confirmed (Sales Tracking Part 2): downsells itself was never
                  singled out or mis-styled relative to its siblings — the whole
                  row just had no card shell at all, unlike every other instrument
                  on this page. Wrapping the row fixes that for all 5 stats, not
                  just downsells specifically. */}
              <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card p-4">
                <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
                <div className="relative mb-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Additional Stats
                </div>
                <div className="relative flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                  <span>
                    Avg cash/booked:{" "}
                    <span className="font-mono text-foreground">{fmtMoney(avgCashPerBooked)}</span>
                  </span>
                  <span>
                    Avg cash/showed:{" "}
                    <span className="font-mono text-foreground">{fmtMoney(avgCashPerShowed)}</span>
                  </span>
                  <span>
                    Avg cash/closed:{" "}
                    <span className="font-mono text-foreground">{fmtMoney(avgCashPerClosed)}</span>
                  </span>
                  <span>{depositCount.toLocaleString()} deposits</span>
                  <span>{downsells.toLocaleString()} downsells</span>
                </div>
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
                      {STATUS_LABEL[c.status] ?? c.status}
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
