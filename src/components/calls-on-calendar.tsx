import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDisplayTimezone, DISPLAY_TIMEZONES } from "@/hooks/use-display-timezone";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { buildDemoCalendarDataset, type DemoCalendarDataset } from "@/lib/demo-fixtures";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { deriveLeadQuality, LEAD_QUALITY_TONE, type LeadQuality } from "@/lib/lead-quality";
import { normalizeAcquisitionSource, acquisitionSourceOptions } from "@/lib/acquisition-source";
import {
  TOUCHPOINT_LABELS,
  TOUCHPOINT_SEQUENCE,
  deriveTouchpointStatus,
  deriveNextAction,
  buildPreCallChecklist,
  getTouchpointTimestamps,
  type Touchpoint,
  type CallConfirmationRow,
  type OverallConfirmationStatus,
} from "@/lib/call-confirmations";
import {
  getConfirmationsForCallsFn,
  markTouchpointFn,
  setConfirmationStatusFn,
  setConfirmationPolicyFn,
  unmarkTouchpointFn,
  respondTouchpointFn,
} from "@/lib/call-confirmations.functions";
import { applicationFormResponses } from "@/lib/application-fields";
import { ApplicationResponses } from "@/components/application-responses";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WebinarFilterBranches } from "@/components/webinar-filter";
import { useWebinars } from "@/hooks/use-webinars";
import {
  ALL_WEBINARS_FILTER,
  matchesWebinarFilter,
  webinarFilterLabel,
  type WebinarFilterValue,
} from "@/lib/webinar-filter";
import { EmptyState } from "@/components/empty-state";
import {
  AtSign,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  Settings,
  User,
  Video,
  X,
} from "lucide-react";

type CallRow = {
  id: string;
  lead_id: string | null;
  setter_id: string | null;
  closer_id: string | null;
  scheduled_for: string | null;
  status: string | null;
  showed: boolean | null;
  offer_made: boolean | null;
  closed: boolean | null;
  cash_collected_cents: number | null;
  contract_value_cents: number | null;
  duration_seconds: number | null;
  cancelled: boolean | null;
  meeting_link: string | null;
  recording_url: string | null;
  calendly_cancel_url: string | null;
  calendly_reschedule_url: string | null;
};

type LeadRow = {
  id: string;
  full_name: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  intent_score: number | null;
  priority: string | null;
  source_platform: string | null;
  source_webinar_id?: string | null;
  qualification_notes: string | null;
  precall_video_watched: boolean | null;
  application_data: Record<string, unknown> | null;
};

const DEFAULT_DURATION_MIN = 30;

// Demo fixture names carry a literal "(Demo)" suffix so they're honest about
// their source everywhere else in the app; the calendar already has its own
// demo/mock-data indicator (DemoModeBanner), so displayed lead/rep names
// here strip the suffix rather than duplicating that signal inside the name
// itself.
function displayName(name: string | null | undefined): string {
  return (name ?? "").replace(/\s*\(Demo\)\s*$/i, "");
}

function zonedParts(date: Date, timeZone: string) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const hour = get("hour");
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: hour === 24 ? 0 : hour,
      minute: get("minute"),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

function dayKey(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function minutesIntoDay(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

function addDays(date: Date, n: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

type CalendarView = "day" | "week" | "month" | "year";

// Prev/Next stepping — day/week move by fixed day counts, month/year move by
// calendar month/year (never a fixed day count, so e.g. stepping from
// January to February doesn't drift into the wrong week of March).
function stepAnchor(date: Date, view: CalendarView, dir: 1 | -1): Date {
  if (view === "day") return addDays(date, dir);
  if (view === "week") return addDays(date, dir * 7);
  const d = new Date(date);
  if (view === "month") d.setMonth(d.getMonth() + dir);
  else d.setFullYear(d.getFullYear() + dir);
  return d;
}

// Dynamic period header (item 8) — Day: "September 16, 2026". Week:
// "September, 2026", or "Jun–Jul 2026" when the displayed week crosses a
// month boundary. Month: "September, 2026". Year: "2026".
function periodLabel(date: Date, view: CalendarView): string {
  if (view === "day") {
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  if (view === "week") {
    const weekStart = addDays(date, -date.getDay());
    const weekEnd = addDays(weekStart, 6);
    if (
      weekStart.getMonth() === weekEnd.getMonth() &&
      weekStart.getFullYear() === weekEnd.getFullYear()
    ) {
      return weekStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    const startMon = weekStart.toLocaleDateString("en-US", { month: "short" });
    const endMon = weekEnd.toLocaleDateString("en-US", { month: "short" });
    // Crossing a year boundary (Dec -> Jan) shows both years; same-year
    // cross-month just shows the one shared year.
    return weekStart.getFullYear() === weekEnd.getFullYear()
      ? `${startMon}–${endMon} ${weekEnd.getFullYear()}`
      : `${startMon} ${weekStart.getFullYear()} – ${endMon} ${weekEnd.getFullYear()}`;
  }
  if (view === "month") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  return String(date.getFullYear());
}

const GRID_START_MIN = 0; // 12:00am — a full 24-hour day (item 14)
const GRID_END_MIN = 24 * 60; // 11:59pm
const PX_PER_MIN = 1.1;

/**
 * Standard calendar overlap layout (Priority 6 — two or more calls booked
 * at the exact same time must render side-by-side, never stacked
 * invisibly on top of each other or stretched to fake a wider block).
 *
 * Groups mutually-overlapping events into clusters (a sweep over start
 * times: an event joins the current cluster if it starts before the
 * cluster's latest-running end time), then greedily first-fits each event
 * in a cluster into the lowest-numbered column whose previous occupant has
 * already ended — the same algorithm Google Calendar-style grids use.
 * Every event in a cluster gets `columnCount` = that cluster's total column
 * count, so a 2-way overlap gets two half-width columns, a 3-way overlap
 * gets three thirds, etc. Vertical position/height (start time, duration)
 * is computed entirely separately by the caller — this only ever decides
 * horizontal placement.
 */
export function computeOverlapColumns<T extends { id: string; startMin: number; endMin: number }>(
  entries: T[],
): Map<string, { column: number; columnCount: number }> {
  const layout = new Map<string, { column: number; columnCount: number }>();
  const sorted = [...entries].sort((a, b) => a.startMin - b.startMin);

  let cluster: T[] = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (!cluster.length) return;
    // Greedy first-fit: track each column's current end time; place each
    // event (in start order) into the first column that's already free.
    const columnEnds: number[] = [];
    const columnOf = new Map<string, number>();
    for (const e of cluster) {
      let placed = false;
      for (let col = 0; col < columnEnds.length; col++) {
        if (columnEnds[col] <= e.startMin) {
          columnEnds[col] = e.endMin;
          columnOf.set(e.id, col);
          placed = true;
          break;
        }
      }
      if (!placed) {
        columnEnds.push(e.endMin);
        columnOf.set(e.id, columnEnds.length - 1);
      }
    }
    const columnCount = columnEnds.length;
    for (const e of cluster) {
      layout.set(e.id, { column: columnOf.get(e.id)!, columnCount });
    }
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const e of sorted) {
    if (cluster.length && e.startMin >= clusterEnd) flushCluster();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.endMin);
  }
  flushCluster();

  return layout;
}

const STATUS_TONE: Record<OverallConfirmationStatus, string> = {
  confirmed: "border-emerald-500/50 bg-emerald-500/20 text-emerald-300",
  awaiting: "border-border/60 bg-muted/25 text-muted-foreground",
  overdue: "border-red-500/50 bg-red-500/20 text-red-300",
  at_risk: "border-amber-500/50 bg-amber-500/20 text-amber-300",
  cancelled: "border-border/40 bg-muted/10 text-muted-foreground/60",
  rescheduled: "border-blue-500/50 bg-blue-500/20 text-blue-300",
};

// Solid, borderless status color — the one true color-per-status mapping
// (matches STATUS_LABEL/LEGEND_DOT exactly: confirmed=green, overdue=red,
// at_risk=amber, cancelled=neutral, rescheduled=blue, awaiting=gray) used
// for booking blocks, month-grid chips, and the status legend cards. Light
// mode = the bright/saturated shade with white text; dark mode = a deeper
// shade of the SAME hue with near-black text — never opacity tricks, two
// intentional color values per status (Google Calendar-style behavior).
// Shades tuned one step richer than the original 700/800 dark values (item
// 17 — those read as muddy/flat against the near-black calendar surface;
// 600 keeps the "deep, not neon" intent while staying visibly saturated).
const STATUS_SOLID: Record<OverallConfirmationStatus, { bg: string; text: string }> = {
  confirmed: {
    bg: "bg-emerald-500 dark:bg-emerald-600",
    text: "text-white dark:text-emerald-950",
  },
  awaiting: { bg: "bg-slate-400 dark:bg-slate-600", text: "text-white dark:text-slate-950" },
  overdue: { bg: "bg-red-500 dark:bg-red-600", text: "text-white dark:text-red-950" },
  at_risk: { bg: "bg-amber-500 dark:bg-amber-600", text: "text-white dark:text-amber-950" },
  cancelled: {
    bg: "bg-neutral-300 dark:bg-neutral-600",
    text: "text-neutral-800 dark:text-neutral-100",
  },
  rescheduled: { bg: "bg-blue-500 dark:bg-blue-600", text: "text-white dark:text-blue-950" },
};

// The ORIGINAL status's color, used only for cancelled/rescheduled booking
// boxes (item 6) — border + text, never a fill. Distinct from STATUS_SOLID
// (which is a fill+text pair for an ACTIVE status) because a cancelled/
// rescheduled box's fill is always the calendar surface color, not a status
// color; only the border/text preserve which status it used to be.
const ORIGINAL_STATUS_ACCENT: Record<
  NonNullable<CallConfirmationRow>["previous_status"] & string,
  { border: string; text: string }
> = {
  awaiting: {
    border: "border-slate-400 dark:border-slate-500",
    text: "text-slate-600 dark:text-slate-300",
  },
  confirmed: {
    border: "border-emerald-500 dark:border-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  overdue: { border: "border-red-500 dark:border-red-500", text: "text-red-600 dark:text-red-400" },
  at_risk: {
    border: "border-amber-500 dark:border-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
};

const STATUS_LABEL: Record<OverallConfirmationStatus, string> = {
  confirmed: "Confirmed",
  awaiting: "Awaiting confirmation",
  overdue: "Confirmation overdue",
  at_risk: "At risk",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

// Legend-only presentation (Priority 41) — a solid dot color and a small
// glyph per status, layered on top of STATUS_TONE/STATUS_LABEL rather than
// a third parallel status list, so the legend can never say something the
// actual event blocks don't.
const LEGEND_DOT: Record<OverallConfirmationStatus, string> = {
  confirmed: "border-emerald-500 bg-emerald-500",
  awaiting: "border-muted-foreground/60 bg-muted-foreground/40",
  overdue: "border-red-500 bg-red-500",
  at_risk: "border-amber-500 bg-amber-500",
  cancelled: "border-border bg-transparent",
  rescheduled: "border-blue-500 bg-blue-500",
};
const LEGEND_ICON: Record<OverallConfirmationStatus, string> = {
  confirmed: "✓",
  awaiting: "…",
  overdue: "!",
  at_risk: "⚠",
  cancelled: "✕",
  rescheduled: "↻",
};

// Structured cancellation/reschedule reasons (Priority 6/48) — a fixed
// category list plus "Other" with optional notes, never free text alone.
// Existing records from before this taxonomy existed show "Reason not
// recorded" rather than a guessed category.
const CANCEL_REASONS = [
  "Lead cancelled",
  "Lead no longer interested",
  "Scheduling conflict",
  "Unqualified",
  "Closer unavailable",
  "Duplicate booking",
  "No confirmation",
  "Other",
] as const;
const RESCHEDULE_REASONS = [
  "Lead requested new time",
  "Closer requested new time",
  "Scheduling conflict",
  "Lead not ready",
  "Technical issue",
  "Other",
] as const;

export function CallsOnCalendar() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { isAdmin } = useRole();
  const { timezone, setTimezone } = useDisplayTimezone();
  const queryClient = useQueryClient();
  const { demoMode } = useDemoMode();

  const getConfirmations = useServerFn(getConfirmationsForCallsFn);
  const markTouchpoint = useServerFn(markTouchpointFn);
  const unmarkTouchpoint = useServerFn(unmarkTouchpointFn);
  const respondTouchpoint = useServerFn(respondTouchpointFn);
  const setConfirmationStatus = useServerFn(setConfirmationStatusFn);
  const setConfirmationPolicy = useServerFn(setConfirmationPolicyFn);

  // Demo / Preview Data mode: a local, mutable, deterministic fixture
  // dataset — actions in demo mode update this in-memory state directly and
  // NEVER call a server fn or touch Supabase, so nothing can ever write
  // demo data into a real org's tables. Regenerated fresh each time demo
  // mode is turned on (so re-entering demo mode always shows the same
  // starting scenario, not whatever a prior demo session mutated it into).
  const [demoDataset, setDemoDataset] = useState<DemoCalendarDataset | null>(null);
  useEffect(() => {
    if (demoMode) setDemoDataset(buildDemoCalendarDataset());
    else setDemoDataset(null);
  }, [demoMode]);

  const [view, setView] = useState<"day" | "week" | "month" | "year">("day");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [webinarFilter, setWebinarFilter] = useState<WebinarFilterValue>(ALL_WEBINARS_FILTER);
  const { webinars, paidWebinars, organicWebinars, unclassifiedWebinars, webinarsById } =
    useWebinars();
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const rangeStart = useMemo(() => {
    let d: Date;
    if (view === "day") d = anchorDate;
    else if (view === "week") d = addDays(anchorDate, -anchorDate.getDay());
    else if (view === "month") d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    else d = new Date(anchorDate.getFullYear(), 0, 1);
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    // Pad enough to cover the leading/trailing grid cells (month view can
    // show up to 6 days from the adjacent month on either side) plus a day
    // either side for timezone-boundary safety.
    return addDays(s, view === "month" ? -8 : -1);
  }, [anchorDate, view]);
  const rangeEnd = useMemo(() => {
    if (view === "day") return addDays(rangeStart, 3);
    if (view === "week") return addDays(rangeStart, 9);
    if (view === "month") return addDays(rangeStart, 50); // covers a 6-week grid + padding
    return addDays(rangeStart, 368); // year, + leap day + padding
  }, [rangeStart, view]);

  const { data: realData, isLoading: realLoading } = useQuery({
    queryKey: ["calls-on-calendar", orgId, rangeStart.toISOString(), rangeEnd.toISOString()],
    enabled: !!orgId && !demoMode,
    queryFn: async () => {
      // `meeting_link` is a real column (added by this same feature's
      // migration) but isn't in the generated Supabase types yet — same
      // `as any` convention used elsewhere in this repo for columns/tables
      // ahead of a fresh `supabase gen types` run (see call-confirmations.server.ts).
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data: calls } = await (supabase.from("calls") as any)
        .select(
          "id, lead_id, setter_id, closer_id, scheduled_for, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents, duration_seconds, cancelled, meeting_link, recording_url, calendly_cancel_url, calendly_reschedule_url",
        )
        .eq("org_id", orgId!)
        .gte("scheduled_for", rangeStart.toISOString())
        .lte("scheduled_for", rangeEnd.toISOString())
        .order("scheduled_for", { ascending: true });
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const callRows = (calls ?? []) as CallRow[];

      const leadIds = Array.from(
        new Set(callRows.map((c) => c.lead_id).filter((v): v is string => !!v)),
      );
      const repIds = Array.from(
        new Set(
          [...callRows.map((c) => c.setter_id), ...callRows.map((c) => c.closer_id)].filter(
            (v): v is string => !!v,
          ),
        ),
      );
      const [leadsRes, profilesRes] = await Promise.all([
        leadIds.length
          ? supabase
              .from("leads")
              .select(
                "id, full_name, handle, email, phone, status, intent_score, priority, source_platform, source_webinar_id, qualification_notes, precall_video_watched, application_data",
              )
              .in("id", leadIds)
          : Promise.resolve({ data: [] as LeadRow[] }),
        repIds.length
          ? supabase.from("profiles").select("id, display_name").in("id", repIds)
          : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
      ]);
      const leadById = new Map((leadsRes.data ?? []).map((l) => [l.id, l as LeadRow]));
      const repNameById: Record<string, string> = {};
      for (const p of profilesRes.data ?? []) repNameById[p.id] = p.display_name ?? p.id;

      const confirmResult = await getConfirmations({
        data: {
          org_id: orgId!,
          calls: callRows.map((c) => ({
            id: c.id,
            scheduled_for: c.scheduled_for,
            cancelled: c.cancelled,
          })),
        },
      });
      const confirmationByCallId = new Map(
        (confirmResult.confirmations as Array<CallConfirmationRow & { call_id: string }>).map(
          (c) => [c.call_id, c],
        ),
      );

      return {
        calls: callRows,
        leadById,
        repNameById,
        confirmationByCallId,
        policy: confirmResult.policy,
      };
    },
  });

  const data = demoMode ? demoDataset : realData;
  const isLoading = demoMode ? !demoDataset : realLoading;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["calls-on-calendar"] });

  const enriched = useMemo(() => {
    if (!data) return [];
    return data.calls.map((call) => {
      const lead = call.lead_id ? data.leadById.get(call.lead_id) : undefined;
      const confirmation = (data.confirmationByCallId.get(call.id) ?? null) as CallConfirmationRow;
      const overallStatus: OverallConfirmationStatus = call.cancelled
        ? "cancelled"
        : (confirmation?.overall_status ?? "awaiting");
      const quality: LeadQuality = lead
        ? deriveLeadQuality({
            status: lead.status,
            intent_score: lead.intent_score,
            priority: lead.priority,
          })
        : "Unknown";
      const callHappened = call.scheduled_for
        ? new Date(call.scheduled_for).getTime() < now.getTime()
        : false;
      const nextAction = call.scheduled_for
        ? deriveNextAction(overallStatus, confirmation, call.scheduled_for, callHappened, now)
        : "No action required";
      const checklist = buildPreCallChecklist(confirmation, !!lead?.precall_video_watched);
      const checklistDone = checklist.filter((c) => c.done).length;
      const source = normalizeAcquisitionSource(null, lead?.source_platform);
      return {
        call,
        lead,
        confirmation,
        overallStatus,
        quality,
        nextAction,
        checklist,
        checklistDone,
        source,
        webinarId:
          (lead as { source_webinar_id?: string | null } | undefined)?.source_webinar_id ?? null,
      };
    });
  }, [data, now]);

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (statusFilter !== "all" && e.overallStatus !== statusFilter) return false;
      if (repFilter !== "all" && e.call.setter_id !== repFilter) return false;
      if (closerFilter !== "all" && e.call.closer_id !== closerFilter) return false;
      if (qualityFilter !== "all" && e.quality !== qualityFilter) return false;
      if (sourceFilter === "__webinar__") {
        if (!matchesWebinarFilter(webinarFilter, e.webinarId, webinarsById)) return false;
      } else if (sourceFilter !== "all" && e.source !== sourceFilter) {
        return false;
      }
      return true;
    });
  }, [
    enriched,
    statusFilter,
    repFilter,
    closerFilter,
    qualityFilter,
    sourceFilter,
    webinarFilter,
    webinarsById,
  ]);

  const visibleDayKeys = useMemo(() => {
    const anchorKey = dayKey(anchorDate, timezone);
    if (view === "day") return [anchorKey];
    if (view === "week") {
      const weekStart = addDays(anchorDate, -anchorDate.getDay());
      return Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i), timezone));
    }
    if (view === "month") {
      const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const gridStart = addDays(monthStart, -monthStart.getDay());
      return Array.from({ length: 42 }, (_, i) => dayKey(addDays(gridStart, i), timezone));
    }
    return [anchorKey]; // year view aggregates by month instead — see YearGrid
  }, [anchorDate, view, timezone]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const key of visibleDayKeys) map.set(key, []);
    for (const e of filtered) {
      if (!e.call.scheduled_for) continue;
      const key = dayKey(new Date(e.call.scheduled_for), timezone);
      if (map.has(key)) map.get(key)!.push(e);
    }
    return map;
  }, [filtered, visibleDayKeys, timezone]);

  // Exact (unpadded) boundaries of the currently SELECTED period — distinct
  // from rangeStart/rangeEnd (the wider, padded fetch window) and from
  // visibleDayKeys' month grid (which spans into the adjacent month for
  // display). The status legend cards (item 9) count against this, so
  // "September" really means September, not the 6 trailing October days
  // the month grid also renders.
  const periodStart = useMemo(() => {
    if (view === "day")
      return new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
    if (view === "week") {
      const d = addDays(anchorDate, -anchorDate.getDay());
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    if (view === "month") return new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    return new Date(anchorDate.getFullYear(), 0, 1);
  }, [anchorDate, view]);
  const periodEnd = useMemo(() => {
    if (view === "day") return addDays(periodStart, 1);
    if (view === "week") return addDays(periodStart, 7);
    if (view === "month") return new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
    return new Date(periodStart.getFullYear() + 1, 0, 1);
  }, [periodStart, view]);
  const periodEntries = useMemo(
    () =>
      filtered.filter((e) => {
        if (!e.call.scheduled_for) return false;
        const t = new Date(e.call.scheduled_for).getTime();
        return t >= periodStart.getTime() && t < periodEnd.getTime();
      }),
    [filtered, periodStart, periodEnd],
  );
  const periodStatusCounts = useMemo(() => {
    const counts: Record<OverallConfirmationStatus, number> = {
      confirmed: 0,
      awaiting: 0,
      overdue: 0,
      at_risk: 0,
      cancelled: 0,
      rescheduled: 0,
    };
    for (const e of periodEntries) counts[e.overallStatus] += 1;
    return counts;
  }, [periodEntries]);

  // Scoped to the SAME selected-period entries the six status cards below
  // use (item 13) — this used to be hardcoded to "today" regardless of the
  // active Day/Week/Month/Year view, which meant switching to Week/Month/
  // Year left the summary silently still describing today. periodEntries
  // already recomputes per view; reusing it here (rather than a second
  // "today" filter) is what actually keeps the two in sync.
  const summary = {
    total: periodEntries.length,
    ready: periodEntries.filter(
      (e) => e.checklistDone === e.checklist.length && e.overallStatus !== "cancelled",
    ).length,
    videoNotWatched: periodEntries.filter(
      (e) => e.lead && !e.lead.precall_video_watched && e.overallStatus !== "cancelled",
    ).length,
    openSlots: periodEntries.filter((e) => e.overallStatus === "cancelled").length,
  };
  // Dynamic timeframe wording (item 12) — "Today's" only when Day is
  // selected; Week/Month/Year get their own noun rather than staying
  // hardcoded to "Today's" regardless of the active view.
  const periodNoun: Record<CalendarView, string> = {
    day: "Today's",
    week: "This week's",
    month: "This month's",
    year: "This year's",
  };
  const periodAdjective: Record<CalendarView, string> = {
    day: "Today",
    week: "This Week",
    month: "This Month",
    year: "This Year",
  };

  const repOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const c of data.calls) if (c.setter_id) ids.add(c.setter_id);
    return Array.from(ids).map((id) => ({ id, name: data.repNameById[id] ?? id }));
  }, [data]);
  const closerOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const c of data.calls) if (c.closer_id) ids.add(c.closer_id);
    return Array.from(ids).map((id) => ({ id, name: data.repNameById[id] ?? id }));
  }, [data]);

  const selected = enriched.find((e) => e.call.id === selectedCallId) ?? null;

  // Confirmed/Awaiting/Overdue/At Risk used to duplicate here AND in the six
  // colored status cards below — removed (item 14), not just hidden; the
  // six cards are now the one place those counts live, and are themselves
  // real filters (item 15) rather than static duplicates of these tiles.
  const summaryTiles: Array<{ key: string; label: string; value: number }> = [
    { key: "total", label: `Calls ${periodAdjective[view]}`, value: summary.total },
    { key: "ready", label: "Pre-Call Ready", value: summary.ready },
    { key: "video", label: "Video Not Watched", value: summary.videoNotWatched },
    { key: "open", label: "Open Slots", value: summary.openSlots },
  ];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground shadow-sm">
        Loading Calls on Calendar…
      </div>
    );
  }

  return (
    <>
      {/* "Calls on Calendar" summary (item 7A) — lives ABOVE the main
          calendar container. Correction: this heading + its tiles used to
          stay hardcoded to "today" regardless of the active Day/Week/Month/
          Year view (unlike the six status cards below, which already
          tracked the selected period) — now scoped to periodEntries like
          everything else, so switching views doesn't leave this block
          silently describing a different period than the calendar under
          it. The page-level "What sales calls need attention today?"
          heading in team-calendar.tsx is a separate, deliberately
          always-today widget and is untouched. Lightweight by design (item
          34) — a title + one row of tiles, not another data-heavy block. */}
      <div className="mb-3 space-y-3">
        <DemoModeBanner demoMode={demoMode} />
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Calls on Calendar
          </div>
          <div className="mt-0.5 text-base font-semibold text-foreground">
            {periodNoun[view]} booked sales calls
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summaryTiles.map((t) => (
            <div key={t.key} className="rounded-lg border border-border/60 bg-background/40 p-2">
              <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-0.5 font-sans tabular-nums text-lg font-semibold text-foreground">
                {t.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main calendar container (item 7A) — everything below (view
          toggles, ← Today → nav, period header, status legend cards, and
          the calendar itself) lives inside this one outer box. */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Period/date header (item 8) — dynamic per Day/Week/Month/Year. */}
          {/* Period header (item 4) — sized up from text-lg so the calendar's
              own date control reads as a primary header, not secondary
              metadata next to the filters/nav beside it. */}
          <div className="text-2xl font-bold tracking-tight text-foreground">
            {periodLabel(anchorDate, view)}
          </div>
          <div className="flex items-center gap-2">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex overflow-hidden rounded-lg border border-border/70">
              {(["day", "week", "month", "year"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`cursor-pointer px-2.5 py-1 text-xs capitalize ${view === v ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <ConfirmationPolicyPopover
              isAdmin={isAdmin}
              policy={data?.policy}
              onSave={async (patch) => {
                if (demoMode) {
                  setDemoDataset((prev) =>
                    prev ? { ...prev, policy: { ...prev.policy, ...patch } } : prev,
                  );
                  toast.success("Confirmation policy updated (demo data)");
                  return;
                }
                try {
                  await setConfirmationPolicy({ data: { org_id: orgId!, ...patch } });
                  toast.success("Confirmation policy updated");
                  invalidate();
                } catch {
                  toast.error("Could not save policy — admin access required");
                }
              }}
            />
          </div>
        </div>

        {/* Filters + ← Today → nav */}
        <div className="flex flex-wrap items-center gap-2">
          {repOptions.length > 0 && (
            <Select value={repFilter} onValueChange={setRepFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Rep: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Rep: All</SelectItem>
                {repOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {closerOptions.length > 0 && (
            <Select value={closerFilter} onValueChange={setCloserFilter}>
              <SelectTrigger className="h-8 w-[150px] text-xs">
                <SelectValue placeholder="Closer: All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Closer: All</SelectItem>
                {closerOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={qualityFilter} onValueChange={setQualityFilter}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Quality: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Quality: All</SelectItem>
              {(
                [
                  "High Quality",
                  "Qualified",
                  "Standard",
                  "Low Quality",
                  "Unqualified",
                  "Unknown",
                ] as const
              ).map((q) => (
                <SelectItem key={q} value={q}>
                  {q}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Priority 7 — explicitly "Acquisition Source" (the standardized
              ACQUISITION_SOURCES taxonomy), never bare "Source", so it can't
              be mistaken for the Platform filter above it. Webinar is an
              additional acquisition-source category nested as a hierarchy
              (All Webinars / Paid Webinars > … / Organic Webinars > …)
              rather than a flat item, since one webinar can't be named in a
              single flat option the way Instagram/TikTok/etc. can. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-[190px] items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 text-xs shadow-sm ring-offset-background transition-all hover:border-ring/30 focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
              >
                <span className="truncate">
                  {sourceFilter === "__webinar__"
                    ? `Acquisition Source: ${webinarFilterLabel(webinarFilter, webinarsById)}`
                    : sourceFilter === "all"
                      ? "Acquisition Source: All"
                      : `Acquisition Source: ${sourceFilter}`}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              <DropdownMenuItem
                onClick={() => {
                  setSourceFilter("all");
                  setWebinarFilter(ALL_WEBINARS_FILTER);
                }}
              >
                Acquisition Source: All
              </DropdownMenuItem>
              {acquisitionSourceOptions().map((s) => (
                <DropdownMenuItem key={s} onClick={() => setSourceFilter(s)}>
                  {s}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Webinar</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-[240px]">
                  <DropdownMenuItem
                    onClick={() => {
                      setSourceFilter("__webinar__");
                      setWebinarFilter(ALL_WEBINARS_FILTER);
                    }}
                  >
                    All Webinars
                  </DropdownMenuItem>
                  <WebinarFilterBranches
                    onChange={(next) => {
                      setSourceFilter("__webinar__");
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
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setAnchorDate((d) => stepAnchor(d, view, -1))}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setAnchorDate(new Date())}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setAnchorDate((d) => stepAnchor(d, view, 1))}
            >
              →
            </Button>
          </div>
        </div>

        {/* Status legend cards — now the PRIMARY interactive status filter
            (item 15), not decorative. Clicking a card filters the calendar
            (and every count on this page) to that status for the currently
            selected date range; clicking the active card again clears it
            (item 16) — no separate "All" control needed since that's
            already the one-click way back. Counted against the exact period
            currently selected (periodStatusCounts) and updating on every
            Day/Week/Month/Year switch and ← Today → navigation. Capped at 3
            columns (not 6) so every card has room for its full label at the
            intended font size — "Confirmation overdue" and "Awaiting
            confirmation" both fit on one line at this width; the label also
            wraps rather than truncates as a safety margin at the narrowest
            (2-column, ~375px) breakpoint instead of clipping. */}
        <div className="flex items-center justify-between">
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Filter by status
          </div>
          {statusFilter !== "all" && (
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className="cursor-pointer text-3xs font-medium text-primary hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(STATUS_LABEL) as OverallConfirmationStatus[]).map((status) => {
            const solid = STATUS_SOLID[status];
            const isSelected = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(isSelected ? "all" : status)}
                aria-pressed={isSelected}
                title={`Filter to ${STATUS_LABEL[status]}`}
                className={`cursor-pointer rounded-lg p-2 text-left transition ${solid.bg} ${solid.text} ${
                  isSelected
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    : "opacity-95 hover:opacity-100 hover:brightness-105"
                }`}
              >
                <div className="flex items-start gap-1.5 text-3xs font-semibold uppercase tracking-wide">
                  <span className="shrink-0">{LEGEND_ICON[status]}</span>{" "}
                  <span>{STATUS_LABEL[status]}</span>
                </div>
                <div className="mt-0.5 font-sans text-lg font-bold tabular-nums">
                  {periodStatusCounts[status]}
                </div>
              </button>
            );
          })}
        </div>

        {/* Confirmation-circle legend — small and informational only, next
            to (never instead of) the actual five circles on each booking.
            Uses the exact same dot size/border/fill/icon classes as
            ConfirmationCircles' own "normal" size so it can never visually
            drift from what the real circles look like. Not-sent uses an
            explicit border-foreground/30 here (vs. border-current/30 on the
            real circles, which inherit the booking card's own text color)
            since this legend isn't sitting on a colored status card. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-3xs text-muted-foreground">
          <span className="font-semibold text-foreground">Pre-call Sequences:</span>
          <div className="flex items-center gap-1.5">
            <span className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full border border-foreground/30 bg-transparent" />
            <span>Not sent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full border border-neutral-400 bg-neutral-300 dark:border-neutral-300 dark:bg-neutral-300">
              <Mail className="h-2 w-2 text-neutral-700" />
            </span>
            <span>Sent, no response</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full border border-emerald-500 bg-emerald-500">
              <Check className="h-2 w-2 text-neutral-900 dark:text-white" strokeWidth={3.5} />
            </span>
            <span>Responded</span>
          </div>
        </div>

        {/* Timeline / agenda / month / year */}
        {view === "year" ? (
          <YearGrid
            anchorDate={anchorDate}
            filtered={filtered}
            timezone={timezone}
            now={now}
            onSelectDate={(date) => {
              setAnchorDate(date);
              setView("day");
            }}
          />
        ) : view === "month" ? (
          <MonthGrid
            dayKeys={visibleDayKeys}
            byDay={byDay}
            anchorDate={anchorDate}
            timezone={timezone}
            now={now}
            repNameById={data?.repNameById ?? {}}
            onSelect={setSelectedCallId}
            onSelectDate={(date) => {
              setAnchorDate(date);
              setView("day");
            }}
          />
        ) : isMobile ? (
          <AgendaList
            entries={filtered.filter((e) =>
              visibleDayKeys.includes(dayKey(new Date(e.call.scheduled_for ?? now), timezone)),
            )}
            timezone={timezone}
            repNameById={data?.repNameById ?? {}}
            onSelect={setSelectedCallId}
          />
        ) : (
          <TimelineGrid
            dayKeys={visibleDayKeys}
            byDay={byDay}
            timezone={timezone}
            now={now}
            repNameById={data?.repNameById ?? {}}
            onSelect={setSelectedCallId}
            onSelectDate={(date) => {
              setAnchorDate(date);
              setView("day");
            }}
          />
        )}
      </div>

      {selected && (
        <CallDetailDrawer
          entry={selected}
          timezone={timezone}
          policy={data?.policy}
          repNameById={data?.repNameById ?? {}}
          onClose={() => setSelectedCallId(null)}
          onMarkTouchpoint={async (touchpoint, extra) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                const next = new Map(prev.confirmationByCallId);
                const existing = next.get(selected.call.id);
                if (!existing) return prev;
                const nowIso = new Date().toISOString();
                const patched = { ...existing };
                if (touchpoint === "night_before") patched.night_before_sent_at = nowIso;
                if (touchpoint === "morning") {
                  patched.morning_sent_at = nowIso;
                  if (extra?.morning_reason_for_change !== undefined)
                    patched.morning_reason_for_change = extra.morning_reason_for_change;
                  if (extra?.morning_goal_1 !== undefined)
                    patched.morning_goal_1 = extra.morning_goal_1;
                  if (extra?.morning_goal_2 !== undefined)
                    patched.morning_goal_2 = extra.morning_goal_2;
                  if (extra?.morning_goal_3 !== undefined)
                    patched.morning_goal_3 = extra.morning_goal_3;
                  if (extra?.morning_response_notes !== undefined)
                    patched.morning_response_notes = extra.morning_response_notes;
                  patched.morning_responded_at = nowIso;
                }
                if (touchpoint === "one_hour") patched.one_hour_sent_at = nowIso;
                if (touchpoint === "thirty_min") {
                  patched.thirty_min_sent_at = nowIso;
                  if (extra?.thirty_min_confirmed) {
                    patched.thirty_min_confirmed = true;
                    patched.thirty_min_confirmed_at = nowIso;
                  }
                }
                if (touchpoint === "ten_min") patched.ten_min_sent_at = nowIso;
                next.set(selected.call.id, patched);
                return { ...prev, confirmationByCallId: next };
              });
              toast.success(`${TOUCHPOINT_LABELS[touchpoint]} marked sent (demo data)`);
              return;
            }
            try {
              await markTouchpoint({
                data: { call_id: selected.call.id, org_id: orgId!, touchpoint, ...extra },
              });
              invalidate();
              toast.success(`${TOUCHPOINT_LABELS[touchpoint]} marked sent`);
            } catch {
              toast.error("Could not update touchpoint");
            }
          }}
          onUnmarkTouchpoint={async (touchpoint) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                const next = new Map(prev.confirmationByCallId);
                const existing = next.get(selected.call.id);
                if (!existing) return prev;
                const patched = { ...existing };
                if (touchpoint === "night_before") patched.night_before_sent_at = null;
                if (touchpoint === "morning") {
                  patched.morning_sent_at = null;
                  patched.morning_responded_at = null;
                }
                if (touchpoint === "one_hour") patched.one_hour_sent_at = null;
                if (touchpoint === "thirty_min") {
                  patched.thirty_min_sent_at = null;
                  patched.thirty_min_confirmed = false;
                  patched.thirty_min_confirmed_at = null;
                }
                if (touchpoint === "ten_min") patched.ten_min_sent_at = null;
                next.set(selected.call.id, patched);
                return { ...prev, confirmationByCallId: next };
              });
              toast.success(`${TOUCHPOINT_LABELS[touchpoint]} unmarked (demo data)`);
              return;
            }
            try {
              await unmarkTouchpoint({
                data: { call_id: selected.call.id, org_id: orgId!, touchpoint },
              });
              invalidate();
              toast.success(`${TOUCHPOINT_LABELS[touchpoint]} unmarked`);
            } catch {
              toast.error("Could not unmark touchpoint");
            }
          }}
          onRespondTouchpoint={async (touchpoint, responded) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                const next = new Map(prev.confirmationByCallId);
                const existing = next.get(selected.call.id);
                if (!existing) return prev;
                const patched = { ...existing };
                const nowIso = responded ? new Date().toISOString() : null;
                if (touchpoint === "night_before") patched.night_before_responded_at = nowIso;
                if (touchpoint === "morning") patched.morning_responded_at = nowIso;
                if (touchpoint === "one_hour") patched.one_hour_responded_at = nowIso;
                if (touchpoint === "thirty_min") {
                  patched.thirty_min_confirmed = responded;
                  patched.thirty_min_confirmed_at = nowIso;
                }
                if (touchpoint === "ten_min") patched.ten_min_responded_at = nowIso;
                next.set(selected.call.id, patched);
                return { ...prev, confirmationByCallId: next };
              });
              toast.success(
                `${TOUCHPOINT_LABELS[touchpoint]} ${responded ? "marked responded" : "response cleared"} (demo data)`,
              );
              return;
            }
            try {
              await respondTouchpoint({
                data: { call_id: selected.call.id, org_id: orgId!, touchpoint, responded },
              });
              invalidate();
              toast.success(
                `${TOUCHPOINT_LABELS[touchpoint]} ${responded ? "marked responded" : "response cleared"}`,
              );
            } catch {
              toast.error("Could not update response");
            }
          }}
          onSetStatus={async (status, cancelledReason, rescheduledReason) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                const nextConfirmations = new Map(prev.confirmationByCallId);
                const existing = nextConfirmations.get(selected.call.id);
                if (existing) {
                  const nowIso = new Date().toISOString();
                  nextConfirmations.set(selected.call.id, {
                    ...existing,
                    overall_status: status,
                    confirmed_at: status === "confirmed" ? nowIso : existing.confirmed_at,
                    cancelled_reason:
                      status === "cancelled"
                        ? (cancelledReason ?? "Cancelled by rep")
                        : existing.cancelled_reason,
                    rescheduled_reason:
                      status === "rescheduled"
                        ? (rescheduledReason ?? "Reason not recorded")
                        : existing.rescheduled_reason,
                  });
                }
                const nextCalls = prev.calls.map((c) =>
                  c.id === selected.call.id && status === "cancelled"
                    ? { ...c, cancelled: true }
                    : c,
                );
                return { ...prev, calls: nextCalls, confirmationByCallId: nextConfirmations };
              });
              toast.success("Status updated (demo data)");
              return;
            }
            try {
              await setConfirmationStatus({
                data: {
                  call_id: selected.call.id,
                  org_id: orgId!,
                  status,
                  cancelled_reason: cancelledReason,
                  rescheduled_reason: rescheduledReason,
                },
              });
              invalidate();
              toast.success("Status updated");
            } catch {
              toast.error("Could not update status");
            }
          }}
          onReschedule={async (isoDate, reason) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                const nextConfirmations = new Map(prev.confirmationByCallId);
                const existing = nextConfirmations.get(selected.call.id);
                if (existing) {
                  nextConfirmations.set(selected.call.id, {
                    ...existing,
                    overall_status: "rescheduled",
                    rescheduled_reason: reason || "Reason not recorded",
                  });
                }
                return {
                  ...prev,
                  calls: prev.calls.map((c) =>
                    c.id === selected.call.id ? { ...c, scheduled_for: isoDate } : c,
                  ),
                  confirmationByCallId: nextConfirmations,
                };
              });
              toast.success("Call rescheduled (demo data)");
              return;
            }
            const { error } = await supabase
              .from("calls")
              .update({ scheduled_for: isoDate })
              .eq("id", selected.call.id);
            if (error) {
              toast.error("Could not reschedule");
              return;
            }
            try {
              await setConfirmationStatus({
                data: {
                  call_id: selected.call.id,
                  org_id: orgId!,
                  status: "rescheduled",
                  rescheduled_reason: reason,
                },
              });
            } catch {
              // The reschedule itself already succeeded (scheduled_for is
              // updated) — a failure here only means the reason/status
              // didn't record, which invalidate()+a future edit can still fix.
            }
            toast.success("Call rescheduled");
            invalidate();
          }}
          onToggleShowed={async (showed) => {
            if (demoMode) {
              setDemoDataset((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  calls: prev.calls.map((c) => (c.id === selected.call.id ? { ...c, showed } : c)),
                };
              });
              toast.success("Updated (demo data)");
              return;
            }
            const { error } = await supabase
              .from("calls")
              .update({ showed })
              .eq("id", selected.call.id);
            if (error) toast.error("Could not update");
            else invalidate();
          }}
        />
      )}
    </>
  );
}

function TimelineGrid({
  dayKeys,
  byDay,
  timezone,
  now,
  repNameById,
  onSelect,
  onSelectDate,
}: {
  dayKeys: string[];
  byDay: Map<string, ReturnType<typeof Array.prototype.slice>>;
  timezone: string;
  now: Date;
  repNameById: Record<string, string>;
  onSelect: (id: string) => void;
  /** Clicking a day-column header jumps Day view to that date (item 16). */
  onSelectDate: (date: Date) => void;
}) {
  // Exactly 24 rows (0..23) — item 1's fix. The previous "+1" length here
  // rendered a 25th row whose label wraps back to "12am" (h % 24 === 0 at
  // h=24), which both duplicated the top's own 12am label at the bottom AND
  // made this label column one full hour-row taller than the event grid
  // column below (gridHeight is exactly 24*60 minutes — a 25-row label
  // column no longer matches it), leaving a dangling blank strip under the
  // last real hour. 24 rows × 60min = the same 1440-minute day, no mismatch.
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const gridHeight = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;
  const nowMinutes = minutesIntoDay(now, timezone);
  const nowTop = (nowMinutes - GRID_START_MIN) * PX_PER_MIN;
  const todayKey = dayKey(now, timezone);
  const HEADER_HEIGHT = 56; // h-14
  const SCROLL_MAX_HEIGHT = 560;

  // Initial scroll position (item 3) — never open cold at 12am. If today is
  // one of the visible columns AND it's already a reasonable hour, center on
  // the current time (where sales calls are actually happening right now).
  // But "now" can itself be the middle of the night — 1am, 3am — a time slot
  // with essentially no bookings, which left the calendar opening on a
  // near-empty view. Below an 8am floor (same value already used as the
  // non-today fallback) we use that same working-hour default instead of
  // the literal clock time, so a page load/refresh always lands somewhere
  // calls actually cluster. Re-runs whenever the visible day set changes
  // (Day/Week navigation, ← Today →), not just on first mount.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const todayVisible = dayKeys.includes(todayKey);
    const WORKING_HOUR_FLOOR = 8 * 60;
    const targetMinutes =
      todayVisible && nowMinutes >= WORKING_HOUR_FLOOR ? nowMinutes : WORKING_HOUR_FLOOR;
    const viewportHeight = SCROLL_MAX_HEIGHT - HEADER_HEIGHT;
    const rawTop = (targetMinutes - GRID_START_MIN) * PX_PER_MIN - viewportHeight / 3;
    const maxScroll = gridHeight - viewportHeight;
    container.scrollTop = Math.min(Math.max(0, rawTop), Math.max(0, maxScroll));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on the visible-day set, not every prop; re-deriving nowMinutes each render would re-scroll on every 60s clock tick.
  }, [dayKeys.join(",")]);

  return (
    <div
      ref={scrollRef}
      className="overflow-auto rounded-xl border border-border/60"
      style={{ maxHeight: SCROLL_MAX_HEIGHT }}
    >
      <div className="flex">
        {/* Sticky header (item 13) — the corner cell + every day-column
            header below stay pinned to the top of this scroll container
            (not the page) while the hour grid scrolls underneath. */}
        <div className="sticky left-0 top-0 z-20 w-14 shrink-0 border-r border-border/60 bg-background">
          <div className="h-14 border-b border-border/60" />
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: 60 * PX_PER_MIN }}
              // Time labels (item 2) — text-foreground (theme-aware white in
              // dark mode, black in light mode) instead of the previous
              // muted-foreground gray, per item 10's "eliminate the overly-
              // gray calendar typography." Grid line matches the hour rows'
              // own border-foreground/15 (see the matching comment there —
              // border-border tops out too faint to read clearly).
              className="border-b border-foreground/15 pr-1 text-right text-3xs font-medium text-foreground/80"
            >
              {h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
            </div>
          ))}
        </div>
        {dayKeys.map((key) => {
          const entries = byDay.get(key) ?? [];
          // Overlap layout (Priority 6) — computed per day, from each
          // entry's real start/end minute, independent of the vertical
          // top/height math below.
          const withTimes = entries
            .filter((e) => !!e.call.scheduled_for)
            .map((e) => {
              const start = new Date(e.call.scheduled_for!);
              const startMin = minutesIntoDay(start, timezone);
              const durationMin = e.call.duration_seconds
                ? e.call.duration_seconds / 60
                : DEFAULT_DURATION_MIN;
              return { id: e.call.id, entry: e, startMin, endMin: startMin + durationMin };
            });
          const overlapLayout = computeOverlapColumns(withTimes);
          const isToday = key === todayKey;
          const [ky, km, kd] = key.split("-").map(Number);
          const cellDate = new Date(ky, km - 1, kd);
          const weekdayAbbr = cellDate
            .toLocaleDateString("en-US", { weekday: "short" })
            .toUpperCase();
          return (
            <div
              key={key}
              className="relative flex-1 border-r border-border/40 last:border-r-0"
              style={{ minWidth: dayKeys.length > 1 ? 140 : undefined }}
            >
              {/* Google Calendar-style header (item 7/8/12): weekday label
                  above a significantly larger date number, today gets a
                  colored circle + colored weekday label. Only the date
                  number itself is clickable — jumps to Day view for that
                  date (item 16) — not the weekday label or the surrounding
                  header padding, so hovering/clicking anywhere else in this
                  header does nothing. This mirrors the hover-circle scoping
                  fix just above it: interaction and hover both key off the
                  circle's own bounds, never the whole cell. */}
              <div className="sticky top-0 z-10 flex h-14 w-full flex-col items-center justify-center gap-0.5 border-b border-border/60 bg-background px-2 py-1">
                <span
                  className={`text-2xs font-semibold tracking-wider ${isToday ? "text-primary" : "text-foreground/70"}`}
                >
                  {weekdayAbbr}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectDate(cellDate)}
                  className={
                    isToday
                      ? "grid h-8 w-8 cursor-pointer place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground"
                      : "grid h-8 w-8 cursor-pointer place-items-center rounded-full text-lg font-bold text-foreground transition hover:bg-neutral-300 dark:hover:bg-neutral-700"
                  }
                >
                  {kd}
                </button>
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: 60 * PX_PER_MIN }}
                    // Item 5: the old border-border-based line topped out
                    // around 7-8% effective alpha even at full strength
                    // (border-border itself is only a 12-14%-alpha token, so
                    // any opacity modifier on it just dilutes further) — too
                    // faint to track across a wide grid. Switched to
                    // border-foreground (white in dark mode, near-black in
                    // light mode) at a modifier tuned for a clearly visible
                    // but still subtle hairline.
                    className="border-b border-foreground/15"
                  />
                ))}
                {/* Current-time line — stacking fix: this shared z-10 with
                    the sticky day-header button above (which is also z-10),
                    an unresolved tie that let the line visually bleed
                    through the header's background while scrolling (the
                    header's own text still painted above it, producing the
                    reported "line above the header background but below its
                    text" artifact). z-[5] keeps it unambiguously BELOW the
                    header (z-10, its own stacking context) while staying
                    ABOVE the CallBlock event cards it needs to stay visible
                    over (their inline zIndex is 1-4 at realistic overlap
                    counts) — the header now always wins, the line still
                    never disappears behind an event. */}
                {key === todayKey && nowTop >= 0 && nowTop <= gridHeight && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-[5] border-t-2 border-red-500"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -top-1.5 left-0 h-3 w-3 rounded-full bg-red-500" />
                  </div>
                )}
                {withTimes.map(({ id, entry: e, startMin }) => {
                  const durationMin = e.call.duration_seconds
                    ? e.call.duration_seconds / 60
                    : DEFAULT_DURATION_MIN;
                  // Vertical geometry is exact-duration only — internal
                  // card padding (CallBlock) never touches this outer
                  // block's height, so a 30-minute call always occupies
                  // exactly a 30-minute-tall block regardless of how much
                  // content is inside it.
                  const top = Math.max(0, (startMin - GRID_START_MIN) * PX_PER_MIN);
                  const height = Math.max(20, durationMin * PX_PER_MIN);
                  const layout = overlapLayout.get(id) ?? { column: 0, columnCount: 1 };
                  const widthPct = 100 / layout.columnCount;
                  const leftPct = layout.column * widthPct;
                  // A consistent 2px inset on every side of every column
                  // slot — at columnCount=1 that's the same ~4px total edge
                  // padding the block always had; at columnCount>1 it also
                  // becomes the visual gap between adjacent side-by-side
                  // cards, so overlapping calls never touch edge-to-edge.
                  return (
                    <CallBlock
                      key={id}
                      entry={e}
                      timezone={timezone}
                      repNameById={repNameById}
                      style={{
                        position: "absolute",
                        top,
                        height,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        zIndex: layout.column + 1,
                      }}
                      onSelect={onSelect}
                      columnCount={layout.columnCount}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function statusIcon(status: OverallConfirmationStatus) {
  if (status === "cancelled") return "✕";
  if (status === "confirmed") return "✓";
  if (status === "at_risk") return "⚠";
  if (status === "overdue") return "!";
  return "…";
}

// Five small circles for the canonical touchpoint sequence (items 19-23) —
// pure derivation off deriveTouchpointStatus, so a circle can never show
// green unless a response is actually recorded (item 23). Three visually
// distinct states, none of which can be confused for another: empty/no fill
// (not sent), light-gray fill + envelope icon (sent, no response — an
// in-progress, neutral outcome, never green and never a checkmark), and
// green fill + checkmark (responded — the only state that means someone on
// the other end actually acted). The gray fill and its icon color are fixed
// (not a dark/light-inverting pair) since the fill itself doesn't change
// between themes — only the checkmark on the green "responded" state does.
//
// Sizing is CSS container-query driven (against the booking button's own
// @container, not columnCount) rather than JS-computed: full size whenever
// the button is actually wide enough to hold it (@[100px]:), the small
// fallback otherwise. That's a deliberate correction — sizing off
// columnCount alone shrank the circles on every overlapping booking even
// when the column was still plenty wide (e.g. a 2-way overlap in a roomy
// view), which read as inconsistent. This way two calls at the same time in
// a wide view get full-size circles just like a single call does; only a
// column that's genuinely too narrow (verified: below 100px, five full
// circles plus the icon they'd need would clip) drops to the small,
// icon-less fallback that was already proven safe at every overlap width.
function ConfirmationCircles({
  confirmation,
  scheduledFor,
  className,
}: {
  confirmation: CallConfirmationRow;
  scheduledFor: string;
  className?: string;
}) {
  return (
    <div className={`flex shrink-0 items-center gap-0 @[100px]:gap-0.5 ${className ?? ""}`}>
      {TOUCHPOINT_SEQUENCE.map((tp) => {
        const status = deriveTouchpointStatus(tp, confirmation, scheduledFor);
        const responded = status === "responded";
        const sentNoResponse = status === "manually_sent" || status === "scheduled";
        const stateLabel = responded
          ? "Responded"
          : sentNoResponse
            ? "Sent, no response"
            : "Not sent";
        return (
          <span
            key={tp}
            title={`${TOUCHPOINT_LABELS[tp]} — ${stateLabel}`}
            className={`grid h-1 w-1 shrink-0 place-items-center rounded-full border @[100px]:h-2.5 @[100px]:w-2.5 ${
              responded
                ? "border-emerald-500 bg-emerald-500"
                : sentNoResponse
                  ? "border-neutral-400 bg-neutral-300 dark:border-neutral-300 dark:bg-neutral-300"
                  : "border-current/30 bg-transparent"
            }`}
          >
            {/* Below 100px the dot itself is only 4px — too small to also
                hold a legible icon without overflowing it. The fill/border
                distinction alone still carries the three real states there;
                the icon is a bonus once there's room, never the only signal. */}
            {responded && (
              <Check
                className="hidden h-2 w-2 text-neutral-900 dark:text-white @[100px]:block"
                strokeWidth={3.5}
              />
            )}
            {sentNoResponse && <Mail className="hidden h-2 w-2 text-neutral-700 @[100px]:block" />}
          </span>
        );
      })}
    </div>
  );
}

function CallBlock({
  entry,
  timezone,
  repNameById,
  style,
  onSelect,
  columnCount = 1,
}: {
  entry: {
    call: CallRow;
    lead?: LeadRow;
    confirmation: CallConfirmationRow;
    overallStatus: OverallConfirmationStatus;
    quality: LeadQuality;
    nextAction: string;
    checklist: Array<{ label: string; done: boolean }>;
    checklistDone: number;
  };
  timezone: string;
  repNameById: Record<string, string>;
  style: React.CSSProperties;
  onSelect: (id: string) => void;
  /** How many calls currently overlap this one (same slot, split into
   *  side-by-side columns). Drives the item-26 narrow-card priority fix —
   *  defaults to 1 (no overlap) for AgendaList, which never splits columns. */
  columnCount?: number;
}) {
  const { call, lead, confirmation, overallStatus, quality, nextAction, checklist, checklistDone } =
    entry;
  // Item 26 correction: 2+ overlapping calls split this column narrow enough
  // that the old single-line "Name — Closer" + full-size circles layout
  // could shrink the name span to 0px (measured, confirmed defect: at
  // columnCount 2 the name span hit width:0 at both a 1400px and an 820px
  // viewport). Any overlap ("compact", columnCount>=2) drops the status icon
  // and the closer suffix to guarantee the two hard requirements — the lead
  // name keeps a protected, non-zero minimum width, and all five circles
  // stay full and unclipped (verified: they still measurably overlapped the
  // button's right edge at columnCount 2 with the icon kept and full-size
  // closer text competing for the same row — dropping both was the only
  // combination that held at every measured overlap width). "tight" (3+-way,
  // genuinely narrower again) shrinks the circles and the name floor further
  // on top of that.
  const compact = columnCount >= 2;
  const tight = columnCount >= 3;
  const isCancelled = overallStatus === "cancelled";
  const isRescheduled = overallStatus === "rescheduled";
  const timeLabel = call.scheduled_for
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(call.scheduled_for))
    : "";
  const closerName = call.closer_id ? (repNameById[call.closer_id] ?? "Unassigned") : "Unassigned";
  // A standard 30-minute block is only ~33px tall at this grid's scale
  // (Priority 6/37 — that geometry is exact and never inflated to fit more
  // text). Below ~48px there's only room for two compact lines before text
  // starts fighting the block's own duration-derived height, so the
  // quality/checklist/next-action lines only render when the block is
  // genuinely tall enough (a longer call, or the "auto" height agenda list)
  // — never by padding the 30-minute block itself.
  const blockHeight = typeof style.height === "number" ? style.height : Infinity;
  const roomy = blockHeight >= 48;
  const leadLine = `${displayName(lead?.full_name ?? lead?.handle) || "Unknown"} — ${displayName(closerName)}`;

  // Cancelled/rescheduled (item 6): fill matches the calendar surface (never
  // the status color), border + text come from the booking's ORIGINAL status
  // (captured server-side in previous_status the instant it transitioned —
  // see call-confirmations.server.ts's setOverallStatus), and the lead/closer
  // line strikes through. A booking cancelled/rescheduled before ever having
  // a previous_status (e.g. it was "awaiting" from creation) falls back to
  // the awaiting accent rather than losing its border/text entirely.
  if (isCancelled || isRescheduled) {
    const accent = ORIGINAL_STATUS_ACCENT[confirmation?.previous_status ?? "awaiting"];
    return (
      <button
        onClick={() => onSelect(call.id)}
        style={style}
        className={`cursor-pointer overflow-hidden rounded-md border-2 bg-card px-1.5 py-1 text-left text-3xs shadow-sm ${accent.border} ${accent.text}`}
      >
        <div className="flex items-center gap-1 font-semibold">
          <span className="shrink-0">{statusIcon(overallStatus)}</span>
          <span className="truncate line-through decoration-2">
            {isCancelled ? "Canceled: " : "Rescheduled: "}
            {leadLine}
          </span>
        </div>
        <div className="truncate line-through opacity-80">{timeLabel}</div>
      </button>
    );
  }

  // Solid status color, no separate border — the block's own fill IS the
  // status indicator (item 10/11), directly off overallStatus so it can
  // never drift from the legend (checklist/lead-quality shaped the OLD
  // ad-hoc tone here, which meant "at risk" and "overdue" rendered
  // identically and "awaiting"/"rescheduled" never got their own color).
  const solid = STATUS_SOLID[overallStatus];

  return (
    <button
      onClick={() => onSelect(call.id)}
      style={style}
      className={`@container cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-left text-3xs shadow-sm ${solid.bg} ${solid.text}`}
    >
      {/* Priority order when the box is narrow (item 26): 1) lead name,
          2) closer, 3) the five confirmation circles. The lead name always
          keeps a protected, non-zero minimum width — it can truncate but
          never fully disappear. Any overlap (compact, 2+ calls sharing this
          slot) drops the status icon; tight (3+-way overlap) shrinks the
          name floor further on top of that.

          Name and closer sit directly next to each other ("Name and
          Closer") — neither is flex-1 (a greedy flex-1 name was pushing
          closer, and the circles after it, all the way to the button's far
          right edge with a large dead gap in between). A dedicated
          zero-width spacer with flex-1 comes after them and does that
          job instead, so the circles stay pinned to the right edge as a
          consistent "status area" while name+closer form one left-aligned
          cluster right next to the icon.

          The closer suffix is NOT tied to columnCount — this card is a CSS
          size container (@container), and the closer span only renders
          (hidden below, inline at/above ~100px of ACTUAL rendered width)
          once there's genuinely room for it. That's why a 2-way overlap in
          Day view (one wide column split in two, still ~190px+) shows the
          closer while the same 2-way overlap in a 7-column Week view
          (~65-80px) doesn't — same columnCount, different real width. When
          shown, closer has no width floor of its own, so it truncates/
          shrinks away before the protected name floor ever gives up any
          space. ConfirmationCircles is sized the same way (see its own
          comment) — full-size whenever the button is wide enough, not
          keyed off columnCount, so two overlapping calls in a roomy view
          get the same circle size as a single call does. */}
      <div className={`flex items-center font-semibold ${tight ? "gap-0.5" : "gap-1"}`}>
        {!compact && <span className="shrink-0">{statusIcon(overallStatus)}</span>}
        <span className={`${tight ? "min-w-[10px]" : "min-w-[18px]"} shrink truncate`}>
          {displayName(lead?.full_name ?? lead?.handle) || "Unknown"}
        </span>
        <span className="hidden min-w-0 shrink truncate text-[0.92em] font-normal opacity-80 @[100px]:inline">
          and <span className="font-semibold">{displayName(closerName)}</span>
        </span>
        <span className="min-w-0 flex-1" />
        {call.scheduled_for && (
          <ConfirmationCircles
            confirmation={confirmation}
            scheduledFor={call.scheduled_for}
            className="shrink-0"
          />
        )}
      </div>
      <div className="truncate opacity-80">{timeLabel}</div>
      {roomy && (
        <>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 opacity-80">
            <span>{quality}</span>
            <span>
              · {checklistDone}/{checklist.length}
            </span>
          </div>
          <div className="mt-0.5 truncate font-medium">{nextAction}</div>
        </>
      )}
    </button>
  );
}

function AgendaList({
  entries,
  timezone,
  repNameById,
  onSelect,
}: {
  entries: Array<{
    call: CallRow;
    lead?: LeadRow;
    confirmation: CallConfirmationRow;
    overallStatus: OverallConfirmationStatus;
    quality: LeadQuality;
    nextAction: string;
    checklist: Array<{ label: string; done: boolean }>;
    checklistDone: number;
  }>;
  timezone: string;
  repNameById: Record<string, string>;
  onSelect: (id: string) => void;
}) {
  const sorted = [...entries].sort((a, b) =>
    (a.call.scheduled_for ?? "").localeCompare(b.call.scheduled_for ?? ""),
  );
  if (!sorted.length) {
    return (
      <EmptyState icon={<CalendarClock className="h-4 w-4" />} title="No calls in this range" />
    );
  }
  return (
    <div className="space-y-2">
      {sorted.map((e) => (
        <CallBlock
          key={e.call.id}
          entry={e}
          timezone={timezone}
          repNameById={repNameById}
          style={{ position: "relative", height: "auto" }}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

const MONTH_GRID_MAX_CHIPS = 3;

function MonthGrid({
  dayKeys,
  byDay,
  anchorDate,
  timezone,
  now,
  repNameById,
  onSelect,
  onSelectDate,
}: {
  dayKeys: string[];
  byDay: Map<string, ReturnType<typeof Array.prototype.slice>>;
  anchorDate: Date;
  timezone: string;
  now: Date;
  repNameById: Record<string, string>;
  onSelect: (id: string) => void;
  /** Clicking a date number jumps Day view to that date (item 16). */
  onSelectDate: (date: Date) => void;
}) {
  const currentMonth = anchorDate.getMonth();
  const todayKey = dayKey(now, timezone);
  return (
    <div className="rounded-xl border border-border/60 overflow-hidden">
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-border/60 bg-background">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="p-1.5 text-center text-3xs font-semibold uppercase tracking-wider text-foreground/70"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {dayKeys.map((key) => {
          const [y, m, d] = key.split("-").map(Number);
          const cellDate = new Date(y, m - 1, d);
          const inMonth = cellDate.getMonth() === currentMonth;
          const entries = (byDay.get(key) ?? []) as Array<{
            call: CallRow;
            lead?: LeadRow;
            confirmation: CallConfirmationRow;
            overallStatus: OverallConfirmationStatus;
          }>;
          const sorted = [...entries].sort((a, b) =>
            (a.call.scheduled_for ?? "").localeCompare(b.call.scheduled_for ?? ""),
          );
          const shown = sorted.slice(0, MONTH_GRID_MAX_CHIPS);
          const overflow = sorted.length - shown.length;
          return (
            <div
              key={key}
              className={`min-h-[92px] border-b border-r border-border/45 p-1 last:border-r-0 ${
                inMonth ? "" : "bg-muted/10"
              }`}
            >
              {/* Item 11: only the date number is centered within its own
                  small area — the cell itself and the event chips below stay
                  left-aligned, unchanged. */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => onSelectDate(cellDate)}
                  className={`grid h-7 w-7 cursor-pointer place-items-center rounded-full text-sm font-semibold transition ${
                    key === todayKey
                      ? "bg-primary text-primary-foreground"
                      : inMonth
                        ? "text-foreground hover:bg-neutral-300 dark:hover:bg-neutral-700"
                        : "text-foreground/30 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                  }`}
                >
                  {d}
                </button>
              </div>
              <div className="mt-1 space-y-0.5">
                {shown.map((e) => {
                  const lead = e.lead;
                  const timeLabel = e.call.scheduled_for
                    ? new Intl.DateTimeFormat("en-US", {
                        timeZone: timezone,
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(e.call.scheduled_for))
                    : "";
                  // Item 6, shared with CallBlock (Day/Week/Agenda) via the
                  // same ORIGINAL_STATUS_ACCENT lookup — a cancelled/
                  // rescheduled booking never falls back to this chip's
                  // normal solid-status fill, in Month view either.
                  if (e.overallStatus === "cancelled" || e.overallStatus === "rescheduled") {
                    const accent =
                      ORIGINAL_STATUS_ACCENT[e.confirmation?.previous_status ?? "awaiting"];
                    const label = e.overallStatus === "cancelled" ? "Canceled" : "Rescheduled";
                    return (
                      <button
                        key={e.call.id}
                        onClick={() => onSelect(e.call.id)}
                        className={`block w-full cursor-pointer truncate rounded border px-1 py-0.5 text-left text-3xs bg-card ${accent.border} ${accent.text}`}
                        title={`${label}: ${displayName(lead?.full_name ?? lead?.handle) || "Unknown"} · ${timeLabel}`}
                      >
                        <span className="line-through decoration-2">
                          {timeLabel} {displayName(lead?.full_name ?? lead?.handle) || "Unknown"}
                        </span>
                      </button>
                    );
                  }
                  const solid = STATUS_SOLID[e.overallStatus];
                  return (
                    <button
                      key={e.call.id}
                      onClick={() => onSelect(e.call.id)}
                      className={`block w-full cursor-pointer truncate rounded px-1 py-0.5 text-left text-3xs ${solid.bg} ${solid.text}`}
                      title={`${displayName(lead?.full_name ?? lead?.handle) || "Unknown"} · ${timeLabel}`}
                    >
                      {timeLabel} {displayName(lead?.full_name ?? lead?.handle) || "Unknown"}
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <div className="px-1 text-3xs text-muted-foreground">+{overflow} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* repNameById reserved for a future closer/setter chip in the cell —
          not shown today to keep the grid legible at this density. */}
      <span className="sr-only">{Object.keys(repNameById).length}</span>
    </div>
  );
}

const YEAR_MINI_WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function YearGrid({
  anchorDate,
  filtered,
  timezone,
  now,
  onSelectDate,
}: {
  anchorDate: Date;
  filtered: Array<{ call: CallRow }>;
  timezone: string;
  now: Date;
  /** Clicking a date number jumps Day view to that date (item 16/28). */
  onSelectDate: (date: Date) => void;
}) {
  const year = anchorDate.getFullYear();
  const todayKey = dayKey(now, timezone);
  // Real event-day indicators (item 28), not just a raw count — every date
  // that has at least one booking gets a dot under its number, from the
  // same filtered dataset every other view renders.
  const datesWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const e of filtered) {
      if (!e.call.scheduled_for) continue;
      set.add(dayKey(new Date(e.call.scheduled_for), timezone));
    }
    return set;
  }, [filtered, timezone]);

  const months = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthStart = new Date(year, monthIndex, 1);
    const gridStart = addDays(monthStart, -monthStart.getDay());
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    // Trim to whole weeks that actually touch this month, so short months
    // (Feb) don't render a wasted trailing all-next-month row.
    const usedCells = cells.filter(
      (d, i) => d.getMonth() === monthIndex || (i >= 7 && cells[i - 7].getMonth() === monthIndex),
    );
    const weekCount = Math.ceil(usedCells.length / 7) * 7;
    return {
      monthIndex,
      name: monthStart.toLocaleDateString("en-US", { month: "long" }),
      cells: cells.slice(0, weekCount),
    };
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map(({ monthIndex, name, cells }) => (
        <div key={name} className="rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="mb-2 text-center text-sm font-semibold text-foreground">{name}</div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {YEAR_MINI_WEEKDAYS.map((w, i) => (
              <div
                key={i}
                className="text-center text-3xs font-semibold uppercase text-foreground/60"
              >
                {w}
              </div>
            ))}
            {cells.map((cellDate) => {
              const inMonth = cellDate.getMonth() === monthIndex;
              const key = dayKey(cellDate, timezone);
              const isToday = key === todayKey;
              const hasEvents = datesWithEvents.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(cellDate)}
                  className="flex cursor-pointer flex-col items-center gap-0.5 rounded py-0.5"
                >
                  {/* Item 9: the hover circle sits on the date number itself
                      (lighter than the today/selected fill), not the whole
                      cell — item 8: typography bumped one notch from the
                      previous 4xs without restructuring this mini-month
                      composition. */}
                  <span
                    className={
                      isToday
                        ? "grid h-6 w-6 place-items-center rounded-full bg-primary text-3xs font-bold text-primary-foreground"
                        : `grid h-6 w-6 place-items-center rounded-full text-3xs transition hover:bg-neutral-300 dark:hover:bg-neutral-700 ${inMonth ? "text-foreground" : "text-foreground/30"}`
                    }
                  >
                    {cellDate.getDate()}
                  </span>
                  <span
                    className={`h-1 w-1 rounded-full ${hasEvents && inMonth ? "bg-spectrum-hot" : "bg-transparent"}`}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmationPolicyPopover({
  isAdmin,
  policy,
  onSave,
}: {
  isAdmin: boolean;
  policy?: {
    overdue_after_hours: number;
    at_risk_after_hours: number;
    auto_cancel_enabled: boolean;
    auto_cancel_minutes_before: number;
  };
  onSave: (
    patch: Partial<{
      overdue_after_hours: number;
      at_risk_after_hours: number;
      auto_cancel_enabled: boolean;
      auto_cancel_minutes_before: number;
    }>,
  ) => void;
}) {
  const [overdue, setOverdue] = useState(policy?.overdue_after_hours ?? 24);
  const [atRisk, setAtRisk] = useState(policy?.at_risk_after_hours ?? 4);
  const [autoCancel, setAutoCancel] = useState(policy?.auto_cancel_enabled ?? false);
  useEffect(() => {
    if (policy) {
      setOverdue(policy.overdue_after_hours);
      setAtRisk(policy.at_risk_after_hours);
      setAutoCancel(policy.auto_cancel_enabled);
    }
  }, [policy]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8" title="Confirmation policy">
          <Settings className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3 text-xs">
        <div className="font-semibold">Confirmation policy</div>
        <p className="text-3xs text-muted-foreground">
          Overdue after {policy?.overdue_after_hours ?? 24}h without confirmation, at-risk after{" "}
          {policy?.at_risk_after_hours ?? 4}h.
        </p>
        <p
          className={`rounded-md border px-2 py-1 text-3xs ${policy?.auto_cancel_enabled ? "border-red-500/40 bg-red-500/5 text-red-300" : "border-border/50 bg-muted/10 text-muted-foreground"}`}
        >
          Automatic cancellation is currently {policy?.auto_cancel_enabled ? "ACTIVE" : "off"}.
          Unconfirmed calls{" "}
          {policy?.auto_cancel_enabled
            ? "will be auto-cancelled"
            : "only reach At Risk — a human must act"}
          .
        </p>
        {isAdmin ? (
          <div className="space-y-2">
            <label className="block">
              Overdue after (hours)
              <Input
                type="number"
                value={overdue}
                onChange={(e) => setOverdue(Number(e.target.value))}
                className="mt-1 h-7 text-xs"
              />
            </label>
            <label className="block">
              At-risk after (hours)
              <Input
                type="number"
                value={atRisk}
                onChange={(e) => setAtRisk(Number(e.target.value))}
                className="mt-1 h-7 text-xs"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoCancel}
                onChange={(e) => setAutoCancel(e.target.checked)}
              />
              Enable automatic cancellation
            </label>
            <Button
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() =>
                onSave({
                  overdue_after_hours: overdue,
                  at_risk_after_hours: atRisk,
                  auto_cancel_enabled: autoCancel,
                })
              }
            >
              Save policy
            </Button>
          </div>
        ) : (
          <p className="text-3xs text-muted-foreground">
            Only workspace admins can change this policy.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Formats a stored timestamp exactly as recorded — never the current time,
 *  never a generated/inferred value. Returns null for a missing timestamp so
 *  callers render an honest "not sent"/"no response recorded" state instead
 *  of a fabricated one. */
function formatTouchpointTimestamp(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function TouchpointRow({
  touchpoint,
  confirmation,
  scheduledFor,
  timezone,
  onMark,
  onUnmark,
  onRespond,
}: {
  touchpoint: Touchpoint;
  confirmation: CallConfirmationRow;
  scheduledFor: string;
  timezone: string;
  onMark: () => void;
  onUnmark: () => void;
  /** Marks/unmarks that the lead RESPONDED to an already-sent touchpoint —
   *  item 21/24: distinct from sent/not-sent, additive on top of it. */
  onRespond: (responded: boolean) => void;
}) {
  const status = deriveTouchpointStatus(touchpoint, confirmation, scheduledFor);
  const actionable = status === "due" || status === "not_due" || status === "not_sent";
  const { sentAt, respondedAt } = getTouchpointTimestamps(touchpoint, confirmation);
  const sentLabel = formatTouchpointTimestamp(sentAt, timezone);
  const respondedLabel = formatTouchpointTimestamp(respondedAt, timezone);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-2">
      <div>
        <div className="text-xs font-medium">{TOUCHPOINT_LABELS[touchpoint]}</div>
        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
          {status.replace("_", " ")}
        </div>
        {/* Actual stored timestamps (item 24) — never the current time and
            never inferred, so a touchpoint that was never sent/responded to
            shows an honest "Not sent" / "No response recorded" instead of a
            blank or fabricated value. Sent and responded are independent:
            a sent-but-unanswered touchpoint shows only the sent line. */}
        <div className="mt-1 space-y-0.5 text-3xs text-muted-foreground">
          <div>{sentLabel ? `Sent · ${sentLabel}` : "Not sent"}</div>
          {(status === "responded" || status === "manually_sent") && (
            <div>{respondedLabel ? `Responded · ${respondedLabel}` : "No response recorded"}</div>
          )}
        </div>
      </div>
      {status === "responded" || status === "manually_sent" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status === "responded" ? (
            <>
              <span className="text-3xs text-emerald-400">Responded</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-3xs text-muted-foreground hover:text-foreground"
                onClick={() => onRespond(false)}
              >
                Unmark responded
              </Button>
            </>
          ) : (
            <>
              <span className="text-3xs text-muted-foreground">Sent, no response</span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-1.5 text-3xs"
                onClick={() => onRespond(true)}
              >
                Mark responded
              </Button>
            </>
          )}
          {/* Corrects an accidental click on InsightOS's own state — never
              claims to undo a message a real integration actually
              delivered (Priority 6/49). Still available once responded —
              unmarking sent clears the response with it, since a response
              can't outlive the message it responded to. */}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-3xs text-muted-foreground hover:text-foreground"
            onClick={onUnmark}
          >
            Unmark as sent
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-3xs"
          disabled={!actionable}
          onClick={onMark}
        >
          Mark sent
        </Button>
      )}
    </div>
  );
}

function CallDetailDrawer({
  entry,
  timezone,
  policy,
  repNameById,
  onClose,
  onMarkTouchpoint,
  onUnmarkTouchpoint,
  onRespondTouchpoint,
  onSetStatus,
  onReschedule,
  onToggleShowed,
}: {
  entry: {
    call: CallRow;
    lead?: LeadRow;
    confirmation: CallConfirmationRow;
    overallStatus: OverallConfirmationStatus;
    quality: LeadQuality;
    nextAction: string;
    checklist: Array<{ label: string; done: boolean }>;
    source: string;
  };
  timezone: string;
  policy?: {
    overdue_after_hours: number;
    at_risk_after_hours: number;
    auto_cancel_enabled: boolean;
    auto_cancel_minutes_before: number;
  };
  repNameById: Record<string, string>;
  onClose: () => void;
  onMarkTouchpoint: (
    touchpoint: Touchpoint,
    extra?: {
      morning_reason_for_change?: string;
      morning_goal_1?: string;
      morning_goal_2?: string;
      morning_goal_3?: string;
      morning_response_notes?: string;
      thirty_min_confirmed?: boolean;
    },
  ) => void;
  onUnmarkTouchpoint: (touchpoint: Touchpoint) => void;
  onRespondTouchpoint: (touchpoint: Touchpoint, responded: boolean) => void;
  onSetStatus: (
    status: OverallConfirmationStatus,
    cancelledReason?: string,
    rescheduledReason?: string,
  ) => void;
  onReschedule: (isoDate: string, reason: string) => void;
  onToggleShowed: (showed: boolean) => void;
}) {
  const { call, lead, confirmation, overallStatus, quality, nextAction, checklist, source } = entry;
  const [reasonForChange, setReasonForChange] = useState(
    confirmation?.morning_reason_for_change ?? "",
  );
  const [goal1, setGoal1] = useState(confirmation?.morning_goal_1 ?? "");
  const [goal2, setGoal2] = useState(confirmation?.morning_goal_2 ?? "");
  const [goal3, setGoal3] = useState(confirmation?.morning_goal_3 ?? "");
  const [notes, setNotes] = useState(confirmation?.morning_response_notes ?? "");
  const [cancelReasonCategory, setCancelReasonCategory] = useState<string>(CANCEL_REASONS[0]);
  const [cancelReasonOther, setCancelReasonOther] = useState("");
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduleReasonCategory, setRescheduleReasonCategory] = useState<string>(
    RESCHEDULE_REASONS[0],
  );
  const [rescheduleReasonOther, setRescheduleReasonOther] = useState("");
  const [formResponsesOpen, setFormResponsesOpen] = useState(false);
  const finalCancelReason =
    cancelReasonCategory === "Other"
      ? `Other — ${cancelReasonOther || "no notes"}`
      : cancelReasonCategory;
  const finalRescheduleReason =
    rescheduleReasonCategory === "Other"
      ? `Other — ${rescheduleReasonOther || "no notes"}`
      : rescheduleReasonCategory;

  const dateLabel = call.scheduled_for
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(call.scheduled_for))
    : "Unscheduled";

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="pr-8 leading-snug">
            {displayName(lead?.full_name ?? lead?.handle) || "Unknown lead"}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* Contact — real lead fields only, never fabricated when missing */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Contact
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {lead?.phone || "Not available"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              {lead?.email || "Not available"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
              {lead?.handle || "Not available"}
            </div>
          </section>

          {/* Appointment */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Appointment
            </div>
            <div className="flex items-center gap-2 text-xs">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Lead: {displayName(lead?.full_name ?? lead?.handle) || "Unknown"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {dateLabel} ({timezone} —
              display only)
            </div>
            <div className="flex items-center gap-2 text-xs">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Setter/Dialer:{" "}
              {call.setter_id
                ? displayName(repNameById[call.setter_id]) || call.setter_id
                : "Unassigned"}{" "}
              · Closer:{" "}
              {call.closer_id
                ? displayName(repNameById[call.closer_id]) || call.closer_id
                : "Unassigned"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Video className="h-3.5 w-3.5 text-muted-foreground" />
              {call.meeting_link ? (
                <a
                  href={call.meeting_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  Open meeting link <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                "Meeting link not set"
              )}
            </div>
            <span
              className={`inline-block rounded-full border px-2 py-0.5 text-3xs ${STATUS_TONE[overallStatus]}`}
            >
              {STATUS_LABEL[overallStatus]}
            </span>
            {call.cancelled && confirmation?.cancelled_reason && (
              <p className="text-3xs text-muted-foreground">
                Cancellation reason: {confirmation.cancelled_reason}
              </p>
            )}
            {overallStatus === "rescheduled" && confirmation?.rescheduled_reason && (
              <p className="text-3xs text-muted-foreground">
                Reschedule reason: {confirmation.rescheduled_reason}
              </p>
            )}
          </section>

          {/* Lead intelligence */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Lead intelligence
            </div>
            <div className="text-xs">
              Quality: <span className="font-medium">{quality}</span>
            </div>
            <div className="text-xs">Acquisition source: {source}</div>
            <div className="text-xs">
              Qualification: {lead?.qualification_notes || "No notes logged"}
            </div>
            <div className="text-xs text-muted-foreground">Lead time zone: Unavailable</div>
            {lead && (
              <Link
                to="/leads"
                search={{ leadId: lead.id }}
                className="text-xs text-primary hover:underline"
              >
                Open lead →
              </Link>
            )}
          </section>

          {/* Lead Form Responses — opens the same application_data Q&A
              (application-fields.ts, shared with Legacy Leads' Application
              tab) in a centered modal without leaving Team Calendar, rather
              than an easy-to-miss inline collapsible. */}
          <button
            type="button"
            onClick={() => setFormResponsesOpen(true)}
            className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-left text-xs font-bold text-foreground transition hover:border-primary/50 hover:bg-muted/30"
          >
            Lead Form Responses
            <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-muted-foreground" />
          </button>
          <Dialog open={formResponsesOpen} onOpenChange={setFormResponsesOpen}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {displayName(lead?.full_name ?? lead?.handle) || "Lead"} — Application
                </DialogTitle>
              </DialogHeader>
              {applicationFormResponses(lead?.application_data).length ? (
                <ApplicationResponses applicationData={lead?.application_data} />
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Not connected — no application responses on file for this lead.
                </p>
              )}
            </DialogContent>
          </Dialog>

          {/* Confirmation sequence */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Confirmation sequence
              </div>
              <span className="rounded-full border border-border/50 bg-muted/10 px-2 py-0.5 text-3xs text-muted-foreground">
                Manual mode — no messaging integration connected
              </span>
            </div>
            {call.scheduled_for && (
              <div className="space-y-2">
                {TOUCHPOINT_SEQUENCE.map((tp) => (
                  <div key={tp}>
                    <TouchpointRow
                      touchpoint={tp}
                      confirmation={confirmation}
                      scheduledFor={call.scheduled_for!}
                      timezone={timezone}
                      onMark={() =>
                        onMarkTouchpoint(
                          tp,
                          tp === "thirty_min" ? { thirty_min_confirmed: true } : undefined,
                        )
                      }
                      onUnmark={() => onUnmarkTouchpoint(tp)}
                      onRespond={(responded) => onRespondTouchpoint(tp, responded)}
                    />
                    {tp === "morning" && (
                      <div className="mt-1.5 space-y-1.5 rounded-lg border border-border/40 bg-background/30 p-2">
                        <Input
                          placeholder="Reason for change"
                          value={reasonForChange}
                          onChange={(e) => setReasonForChange(e.target.value)}
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="Goal 1"
                          value={goal1}
                          onChange={(e) => setGoal1(e.target.value)}
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="Goal 2"
                          value={goal2}
                          onChange={(e) => setGoal2(e.target.value)}
                          className="h-7 text-xs"
                        />
                        <Input
                          placeholder="Goal 3"
                          value={goal3}
                          onChange={(e) => setGoal3(e.target.value)}
                          className="h-7 text-xs"
                        />
                        <Textarea
                          placeholder="Optional notes"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          className="text-xs"
                          rows={2}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-full text-3xs"
                          onClick={() =>
                            onMarkTouchpoint("morning", {
                              morning_reason_for_change: reasonForChange,
                              morning_goal_1: goal1,
                              morning_goal_2: goal2,
                              morning_goal_3: goal3,
                              morning_response_notes: notes,
                            })
                          }
                        >
                          Save morning response
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {policy && (
              <p className="text-3xs text-muted-foreground">
                Policy: overdue after {policy.overdue_after_hours}h, at-risk after{" "}
                {policy.at_risk_after_hours}h
                {policy.auto_cancel_enabled
                  ? " — automatic cancellation is ACTIVE for this org."
                  : "."}
              </p>
            )}
          </section>

          {/* Pre-call prep */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Pre-call prep
            </div>
            <ul className="space-y-1">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-xs">
                  <span className={c.done ? "text-emerald-400" : "text-muted-foreground"}>
                    {c.done ? "✓" : "○"}
                  </span>
                  {c.label}
                </li>
              ))}
            </ul>
            <div className="text-xs font-medium">Next action: {nextAction}</div>
          </section>

          {/* Actions */}
          <section className="space-y-2">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Actions
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() =>
                  onSetStatus(overallStatus === "confirmed" ? "awaiting" : "confirmed")
                }
              >
                {overallStatus === "confirmed" ? "Mark unconfirmed" : "Confirm"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onToggleShowed(true)}
              >
                Mark showed
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => onToggleShowed(false)}
              >
                Mark no-show
              </Button>
            </div>
            {/* Reschedule — a structured reason is required alongside the
                new time (Priority 6/48), same "Other" + notes pattern as
                cancellation below. */}
            <div className="space-y-1.5 rounded-lg border border-border/40 bg-background/30 p-2">
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  value={rescheduleValue}
                  onChange={(e) => setRescheduleValue(e.target.value)}
                  className="h-7 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-xs"
                  disabled={!rescheduleValue}
                  onClick={() => {
                    onReschedule(new Date(rescheduleValue).toISOString(), finalRescheduleReason);
                    setRescheduleValue("");
                  }}
                >
                  Reschedule
                </Button>
              </div>
              <Select value={rescheduleReasonCategory} onValueChange={setRescheduleReasonCategory}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Reason for rescheduling" />
                </SelectTrigger>
                <SelectContent>
                  {RESCHEDULE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rescheduleReasonCategory === "Other" && (
                <Input
                  placeholder="Notes"
                  value={rescheduleReasonOther}
                  onChange={(e) => setRescheduleReasonOther(e.target.value)}
                  className="h-7 text-xs"
                />
              )}
            </div>
            {/* Cancellation — same structured reason pattern. */}
            <div className="space-y-1.5 rounded-lg border border-border/40 bg-background/30 p-2">
              <Select value={cancelReasonCategory} onValueChange={setCancelReasonCategory}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Reason for cancelling" />
                </SelectTrigger>
                <SelectContent>
                  {CANCEL_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cancelReasonCategory === "Other" && (
                <Input
                  placeholder="Notes"
                  value={cancelReasonOther}
                  onChange={(e) => setCancelReasonOther(e.target.value)}
                  className="h-7 text-xs"
                />
              )}
              <Button
                size="sm"
                variant="destructive"
                className="h-7 w-full text-xs"
                onClick={() => onSetStatus("cancelled", finalCancelReason)}
              >
                <X className="mr-1 h-3 w-3" /> Cancel
              </Button>
            </div>
            <Link
              to="/attribution"
              search={{
                setterId: call.setter_id ?? undefined,
                closerId: call.closer_id ?? undefined,
                source: source !== "Unknown / Unattributed" ? source : undefined,
              }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Phone className="h-3 w-3" /> View Full Attribution →
            </Link>
          </section>

          {/* Calendly (Priority 6/47) — event-specific links only; never a
              hardcoded/shared URL. Honest "not connected" when the call has
              none on file. */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Need to make changes to this event?
            </div>
            {call.calendly_cancel_url || call.calendly_reschedule_url ? (
              <div className="flex flex-wrap gap-2">
                {call.calendly_cancel_url && (
                  <a
                    href={call.calendly_cancel_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-foreground hover:bg-muted/30"
                  >
                    Cancel via Calendly <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {call.calendly_reschedule_url && (
                  <a
                    href={call.calendly_reschedule_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-foreground hover:bg-muted/30"
                  >
                    Reschedule via Calendly <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ) : (
              <p className="text-xs italic text-muted-foreground">
                Calendly links not connected for this appointment.
              </p>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
