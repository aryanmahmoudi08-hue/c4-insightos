import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
/* eslint-disable @typescript-eslint/no-explicit-any -- legacy dynamic Supabase rows in this shared module */
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { TopBar } from "@/components/app-sidebar";
import type { DateRange } from "@/components/date-range-picker";
import { useDateRange } from "@/hooks/use-date-range";
import { useMemo, useState, useEffect } from "react";
import { useSearch, useNavigate, Link } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/platform-icon";
import { mockLeads } from "@/lib/dev-mock-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Activity as ActivityIcon,
  MessageCircle,
  PhoneIncoming,
  X,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { TeamMemberPicker } from "@/components/team-member-picker";
import { TeamMemberFilter, ALL_MEMBERS } from "@/components/team-member-filter";
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { ClipboardList } from "lucide-react";
import { HeatmapGrid } from "@/components/heatmap-grid";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import { PageHero } from "@/components/page-hero";
import { FunnelInstrument } from "@/components/funnel-instrument";
import { MoneyInstrument, type MoneyPoint } from "@/components/money-instrument";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { OperationalWorkflowPanel } from "@/components/operational-workflow-panel";
import { AttributionPathPanel, type AttributionPath } from "@/components/attribution-path-panel";
import { RateSmallMultiples, type RateChartSpec } from "@/components/rate-small-multiples";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import {
  ObjectionInstrument,
  type ObjectionEntry,
  type FaqVideoLite,
} from "@/components/objection-instrument";
import { scoreText, pickTop, type MechanismKey } from "@/lib/content-mechanisms";
import { normalizeSocialPlatform, SOCIAL_PLATFORMS, platformMatches } from "@/lib/social-platform";
import { evaluateAttributionEvidence } from "@/lib/acquisition";
import {
  buildSpeedToLeadQueue,
  calculateSpeedToLead,
  compareSpeedBuckets,
  filterSpeedEvents,
  speedDistribution,
  type SpeedToLeadQueueItem,
} from "@/lib/speed-to-lead";
import { dailySeries, seriesValues, seriesRatePoints, priorPeriod, pctDelta } from "@/lib/trend";
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
import { clusterObjectionsFn } from "@/lib/objection-clustering.functions";
import { applyObjectionClusters } from "@/lib/objection-clustering";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { KpiTargetCard } from "@/components/kpi-target-card";
import { fetchRepKpiTargets } from "@/lib/rep-kpi-targets";
import {
  KPI_DEFINITIONS,
  computeTargetProgress,
  currentTargetsAsOf,
  periodWindow,
  type KpiRole,
} from "@/lib/kpi-targets";
import {
  actualFromSetterActivity,
  sliceSetterActivityToWindow,
  type SetterActivityActualRow,
} from "@/lib/rep-kpi-actuals";

export type ActivityRole = "dm_setter" | "inbound_dialer";

interface Props {
  role: ActivityRole;
  title: string;
  subtitle: string;
}

const NUM = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;
const fmtMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0.0%");

// Callback scheduling timezone (spec: "Log a Call" timezone visibility).
// Leads have no stored timezone anywhere in the schema — the `datetime-local`
// input above this is filled in and read back in the browser's own local
// time (`new Date(dueAt).toISOString()` at the mutation call site already
// relies on that), so the honest thing to surface is which timezone that
// browser-local value is actually being interpreted in, not a guessed lead
// timezone. Never attribute this offset to the lead.
const browserTzAbbrev = () =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "Local";
const browserUtcOffset = () => {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

const LEAD_SOURCES = ["Instagram Spiderweb", "Keyword", "Inbound", "Referral", "Ads", "Other"];

interface ActivityLbPerson {
  name: string;
  cash: number;
  sets: number;
  qualified: number;
  closes: number;
  showRate: number;
  closeRate: number;
  linksSent: number;
  contacted: number;
  connections: number;
  dials: number;
  pickupRate: number;
}

// Part C3 — exact per-role metric option lists for the setter/dialer leaderboard selector.
const SETTER_METRICS: RepMetricOption<ActivityLbPerson>[] = [
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => fmtMoney(p.cash),
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.cash,
  },
  {
    key: "sets",
    label: "Sets",
    spectrum: "mid",
    primary: (p) => `${p.sets} sets`,
    secondary: (p) => `${p.qualified} qualified`,
    rankBy: (p) => p.sets,
  },
  {
    key: "qualified",
    label: "Qualified Convos",
    spectrum: "mid",
    primary: (p) => `${p.qualified}`,
    secondary: (p) => `${p.contacted} contacted`,
    rankBy: (p) => p.qualified,
  },
  {
    key: "closes",
    label: "Closes",
    spectrum: "hot",
    primary: (p) => `${p.closes}`,
    secondary: (p) => fmtMoney(p.cash),
    rankBy: (p) => p.closes,
  },
  {
    key: "showRate",
    label: "Show Rate",
    spectrum: "mid",
    primary: (p) => `${p.showRate.toFixed(0)}%`,
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.showRate,
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
    key: "linksSent",
    label: "Links Sent",
    spectrum: "cold",
    primary: (p) => `${p.linksSent}`,
    secondary: (p) => `${p.contacted} contacted`,
    rankBy: (p) => p.linksSent,
  },
  {
    key: "contacted",
    label: "Leads Contacted",
    spectrum: "cold",
    primary: (p) => `${p.contacted}`,
    secondary: (p) => `${p.qualified} qualified`,
    rankBy: (p) => p.contacted,
  },
];

const DIALER_METRICS: RepMetricOption<ActivityLbPerson>[] = [
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => fmtMoney(p.cash),
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.cash,
  },
  {
    key: "sets",
    label: "Sets",
    spectrum: "mid",
    primary: (p) => `${p.sets} sets`,
    secondary: (p) => `${p.connections} connects`,
    rankBy: (p) => p.sets,
  },
  {
    key: "connections",
    label: "Connects",
    spectrum: "cold",
    primary: (p) => `${p.connections}`,
    secondary: (p) => `${p.dials} dials`,
    rankBy: (p) => p.connections,
  },
  {
    key: "qualified",
    label: "Qualified Convos",
    spectrum: "mid",
    primary: (p) => `${p.qualified}`,
    secondary: (p) => `${p.connections} connects`,
    rankBy: (p) => p.qualified,
  },
  {
    key: "dials",
    label: "Dials",
    spectrum: "cold",
    primary: (p) => `${p.dials}`,
    secondary: (p) => `${p.connections} connects`,
    rankBy: (p) => p.dials,
  },
  {
    key: "pickupRate",
    label: "Pick-up Rate",
    spectrum: "cold",
    primary: (p) => `${p.pickupRate.toFixed(0)}%`,
    secondary: (p) => `${p.connections} connects`,
    rankBy: (p) => p.pickupRate,
  },
  {
    key: "closes",
    label: "Closes",
    spectrum: "hot",
    primary: (p) => `${p.closes}`,
    secondary: (p) => fmtMoney(p.cash),
    rankBy: (p) => p.closes,
  },
];

export function ActivityModule({ role, title, subtitle }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<{
    kind: "reach" | "close" | "money";
    index: number;
  } | null>(null);

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
  // Command palette's "Log Day" quick action lands here with ?action=log-day.
  const actionSearch = useSearch({ strict: false }) as { action?: string };
  const paletteNav = useNavigate();
  useEffect(() => {
    if (actionSearch.action === "log-day") {
      setOpen(true);
      paletteNav({ search: {} as never, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSearch.action]);
  const { range } = useDateRange();
  const [member, setMember] = useState<string>(ALL_MEMBERS);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [speedWeekday, setSpeedWeekday] = useState("all");
  const [speedTimeWindow, setSpeedTimeWindow] = useState("all");
  const isDialer = role === "inbound_dialer";
  // Part C3 — leaderboard's own metric selector + independent date range,
  // defaulting to inherit the page range until explicitly overridden.
  const [lbMetric, setLbMetric] = useState<string>("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? range;
  const lbMetrics = isDialer ? DIALER_METRICS : SETTER_METRICS;

  const { data: allRows } = useQuery({
    queryKey: ["activity", role, orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_activity")
        .select("*")
        .eq("org_id", orgId!)
        .eq("role", role)
        .gte("activity_date", range.from)
        .lte("activity_date", range.to)
        .order("activity_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  // Rep KPI Target Engine (Priority 2) — "as of today," independent of this
  // page's own `range` (which stays a separate, historical-browsing concept;
  // see kpi-targets.ts's periodWindow doc comment on why the two are kept
  // apart). One org+role-scoped fetch of this month's raw rows; each target
  // slices its own daily/weekly/monthly window out of the same batch.
  const targetAnchor = new Date().toISOString().slice(0, 10);
  const targetWindowStart = `${targetAnchor.slice(0, 7)}-01`;
  const { data: repKpiTargetsRaw } = useQuery({
    queryKey: ["rep-kpi-targets", orgId, role],
    enabled: !!orgId && !devBypass,
    queryFn: () => fetchRepKpiTargets(orgId!, role as KpiRole),
  });
  const { data: targetActivityRows = [] } = useQuery({
    queryKey: ["target-activity-rows", orgId, role, targetWindowStart, targetAnchor],
    enabled: !!orgId && !devBypass,
    queryFn: async (): Promise<SetterActivityActualRow[]> => {
      const { data, error } = await supabase
        .from("setter_activity")
        .select(
          "team_member_name, activity_date, outbound_dms_sent, inbound_dms_sent, replies, qualified_convos, calls_on_calendar, live_calls, dials, connections, leads_contacted",
        )
        .eq("org_id", orgId!)
        .eq("role", role)
        .gte("activity_date", targetWindowStart)
        .lte("activity_date", targetAnchor)
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as SetterActivityActualRow[];
    },
  });
  const currentTargetsForRole = useMemo(
    () => currentTargetsAsOf(repKpiTargetsRaw ?? [], targetAnchor),
    [repKpiTargetsRaw, targetAnchor],
  );
  // One card per catalogue KPI for the currently-selected rep — "No target
  // configured" is shown explicitly rather than omitting the metric, so it's
  // visible which KPIs still lack a target (Priority 12).
  const memberTargetCards = useMemo(() => {
    if (member === ALL_MEMBERS) return [];
    const forMember = currentTargetsForRole.filter((t) => t.teamMemberName === member);
    return KPI_DEFINITIONS[role as KpiRole].flatMap((def) => {
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
              actualValue: actualFromSetterActivity(targetActivityRows, member, def.key),
            }),
          },
        ];
      }
      return matches.map((t) => {
        const window = periodWindow(t.period, targetAnchor);
        const sliced = sliceSetterActivityToWindow(targetActivityRows, window.start, window.end);
        return {
          key: `${def.key}-${t.period}`,
          label: def.label,
          progress: computeTargetProgress({
            format: def.format,
            period: t.period,
            anchorISODate: targetAnchor,
            targetValue: t.targetValue,
            actualValue: actualFromSetterActivity(sliced, member, def.key),
          }),
        };
      });
    });
  }, [member, currentTargetsForRole, targetActivityRows, role, targetAnchor]);

  // Active leads available to dial, split by ticket tier (spec section 4).
  // "Active" = not yet closed/disqualified/ghosted/no-show — still workable.
  const OPEN_LEAD_STATUSES = [
    "dm_received",
    "qualified",
    "pre_call_assets_sent",
    "call_booked",
    "follow_up",
  ] as const;
  const { data: dialableLeads = [] } = useQuery({
    queryKey: ["dialable-leads", orgId, devBypass, range.from, range.to],
    enabled: isDialer && !!orgId,
    queryFn: async () => {
      // Same reasoning as the callback lead search above: dev bypass has no
      // real Supabase session, so this — now an interactive drilldown
      // source, not just a passive count — needs a real filterable/openable
      // fallback rather than silently coming back empty.
      if (devBypass) {
        const now = Date.now();
        return mockLeads().map((lead, i) => ({
          id: lead.id,
          // Deliberately not the same modulo as mockLeads()'s own phone
          // assignment (i % 3) — otherwise "has a phone" and "unclassified"
          // would be perfectly correlated and no tiered lead would ever show
          // a phone number in this fallback.
          ticket_tier: i % 5 === 0 ? null : i % 2 === 0 ? "high" : "low",
          status: OPEN_LEAD_STATUSES[i % OPEN_LEAD_STATUSES.length],
          full_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          handle: lead.handle,
          created_at: new Date(now - i * 36 * 3600 * 1000).toISOString(),
          source_platform: (lead as { source_connector?: string }).source_connector ?? null,
          source_campaign: null as string | null,
          assigned_setter_id: null as string | null,
          qualification_notes: null as string | null,
        }));
      }
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, ticket_tier, status, full_name, email, phone, handle, created_at, source_platform, source_campaign, assigned_setter_id, qualification_notes",
        )
        .eq("org_id", orgId!)
        .in("status", OPEN_LEAD_STATUSES)
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });
  // Ticket tiers are configured in Client DNA (offer_tiers), not hardcoded —
  // any number of tiers, not just high/low. Dev bypass mirrors the two tiers
  // the real migration seeds for every org, so the page behaves the same way.
  const { data: offerTiers = [] } = useQuery({
    queryKey: ["offer-tiers-dialer", orgId, devBypass],
    enabled: isDialer && !!orgId,
    queryFn: async () => {
      if (devBypass)
        return [
          { key: "low", label: "Low Ticket", sort_order: 1 },
          { key: "high", label: "High Ticket", sort_order: 2 },
        ];
      const { data, error } = await (supabase as any)
        .from("offer_tiers")
        .select("key, label, sort_order")
        .eq("org_id", orgId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { key: string; label: string; sort_order: number }[];
    },
  });
  const ticketTierSplit = useMemo(() => {
    const byTier = offerTiers.map((t) => ({
      ...t,
      count: dialableLeads.filter((l) => l.ticket_tier === t.key).length,
    }));
    const known = new Set(offerTiers.map((t) => t.key));
    const unclassified = dialableLeads.filter(
      (l) => !l.ticket_tier || !known.has(l.ticket_tier),
    ).length;
    return { byTier, unclassified, total: dialableLeads.length };
  }, [dialableLeads, offerTiers]);
  const [activeLeadsTier, setActiveLeadsTier] = useState<string | null>(null);
  const activeLeadsDrilldownRows = useMemo(
    () => dialableLeads.filter((l) => l.ticket_tier === activeLeadsTier),
    [dialableLeads, activeLeadsTier],
  );
  // Appointment quality (spec section 4) — booking-outcome quality is org-wide
  // (calls have no "booking dialer" column, only closer/setter), scoped to
  // the page's date range via scheduled_for.
  const { data: rangeCalls = [] } = useQuery({
    queryKey: ["dialer-appointment-quality", orgId, range.from, range.to],
    enabled: isDialer && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, status, cancelled, no_show_recovered, recovered_from_call_id, scheduled_for, duration_seconds, talk_seconds",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", `${range.from}T00:00:00`)
        .lte("scheduled_for", `${range.to}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });
  const appointmentQuality = useMemo(() => {
    const total = rangeCalls.length;
    const cancelled = rangeCalls.filter((c) => c.cancelled).length;
    const rescheduled = rangeCalls.filter((c) => c.status === "rescheduled").length;
    const noShows = rangeCalls.filter((c) => c.status === "no_show");
    // Recovered = either explicitly flagged, or a later call links back to it
    // via recovered_from_call_id (set when the closer logs the follow-up call).
    const recovered = noShows.filter(
      (c) => c.no_show_recovered || rangeCalls.some((c2) => c2.recovered_from_call_id === c.id),
    ).length;
    const durations = rangeCalls
      .map((c) => c.duration_seconds)
      .filter((v): v is number => v != null);
    const talks = rangeCalls.map((c) => c.talk_seconds).filter((v): v is number => v != null);
    return {
      total,
      cancellationRate: total ? (cancelled / total) * 100 : null,
      rescheduleRate: total ? (rescheduled / total) * 100 : null,
      noShowRate: total ? (noShows.length / total) * 100 : null,
      noShowRecoveryRate: noShows.length ? (recovered / noShows.length) * 100 : null,
      avgDurationSeconds: durations.length
        ? durations.reduce((s, v) => s + v, 0) / durations.length
        : null,
      avgTalkSeconds: talks.length ? talks.reduce((s, v) => s + v, 0) / talks.length : null,
    };
  }, [rangeCalls]);
  const fmtDuration = (seconds: number | null) => {
    if (seconds == null) return "Not connected";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  };

  // Callback attribution workflow (spec section 4) — real operational_work_items
  // rows, not simulated. Requested/Due Today/Completed Today are computed from
  // actual logged callbacks; empty until a dialer logs the first one.
  type CallbackRow = {
    id: string;
    entity_id: string | null;
    state: string;
    owner_id: string | null;
    due_at: string | null;
    next_action: string | null;
    created_at: string;
    updated_at: string;
    payload: { lead_name?: string } | null;
  };
  // Dev bypass has no real Supabase session, so the real query/mutations
  // below would come back RLS-empty / fail outright — same reasoning as the
  // lead search above. This is a genuine read+write workflow (log a
  // callback, see it in the list, complete it), not a passive KPI tile, so
  // it gets a real local-state mock store under dev bypass rather than
  // silently looking broken, matching the pattern _authenticated.permissions.tsx
  // already uses (mockPerms) for the same reason.
  const [devBypassCallbacks, setDevBypassCallbacks] = useState<CallbackRow[]>([]);
  const { data: realCallbacks } = useQuery({
    queryKey: ["dialer-callbacks", orgId, range.from, range.to],
    enabled: isDialer && !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("operational_work_items")
        .select(
          "id, entity_id, state, owner_id, due_at, next_action, created_at, updated_at, payload",
        )
        .eq("org_id", orgId!)
        .eq("entity_type", "dialer_callback")
        .gte("created_at", `${range.from}T00:00:00`)
        .lte("created_at", `${range.to}T23:59:59`)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CallbackRow[];
    },
  });
  const callbacks = useMemo(
    () => (devBypass ? devBypassCallbacks : (realCallbacks ?? [])),
    [devBypass, devBypassCallbacks, realCallbacks],
  );
  const todayStr = new Date().toISOString().slice(0, 10);
  const callbackFunnel = useMemo(
    () => ({
      requested: callbacks.length,
      dueToday: callbacks.filter((c) => c.due_at?.slice(0, 10) === todayStr).length,
      completedToday: callbacks.filter(
        (c) => c.state === "completed" && c.updated_at.slice(0, 10) === todayStr,
      ).length,
    }),
    [callbacks, todayStr],
  );
  // Real Legacy Lead selector — was previously a free-text "lead name" field
  // with no link back to the actual lead record. operational_work_items
  // already had an entity_id column for exactly this (unique per
  // org+entity_type+entity_id) but nothing populated it.
  const [callbackLeadQuery, setCallbackLeadQuery] = useState("");
  const [callbackSelectedLead, setCallbackSelectedLead] = useState<{
    id: string;
    full_name: string | null;
    handle: string | null;
    email: string | null;
  } | null>(null);
  const { data: callbackLeadResults = [] } = useQuery({
    queryKey: ["dialer-callback-lead-search", orgId, callbackLeadQuery, devBypass],
    enabled: isDialer && !!orgId && callbackLeadQuery.trim().length >= 2 && !callbackSelectedLead,
    queryFn: async () => {
      const q = callbackLeadQuery.trim();
      // Dev bypass never has a real Supabase session, so a real leads query
      // comes back RLS-empty (same reasoning as every other devBypass branch
      // in this codebase) — a search-and-select workflow with nothing to
      // select isn't a degraded-but-honest empty state like a zeroed KPI
      // tile, it's an unusable interaction, so it gets a real mock fallback
      // like VslPage/closer.tsx/leads.tsx/team.tsx already do for theirs.
      if (devBypass) {
        const needle = q.toLowerCase();
        return mockLeads()
          .filter(
            (lead) =>
              lead.full_name.toLowerCase().includes(needle) ||
              lead.handle.toLowerCase().includes(needle) ||
              lead.email.toLowerCase().includes(needle),
          )
          .slice(0, 8)
          .map((lead) => ({
            id: lead.id,
            full_name: lead.full_name,
            handle: lead.handle,
            email: lead.email,
          }));
      }
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, handle, email")
        .eq("org_id", orgId!)
        .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });
  const logCallback = useMutation({
    mutationFn: async ({
      leadId,
      leadName,
      dueAt,
    }: {
      leadId: string;
      leadName: string;
      dueAt: string;
    }) => {
      const dueIso = dueAt ? new Date(dueAt).toISOString() : null;
      if (devBypass) {
        const now = new Date().toISOString();
        setDevBypassCallbacks((prev) => {
          const existingIdx = prev.findIndex((c) => c.entity_id === leadId);
          const row: CallbackRow = {
            id: existingIdx >= 0 ? prev[existingIdx].id : `dev-callback-${leadId}-${Date.now()}`,
            entity_id: leadId,
            state: "requested",
            owner_id: null,
            due_at: dueIso,
            next_action: "Call back",
            created_at: existingIdx >= 0 ? prev[existingIdx].created_at : now,
            updated_at: now,
            payload: { lead_name: leadName },
          };
          if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx] = row;
            return next;
          }
          return [...prev, row];
        });
        return;
      }
      const { error } = await (supabase as any).from("operational_work_items").upsert(
        {
          org_id: orgId!,
          entity_type: "dialer_callback",
          entity_id: leadId,
          state: "requested",
          due_at: dueIso,
          next_action: "Call back",
          next_action_at: dueIso,
          payload: { lead_name: leadName },
        },
        { onConflict: "org_id,entity_type,entity_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Callback logged");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["dialer-callbacks", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const completeCallback = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setDevBypassCallbacks((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, state: "completed", updated_at: new Date().toISOString() } : c,
          ),
        );
        return;
      }
      const { error } = await (supabase as any)
        .from("operational_work_items")
        .update({ state: "completed", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!devBypass) qc.invalidateQueries({ queryKey: ["dialer-callbacks", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // Split date + time fields, not one native datetime-local input (visual
  // refinement pass) — composed into the same "YYYY-MM-DDTHH:mm" shape the
  // mutation always expected, so dueAt's downstream handling (parsed with
  // `new Date()`, stored as UTC via `.toISOString()`) is unchanged.
  const [callbackDueDate, setCallbackDueDate] = useState("");
  const [callbackDueTime, setCallbackDueTime] = useState("");
  const callbackDueAt =
    callbackDueDate && callbackDueTime ? `${callbackDueDate}T${callbackDueTime}` : "";
  const resetCallbackDueAt = () => {
    setCallbackDueDate("");
    setCallbackDueTime("");
  };

  // Persisted hot-lead alerts (spec section 4: "Create an InsightOS
  // notification"). A row here IS the InsightOS-side notification — durable,
  // queryable, visible to the whole team — independent of whether Discord
  // delivery is configured. Delivery itself stays honestly "unavailable"
  // until a real Discord webhook secret is connected (never fabricated).
  const { data: loggedAlertKeys = new Set<string>() } = useQuery({
    queryKey: ["sla-breach-keys", orgId],
    enabled: isDialer && !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_breach_records")
        .select("notification_key")
        .eq("org_id", orgId!)
        .limit(1000);
      if (error) throw error;
      return new Set((data ?? []).map((r: { notification_key: string }) => r.notification_key));
    },
  });
  const logAlert = useMutation({
    mutationFn: async (item: SpeedToLeadQueueItem) => {
      if (!item.notificationKey) throw new Error("No stable key for this lead yet");
      await (supabase as any).from("sla_breach_records").upsert(
        {
          org_id: orgId!,
          lead_id: item.leadId,
          owner_id: item.ownerId,
          notification_key: item.notificationKey,
          threshold_minutes: item.thresholdMinutes,
          breached_at: new Date().toISOString(),
          status: "open",
        },
        { onConflict: "org_id,notification_key", ignoreDuplicates: true },
      );
      const { error } = await (supabase as any).from("notification_attempts").upsert(
        {
          org_id: orgId!,
          idempotency_key: item.notificationKey,
          event: "speed_to_lead.breached",
          recipient: item.ownerId,
          channel: "discord",
          provider: "discord-webhook",
          status: "unavailable",
          payload: { leadId: item.leadId, source: item.source, status: item.status },
        },
        { onConflict: "org_id,idempotency_key", ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("InsightOS alert logged — Discord delivery unavailable (no webhook connected)");
      qc.invalidateQueries({ queryKey: ["sla-breach-keys", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: speedEvents = [] } = useQuery({
    queryKey: ["speed-to-lead", role, orgId, range.from, range.to],
    enabled: isDialer && !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lead_response_events")
        .select(
          "lead_id,lead_created_at,lead_assigned_at,first_attempt_at,first_connection_at,rep_id,source_platform,lead_source,campaign,connected,qualified,set,booked_call,showed,closed,content_id,call_id,client_id,payment_id,event_at,event_type",
        )
        .eq("org_id", orgId!)
        .gte("lead_created_at", `${range.from}T00:00:00`)
        .lte("lead_created_at", `${range.to}T23:59:59`)
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const speedSummary = useMemo(() => {
    const weekday = speedWeekday === "all" ? undefined : Number(speedWeekday);
    const [hourStart, hourEnd] =
      speedTimeWindow === "all" ? [undefined, undefined] : speedTimeWindow.split("-").map(Number);
    const filtered = filterSpeedEvents(
      speedEvents.map((event: any) => ({
        leadCreatedAt: event.lead_created_at,
        leadAssignedAt: event.lead_assigned_at,
        firstAttemptAt: event.first_attempt_at,
        firstConnectionAt: event.first_connection_at,
        repId: event.rep_id,
        sourcePlatform: normalizeSocialPlatform(event.lead_source, event.source_platform),
        leadSource: event.lead_source,
        campaign: event.campaign,
        connected: event.connected,
        qualified: event.qualified,
        set: event.set,
        bookedCall: event.booked_call,
        showed: event.showed,
        close: event.closed,
      })),
      {
        sourcePlatform: platformFilter === "all" ? undefined : platformFilter,
        leadSource: sourceFilter === "all" ? undefined : sourceFilter,
        weekday,
        hourStart,
        hourEnd,
      },
    );
    const summary = speedDistribution(filtered);
    return {
      ...summary,
      comparison: compareSpeedBuckets(
        filtered.map((event: any) => ({
          minutesToAttempt: calculateSpeedToLead(event).minutesToAttempt,
          connected: event.connected,
          qualified: event.qualified,
          set: event.set,
          bookedCall: event.bookedCall,
          showed: event.showed,
          close: event.close,
        })),
      ),
    };
  }, [speedEvents, platformFilter, sourceFilter, speedWeekday, speedTimeWindow]);
  const operationalSpeedQueue = useMemo(
    () =>
      buildSpeedToLeadQueue(
        speedEvents.map((event: any) => ({
          leadId: event.lead_id,
          leadCreatedAt: event.lead_created_at,
          leadAssignedAt: event.lead_assigned_at,
          firstAttemptAt: event.first_attempt_at,
          firstConnectionAt: event.first_connection_at,
          repId: event.rep_id,
          sourcePlatform: event.source_platform,
          leadSource: event.lead_source,
          campaign: event.campaign,
        })),
        new Date(),
        [],
        { connectorAvailable: false },
      ),
    [speedEvents],
  );
  const rows = (allRows ?? []).filter((r) => {
    const matchesMember = member === ALL_MEMBERS || r.team_member_name === member;
    const source = String((r as Record<string, unknown>).lead_source ?? "").trim();
    const explicitPlatform =
      String((r as Record<string, unknown>).source_platform ?? "").trim() || null;
    const matchesPlatform = platformMatches(
      source,
      platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all",
      explicitPlatform,
    );
    const matchesSource = sourceFilter === "all" || source === sourceFilter;
    return matchesMember && matchesPlatform && matchesSource;
  });
  const {
    page,
    setPage,
    pageCount,
    paged: pagedRows,
    total: totalRows,
    pageSize,
  } = usePagination(rows ?? [], 25);

  const sum = (k: string) =>
    (rows ?? []).reduce((s, r) => s + (Number((r as Record<string, unknown>)[k] ?? 0) || 0), 0);
  const observed = (k: string) =>
    (rows ?? []).some((r) => Object.prototype.hasOwnProperty.call(r, k));
  const optionalMetric = (k: string) => (observed(k) ? sum(k) : null);
  const inboundDms = optionalMetric("inbound_dms_sent");
  const outboundDms = optionalMetric("outbound_dms_sent");
  const replies = optionalMetric("replies");
  const followupsSent = optionalMetric("followups_sent");
  const linksClicked = optionalMetric("links_clicked");
  const postBookingVisits = optionalMetric("post_booking_page_visits");
  const preCallWatches = optionalMetric("pre_call_video_watches");
  const dials = sum("dials");
  const conns = sum("connections");
  const contacted = sum("leads_contacted");
  const linksSent = sum("links_sent");
  const qualified = sum("qualified_convos");
  const sets = sum("sets");
  const onCalendar = sum("calls_on_calendar");
  const showed = sum("live_calls");
  const closes = sum("closes");
  const downsells = sum("downsells");
  const cashCents = sum("cash_collected_cents");
  const revCents = sum("total_revenue_cents");

  // Prior equivalent period — real deltas and trend sparklines on every tile (Part 2),
  // not the hardcoded decorative arrays this app shipped elsewhere with the visual redesign.
  const prevRange = useMemo(() => priorPeriod(range.from, range.to), [range.from, range.to]);
  const { data: prevAllRows } = useQuery({
    queryKey: ["activity-prev", role, orgId, prevRange.from, prevRange.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_activity")
        .select("*")
        .eq("org_id", orgId!)
        .eq("role", role)
        .gte("activity_date", prevRange.from)
        .lte("activity_date", prevRange.to)
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const prevRows = (prevAllRows ?? []).filter((r) => {
    const matchesMember = member === ALL_MEMBERS || r.team_member_name === member;
    const source = String((r as Record<string, unknown>).lead_source ?? "").trim();
    const explicitPlatform =
      String((r as Record<string, unknown>).source_platform ?? "").trim() || null;
    const matchesPlatform = platformMatches(
      source,
      platformFilter as (typeof SOCIAL_PLATFORMS)[number] | "all",
      explicitPlatform,
    );
    const matchesSource = sourceFilter === "all" || source === sourceFilter;
    return matchesMember && matchesPlatform && matchesSource;
  });
  const prevSum = (k: string) =>
    (prevRows ?? []).reduce((s, r) => s + (Number((r as Record<string, unknown>)[k] ?? 0) || 0), 0);
  const prevDials = prevSum("dials");
  const prevConns = prevSum("connections");
  const prevContacted = prevSum("leads_contacted");
  const prevLinksSent = prevSum("links_sent");
  const prevQualified = prevSum("qualified_convos");
  const prevSets = prevSum("sets");
  const prevOnCalendar = prevSum("calls_on_calendar");
  const prevShowed = prevSum("live_calls");
  const prevCloses = prevSum("closes");
  const prevDownsells = prevSum("downsells");
  const prevCashCents = prevSum("cash_collected_cents");
  const prevRevCents = prevSum("total_revenue_cents");

  const daySeries = useMemo(
    () =>
      dailySeries(rows ?? [], range.from, range.to, (r) => r.activity_date, {
        dials: (r) => r.dials ?? 0,
        connections: (r) => r.connections ?? 0,
        leads_contacted: (r) => r.leads_contacted ?? 0,
        links_sent: (r) => r.links_sent ?? 0,
        qualified_convos: (r) => r.qualified_convos ?? 0,
        sets: (r) => r.sets ?? 0,
        calls_on_calendar: (r) => r.calls_on_calendar ?? 0,
        live_calls: (r) => r.live_calls ?? 0,
        closes: (r) => r.closes ?? 0,
        downsells: (r) => r.downsells ?? 0,
        cash_collected_cents: (r) => r.cash_collected_cents ?? 0,
        total_revenue_cents: (r) => r.total_revenue_cents ?? 0,
      }),
    [rows, range.from, range.to],
  );

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

  const parseObjections = (raw: string | null | undefined) =>
    raw
      ? String(raw)
          .split(/[,;\n|]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean)
      : [];

  // Objection frequency aggregation across all rows in range (uses unfiltered
  // allRows so the chart reflects org-wide patterns). Resolved-rate isn't
  // tracked here — setter_activity is a daily rollup, not a per-call log — so
  // that field stays omitted rather than faked. Mechanism is keyword-inferred
  // (content-mechanisms.ts scoreText/pickTop), always labeled "(inferred)".
  const rawObjectionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of allRows ?? []) {
      for (const p of parseObjections(r.objections)) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, total]) => ({ key, total }));
  }, [allRows]);
  const rawPrevObjectionCounts = useMemo(() => {
    const prevCounts = new Map<string, number>();
    for (const r of prevAllRows ?? []) {
      for (const p of parseObjections(r.objections)) {
        prevCounts.set(p, (prevCounts.get(p) ?? 0) + 1);
      }
    }
    return prevCounts;
  }, [prevAllRows]);

  // AI clustering (Part 2, item 4) — same pattern as the Closer dashboard:
  // groups raw exact-string buckets ("price," "too expensive," "can't afford
  // it") into canonical objections via the Lovable AI Gateway, falling back to
  // today's exact-string bucketing whenever clustering hasn't resolved or the
  // AI gateway isn't configured (applyObjectionClusters returns raw 1:1 on null).
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
    queryKey: ["objection-clusters", role, orgId, distinctObjectionTexts],
    enabled: !!orgId && rawObjectionCounts.length > 0,
    queryFn: () =>
      clusterObjections({
        data: { rawCounts: rawObjectionCounts.map((r) => ({ text: r.key, count: r.total })) },
      }),
  });

  const objectionEntries = useMemo<ObjectionEntry[]>(() => {
    const grouped = applyObjectionClusters(
      rawObjectionCounts,
      rawPrevObjectionCounts,
      objectionClusterData?.clusters,
    );
    return grouped
      .map((g) => ({
        key: g.key,
        label: g.label.length > 24 ? g.label.slice(0, 24) + "…" : g.label,
        count: g.total,
        prevCount: g.prevTotal,
        mechanism: pickTop(scoreText(g.label)),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [rawObjectionCounts, rawPrevObjectionCounts, objectionClusterData]);

  // Per-setter momentum: avg sets in last 7 days vs personal best 7-day window in the visible range
  const momentum = useMemo(() => {
    const byName = new Map<string, { date: string; sets: number }[]>();
    for (const r of allRows ?? []) {
      const arr = byName.get(r.team_member_name) ?? [];
      arr.push({ date: r.activity_date, sets: r.sets ?? 0 });
      byName.set(r.team_member_name, arr);
    }
    const today = new Date(range.to);
    const cutoff = new Date(today.getTime() - 6 * 86400e3).toISOString().slice(0, 10);
    return Array.from(byName.entries())
      .map(([name, entries]) => {
        const recent = entries.filter((e) => e.date >= cutoff);
        const recentAvg = recent.length
          ? recent.reduce((s, e) => s + e.sets, 0) / recent.length
          : 0;
        // personal best: max single-day in the range (proxy for "best")
        const best = entries.reduce((m, e) => Math.max(m, e.sets), 0);
        const score = best > 0 ? Math.round((recentAvg / best) * 100) : 0;
        return { name, recentAvg: +recentAvg.toFixed(1), best, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [allRows, range.to]);

  // Setter scorecard radar — normalized 0-100 across key metrics
  const scorecard = useMemo(() => {
    const byName = new Map<
      string,
      { sets: number; live: number; oncal: number; closes: number; qual: number; reach: number }
    >();
    for (const r of allRows ?? []) {
      const x = byName.get(r.team_member_name) ?? {
        sets: 0,
        live: 0,
        oncal: 0,
        closes: 0,
        qual: 0,
        reach: 0,
      };
      x.sets += r.sets ?? 0;
      x.live += r.live_calls ?? 0;
      x.oncal += r.calls_on_calendar ?? 0;
      x.closes += r.closes ?? 0;
      x.qual += r.qualified_convos ?? 0;
      x.reach += (r.leads_contacted ?? 0) + (r.connections ?? 0);
      byName.set(r.team_member_name, x);
    }
    const people = Array.from(byName.entries()).map(([name, x]) => ({
      name,
      Sets: x.sets,
      ShowRate: x.oncal ? (x.live / x.oncal) * 100 : 0,
      CloseRate: x.live ? (x.closes / x.live) * 100 : 0,
      QualRate: x.reach ? (x.qual / x.reach) * 100 : 0,
    }));
    const maxSets = Math.max(1, ...people.map((p) => p.Sets));
    // Build per-axis dataset for recharts radar
    const axes = ["Sets", "ShowRate", "CloseRate", "QualRate"] as const;
    return axes.map((axis) => {
      const row: Record<string, number | string> = { axis };
      for (const p of people) {
        row[p.name] = axis === "Sets" ? Math.round((p.Sets / maxSets) * 100) : Math.round(p[axis]);
      }
      return row;
    });
  }, [allRows]);
  const scorecardNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of allRows ?? []) names.add(r.team_member_name);
    return Array.from(names);
  }, [allRows]);
  const radarColors = [
    "oklch(0.7 0.2 258)",
    "oklch(0.72 0.18 25)",
    "oklch(0.7 0.18 145)",
    "oklch(0.72 0.18 60)",
    "oklch(0.7 0.18 320)",
  ];

  // Leaderboard — ranked by what this role is actually paid on, not cash (setters/
  // dialers earn a flat % of collected cash regardless of who closes it). Dialer
  // ranks by connects + sets (pickup rate is its unique differentiator); Setter
  // ranks by qualified convos + sets (qual rate + share of total sets differentiate).
  // Org-wide (ignores the member filter), matching this file's own objections/
  // momentum/scorecard convention of deriving cross-rep comparisons from allRows.
  const leaderboard = useMemo(() => {
    const byName = new Map<
      string,
      { sets: number; qualified: number; contacted: number; connections: number; dials: number }
    >();
    for (const r of allRows ?? []) {
      const x = byName.get(r.team_member_name) ?? {
        sets: 0,
        qualified: 0,
        contacted: 0,
        connections: 0,
        dials: 0,
      };
      x.sets += r.sets ?? 0;
      x.qualified += r.qualified_convos ?? 0;
      x.contacted += r.leads_contacted ?? 0;
      x.connections += r.connections ?? 0;
      x.dials += r.dials ?? 0;
      byName.set(r.team_member_name, x);
    }
    const totalSets = Array.from(byName.values()).reduce((s, x) => s + x.sets, 0);
    return Array.from(byName.entries())
      .map(([name, x]) => ({
        name,
        sets: x.sets,
        qualRate: x.contacted ? (x.qualified / x.contacted) * 100 : 0,
        pickupRate: x.dials ? (x.connections / x.dials) * 100 : 0,
        connections: x.connections,
        shareOfSets: totalSets ? (x.sets / totalSets) * 100 : 0,
        rankScore: isDialer ? x.connections + x.sets : x.qualified + x.sets,
      }))
      .sort((a, b) => b.rankScore - a.rankScore);
  }, [allRows, isDialer]);

  // Leaderboard's own independently-ranged query (Part C3) — separate from the
  // page-range `allRows` query above so overriding the leaderboard's date
  // range never touches the rest of the page.
  const { data: lbRows } = useQuery({
    queryKey: ["activity-lb", role, orgId, lbRange.from, lbRange.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_activity")
        .select(
          "team_member_name, sets, qualified_convos, leads_contacted, connections, dials, closes, live_calls, calls_on_calendar, links_sent, cash_collected_cents",
        )
        .eq("org_id", orgId!)
        .eq("role", role)
        .gte("activity_date", lbRange.from)
        .lte("activity_date", lbRange.to)
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  const lbPeople = useMemo<ActivityLbPerson[]>(() => {
    const byName = new Map<
      string,
      {
        sets: number;
        qualified: number;
        contacted: number;
        connections: number;
        dials: number;
        closes: number;
        live: number;
        oncal: number;
        linksSent: number;
        cash: number;
      }
    >();
    for (const r of lbRows ?? []) {
      const x = byName.get(r.team_member_name) ?? {
        sets: 0,
        qualified: 0,
        contacted: 0,
        connections: 0,
        dials: 0,
        closes: 0,
        live: 0,
        oncal: 0,
        linksSent: 0,
        cash: 0,
      };
      x.sets += r.sets ?? 0;
      x.qualified += r.qualified_convos ?? 0;
      x.contacted += r.leads_contacted ?? 0;
      x.connections += r.connections ?? 0;
      x.dials += r.dials ?? 0;
      x.closes += r.closes ?? 0;
      x.live += r.live_calls ?? 0;
      x.oncal += r.calls_on_calendar ?? 0;
      x.linksSent += r.links_sent ?? 0;
      x.cash += r.cash_collected_cents ?? 0;
      byName.set(r.team_member_name, x);
    }
    return Array.from(byName.entries()).map(([name, x]) => ({
      name,
      cash: x.cash,
      sets: x.sets,
      qualified: x.qualified,
      closes: x.closes,
      showRate: x.oncal ? (x.live / x.oncal) * 100 : 0,
      closeRate: x.live ? (x.closes / x.live) * 100 : 0,
      linksSent: x.linksSent,
      contacted: x.contacted,
      connections: x.connections,
      dials: x.dials,
      pickupRate: x.dials ? (x.connections / x.dials) * 100 : 0,
    }));
  }, [lbRows]);

  // Activity heatmap — DM Setter tracks leads_contacted (the per-day "DMs sent"
  // volume field); Inbound Dialer tracks dials. Same weekday-grid pattern as Closer.
  // Confirmed real bug (Sales Tracking Part 2): both labels AND per-cell data
  // previously iterated unfiltered `allRows` — selecting a member did nothing
  // to this instrument at all, unlike every other filtered piece on this
  // page. Switched to the member-filtered `rows` for both (a no-op when
  // `member === ALL_MEMBERS`, since `rows` then equals `allRows`).
  const activityHeatmap = useMemo(() => {
    const namesInFilteredRows = new Set(
      (rows ?? []).map((r) => r.team_member_name).filter((n): n is string => !!n),
    );
    const names = leaderboard
      .map((p) => p.name)
      .filter((n) => namesInFilteredRows.has(n))
      .slice(0, 6);
    const cols = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const field = isDialer ? "dials" : "leads_contacted";
    const data = names.map((name) => {
      const row = new Array(7).fill(0);
      for (const r of rows ?? []) {
        if (r.team_member_name !== name || !r.activity_date) continue;
        const day = (new Date(`${r.activity_date}T12:00:00`).getDay() + 6) % 7; // Mon=0..Sun=6
        row[day] += Number((r as Record<string, unknown>)[field] ?? 0);
      }
      return row;
    });
    return { rows: names, cols, data };
  }, [rows, leaderboard, isDialer]);

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const payload = {
        org_id: orgId!,
        role,
        team_member_name: String(f.get("team_member_name") || ""),
        activity_date: String(f.get("activity_date") || new Date().toISOString().slice(0, 10)),
        rate_today: f.get("rate_today") ? Number(f.get("rate_today")) : null,
        objections: String(f.get("objections") || "") || null,
        notes: String(f.get("notes") || "") || null,
        lead_source: String(f.get("lead_source") || "") || null,
        leads_contacted: NUM(f.get("leads_contacted")),
        links_sent: NUM(f.get("links_sent")),
        qualified_convos: NUM(f.get("qualified_convos")),
        sets: NUM(f.get("sets")),
        calls_on_calendar: NUM(f.get("calls_on_calendar")),
        live_calls: NUM(f.get("live_calls")),
        closes: NUM(f.get("closes")),
        downsells: NUM(f.get("downsells")),
        cash_collected_cents: Math.round(NUM(f.get("cash_collected")) * 100),
        total_revenue_cents: Math.round(NUM(f.get("total_revenue")) * 100),
        dials: NUM(f.get("dials")),
        connections: NUM(f.get("connections")),
        // DM-setter-only metrics (spec section 3) — left unset (not zeroed) on
        // dialer rows so `observed()` in the dashboard can tell "never asked"
        // apart from "asked, logged zero".
        ...(isDialer
          ? {}
          : {
              inbound_dms_sent: NUM(f.get("inbound_dms_sent")),
              outbound_dms_sent: NUM(f.get("outbound_dms_sent")),
              replies: NUM(f.get("replies")),
              followups_sent: NUM(f.get("followups_sent")),
              links_clicked: NUM(f.get("links_clicked")),
              post_booking_page_visits: NUM(f.get("post_booking_page_visits")),
              pre_call_video_watches: NUM(f.get("pre_call_video_watches")),
            }),
      };
      if (!payload.team_member_name) throw new Error("Team member name required");
      const { error } = await supabase.from("setter_activity").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Activity logged");
      qc.invalidateQueries({ queryKey: ["activity", role] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const activeReps = scorecardNames.length;
  const fmtN0 = (n: number) => Math.round(n).toLocaleString();

  return (
    <>
      <TopBar title={title} subtitle={subtitle} showDateRange />
      <div className="p-6 space-y-4">
        {/* Summary hero moved to the top of the page (was buried below Speed
            to Lead / Active Leads for the Dialer role) so it appears first,
            matching DM Setter/Closer's own placement. */}
        <PageHero
          icon={
            isDialer ? <PhoneIncoming className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />
          }
          eyebrow="Rep Efficiency"
          title={title}
          subtitle={subtitle}
          status={
            isDialer
              ? [
                  { label: `${activeReps} active dialers`, tone: "default" },
                  {
                    label: `${pct(conns, dials)} pick-up rate`,
                    tone: dials ? (conns / dials >= 0.3 ? "success" : "warning") : "default",
                  },
                ]
              : [
                  { label: `${activeReps} active setters`, tone: "default" },
                  {
                    label: `${pct(sets, qualified)} set rate`,
                    tone: qualified ? (sets / qualified >= 0.3 ? "success" : "warning") : "default",
                  },
                ]
          }
        />
        {isDialer && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Inbound response intelligence
                </div>
                <div className="mt-1 text-base font-semibold">Speed to Lead</div>
              </div>
              <span className="text-3xs text-muted-foreground">Assignment → first attempt</span>
            </div>
            {speedSummary.contacted ? (
              <>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Select value={speedWeekday} onValueChange={setSpeedWeekday}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Day of week" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All weekdays</SelectItem>
                      <SelectItem value="0">Sunday</SelectItem>
                      <SelectItem value="1">Monday</SelectItem>
                      <SelectItem value="2">Tuesday</SelectItem>
                      <SelectItem value="3">Wednesday</SelectItem>
                      <SelectItem value="4">Thursday</SelectItem>
                      <SelectItem value="5">Friday</SelectItem>
                      <SelectItem value="6">Saturday</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={speedTimeWindow} onValueChange={setSpeedTimeWindow}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Time of day" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All times</SelectItem>
                      <SelectItem value="0-11">Morning</SelectItem>
                      <SelectItem value="12-16">Afternoon</SelectItem>
                      <SelectItem value="17-23">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [
                      "Median",
                      speedSummary.medianMinutes == null
                        ? "—"
                        : `${speedSummary.medianMinutes.toFixed(1)} min`,
                    ],
                    [
                      "Average",
                      speedSummary.averageMinutes == null
                        ? "—"
                        : `${speedSummary.averageMinutes.toFixed(1)} min`,
                    ],
                    ["Within 5 min", `${speedSummary.within[5]} / ${speedSummary.contacted}`],
                    [
                      "Fastest",
                      speedSummary.fastestMinutes == null
                        ? "—"
                        : `${speedSummary.fastestMinutes.toFixed(1)} min`,
                    ],
                    [
                      "Slowest",
                      speedSummary.slowestMinutes == null
                        ? "—"
                        : `${speedSummary.slowestMinutes.toFixed(1)} min`,
                    ],
                    ["Uncontacted", String(speedSummary.uncontacted)],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-xl border border-border/70 bg-background/40 p-3"
                    >
                      <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-2 font-mono text-xl font-semibold text-spectrum-cold">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    ["<1 min", speedSummary.buckets.underOneMinute],
                    ["<5 min", speedSummary.buckets.underFiveMinutes],
                    ["<15 min", speedSummary.buckets.underFifteenMinutes],
                    ["<30 min", speedSummary.buckets.underThirtyMinutes],
                    ["<1 hour", speedSummary.buckets.underOneHour],
                    [">1 hour", speedSummary.buckets.overOneHour],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg border border-border/70 bg-background/30 px-2 py-2"
                    >
                      <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                        {label}
                      </div>
                      <div className="mt-1 font-mono">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-border/70 bg-background/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold">Actionable 5-minute queue</div>
                      <div className="mt-1 text-3xs uppercase tracking-wider text-muted-foreground">
                        Verified lead-response events · delivery remains unavailable until a
                        connector is configured
                      </div>
                    </div>
                    <span className="text-3xs uppercase tracking-wider text-amber-300">
                      {operationalSpeedQueue.length} open
                    </span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    {operationalSpeedQueue.length ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/70 text-left text-muted-foreground">
                            <th className="pb-2 pr-3">Lead</th>
                            <th className="pb-2 pr-3">Urgency</th>
                            <th className="pb-2 pr-3">Source</th>
                            <th className="pb-2 pr-3">Owner</th>
                            <th className="pb-2 pr-3">Action</th>
                            <th className="pb-2">InsightOS alert</th>
                          </tr>
                        </thead>
                        <tbody>
                          {operationalSpeedQueue.slice(0, 25).map((item) => {
                            const logged = item.notificationKey
                              ? loggedAlertKeys.has(item.notificationKey)
                              : false;
                            return (
                              <tr
                                key={item.notificationKey ?? `${item.leadId}-${item.status}`}
                                className="border-b border-border/40 last:border-0"
                              >
                                <td className="py-2 pr-3 font-mono">
                                  {item.leadId ?? "Unavailable"}
                                </td>
                                <td className="py-2 pr-3 font-mono uppercase text-amber-300">
                                  {item.status}
                                </td>
                                <td className="py-2 pr-3">{item.source ?? "Unavailable"}</td>
                                <td className="py-2 pr-3">{item.ownerId ?? "Owner unavailable"}</td>
                                <td className="py-2 pr-3">
                                  {item.leadId ? (
                                    <a
                                      className="text-accent underline underline-offset-2"
                                      href={`/leads?leadId=${encodeURIComponent(item.leadId)}`}
                                    >
                                      Open lead
                                    </a>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="py-2">
                                  {logged ? (
                                    <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                                      Logged · Discord unavailable
                                    </span>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 text-2xs"
                                      disabled={!item.notificationKey || logAlert.isPending}
                                      onClick={() => logAlert.mutate(item)}
                                    >
                                      Log alert
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No pending or breached eligible leads in this range.
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-border/70 bg-background/30 p-3">
                  <div className="text-xs font-semibold">Observed segment performance</div>
                  <div className="mt-1 text-3xs uppercase tracking-wider text-muted-foreground">
                    Correlation only · not a causal claim
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-muted-foreground">
                          <th className="pb-2 pr-3">Metric</th>
                          <th className="pb-2 pr-3">&lt;5 min</th>
                          <th className="pb-2">30+ min</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          [
                            "Connection rate",
                            speedSummary.comparison.underFive.connectionRate,
                            speedSummary.comparison.thirtyPlus.connectionRate,
                          ],
                          [
                            "Qualified convo rate",
                            speedSummary.comparison.underFive.qualificationRate,
                            speedSummary.comparison.thirtyPlus.qualificationRate,
                          ],
                          [
                            "Set rate",
                            speedSummary.comparison.underFive.setRate,
                            speedSummary.comparison.thirtyPlus.setRate,
                          ],
                          [
                            "Booked-call rate",
                            speedSummary.comparison.underFive.bookedCallRate,
                            speedSummary.comparison.thirtyPlus.bookedCallRate,
                          ],
                          [
                            "Show rate",
                            speedSummary.comparison.underFive.showRate,
                            speedSummary.comparison.thirtyPlus.showRate,
                          ],
                          [
                            "Close rate",
                            speedSummary.comparison.underFive.closeRate,
                            speedSummary.comparison.thirtyPlus.closeRate,
                          ],
                        ].map(([label, fast, slow]) => (
                          <tr
                            key={label as string}
                            className="border-b border-border/40 last:border-0"
                          >
                            <td className="py-2 pr-3 text-muted-foreground">{label}</td>
                            <td className="py-2 pr-3 font-mono">
                              {fast == null ? "Unavailable" : `${(Number(fast) * 100).toFixed(1)}%`}
                            </td>
                            <td className="py-2 font-mono">
                              {slow == null ? "Unavailable" : `${(Number(slow) * 100).toFixed(1)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                Speed to Lead is unavailable until lead response events are connected.
              </div>
            )}
          </div>
        )}
        {isDialer && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Active leads available to dial
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(1, ticketTierSplit.byTier.length + 1)}, minmax(0, 1fr))`,
              }}
            >
              {ticketTierSplit.byTier.map((tier, i) => (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => setActiveLeadsTier(tier.key)}
                  disabled={tier.count === 0}
                  className={`rounded-xl border border-border/70 bg-background/40 p-3 text-left transition hover:bg-background/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border/70 disabled:hover:bg-background/40 ${i % 2 === 0 ? "hover:border-spectrum-hot/50" : "hover:border-spectrum-mid/50"}`}
                >
                  <div className="truncate text-3xs uppercase tracking-wider text-muted-foreground">
                    {tier.label}
                  </div>
                  <div
                    className={`mt-2 font-mono text-xl font-semibold ${i % 2 === 0 ? "text-spectrum-hot" : "text-spectrum-mid"}`}
                  >
                    {tier.count}
                  </div>
                </button>
              ))}
              <div className="rounded-xl border border-border/70 bg-background/40 p-3">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Unclassified
                </div>
                <div className="mt-2 font-mono text-xl font-semibold text-muted-foreground">
                  {ticketTierSplit.unclassified}
                </div>
              </div>
            </div>
            {ticketTierSplit.byTier.length === 0 && (
              <div className="mt-2 text-3xs text-muted-foreground">
                No ticket tiers configured yet — define them in Client DNA → Offer / Ticket /
                Payment Configuration.
              </div>
            )}
            {ticketTierSplit.unclassified > 0 && (
              <div className="mt-2 text-3xs text-muted-foreground">
                Unclassified leads have no ticket_tier set on the lead record, or their value
                doesn't match a currently configured tier.
              </div>
            )}
            <MetricDetailPanel
              open={activeLeadsTier != null}
              onOpenChange={(v) => !v && setActiveLeadsTier(null)}
              title={`${offerTiers.find((t) => t.key === activeLeadsTier)?.label ?? activeLeadsTier} leads available to dial`}
              subtitle={`${activeLeadsDrilldownRows.length} active lead${activeLeadsDrilldownRows.length === 1 ? "" : "s"} · ${range.from} → ${range.to} · not yet closed, disqualified, or no-showed`}
              columns={[
                {
                  key: "lead",
                  label: "Lead",
                  render: (l) => (
                    <Link
                      to="/leads"
                      search={{ leadId: l.id }}
                      className="font-medium text-primary hover:underline"
                    >
                      {l.full_name ?? l.handle ?? "Unnamed lead"}
                    </Link>
                  ),
                },
                {
                  key: "phone",
                  label: "Phone",
                  render: (l) =>
                    l.phone ? (
                      <a
                        href={`tel:${l.phone.replace(/[^\d+]/g, "")}`}
                        className="text-primary hover:underline"
                      >
                        {l.phone}
                      </a>
                    ) : (
                      "—"
                    ),
                },
                {
                  key: "email",
                  label: "Email",
                  render: (l) => l.email ?? "—",
                },
                {
                  key: "source",
                  label: "Source",
                  render: (l) => l.source_platform ?? l.source_campaign ?? "Unknown",
                },
                {
                  key: "created",
                  label: "Created",
                  render: (l) => (l.created_at ? new Date(l.created_at).toLocaleDateString() : "—"),
                },
                {
                  key: "age",
                  label: "Age",
                  render: (l) => {
                    if (!l.created_at) return "—";
                    const days = Math.floor(
                      (Date.now() - new Date(l.created_at).getTime()) / 86_400_000,
                    );
                    return `${days}d`;
                  },
                },
                {
                  key: "status",
                  label: "Status",
                  render: (l) => l.status.replace(/_/g, " "),
                },
                {
                  key: "assigned",
                  label: "Assigned rep",
                  render: (l) =>
                    l.assigned_setter_id ? `Rep ${l.assigned_setter_id.slice(0, 8)}` : "Unassigned",
                },
                {
                  key: "nextFollowUp",
                  label: "Next follow-up",
                  render: (l) => {
                    const cb = callbacks.find(
                      (c) => c.entity_id === l.id && c.state !== "completed",
                    );
                    return cb?.due_at ? new Date(cb.due_at).toLocaleString() : "Not scheduled";
                  },
                },
                {
                  key: "qualification",
                  label: "Qualification notes",
                  render: (l) => l.qualification_notes ?? "—",
                },
              ]}
              rows={activeLeadsDrilldownRows}
              rowKey={(l) => l.id}
              cap={{
                status: "insufficient_data",
                sentence: `A pipeline snapshot for ${range.from} → ${range.to}, not a funnel stage — no prior-stage constraint to derive.`,
              }}
              working={{
                status: "insufficient_data",
                sentence:
                  "Assigned-dialer and call-attempt tracking aren't connected on the lead record yet, so only what's actually stored (status, source, created date, next scheduled follow-up) is shown here.",
              }}
              emptyRowsLabel="No leads in this tier right now."
            />
          </div>
        )}
        {!isDialer && (
          <KpiBand
            title="DM Setter · Primary Activity"
            items={[
              {
                key: "contacted",
                label: "Leads Contacted",
                value: fmtN0(contacted),
                spectrum: "cold",
              },
              {
                key: "inbound-dms",
                label: "Inbound DMs Sent",
                value: inboundDms == null ? "Unavailable" : fmtN0(inboundDms),
                spectrum: "mid",
                empty: inboundDms == null,
                emptyHint: "Requires connected message events.",
              },
              {
                key: "outbound-dms",
                label: "Outbound DMs Sent",
                value: outboundDms == null ? "Unavailable" : fmtN0(outboundDms),
                spectrum: "mid",
                empty: outboundDms == null,
                emptyHint: "Requires connected message events.",
              },
              {
                key: "reply-rate",
                label: "Reply Rate",
                value:
                  replies == null || !outboundDms
                    ? "Unavailable"
                    : `${((replies / outboundDms) * 100).toFixed(1)}%`,
                spectrum: "hot",
                empty: replies == null || !outboundDms,
                emptyHint: "Log Outbound DMs Sent and Replies to see reply rate.",
              },
              {
                key: "followups",
                label: "Follow-ups Sent",
                value: followupsSent == null ? "Unavailable" : fmtN0(followupsSent),
                spectrum: "mid",
                empty: followupsSent == null,
                emptyHint: "Requires connected message events.",
              },
              { key: "links-sent", label: "Links Sent", value: fmtN0(linksSent), spectrum: "mid" },
              {
                key: "links-clicked",
                label: "Links Clicked",
                value: linksClicked == null ? "Unavailable" : fmtN0(linksClicked),
                spectrum: "mid",
                empty: linksClicked == null,
                emptyHint: "Requires connected link events.",
              },
              {
                key: "post-booking",
                label: "Post-booking Visits",
                value: postBookingVisits == null ? "Unavailable" : fmtN0(postBookingVisits),
                spectrum: "hot",
                empty: postBookingVisits == null,
                emptyHint: "Requires connected page events.",
              },
              {
                key: "precall",
                label: "Pre-call Watches",
                value: preCallWatches == null ? "Unavailable" : fmtN0(preCallWatches),
                spectrum: "hot",
                empty: preCallWatches == null,
                emptyHint: "Requires connected video events.",
              },
            ]}
          />
        )}
        <OperationalWorkflowPanel
          role={role}
          qualified={qualified}
          sets={sets}
          booked={onCalendar}
          closes={closes}
          cashLabel={fmtMoney(cashCents)}
          linksSent={linksSent}
          connectorAvailable={false}
        />
        {(() => {
          const setterPaths: AttributionPath[] = [
            {
              id: "dm-lifecycle",
              label: "Path 1 · DM → reply → qualified → booked → showed → closed → cash",
              stages: [
                {
                  key: "outbound",
                  label: "Outbound DMs",
                  value: outboundDms,
                  detail: "Verified daily activity",
                },
                {
                  key: "inbound",
                  label: "Inbound DMs",
                  value: inboundDms,
                  detail: "Verified daily activity",
                },
                {
                  key: "replies",
                  label: "Replies",
                  value: replies,
                  detail: "Verified message replies",
                },
                {
                  key: "qualified",
                  label: "Qualified",
                  value: qualified,
                  detail: "Qualified conversations",
                },
                { key: "booked", label: "Booked", value: onCalendar, detail: "Calls on calendar" },
                { key: "showed", label: "Showed", value: showed, detail: "Live calls" },
                { key: "closed", label: "Closed", value: closes, detail: "Closed calls" },
                {
                  key: "cash",
                  label: "Cash",
                  value: cashCents ? Math.round(cashCents / 100) : 0,
                  detail: `${fmtMoney(cashCents)} collected`,
                },
              ],
            },
            {
              id: "content-mechanism",
              label: "Path 2 · format/content → conversation → booked → cash",
              stages: [
                {
                  key: "format",
                  label: "Format / content",
                  value: null,
                  detail: "No verified content-touch join in daily activity",
                },
                {
                  key: "conversation",
                  label: "Conversation",
                  value: replies,
                  detail: "Verified replies when available",
                },
                { key: "booked", label: "Booked", value: onCalendar, detail: "Calls on calendar" },
                {
                  key: "cash",
                  label: "Cash",
                  value: cashCents ? Math.round(cashCents / 100) : 0,
                  detail: `${fmtMoney(cashCents)} collected`,
                },
              ],
            },
            {
              id: "vsl-flow",
              label: "Path 3 · platform → first touch → content/campaign → setter/VSL → outcome",
              stages: [
                {
                  key: "platform",
                  label: "Platform",
                  value: null,
                  detail: "No verified platform join in aggregate activity",
                },
                {
                  key: "touch",
                  label: "First touch",
                  value: null,
                  detail: "No verified content touchpoint join",
                },
                {
                  key: "setter",
                  label: isDialer ? "Dialer" : "DM Setter",
                  value: isDialer ? dials : contacted,
                  detail: "Current role activity",
                },
                {
                  key: "qualified",
                  label: "Qualified",
                  value: qualified,
                  detail: "Qualified conversations",
                },
                { key: "booked", label: "Booked", value: onCalendar, detail: "Calls on calendar" },
                {
                  key: "cash",
                  label: "Cash",
                  value: cashCents ? Math.round(cashCents / 100) : 0,
                  detail: `${fmtMoney(cashCents)} collected`,
                },
              ],
            },
            {
              id: "dm-vsl-flow",
              label:
                "DM Setter → VSL → post-booking → testimonial → FAQ/objection → booking → cash",
              stages: [
                { key: "dm", label: "DM Setter", value: contacted, detail: "Leads contacted" },
                {
                  key: "vsl",
                  label: "VSL",
                  value: null,
                  detail: "VSL identity/event join not connected",
                },
                {
                  key: "post-booking",
                  label: "Post-booking page",
                  value: postBookingVisits,
                  detail: "Verified page visits when connected",
                },
                {
                  key: "testimonial",
                  label: "Testimonial videos",
                  value: preCallWatches,
                  detail: "Pre-call watches; video identity unavailable",
                },
                {
                  key: "faq",
                  label: "FAQ / objections",
                  value: null,
                  detail: "No verified FAQ-video event source",
                },
                { key: "booked", label: "Booking", value: onCalendar, detail: "Calls on calendar" },
                {
                  key: "cash",
                  label: "Cash",
                  value: cashCents ? Math.round(cashCents / 100) : 0,
                  detail: `${fmtMoney(cashCents)} collected`,
                },
              ],
            },
          ];
          if (isDialer) {
            return (
              <>
                <AttributionPathPanel
                  title="Inbound Dialer attribution"
                  subtitle="Source → capture → connection → qualified → booked → showed → closed → cash"
                  paths={[setterPaths[2]]}
                />
                <AttributionPathPanel
                  title="Dialer callbacks & appointment quality"
                  subtitle="Callbacks Requested → Due Today → Completed Today → Booked → Closed → Cash"
                  paths={[
                    {
                      id: "callbacks",
                      label: "Callback workflow",
                      stages: [
                        {
                          key: "requested",
                          label: "Callbacks Requested",
                          value: callbackFunnel.requested,
                          detail: "Logged in this range",
                        },
                        {
                          key: "due",
                          label: "Due Today",
                          value: callbackFunnel.dueToday,
                          detail: "due_at falls today",
                        },
                        {
                          key: "completed",
                          label: "Completed Today",
                          value: callbackFunnel.completedToday,
                          detail: "Marked completed today",
                        },
                        {
                          key: "booked",
                          label: "Calls Booked",
                          value: onCalendar,
                          detail: "Verified calls on calendar",
                        },
                        {
                          key: "closed",
                          label: "Closed",
                          value: closes,
                          detail: "Verified closes",
                        },
                        {
                          key: "cash",
                          label: "Cash",
                          value: cashCents ? Math.round(cashCents / 100) : 0,
                          detail: `${fmtMoney(cashCents)} collected`,
                        },
                      ],
                    },
                    {
                      id: "appointment-quality",
                      label: "Appointment quality",
                      stages: [
                        {
                          key: "cancel",
                          label: "Cancellation Rate",
                          value:
                            appointmentQuality.cancellationRate == null
                              ? null
                              : Math.round(appointmentQuality.cancellationRate),
                          detail: appointmentQuality.total
                            ? `${appointmentQuality.total} scheduled calls in range`
                            : "No scheduled calls in range",
                        },
                        {
                          key: "reschedule",
                          label: "Reschedule Rate",
                          value:
                            appointmentQuality.rescheduleRate == null
                              ? null
                              : Math.round(appointmentQuality.rescheduleRate),
                          detail: appointmentQuality.total
                            ? `${appointmentQuality.total} scheduled calls in range`
                            : "No scheduled calls in range",
                        },
                        {
                          key: "no-show",
                          label: "No-show Rate",
                          value:
                            appointmentQuality.noShowRate == null
                              ? null
                              : Math.round(appointmentQuality.noShowRate),
                          detail: appointmentQuality.total
                            ? `${appointmentQuality.total} scheduled calls in range`
                            : "No scheduled calls in range",
                        },
                        {
                          key: "recovery",
                          label: "No-show Recovery",
                          value:
                            appointmentQuality.noShowRecoveryRate == null
                              ? null
                              : Math.round(appointmentQuality.noShowRecoveryRate),
                          detail: "% of no-shows later marked recovered on a follow-up call",
                        },
                      ],
                    },
                  ]}
                />
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Log a callback
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="relative">
                      <Label className="text-2xs">Lead</Label>
                      {callbackSelectedLead ? (
                        <div className="mt-1 flex w-fit items-center gap-2 rounded-lg border border-spectrum-mid/40 bg-spectrum-mid/10 py-1.5 pr-1.5 pl-2.5">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-spectrum-mid shadow-[0_0_6px_var(--spectrum-mid)]" />
                          <span className="text-xs font-semibold text-foreground">
                            {callbackSelectedLead.full_name ??
                              callbackSelectedLead.handle ??
                              callbackSelectedLead.email}
                          </span>
                          {callbackSelectedLead.email && (
                            <span className="text-3xs text-muted-foreground">
                              {callbackSelectedLead.email}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label="Change lead"
                            onClick={() => setCallbackSelectedLead(null)}
                            className="rounded p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <Input
                            value={callbackLeadQuery}
                            onChange={(e) => setCallbackLeadQuery(e.target.value)}
                            placeholder="Search a Legacy Lead by name, handle, or email"
                            className="mt-1 h-8 w-72 text-xs"
                          />
                          {callbackLeadResults.length > 0 && (
                            <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-md border border-border bg-popover shadow-md">
                              {callbackLeadResults.map((lead) => (
                                <button
                                  key={lead.id}
                                  type="button"
                                  className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-muted"
                                  onClick={() => {
                                    setCallbackSelectedLead(lead);
                                    setCallbackLeadQuery("");
                                  }}
                                >
                                  {lead.full_name ?? lead.handle ?? lead.email ?? "Unnamed lead"}
                                  {lead.email && (
                                    <span className="ml-1.5 text-muted-foreground">
                                      {lead.email}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-2xs">Date</Label>
                        <Input
                          type="date"
                          value={callbackDueDate}
                          onChange={(e) => setCallbackDueDate(e.target.value)}
                          className="h-8 w-36 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-2xs">Time</Label>
                        <Input
                          type="time"
                          value={callbackDueTime}
                          onChange={(e) => setCallbackDueTime(e.target.value)}
                          className="h-8 w-28 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        disabled={!callbackSelectedLead || logCallback.isPending}
                        onClick={() => {
                          if (!callbackSelectedLead) return;
                          logCallback.mutate(
                            {
                              leadId: callbackSelectedLead.id,
                              leadName:
                                callbackSelectedLead.full_name ??
                                callbackSelectedLead.handle ??
                                callbackSelectedLead.email ??
                                "Unnamed lead",
                              dueAt: callbackDueAt,
                            },
                            {
                              onSuccess: () => {
                                setCallbackSelectedLead(null);
                                setCallbackLeadQuery("");
                                resetCallbackDueAt();
                              },
                            },
                          );
                        }}
                      >
                        Log callback
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-3xs">
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/50 px-2 py-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Your time zone:{" "}
                        <span className="font-medium text-foreground">
                          {browserTzAbbrev()} ({browserUtcOffset()})
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/50 px-2 py-1 text-muted-foreground">
                        Lead time zone:{" "}
                        <span className="font-medium text-foreground">Unavailable</span>
                      </span>
                      {callbackDueAt && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-spectrum-mid/40 bg-spectrum-mid/10 px-2 py-1 text-spectrum-mid">
                          Scheduling for{" "}
                          {new Date(callbackDueAt).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}{" "}
                          {browserTzAbbrev()}
                        </span>
                      )}
                    </div>
                  </div>
                  {callbacks.filter((c) => c.state !== "completed").length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/70 text-left text-muted-foreground">
                            <th className="pb-2 pr-3">Lead</th>
                            <th className="pb-2 pr-3">Due</th>
                            <th className="pb-2 pr-3">State</th>
                            <th className="pb-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {callbacks
                            .filter((c) => c.state !== "completed")
                            .map((c) => (
                              <tr key={c.id} className="border-b border-border/40 last:border-0">
                                <td className="py-2 pr-3">
                                  {c.entity_id ? (
                                    <Link
                                      to="/leads"
                                      search={{ leadId: c.entity_id }}
                                      className="text-primary hover:underline"
                                    >
                                      {c.payload?.lead_name ?? "Open lead"}
                                    </Link>
                                  ) : (
                                    (c.payload?.lead_name ?? "—")
                                  )}
                                </td>
                                <td className="py-2 pr-3 font-mono">
                                  {c.due_at ? new Date(c.due_at).toLocaleString() : "—"}
                                </td>
                                <td className="py-2 pr-3 uppercase">{c.state}</td>
                                <td className="py-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-2xs"
                                    onClick={() => completeCallback.mutate(c.id)}
                                  >
                                    Mark completed
                                  </Button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          }
          return (
            <AttributionPathPanel
              title="DM Setter attribution"
              subtitle="Distinct DM, content, platform, and VSL paths; aggregate rows stay evidence-scoped"
              paths={setterPaths}
            />
          );
        })()}
        {/* Leaderboard with metric selector + independent date range (Part C3) + spectrum activity heatmap (Part C4) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <RepLeaderboard
            titlePrefix={isDialer ? "Dialer leaderboard" : "Setter leaderboard"}
            metrics={lbMetrics}
            metricKey={lbMetric}
            onMetricChange={setLbMetric}
            people={lbPeople}
            emptyLabel={`No ${isDialer ? "dialers" : "setters"} in range.`}
            dateRange={lbRange}
            onDateRangeChange={setLbOverride}
            overridden={!!lbOverride}
            onResetRange={() => setLbOverride(null)}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider mb-3">
              <ActivityIcon className="h-3.5 w-3.5 text-accent" />
              {isDialer
                ? "Dialer activity heatmap · dials by weekday"
                : "Setter activity heatmap · DMs sent by weekday"}
            </div>
            <HeatmapGrid
              rowLabels={activityHeatmap.rows}
              colLabels={activityHeatmap.cols}
              data={activityHeatmap.data}
              valueFmt={(v) => (isDialer ? `${v} dials` : `${v} DMs`)}
              variant="spectrum"
            />
          </div>
        </div>

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
                      .getElementById("rep-activity-log")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <TeamMemberFilter role={role} value={member} onChange={setMember} />
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
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[190px]">
                <SelectValue placeholder="Source: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Source: All</SelectItem>
                {LEAD_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>
                    Source: {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Log day
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{isDialer ? "Inbound Dialer" : "DM Setter"} — daily log</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  create.mutate(new FormData(e.currentTarget));
                }}
              >
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Name</Label>
                    <TeamMemberPicker role={role} name="team_member_name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date</Label>
                    <Input
                      name="activity_date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Lead source</Label>
                  <Select name="lead_source">
                    <SelectTrigger>
                      <SelectValue placeholder="Where did most leads come from?" />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isDialer ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Dials</Label>
                      <Input name="dials" type="number" min={0} defaultValue={0} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Connections</Label>
                      <Input name="connections" type="number" min={0} defaultValue={0} required />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Leads contacted</Label>
                      <Input
                        name="leads_contacted"
                        type="number"
                        min={0}
                        defaultValue={0}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Links sent</Label>
                      <Input name="links_sent" type="number" min={0} defaultValue={0} />
                    </div>
                  </div>
                )}
                {!isDialer && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1.5">
                      <Label>Inbound DMs sent</Label>
                      <Input name="inbound_dms_sent" type="number" min={0} defaultValue={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Outbound DMs sent</Label>
                      <Input name="outbound_dms_sent" type="number" min={0} defaultValue={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Replies</Label>
                      <Input name="replies" type="number" min={0} defaultValue={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Follow-ups sent</Label>
                      <Input name="followups_sent" type="number" min={0} defaultValue={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Links clicked</Label>
                      <Input name="links_clicked" type="number" min={0} defaultValue={0} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Post-booking page visits</Label>
                      <Input
                        name="post_booking_page_visits"
                        type="number"
                        min={0}
                        defaultValue={0}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Pre-call video watches</Label>
                      <Input name="pre_call_video_watches" type="number" min={0} defaultValue={0} />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Qualified convos</Label>
                    <Input
                      name="qualified_convos"
                      type="number"
                      min={0}
                      defaultValue={0}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Sets</Label>
                    <Input name="sets" type="number" min={0} defaultValue={0} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Calls on calendar</Label>
                    <Input
                      name="calls_on_calendar"
                      type="number"
                      min={0}
                      defaultValue={0}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Live calls (showed)</Label>
                    <Input name="live_calls" type="number" min={0} defaultValue={0} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Closes</Label>
                    <Input name="closes" type="number" min={0} defaultValue={0} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Downsells</Label>
                    <Input name="downsells" type="number" min={0} defaultValue={0} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cash collected $</Label>
                    <Input
                      name="cash_collected"
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={0}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Total revenue $</Label>
                    <Input
                      name="total_revenue"
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={0}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rate today (1–10)</Label>
                    <Input name="rate_today" type="number" min={1} max={10} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Objections (comma-separated)</Label>
                  <Textarea
                    name="objections"
                    rows={2}
                    placeholder="price, timing, spouse…"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea name="notes" rows={3} required />
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>
                  {create.isPending ? "…" : "Save day"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Composed instruments, not atomized tiles. Every rate ("show rate",
            "close rate", "pickup rate"...) is the conv% between two adjacent
            funnel stages, not a separate box. Click a stage or Cash Collected
            to see what produced it, what's capping it, and what's working. */}
        {(() => {
          const reachStages: FunnelStage[] = isDialer
            ? [
                { key: "inbound_leads", label: "Inbound Leads", value: dials, spectrum: "cold" },
                { key: "qualified", label: "Qualified Convos", value: qualified, spectrum: "mid" },
                { key: "sets", label: "Sets", value: sets, spectrum: "mid" },
              ]
            : [
                {
                  key: "inbound_leads",
                  label: "Inbound Leads",
                  value: contacted,
                  spectrum: "cold",
                },
                { key: "qualified", label: "Qualified Convos", value: qualified, spectrum: "mid" },
                { key: "sets", label: "Sets", value: sets, spectrum: "mid" },
              ];
          const prevReachStages: FunnelStage[] = isDialer
            ? [
                {
                  key: "inbound_leads",
                  label: "Inbound Leads",
                  value: prevDials,
                  spectrum: "cold",
                },
                {
                  key: "qualified",
                  label: "Qualified Convos",
                  value: prevQualified,
                  spectrum: "mid",
                },
                { key: "sets", label: "Sets", value: prevSets, spectrum: "mid" },
              ]
            : [
                {
                  key: "inbound_leads",
                  label: "Inbound Leads",
                  value: prevContacted,
                  spectrum: "cold",
                },
                {
                  key: "qualified",
                  label: "Qualified Convos",
                  value: prevQualified,
                  spectrum: "mid",
                },
                { key: "sets", label: "Sets", value: prevSets, spectrum: "mid" },
              ];
          const reachFields = isDialer
            ? ["dials", "qualified_convos", "sets"]
            : ["leads_contacted", "qualified_convos", "sets"];

          const closeStages: FunnelStage[] = [
            { key: "oncal", label: "Calls on Calendar", value: onCalendar, spectrum: "mid" },
            { key: "showed", label: "Showed", value: showed, spectrum: "mid" },
            { key: "closes", label: "Closes", value: closes, spectrum: "hot" },
          ];
          const prevCloseStages: FunnelStage[] = [
            { key: "oncal", label: "Calls on Calendar", value: prevOnCalendar, spectrum: "mid" },
            { key: "showed", label: "Showed", value: prevShowed, spectrum: "mid" },
            { key: "closes", label: "Closes", value: prevCloses, spectrum: "hot" },
          ];
          const closeFields = ["calls_on_calendar", "live_calls", "closes"];

          const avgCashPerClose = closes ? cashCents / closes : 0;
          const prevAvgCashPerClose = prevCloses ? prevCashCents / prevCloses : 0;

          type ActivityRow = Record<string, unknown>;
          const activityRowsBy = (field: string): ActivityRow[] =>
            [...((rows ?? []) as unknown as ActivityRow[])]
              .sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0))
              .slice(0, 50);
          const activityColumns = (
            field: string,
            label: string,
            fmt?: (v: number) => string,
          ): DetailColumn<ActivityRow>[] => [
            { key: "name", label: "Rep", render: (r) => String(r.team_member_name ?? "—") },
            { key: "date", label: "Date", render: (r) => String(r.activity_date ?? "—") },
            { key: "source", label: "Source", render: (r) => String(r.lead_source ?? "—") },
            {
              key: "canonicalPath",
              label: "Canonical path",
              render: (r) => {
                const evidence = evaluateAttributionEvidence({
                  model: "lead_source",
                  supportingEvents: r.activity_date ? ["daily_activity"] : [],
                  knownTouchpoints: 0,
                  sampleSize: null,
                  directOutcomeLinked: false,
                  drilldownKey: null,
                });
                return `${evidence.coverage} — aggregate row`;
              },
            },
            {
              key: "value",
              label,
              align: "right",
              render: (r) => (fmt ? fmt(Number(r[field] ?? 0)) : String(r[field] ?? 0)),
            },
          ];

          let panel: {
            title: string;
            columns: DetailColumn<ActivityRow>[];
            rows: ActivityRow[];
            cap: ReturnType<typeof deriveCap>;
            working: ReturnType<typeof deriveWorking>;
          } | null = null;
          if (selected?.kind === "money") {
            panel = {
              title: "Cash Collected",
              columns: activityColumns("cash_collected_cents", "Cash", fmtMoney),
              rows: activityRowsBy("cash_collected_cents"),
              cap: deriveMoneyCap(closes, avgCashPerClose, cashCents, minCapSample, fmtMoney),
              working: deriveMoneyWorking(
                avgCashPerClose,
                prevAvgCashPerClose,
                closes,
                prevCloses,
                minCapSample,
                fmtMoney,
              ),
            };
          } else if (selected) {
            const stages = selected.kind === "reach" ? reachStages : closeStages;
            const prevStages = selected.kind === "reach" ? prevReachStages : prevCloseStages;
            const fields = selected.kind === "reach" ? reachFields : closeFields;
            const stage = stages[selected.index];
            panel = stage
              ? {
                  title: stage.label,
                  columns: activityColumns(fields[selected.index], stage.label),
                  rows: activityRowsBy(fields[selected.index]),
                  cap: deriveCap(stages, selected.index, minCapSample),
                  working: deriveWorking(stages, prevStages, minCapSample),
                }
              : null;
          }

          const moneySeries: MoneyPoint[] = daySeries.map((p) => ({
            d: p.d,
            cash: Number(p.cash_collected_cents ?? 0),
            revenue: Number(p.total_revenue_cents ?? 0),
          }));

          const kpiItems: KpiBandItem[] = [
            ...(isDialer
              ? [
                  {
                    key: "dials",
                    label: "Dials",
                    value: fmtN0(dials),
                    spectrum: "cold" as const,
                    deltaPct: pctDelta(dials, prevDials),
                    priorValue: fmtN0(prevDials),
                    empty: dials === 0,
                    emptyHint: 'Log your dial count in "Log day" to start tracking reach.',
                    onClick: () => setSelected({ kind: "reach", index: 0 }),
                  },
                  {
                    key: "connections",
                    label: "Connections",
                    value: fmtN0(conns),
                    spectrum: "cold" as const,
                    deltaPct: pctDelta(conns, prevConns),
                    priorValue: fmtN0(prevConns),
                    empty: conns === 0,
                    emptyHint: 'Connections drive your pickup rate — log them in "Log day."',
                    onClick: () => setSelected({ kind: "reach", index: 1 }),
                  },
                  {
                    key: "qualified",
                    label: "Qualified Convos",
                    value: fmtN0(qualified),
                    spectrum: "mid" as const,
                    deltaPct: pctDelta(qualified, prevQualified),
                    priorValue: fmtN0(prevQualified),
                    empty: qualified === 0,
                    emptyHint: "No qualified convos logged yet this range.",
                    onClick: () => setSelected({ kind: "reach", index: 2 }),
                  },
                  {
                    key: "sets",
                    label: "Sets",
                    value: fmtN0(sets),
                    spectrum: "mid" as const,
                    deltaPct: pctDelta(sets, prevSets),
                    priorValue: fmtN0(prevSets),
                    empty: sets === 0,
                    emptyHint: "Sets show up once a call actually gets booked.",
                    onClick: () => setSelected({ kind: "reach", index: 3 }),
                  },
                ]
              : [
                  {
                    key: "contacted",
                    label: "Leads Contacted",
                    value: fmtN0(contacted),
                    spectrum: "cold" as const,
                    deltaPct: pctDelta(contacted, prevContacted),
                    priorValue: fmtN0(prevContacted),
                    empty: contacted === 0,
                    emptyHint: 'Log outreach in "Log day" to start tracking reach.',
                    onClick: () => setSelected({ kind: "reach", index: 0 }),
                  },
                  {
                    key: "qualified",
                    label: "Qualified Convos",
                    value: fmtN0(qualified),
                    spectrum: "mid" as const,
                    deltaPct: pctDelta(qualified, prevQualified),
                    priorValue: fmtN0(prevQualified),
                    empty: qualified === 0,
                    emptyHint: "No qualified convos logged yet this range.",
                    onClick: () => setSelected({ kind: "reach", index: 1 }),
                  },
                  {
                    key: "sets",
                    label: "Sets",
                    value: fmtN0(sets),
                    spectrum: "mid" as const,
                    deltaPct: pctDelta(sets, prevSets),
                    priorValue: fmtN0(prevSets),
                    empty: sets === 0,
                    emptyHint: "Sets show up once a call actually gets booked.",
                    onClick: () => setSelected({ kind: "reach", index: 2 }),
                  },
                ]),
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
              emptyHint: 'Mark calls as showed in "Log day" once they happen.',
              onClick: () => setSelected({ kind: "close", index: 1 }),
            },
            {
              key: "closes",
              label: "Closes",
              value: fmtN0(closes),
              spectrum: "hot",
              featured: true,
              deltaPct: pctDelta(closes, prevCloses),
              priorValue: fmtN0(prevCloses),
              empty: closes === 0,
              emptyHint: "No closes yet this range — they'll show up here.",
              onClick: () => setSelected({ kind: "close", index: 2 }),
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
              emptyHint: "Log a close with cash collected to see this populate.",
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
            ...(isDialer
              ? [
                  {
                    key: "averageCallLength",
                    label: "Average Call Length",
                    value: fmtDuration(appointmentQuality.avgDurationSeconds),
                    spectrum: "cold" as const,
                    empty: appointmentQuality.avgDurationSeconds == null,
                    emptyHint: "Requires duration_seconds logged on calls.",
                  },
                  {
                    key: "averageTalkTime",
                    label: "Average Talk Time",
                    value: fmtDuration(appointmentQuality.avgTalkSeconds),
                    spectrum: "cold" as const,
                    empty: appointmentQuality.avgTalkSeconds == null,
                    emptyHint: "Requires talk_seconds logged on calls.",
                  },
                ]
              : []),
          ];

          const pickupPct = dials ? (conns / dials) * 100 : 0;
          const prevPickupPct = prevDials ? (prevConns / prevDials) * 100 : 0;
          const qualDen = isDialer ? conns : contacted;
          const prevQualDen = isDialer ? prevConns : prevContacted;
          const qualPct = qualDen ? (qualified / qualDen) * 100 : 0;
          const prevQualPct = prevQualDen ? (prevQualified / prevQualDen) * 100 : 0;
          const setPct = qualified ? (sets / qualified) * 100 : 0;
          const prevSetPct = prevQualified ? (prevSets / prevQualified) * 100 : 0;
          const showPct = onCalendar ? (showed / onCalendar) * 100 : 0;
          const prevShowPct = prevOnCalendar ? (prevShowed / prevOnCalendar) * 100 : 0;
          const closeRatePct = showed ? (closes / showed) * 100 : 0;
          const prevCloseRatePct = prevShowed ? (prevCloses / prevShowed) * 100 : 0;

          const rateCharts: RateChartSpec[] = [
            ...(isDialer
              ? [
                  {
                    key: "pickup",
                    label: "Pickup Rate",
                    points: seriesRatePoints(daySeries, "connections", "dials"),
                    currentPct: pickupPct,
                    deltaPct: pctDelta(pickupPct, prevPickupPct),
                    spectrum: "cold" as const,
                    onClick: () => setSelected({ kind: "reach", index: 1 }),
                  },
                ]
              : []),
            {
              key: "qualrate",
              label: "Qualified Convo Rate",
              points: seriesRatePoints(
                daySeries,
                "qualified_convos",
                isDialer ? "connections" : "leads_contacted",
              ),
              currentPct: qualPct,
              deltaPct: pctDelta(qualPct, prevQualPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "reach", index: isDialer ? 2 : 1 }),
            },
            {
              key: "setrate",
              label: "Set Rate",
              points: seriesRatePoints(daySeries, "sets", "qualified_convos"),
              currentPct: setPct,
              deltaPct: pctDelta(setPct, prevSetPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "reach", index: isDialer ? 3 : 2 }),
            },
            {
              key: "showrate",
              label: "Show Rate",
              points: seriesRatePoints(daySeries, "live_calls", "calls_on_calendar"),
              currentPct: showPct,
              deltaPct: pctDelta(showPct, prevShowPct),
              spectrum: "mid",
              onClick: () => setSelected({ kind: "close", index: 1 }),
            },
            {
              key: "closerate",
              label: "Close Rate",
              points: seriesRatePoints(daySeries, "closes", "live_calls"),
              currentPct: closeRatePct,
              deltaPct: pctDelta(closeRatePct, prevCloseRatePct),
              spectrum: "hot",
              onClick: () => setSelected({ kind: "close", index: 2 }),
            },
          ];

          const activityChartFields: Record<string, string> = {
            dials: "dials",
            connections: "connections",
            contacted: "leads_contacted",
            qualified: "qualified_convos",
            sets: "sets",
            oncal: "calls_on_calendar",
            showed: "live_calls",
            closes: "closes",
            cash: "cash_collected_cents",
            revenue: "total_revenue_cents",
          };
          const activityBarKeys = new Set([
            "dials",
            "connections",
            "contacted",
            "qualified",
            "sets",
            "oncal",
            "showed",
            "closes",
          ]);
          const chartedKpiItems = kpiItems.map((item) => {
            const field = activityChartFields[item.key];
            return field
              ? {
                  ...item,
                  spark: daySeries.map((point) =>
                    Number((point as Record<string, unknown>)[field] ?? 0),
                  ),
                  sparkLabels: daySeries.map((point) => point.d),
                  sparkVariant: activityBarKeys.has(item.key)
                    ? ("bar" as const)
                    : ("line" as const),
                }
              : item;
          });

          return (
            <>
              <KpiBand
                items={chartedKpiItems}
                title={isDialer ? "Inbound Dialer · Key Metrics" : "DM Setter · Key Metrics"}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FunnelInstrument
                    title="Reach"
                    subtitle="Inbound Leads → Sets"
                    stages={reachStages}
                    onStageClick={(i) => setSelected({ kind: "reach", index: i })}
                  />
                  <FunnelInstrument
                    title="Close"
                    subtitle="Booked → Closed"
                    stages={closeStages}
                    onStageClick={(i) => setSelected({ kind: "close", index: i })}
                  />
                </div>
                <MoneyInstrument
                  series={moneySeries}
                  payoutPct={5}
                  payoutCents={cashCents * 0.05}
                  cashRatePct={revCents ? (cashCents / revCents) * 100 : 0}
                  onCashClick={() => setSelected({ kind: "money", index: 0 })}
                  fmtMoney={fmtMoney}
                />
              </div>
              <RateSmallMultiples charts={rateCharts} />
              <KpiBand
                title="Additional Stats"
                items={
                  [
                    // Links Sent, Inbound/Outbound DMs, Follow-ups, Links
                    // Clicked, Post-booking Visits, and Pre-call Watches all
                    // used to be duplicated here AND in "DM Setter · Primary
                    // Activity" above — same metric, same value, two cards.
                    // Primary Activity is the single home for all of them now;
                    // Additional Stats keeps only what's genuinely secondary.
                    {
                      key: "downsells",
                      label: "Downsells",
                      value: downsells.toLocaleString(),
                      spectrum: "mid",
                      deltaPct: pctDelta(downsells, prevDownsells),
                      priorValue: prevDownsells.toLocaleString(),
                      empty: !downsells,
                      emptyHint: "No downsells logged in this range.",
                    },
                  ].filter(Boolean) as KpiBandItem[]
                }
              />
              {panel && (
                <MetricDetailPanel
                  open={!!selected}
                  onOpenChange={(v) => !v && setSelected(null)}
                  title={panel.title}
                  subtitle={`${range.from} → ${range.to}`}
                  columns={panel.columns}
                  rows={panel.rows}
                  rowKey={(r) => String(r.id ?? `${r.team_member_name}-${r.activity_date}`)}
                  cap={panel.cap}
                  working={panel.working}
                  emptyRowsLabel="No entries in this date range."
                />
              )}
            </>
          );
        })()}

        {/* Insights row: Objection frequency + Momentum + Scorecard */}
        <Tabs defaultValue="objections">
          <TabsList>
            <TabsTrigger value="objections">Objection frequency</TabsTrigger>
            <TabsTrigger value="momentum">Momentum (7d)</TabsTrigger>
            <TabsTrigger value="scorecard">Setter scorecard</TabsTrigger>
          </TabsList>

          <TabsContent value="objections">
            <ObjectionInstrument
              title="Most-logged objections · feeds content strategy"
              entries={objectionEntries}
              totalLogged={(allRows ?? []).reduce(
                (s, r) => s + parseObjections(r.objections).length,
                0,
              )}
              resolvedTracked={false}
              resolvedGapNote={`Resolved-rate isn't tracked for ${isDialer ? "Inbound Dialer" : "DM Setter"} calls yet — would need per-call objection logging for ${isDialer ? "dialers" : "setters"}, not just daily rollups. (Logged as a follow-up.)`}
              faqVideos={faqVideos}
              emptyLabel="No objections logged yet. Add them to daily entries (comma-separated) to see patterns."
            />
          </TabsContent>

          <TabsContent value="momentum">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider">
                7-day rolling momentum vs personal best
              </div>
              <div className="divide-y divide-border">
                {momentum.length === 0 && (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Log activity over multiple days to see momentum.
                  </div>
                )}
                {momentum.map((m) => {
                  const Icon = m.score >= 80 ? TrendingUp : m.score >= 50 ? Minus : TrendingDown;
                  const tone =
                    m.score >= 80
                      ? "text-[color:var(--color-success)]"
                      : m.score >= 50
                        ? "text-muted-foreground"
                        : "text-destructive";
                  return (
                    <div key={m.name} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{m.name}</div>
                        <div className="text-2xs text-muted-foreground">
                          avg {m.recentAvg} sets/day last 7d · best day {m.best}
                        </div>
                      </div>
                      <div
                        className={`flex items-center gap-1.5 font-mono text-sm font-semibold ${tone}`}
                      >
                        <Icon className="h-4 w-4" />
                        {m.score}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scorecard">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3">
                <div className="text-sm font-semibold">
                  Setter scorecard · Sets / Show / Close / Qual
                </div>
                <div className="text-xs text-muted-foreground">
                  Normalized 0–100. Sets is relative to top performer.
                </div>
              </div>
              {scorecardNames.length === 0 ? (
                <div className="p-10 text-center text-sm text-muted-foreground">No data yet.</div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={scorecard}>
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
                      {scorecardNames.slice(0, 5).map((name, i) => (
                        <Radar
                          key={name}
                          name={name}
                          dataKey={name}
                          stroke={radarColors[i]}
                          fill={radarColors[i]}
                          fillOpacity={0.25}
                        />
                      ))}
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                          boxShadow: "var(--shadow-md)",
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Activity Log */}
        <div id="rep-activity-log" />
        <GlassTableShell
          toolbar={
            <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
              {isDialer ? "Setter Input" : "DM Setter Input"} · {totalRows} rows
            </div>
          }
          footer={
            totalRows > 0 ? (
              <Pagination
                page={page}
                pageCount={pageCount}
                onPage={setPage}
                total={totalRows}
                pageSize={pageSize}
              />
            ) : undefined
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5">Name</th>
                <th className="text-left p-2.5">Date</th>
                <th className="text-left p-2.5">Source</th>
                {isDialer ? (
                  <>
                    <th className="text-right p-2.5 font-mono">Dials</th>
                    <th className="text-right p-2.5 font-mono">Conn</th>
                  </>
                ) : (
                  <>
                    <th className="text-right p-2.5 font-mono">Contacted</th>
                    <th className="text-right p-2.5 font-mono">Links</th>
                  </>
                )}
                <th className="text-right p-2.5 font-mono">Qual Convos</th>
                <th className="text-right p-2.5 font-mono">Sets</th>
                <th className="text-right p-2.5 font-mono">On Cal</th>
                <th className="text-right p-2.5 font-mono">Live</th>
                <th className="text-right p-2.5 font-mono">Closes</th>
                <th className="text-right p-2.5 font-mono">Downsells</th>
                <th className="text-right p-2.5 font-mono">Cash</th>
                <th className="text-right p-2.5 font-mono">Revenue</th>
                <th className="text-center p-2.5">Rate</th>
                <th className="text-left p-2.5">Objections</th>
                <th className="text-left p-2.5">Notes</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                <tr key={r.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-2.5 font-medium">{r.team_member_name}</td>
                  <td className="p-2.5 text-xs text-muted-foreground">{r.activity_date}</td>
                  <td className="p-2.5 text-xs">
                    {r.lead_source ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">
                        {r.lead_source}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {isDialer ? (
                    <>
                      <td className="p-2.5 text-right font-mono">{r.dials ?? 0}</td>
                      <td className="p-2.5 text-right font-mono">{r.connections ?? 0}</td>
                    </>
                  ) : (
                    <>
                      <td className="p-2.5 text-right font-mono">{r.leads_contacted ?? 0}</td>
                      <td className="p-2.5 text-right font-mono">{r.links_sent ?? 0}</td>
                    </>
                  )}
                  <td className="p-2.5 text-right font-mono">{r.qualified_convos ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.sets ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.calls_on_calendar ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.live_calls ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.closes ?? 0}</td>
                  <td className="p-2.5 text-right font-mono">{r.downsells ?? 0}</td>
                  <td className="p-2.5 text-right font-mono text-[color:var(--color-success)]">
                    ${((r.cash_collected_cents ?? 0) / 100).toLocaleString()}
                  </td>
                  <td className="p-2.5 text-right font-mono">
                    ${((r.total_revenue_cents ?? 0) / 100).toLocaleString()}
                  </td>
                  <td className="p-2.5 text-center">
                    {r.rate_today ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[180px] truncate">
                    {r.objections ?? "—"}
                  </td>
                  <td className="p-2.5 text-xs text-muted-foreground max-w-[200px] truncate">
                    {r.notes ?? "—"}
                  </td>
                </tr>
              ))}
              {totalRows === 0 && (
                <tr>
                  <td colSpan={16}>
                    <EmptyState
                      icon={<ClipboardList className="h-4 w-4" />}
                      title="No entries in this date range"
                      description="Log your first day to start tracking."
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
