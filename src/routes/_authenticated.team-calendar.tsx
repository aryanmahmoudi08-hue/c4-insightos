import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CalendarDays,
  Plus,
  Trash2,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { checkCalendarStatusFn } from "@/lib/team-calendar-status.functions";
import { mockCalendarStatus, withMockDelay } from "@/lib/dev-mock-data";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { avatarColorFor } from "@/lib/avatar-color";
import { TeamMemberPicker, type TeamRole } from "@/components/team-member-picker";

export const Route = createFileRoute("/_authenticated/team-calendar")({
  component: TeamCalendarPage,
  head: () => ({
    meta: [
      { title: "Team Calendars — C4 InsightOS" },
      {
        name: "description",
        content: "Every closer and setter calendar in one view, with day the whole team can see.",
      },
      { property: "og:title", content: "Team Calendars — C4 InsightOS" },
      {
        property: "og:description",
        content: "Closer and setter Google Calendars visible to the whole team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Cal = {
  id: string;
  member_name: string;
  role: string;
  calendar_id: string | null;
  ical_url: string | null;
  embed_url: string | null;
  timezone: string | null;
  active: boolean;
};

const ROLES = ["closer", "dm_setter", "dialer", "manager", "other"];
const ROLE_GROUPS: { key: string; label: string; roles: string[] }[] = [
  { key: "closer", label: "All Closers", roles: ["closer"] },
  { key: "dm_setter", label: "All Setters", roles: ["dm_setter"] },
  { key: "ops", label: "All Ops", roles: ["dialer", "manager", "other"] },
];
// Confirmed real gap (Sales Tracking Part 4): the calendar/work-block "Rep
// name" fields were plain free-text — a typo creates an orphaned calendar
// disconnected from the real `team_members` roster. TeamMemberPicker (used
// everywhere else for roster selection) only knows the 3 real team_members
// roles, so "manager"/"other" (no backing roster) honestly stay free-text.
const TEAM_MEMBER_ROLE_MAP: Partial<Record<string, TeamRole>> = {
  closer: "closer",
  dm_setter: "dm_setter",
  dialer: "inbound_dialer",
};
function TeamCalendarPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<"WEEK" | "MONTH" | "AGENDA">("WEEK");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  // Empty set = "all reps" (matches everything) — direct click-to-select on the
  // Connected Reps list below, multi-select supported. Part D.
  const [selectedReps, setSelectedReps] = useState<Set<string>>(new Set());
  const toggleRep = (name: string) =>
    setSelectedReps((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  // Lifted so both the toolbar's "Connect calendar" button and the empty-state
  // CTA below can open the same dialog instance.
  const [calDialogOpen, setCalDialogOpen] = useState(false);

  // Dev bypass never got a real Supabase session, so writes to team_calendars
  // get rejected by RLS (401) — the same gap the backfill fixed on
  // team.tsx/daily-wins-panel.tsx. Keep edits in local state
  // instead, mirroring permissions.tsx's established pattern for this exact
  // situation (reads succeed empty under devBypass RLS, only writes fail).
  const [mockCals, setMockCals] = useState<Cal[]>([]);

  const { data: calsQuery } = useQuery({
    queryKey: ["team-calendars", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_calendars")
        .select("id, member_name, role, calendar_id, ical_url, embed_url, timezone, active")
        .eq("org_id", orgId!)
        .order("member_name");
      if (error) throw error;
      return (data ?? []) as Cal[];
    },
  });
  const cals = devBypass ? mockCals : calsQuery;

  const matchesFilter = (name: string) => selectedReps.size === 0 || selectedReps.has(name);

  const allActiveCals = (cals ?? []).filter((c) => c.active);
  const activeCals = allActiveCals.filter((c) => matchesFilter(c.member_name));
  const visibleCals = (cals ?? []).filter((c) => matchesFilter(c.member_name));
  const combinedEmbed = useMemo(() => {
    const ids = activeCals.map((c) => c.calendar_id).filter(Boolean) as string[];
    if (!ids.length) return null;
    const params = ids.map((id) => `src=${encodeURIComponent(id)}`).join("&");
    return `https://calendar.google.com/calendar/embed?${params}&mode=${view}&showTitle=0&showPrint=0&showTabs=1&showCalendars=1`;
  }, [activeCals, view]);

  const checkStatus = useServerFn(checkCalendarStatusFn);
  const {
    data: statuses,
    dataUpdatedAt: statusUpdatedAt,
    refetch: refetchStatus,
    isFetching: statusFetching,
  } = useQuery({
    queryKey: ["team-calendar-status", allActiveCals.map((c) => c.id).join(","), devBypass],
    enabled: allActiveCals.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.all(
        allActiveCals.map(async (c) => {
          const r = devBypass
            ? await withMockDelay(mockCalendarStatus(), 300)
            : await checkStatus({ data: { calendar_id: c.calendar_id, ical_url: c.ical_url } });
          return [c.id, r] as const;
        }),
      );
      return Object.fromEntries(results) as Record<string, { ok: boolean; error: string | null }>;
    },
  });
  const failedCals = allActiveCals.filter((c) => statuses?.[c.id] && !statuses[c.id].ok);

  // Show-rate micro-stat (Sales Tracking Part 4) — real, org-wide, fixed 30-day
  // window (this page has no date-range picker of its own). `calls` only has
  // `closer_name` as a text column (no `setter_name` — confirmed via schema,
  // not fabricated), so this covers closer rows; a rep with no closer-side
  // calls in range just shows no badge rather than a fabricated 0%.
  const { data: showRateByRep } = useQuery({
    queryKey: ["team-calendar-showrate", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const since = new Date(Date.now() - 29 * 86400e3).toISOString();
      const { data, error } = await supabase
        .from("calls")
        .select("closer_name, showed")
        .eq("org_id", orgId!)
        .gte("created_at", since);
      if (error) throw error;
      const byRep = new Map<string, { booked: number; showed: number }>();
      for (const c of data ?? []) {
        if (!c.closer_name) continue;
        const r = byRep.get(c.closer_name) ?? { booked: 0, showed: 0 };
        r.booked += 1;
        if (c.showed) r.showed += 1;
        byRep.set(c.closer_name, r);
      }
      return Object.fromEntries(byRep) as Record<string, { booked: number; showed: number }>;
    },
  });

  const saveCal = useMutation({
    mutationFn: async (row: Partial<Cal> & { member_name: string }) => {
      const memberName = row.member_name.trim();
      const payload: Cal = {
        id:
          (devBypass && mockCals.find((c) => c.member_name === memberName)?.id) ||
          crypto.randomUUID(),
        member_name: memberName,
        role: row.role ?? "closer",
        calendar_id: row.calendar_id || null,
        ical_url: row.ical_url || null,
        embed_url: row.embed_url || null,
        timezone: row.timezone || null,
        active: true,
      };
      if (devBypass) {
        setMockCals((prev) => {
          const idx = prev.findIndex((c) => c.member_name === memberName);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = payload;
            return next;
          }
          return [...prev, payload];
        });
        return;
      }
      const { error } = await (
        supabase.from("team_calendars") as never as {
          upsert: (p: unknown, o: unknown) => Promise<{ error: { message: string } | null }>;
        }
      ).upsert(
        {
          org_id: orgId!,
          member_name: payload.member_name,
          role: payload.role,
          calendar_id: payload.calendar_id,
          ical_url: payload.ical_url,
          embed_url: payload.embed_url,
          timezone: payload.timezone,
          active: payload.active,
        },
        { onConflict: "org_id,member_name" },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (!devBypass) qc.invalidateQueries({ queryKey: ["team-calendars", orgId] });
      toast.success("Calendar connected.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCal = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) {
        setMockCals((prev) => prev.filter((c) => c.id !== id));
        return;
      }
      const { error } = await supabase.from("team_calendars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (!devBypass) qc.invalidateQueries({ queryKey: ["team-calendars", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <TopBar
        title="Team Calendars"
        subtitle="Closer + setter availability — one view for the whole team. Work blocks live in Google Calendar."
      />
      <div className="p-4 md:p-6 space-y-5">
        {/* Combined Google Calendar */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <CalendarDays className="h-3.5 w-3.5" /> Live team calendar · {activeCals.length}{" "}
              connected
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Quick-select by role group (bulk), "All reps" is the explicit
                  back-to-all reset — direct per-rep selection happens by
                  clicking a row in Connected Reps below (Part D). */}
              <button
                onClick={() => setSelectedReps(new Set())}
                className={cn(
                  "rounded border px-2 py-1 text-2xs",
                  selectedReps.size === 0
                    ? "border-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:bg-muted/40",
                )}
              >
                All reps
              </button>
              {ROLE_GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() =>
                    setSelectedReps(
                      new Set(
                        (cals ?? [])
                          .filter((c) => g.roles.includes(c.role))
                          .map((c) => c.member_name),
                      ),
                    )
                  }
                  className="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/40"
                >
                  {g.label}
                </button>
              ))}
              <span className="h-4 w-px bg-border" />
              {/* Select Rep Calendar — a fast single-jump alternative to
                  clicking a row in Connected Reps below; additive, doesn't
                  replace the existing multi-select click UI. */}
              <Select value="" onValueChange={(v) => v && setSelectedReps(new Set([v]))}>
                <SelectTrigger className="h-7 w-40 text-2xs">
                  <SelectValue placeholder="Select rep calendar…" />
                </SelectTrigger>
                <SelectContent>
                  {(cals ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.member_name}>
                      {c.member_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="h-4 w-px bg-border" />
              {(["WEEK", "MONTH", "AGENDA"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "rounded border px-2 py-1 text-2xs",
                    view === v
                      ? "border-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {v[0] + v.slice(1).toLowerCase()}
                </button>
              ))}
              <CalendarDialog
                open={calDialogOpen}
                onOpenChange={setCalDialogOpen}
                onSave={(r) => saveCal.mutate(r)}
              />
            </div>
          </div>
          {allActiveCals.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/10 px-4 py-1.5 text-3xs text-muted-foreground">
              <span>
                {statusUpdatedAt ? `Last synced ${timeAgo(statusUpdatedAt)}` : "Not synced yet"}
              </span>
              <button
                onClick={() => refetchStatus()}
                disabled={statusFetching}
                className="flex items-center gap-1 hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3 w-3", statusFetching && "animate-spin")} /> Refresh
              </button>
            </div>
          )}
          {selectedReps.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-2">
              <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                Showing
              </span>
              {[...selectedReps].map((name) => (
                <button
                  key={name}
                  onClick={() => toggleRep(name)}
                  className="flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2 text-2xs hover:opacity-80"
                  style={{ borderColor: avatarColorFor(name), color: avatarColorFor(name) }}
                >
                  <AvatarInitials name={name} size="xs" />
                  {name} ×
                </button>
              ))}
            </div>
          )}
          {failedCals.length > 0 && (
            <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2.5 text-2xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-semibold">
                  {failedCals.length} calendar{failedCals.length === 1 ? "" : "s"} not reachable —
                  won't render below even though marked connected:
                </div>
                <ul className="space-y-0.5">
                  {failedCals.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">{c.member_name}</span> —{" "}
                      {statuses?.[c.id]?.error ?? "Unknown error."}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {combinedEmbed ? (
            <iframe
              title="Team calendar"
              src={combinedEmbed}
              className="h-[620px] w-full border-0"
              loading="lazy"
            />
          ) : (
            <div className="space-y-3 p-10 text-center text-xs text-muted-foreground">
              {allActiveCals.length === 0 ? (
                <>
                  <p>
                    No Google Calendar IDs connected yet. Add a rep's calendar ID (Google Calendar →
                    Settings → Integrate calendar → Calendar ID) and make sure the calendar is
                    shared publicly or with the team.
                  </p>
                  <Button size="sm" onClick={() => setCalDialogOpen(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Connect a rep's calendar
                  </Button>
                </>
              ) : (
                <>
                  <p>No calendars match this filter.</p>
                  <Button size="sm" variant="outline" onClick={() => setSelectedReps(new Set())}>
                    Show all reps
                  </Button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Connected calendars — Part D: click a rep to load their calendar
            (multi-select). This list always shows every rep, unfiltered by
            the current selection — it's the control surface for that
            selection, so a row can't disappear the moment you deselect it. */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">
            Connected reps
            <span className="ml-1.5 font-normal normal-case text-muted-foreground">
              · click to load a rep's calendar, click again to remove
            </span>
          </div>
          <div className="divide-y divide-border">
            {(cals ?? []).map((c) => {
              const status = statuses?.[c.id];
              const selected = selectedReps.has(c.member_name);
              const color = avatarColorFor(c.member_name);
              return (
                // A <div role="button">, not a real <button> — the trailing
                // action icons are real interactive elements (a real <a>, a
                // real delete <button>), and a <button> can't validly contain
                // either per the HTML spec. Nesting them would parse
                // differently than the intent, risking exactly the kind of
                // server/client divergence this session spent a while
                // chasing down elsewhere.
                <div
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRep(c.member_name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleRep(c.member_name);
                    }
                  }}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer",
                    selected ? "bg-[color:var(--color-accent)]/[0.06]" : "hover:bg-muted/20",
                  )}
                  style={selected ? { boxShadow: `inset 2px 0 0 0 ${color}` } : undefined}
                >
                  <AvatarInitials name={c.member_name} size="sm" />
                  <span className="font-medium">{c.member_name}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-3xs uppercase tracking-wider text-muted-foreground">
                    {c.role.replace("_", " ")}
                  </span>
                  <span className="truncate font-mono text-2xs text-muted-foreground">
                    {c.calendar_id ?? c.ical_url ?? "—"}
                  </span>
                  {c.active &&
                    (c.calendar_id || c.ical_url) &&
                    (status === undefined ? (
                      <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
                      </span>
                    ) : status.ok ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs uppercase",
                          CHIP_TONE_CLASSES.success,
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" /> Connected
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs uppercase",
                          CHIP_TONE_CLASSES.destructive,
                        )}
                      >
                        <AlertTriangle className="h-3 w-3" /> Not shared —{" "}
                        {status.error ?? "unknown error"}
                      </span>
                    ))}
                  {showRateByRep?.[c.member_name] && showRateByRep[c.member_name].booked > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-3xs text-muted-foreground"
                      title="Show rate, last 30 days"
                    >
                      <TrendingUp className="h-3 w-3" />{" "}
                      {Math.round(
                        (showRateByRep[c.member_name].showed /
                          showRateByRep[c.member_name].booked) *
                          100,
                      )}
                      % show (30D)
                    </span>
                  )}
                  <div
                    className="ml-auto flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.calendar_id && (
                      <a
                        className="text-muted-foreground hover:text-foreground"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.calendar_id)}`}
                        aria-label="Open in Google Calendar"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => delCal.mutate(c.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Remove calendar"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {(cals ?? []).length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                No rep calendars yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function CalendarDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (r: Partial<Cal> & { member_name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("closer");
  const [calId, setCalId] = useState("");
  const [ical, setIcal] = useState("");
  const pickerRole = TEAM_MEMBER_ROLE_MAP[role];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-2xs">
          <Plus className="h-3 w-3 mr-1" /> Connect calendar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a rep's Google Calendar</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {r.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Confirmed real bug fix: was a plain text Input, so a typo created
              an orphaned calendar disconnected from the real roster. Roles
              without a team_members equivalent ("manager"/"other") honestly
              keep free text — there's no roster to pick from for those. */}
          {pickerRole ? (
            <TeamMemberPicker
              role={pickerRole}
              name="calendar_rep"
              value={name}
              onChange={setName}
              placeholder="Select rep"
            />
          ) : (
            <Input placeholder="Rep name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <div>
            <label className="text-xs text-muted-foreground">Google Calendar ID</label>
            <Input
              placeholder="rep@gmail.com or ...@group.calendar.google.com"
              value={calId}
              onChange={(e) => setCalId(e.target.value)}
            />
            <p className="mt-1 text-2xs text-muted-foreground">
              Google Calendar → Settings → your calendar → Integrate calendar → Calendar ID. Share
              it with the team so it renders here.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Secret iCal URL (optional)</label>
            <Input
              placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
              value={ical}
              onChange={(e) => setIcal(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            disabled={!name.trim() || (!calId.trim() && !ical.trim())}
            onClick={() => {
              onSave({ member_name: name, role, calendar_id: calId, ical_url: ical });
              onOpenChange(false);
              setName("");
              setCalId("");
              setIcal("");
            }}
          >
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}
function shiftWeek(d: Date, delta: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
