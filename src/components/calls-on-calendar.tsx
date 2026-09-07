import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDisplayTimezone, DISPLAY_TIMEZONES } from "@/hooks/use-display-timezone";
import { deriveLeadQuality, LEAD_QUALITY_TONE, type LeadQuality } from "@/lib/lead-quality";
import {
  TOUCHPOINT_LABELS,
  deriveTouchpointStatus,
  deriveNextAction,
  buildPreCallChecklist,
  type Touchpoint,
  type CallConfirmationRow,
  type OverallConfirmationStatus,
} from "@/lib/call-confirmations";
import {
  getConfirmationsForCallsFn,
  markTouchpointFn,
  setConfirmationStatusFn,
  setConfirmationPolicyFn,
} from "@/lib/call-confirmations.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { CalendarClock, Clock, ExternalLink, Phone, Settings, User, Video, X } from "lucide-react";

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
  qualification_notes: string | null;
  precall_video_watched: boolean | null;
};

const DEFAULT_DURATION_MIN = 30;

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

const GRID_START_MIN = 6 * 60; // 6:00am
const GRID_END_MIN = 22 * 60; // 10:00pm
const PX_PER_MIN = 1.1;

const STATUS_TONE: Record<OverallConfirmationStatus, string> = {
  confirmed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
  awaiting: "border-border/60 bg-muted/20 text-muted-foreground",
  overdue: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  at_risk: "border-red-500/50 bg-red-500/10 text-red-300",
  cancelled: "border-border/40 bg-muted/10 text-muted-foreground/60",
  rescheduled: "border-blue-500/50 bg-blue-500/10 text-blue-300",
};

const STATUS_LABEL: Record<OverallConfirmationStatus, string> = {
  confirmed: "Confirmed",
  awaiting: "Awaiting confirmation",
  overdue: "Confirmation overdue",
  at_risk: "At risk",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export function CallsOnCalendar() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { isAdmin } = useRole();
  const { timezone, setTimezone } = useDisplayTimezone();
  const queryClient = useQueryClient();

  const getConfirmations = useServerFn(getConfirmationsForCallsFn);
  const markTouchpoint = useServerFn(markTouchpointFn);
  const setConfirmationStatus = useServerFn(setConfirmationStatusFn);
  const setConfirmationPolicy = useServerFn(setConfirmationPolicyFn);

  const [view, setView] = useState<"day" | "week">("day");
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [repFilter, setRepFilter] = useState<string>("all");
  const [closerFilter, setCloserFilter] = useState<string>("all");
  const [qualityFilter, setQualityFilter] = useState<string>("all");
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
    const d = view === "day" ? anchorDate : addDays(anchorDate, -anchorDate.getDay());
    const s = new Date(d);
    s.setHours(0, 0, 0, 0);
    return addDays(s, -1); // pad a day either side for timezone-boundary safety
  }, [anchorDate, view]);
  const rangeEnd = useMemo(() => addDays(rangeStart, view === "day" ? 3 : 9), [rangeStart, view]);

  const { data, isLoading } = useQuery({
    queryKey: ["calls-on-calendar", orgId, rangeStart.toISOString(), rangeEnd.toISOString()],
    enabled: !!orgId,
    queryFn: async () => {
      // `meeting_link` is a real column (added by this same feature's
      // migration) but isn't in the generated Supabase types yet — same
      // `as any` convention used elsewhere in this repo for columns/tables
      // ahead of a fresh `supabase gen types` run (see call-confirmations.server.ts).
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const { data: calls } = await (supabase.from("calls") as any)
        .select(
          "id, lead_id, setter_id, closer_id, scheduled_for, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents, duration_seconds, cancelled, meeting_link, recording_url",
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
                "id, full_name, handle, email, phone, status, intent_score, priority, source_platform, qualification_notes, precall_video_watched",
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
      return {
        call,
        lead,
        confirmation,
        overallStatus,
        quality,
        nextAction,
        checklist,
        checklistDone,
      };
    });
  }, [data, now]);

  const filtered = useMemo(() => {
    return enriched.filter((e) => {
      if (statusFilter !== "all" && e.overallStatus !== statusFilter) return false;
      if (repFilter !== "all" && e.call.setter_id !== repFilter) return false;
      if (closerFilter !== "all" && e.call.closer_id !== closerFilter) return false;
      if (qualityFilter !== "all" && e.quality !== qualityFilter) return false;
      return true;
    });
  }, [enriched, statusFilter, repFilter, closerFilter, qualityFilter]);

  const visibleDayKeys = useMemo(() => {
    const anchorKey = dayKey(anchorDate, timezone);
    if (view === "day") return [anchorKey];
    const weekStart = addDays(anchorDate, -anchorDate.getDay());
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i), timezone));
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

  const todayKey = dayKey(now, timezone);
  const todaysCalls = data
    ? enriched.filter(
        (e) =>
          e.call.scheduled_for && dayKey(new Date(e.call.scheduled_for), timezone) === todayKey,
      )
    : [];
  const summary = {
    total: todaysCalls.length,
    confirmed: todaysCalls.filter((e) => e.overallStatus === "confirmed").length,
    awaiting: todaysCalls.filter((e) => e.overallStatus === "awaiting").length,
    overdue: todaysCalls.filter((e) => e.overallStatus === "overdue").length,
    atRisk: todaysCalls.filter((e) => e.overallStatus === "at_risk").length,
    ready: todaysCalls.filter(
      (e) => e.checklistDone === e.checklist.length && e.overallStatus !== "cancelled",
    ).length,
    videoNotWatched: todaysCalls.filter(
      (e) => e.lead && !e.lead.precall_video_watched && e.overallStatus !== "cancelled",
    ).length,
    openSlots: todaysCalls.filter((e) => e.overallStatus === "cancelled").length,
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

  const summaryTiles: Array<{ key: string; label: string; value: number; filter?: string }> = [
    { key: "total", label: "Calls Today", value: summary.total },
    { key: "confirmed", label: "Confirmed", value: summary.confirmed, filter: "confirmed" },
    {
      key: "awaiting",
      label: "Awaiting Confirmation",
      value: summary.awaiting,
      filter: "awaiting",
    },
    { key: "overdue", label: "Confirmation Overdue", value: summary.overdue, filter: "overdue" },
    { key: "at_risk", label: "At Risk", value: summary.atRisk, filter: "at_risk" },
    { key: "ready", label: "Pre-Call Ready", value: summary.ready },
    { key: "video", label: "Video Not Watched", value: summary.videoNotWatched },
    { key: "open", label: "Open Slots", value: summary.openSlots, filter: "cancelled" },
  ];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-xs text-muted-foreground shadow-sm">
        Loading Calls on Calendar…
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Calls on Calendar
          </div>
          <div className="mt-0.5 text-base font-semibold">Today's booked sales calls</div>
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
            <button
              onClick={() => setView("day")}
              className={`px-2.5 py-1 text-xs ${view === "day" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              Day
            </button>
            <button
              onClick={() => setView("week")}
              className={`px-2.5 py-1 text-xs ${view === "week" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            >
              Week
            </button>
          </div>
          <ConfirmationPolicyPopover
            isAdmin={isAdmin}
            policy={data?.policy}
            onSave={async (patch) => {
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

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {summaryTiles.map((t) => (
          <button
            key={t.key}
            onClick={() =>
              t.filter && setStatusFilter(statusFilter === t.filter ? "all" : t.filter)
            }
            className={`rounded-lg border p-2 text-left transition ${
              t.filter && statusFilter === t.filter
                ? "border-primary bg-primary/10"
                : "border-border/60 bg-background/40 hover:border-border"
            }`}
          >
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">{t.label}</div>
            <div className="mt-0.5 font-mono text-lg font-semibold">{t.value}</div>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
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
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setAnchorDate((d) => addDays(d, view === "day" ? -1 : -7))}
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
            onClick={() => setAnchorDate((d) => addDays(d, view === "day" ? 1 : 7))}
          >
            →
          </Button>
        </div>
      </div>

      {/* Timeline / agenda */}
      {isMobile ? (
        <AgendaList
          entries={filtered.filter((e) =>
            visibleDayKeys.includes(dayKey(new Date(e.call.scheduled_for ?? now), timezone)),
          )}
          timezone={timezone}
          onSelect={setSelectedCallId}
        />
      ) : (
        <TimelineGrid
          dayKeys={visibleDayKeys}
          byDay={byDay}
          timezone={timezone}
          now={now}
          onSelect={setSelectedCallId}
        />
      )}

      {selected && (
        <CallDetailDrawer
          entry={selected}
          timezone={timezone}
          policy={data?.policy}
          repNameById={data?.repNameById ?? {}}
          onClose={() => setSelectedCallId(null)}
          onMarkTouchpoint={async (touchpoint, extra) => {
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
          onSetStatus={async (status, cancelledReason) => {
            try {
              await setConfirmationStatus({
                data: {
                  call_id: selected.call.id,
                  org_id: orgId!,
                  status,
                  cancelled_reason: cancelledReason,
                },
              });
              invalidate();
              toast.success("Status updated");
            } catch {
              toast.error("Could not update status");
            }
          }}
          onReschedule={async (isoDate) => {
            const { error } = await supabase
              .from("calls")
              .update({ scheduled_for: isoDate })
              .eq("id", selected.call.id);
            if (error) toast.error("Could not reschedule");
            else {
              toast.success("Call rescheduled");
              invalidate();
            }
          }}
          onToggleShowed={async (showed) => {
            const { error } = await supabase
              .from("calls")
              .update({ showed })
              .eq("id", selected.call.id);
            if (error) toast.error("Could not update");
            else invalidate();
          }}
        />
      )}
    </div>
  );
}

function TimelineGrid({
  dayKeys,
  byDay,
  timezone,
  now,
  onSelect,
}: {
  dayKeys: string[];
  byDay: Map<string, ReturnType<typeof Array.prototype.slice>>;
  timezone: string;
  now: Date;
  onSelect: (id: string) => void;
}) {
  const hours = Array.from(
    { length: (GRID_END_MIN - GRID_START_MIN) / 60 + 1 },
    (_, i) => GRID_START_MIN / 60 + i,
  );
  const gridHeight = (GRID_END_MIN - GRID_START_MIN) * PX_PER_MIN;
  const nowMinutes = minutesIntoDay(now, timezone);
  const nowTop = (nowMinutes - GRID_START_MIN) * PX_PER_MIN;
  const todayKey = dayKey(now, timezone);

  return (
    <div
      className="overflow-auto rounded-xl border border-border/60"
      style={{ maxHeight: "560px" }}
    >
      <div className="flex">
        <div className="w-14 shrink-0 border-r border-border/60 bg-background/40">
          <div className="h-8 border-b border-border/60" />
          {hours.map((h) => (
            <div
              key={h}
              style={{ height: 60 * PX_PER_MIN }}
              className="border-b border-border/30 pr-1 text-right text-3xs text-muted-foreground"
            >
              {h % 24 === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`}
            </div>
          ))}
        </div>
        {dayKeys.map((key) => {
          const entries = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className="relative flex-1 border-r border-border/40 last:border-r-0"
              style={{ minWidth: dayKeys.length > 1 ? 140 : undefined }}
            >
              <div className="h-8 border-b border-border/60 bg-background/40 px-2 py-1 text-center text-3xs font-medium">
                {key === todayKey ? "Today" : key}
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    style={{ height: 60 * PX_PER_MIN }}
                    className="border-b border-border/20"
                  />
                ))}
                {key === todayKey && nowTop >= 0 && nowTop <= gridHeight && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-500"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -top-1.5 left-0 h-3 w-3 rounded-full bg-red-500" />
                  </div>
                )}
                {entries.map((e) => {
                  if (!e.call.scheduled_for) return null;
                  const start = new Date(e.call.scheduled_for);
                  const startMin = minutesIntoDay(start, timezone);
                  const durationMin = e.call.duration_seconds
                    ? e.call.duration_seconds / 60
                    : DEFAULT_DURATION_MIN;
                  const top = Math.max(0, (startMin - GRID_START_MIN) * PX_PER_MIN);
                  const height = Math.max(20, durationMin * PX_PER_MIN);
                  return (
                    <CallBlock
                      key={e.call.id}
                      entry={e}
                      timezone={timezone}
                      style={{ position: "absolute", top, left: 4, right: 4, height }}
                      onSelect={onSelect}
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

function CallBlock({
  entry,
  timezone,
  style,
  onSelect,
}: {
  entry: {
    call: CallRow;
    lead?: LeadRow;
    overallStatus: OverallConfirmationStatus;
    quality: LeadQuality;
    nextAction: string;
    checklist: Array<{ label: string; done: boolean }>;
    checklistDone: number;
  };
  timezone: string;
  style: React.CSSProperties;
  onSelect: (id: string) => void;
}) {
  const { call, lead, overallStatus, quality, nextAction, checklist, checklistDone } = entry;
  const isCancelled = overallStatus === "cancelled";
  const timeLabel = call.scheduled_for
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(call.scheduled_for))
    : "";

  if (isCancelled) {
    return (
      <button
        onClick={() => onSelect(call.id)}
        style={style}
        className="overflow-hidden rounded-md border border-dashed border-border/50 bg-muted/10 p-1.5 text-left text-3xs text-muted-foreground/70"
      >
        <div className="font-medium">Available</div>
        <div>{timeLabel}</div>
      </button>
    );
  }

  const tone = LEAD_QUALITY_TONE[quality];
  const toneClass =
    overallStatus === "at_risk" || overallStatus === "overdue"
      ? "border-red-500/50 bg-red-500/10"
      : overallStatus === "confirmed" && checklistDone === checklist.length
        ? "border-emerald-500/50 bg-emerald-500/10"
        : overallStatus === "confirmed"
          ? "border-amber-500/50 bg-amber-500/10"
          : tone === "hot"
            ? "border-orange-500/40 bg-orange-500/5"
            : "border-border/60 bg-background/60";

  return (
    <button
      onClick={() => onSelect(call.id)}
      style={style}
      className={`overflow-hidden rounded-md border p-1.5 text-left text-3xs shadow-sm ${toneClass}`}
    >
      <div className="flex items-center gap-1 font-semibold">
        <span>{statusIcon(overallStatus)}</span>
        <span className="truncate">{lead?.full_name ?? lead?.handle ?? "Unknown lead"}</span>
      </div>
      <div className="text-muted-foreground">{timeLabel}</div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-muted-foreground">
        <span>{quality}</span>
        <span>
          · {checklistDone}/{checklist.length}
        </span>
      </div>
      <div className="mt-0.5 truncate font-medium">{nextAction}</div>
    </button>
  );
}

function AgendaList({
  entries,
  timezone,
  onSelect,
}: {
  entries: Array<{
    call: CallRow;
    lead?: LeadRow;
    overallStatus: OverallConfirmationStatus;
    quality: LeadQuality;
    nextAction: string;
    checklist: Array<{ label: string; done: boolean }>;
    checklistDone: number;
  }>;
  timezone: string;
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
          style={{ position: "relative", height: "auto" }}
          onSelect={onSelect}
        />
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

function TouchpointRow({
  touchpoint,
  confirmation,
  scheduledFor,
  onMark,
}: {
  touchpoint: Touchpoint;
  confirmation: CallConfirmationRow;
  scheduledFor: string;
  onMark: () => void;
}) {
  const status = deriveTouchpointStatus(touchpoint, confirmation, scheduledFor);
  const actionable = status === "due" || status === "not_due" || status === "not_sent";
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 p-2">
      <div>
        <div className="text-xs font-medium">{TOUCHPOINT_LABELS[touchpoint]}</div>
        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
          {status.replace("_", " ")}
        </div>
      </div>
      {status === "responded" || status === "manually_sent" ? (
        <span className="text-3xs text-emerald-400">Done</span>
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
  onSetStatus: (status: OverallConfirmationStatus, cancelledReason?: string) => void;
  onReschedule: (isoDate: string) => void;
  onToggleShowed: (showed: boolean) => void;
}) {
  const { call, lead, confirmation, overallStatus, quality, nextAction, checklist } = entry;
  const [reasonForChange, setReasonForChange] = useState(
    confirmation?.morning_reason_for_change ?? "",
  );
  const [goal1, setGoal1] = useState(confirmation?.morning_goal_1 ?? "");
  const [goal2, setGoal2] = useState(confirmation?.morning_goal_2 ?? "");
  const [goal3, setGoal3] = useState(confirmation?.morning_goal_3 ?? "");
  const [notes, setNotes] = useState(confirmation?.morning_response_notes ?? "");
  const [cancelReason, setCancelReason] = useState("Cancelled by rep");
  const [rescheduleValue, setRescheduleValue] = useState("");

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
            {lead?.full_name ?? lead?.handle ?? "Unknown lead"}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-sm">
          {/* Appointment */}
          <section className="space-y-1.5">
            <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Appointment
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {dateLabel} ({timezone} —
              display only)
            </div>
            <div className="flex items-center gap-2 text-xs">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Rep: {call.setter_id
                ? (repNameById[call.setter_id] ?? call.setter_id)
                : "Unassigned"}{" "}
              · Closer:{" "}
              {call.closer_id ? (repNameById[call.closer_id] ?? call.closer_id) : "Unassigned"}
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
                Reason: {confirmation.cancelled_reason}
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
            <div className="text-xs">Source: {lead?.source_platform ?? "Unknown"}</div>
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
                {(
                  ["night_before", "morning", "one_hour", "thirty_min", "ten_min"] as Touchpoint[]
                ).map((tp) => (
                  <div key={tp}>
                    <TouchpointRow
                      touchpoint={tp}
                      confirmation={confirmation}
                      scheduledFor={call.scheduled_for!}
                      onMark={() =>
                        onMarkTouchpoint(
                          tp,
                          tp === "thirty_min" ? { thirty_min_confirmed: true } : undefined,
                        )
                      }
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
                onClick={() => onReschedule(new Date(rescheduleValue).toISOString())}
              >
                Reschedule
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Cancellation reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="destructive"
                className="h-7 shrink-0 text-xs"
                onClick={() => onSetStatus("cancelled", cancelReason)}
              >
                <X className="mr-1 h-3 w-3" /> Cancel
              </Button>
            </div>
            <Link
              to="/attribution"
              search={{
                setterId: call.setter_id ?? undefined,
                closerId: call.closer_id ?? undefined,
              }}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Phone className="h-3 w-3" /> View Full Attribution →
            </Link>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
