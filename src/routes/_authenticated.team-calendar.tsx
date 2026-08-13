import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, Plus, Trash2, ExternalLink, Clock, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkCalendarStatusFn } from "@/lib/team-calendar-status.functions";
import { mockCalendarStatus, withMockDelay } from "@/lib/dev-mock-data";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { avatarColorFor } from "@/lib/avatar-color";

export const Route = createFileRoute("/_authenticated/team-calendar")({
  component: TeamCalendarPage,
  head: () => ({
    meta: [
      { title: "Team Calendars — C4 InsightOS" },
      { name: "description", content: "Every closer and setter calendar in one view, with day work blocks the whole team can see." },
      { property: "og:title", content: "Team Calendars — C4 InsightOS" },
      { property: "og:description", content: "Closer and setter Google Calendars plus work blocks, visible to the whole team." },
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

type Block = {
  id: string;
  member_name: string;
  role: string | null;
  title: string;
  kind: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
};

const ROLES = ["closer", "dm_setter", "dialer", "manager", "other"];
const ROLE_GROUPS: { key: string; label: string; roles: string[] }[] = [
  { key: "closer", label: "All Closers", roles: ["closer"] },
  { key: "dm_setter", label: "All Setters", roles: ["dm_setter"] },
  { key: "ops", label: "All Ops", roles: ["dialer", "manager", "other"] },
];
const KINDS = [
  { value: "calls", label: "Calls", tone: "bg-primary/15 text-primary border-primary/30" },
  { value: "prospecting", label: "Prospecting", tone: "bg-accent/15 text-accent border-accent/30" },
  { value: "work", label: "Deep work", tone: "bg-muted text-foreground border-border" },
  { value: "admin", label: "Admin", tone: "bg-muted text-muted-foreground border-border" },
  { value: "off", label: "Off / PTO", tone: "bg-destructive/10 text-destructive border-destructive/30" },
];

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
  const toggleRep = (name: string) => setSelectedReps(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  // Dev bypass never got a real Supabase session, so writes to team_calendars /
  // work_blocks get rejected by RLS (401) — the same gap the backfill fixed on
  // team.tsx/connectors.tsx/daily-wins-panel.tsx. Keep edits in local state
  // instead, mirroring permissions.tsx's established pattern for this exact
  // situation (reads succeed empty under devBypass RLS, only writes fail).
  const [mockCals, setMockCals] = useState<Cal[]>([]);
  const [mockBlocks, setMockBlocks] = useState<Block[]>([]);

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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  }), [weekStart]);

  const { data: blocksQuery } = useQuery({
    queryKey: ["work-blocks", orgId, days[0]],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_blocks")
        .select("id, member_name, role, title, kind, block_date, start_time, end_time, notes")
        .eq("org_id", orgId!)
        .gte("block_date", days[0])
        .lte("block_date", days[6])
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as Block[];
    },
  });
  const blocks = devBypass ? mockBlocks.filter(b => b.block_date >= days[0] && b.block_date <= days[6]) : blocksQuery;

  const matchesFilter = (name: string) => selectedReps.size === 0 || selectedReps.has(name);

  const allActiveCals = (cals ?? []).filter(c => c.active);
  const activeCals = allActiveCals.filter(c => matchesFilter(c.member_name));
  const visibleCals = (cals ?? []).filter(c => matchesFilter(c.member_name));
  const combinedEmbed = useMemo(() => {
    const ids = activeCals.map(c => c.calendar_id).filter(Boolean) as string[];
    if (!ids.length) return null;
    const params = ids.map(id => `src=${encodeURIComponent(id)}`).join("&");
    return `https://calendar.google.com/calendar/embed?${params}&mode=${view}&showTitle=0&showPrint=0&showTabs=1&showCalendars=1`;
  }, [activeCals, view]);

  const checkStatus = useServerFn(checkCalendarStatusFn);
  const { data: statuses } = useQuery({
    queryKey: ["team-calendar-status", allActiveCals.map(c => c.id).join(","), devBypass],
    enabled: allActiveCals.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.all(allActiveCals.map(async (c) => {
        const r = devBypass
          ? await withMockDelay(mockCalendarStatus(), 300)
          : await checkStatus({ data: { calendar_id: c.calendar_id, ical_url: c.ical_url } });
        return [c.id, r] as const;
      }));
      return Object.fromEntries(results) as Record<string, { ok: boolean; error: string | null }>;
    },
  });
  const failedCals = allActiveCals.filter(c => statuses?.[c.id] && !statuses[c.id].ok);

  const saveCal = useMutation({
    mutationFn: async (row: Partial<Cal> & { member_name: string }) => {
      const memberName = row.member_name.trim();
      const payload: Cal = {
        id: (devBypass && mockCals.find(c => c.member_name === memberName)?.id) || crypto.randomUUID(),
        member_name: memberName,
        role: row.role ?? "closer",
        calendar_id: row.calendar_id || null,
        ical_url: row.ical_url || null,
        embed_url: row.embed_url || null,
        timezone: row.timezone || null,
        active: true,
      };
      if (devBypass) {
        setMockCals(prev => {
          const idx = prev.findIndex(c => c.member_name === memberName);
          if (idx >= 0) { const next = [...prev]; next[idx] = payload; return next; }
          return [...prev, payload];
        });
        return;
      }
      const { error } = await (supabase.from("team_calendars") as never as { upsert: (p: unknown, o: unknown) => Promise<{ error: { message: string } | null }> })
        .upsert({ org_id: orgId!, member_name: payload.member_name, role: payload.role, calendar_id: payload.calendar_id, ical_url: payload.ical_url, embed_url: payload.embed_url, timezone: payload.timezone, active: payload.active }, { onConflict: "org_id,member_name" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["team-calendars", orgId] }); toast.success("Calendar connected."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCal = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) { setMockCals(prev => prev.filter(c => c.id !== id)); return; }
      const { error } = await supabase.from("team_calendars").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["team-calendars", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBlock = useMutation({
    mutationFn: async (row: Omit<Block, "id">) => {
      if (devBypass) { setMockBlocks(prev => [...prev, { ...row, id: crypto.randomUUID() }]); return; }
      const { error } = await (supabase.from("work_blocks") as never as { insert: (p: unknown) => Promise<{ error: { message: string } | null }> })
        .insert({ ...row, org_id: orgId! });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["work-blocks", orgId, days[0]] }); toast.success("Work block added."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBlock = useMutation({
    mutationFn: async (id: string) => {
      if (devBypass) { setMockBlocks(prev => prev.filter(b => b.id !== id)); return; }
      const { error } = await supabase.from("work_blocks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["work-blocks", orgId, days[0]] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <TopBar title="Team Calendars" subtitle="Closer + setter availability and work blocks — one view for the whole team" />
      <div className="p-4 md:p-6 space-y-5">
        {/* Combined Google Calendar */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <CalendarDays className="h-3.5 w-3.5" /> Live team calendar · {activeCals.length} connected
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Quick-select by role group (bulk), "All reps" is the explicit
                  back-to-all reset — direct per-rep selection happens by
                  clicking a row in Connected Reps below (Part D). */}
              <button onClick={() => setSelectedReps(new Set())}
                className={cn("rounded border px-2 py-1 text-2xs", selectedReps.size === 0 ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40")}>
                All reps
              </button>
              {ROLE_GROUPS.map(g => (
                <button key={g.key}
                  onClick={() => setSelectedReps(new Set((cals ?? []).filter(c => g.roles.includes(c.role)).map(c => c.member_name)))}
                  className="rounded border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/40">
                  {g.label}
                </button>
              ))}
              <span className="h-4 w-px bg-border" />
              {(["WEEK", "MONTH", "AGENDA"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn("rounded border px-2 py-1 text-2xs", view === v ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40")}>
                  {v[0] + v.slice(1).toLowerCase()}
                </button>
              ))}
              <CalendarDialog onSave={(r) => saveCal.mutate(r)} />
            </div>
          </div>
          {selectedReps.size > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-2">
              <span className="text-3xs uppercase tracking-wider text-muted-foreground">Showing</span>
              {[...selectedReps].map(name => (
                <button key={name} onClick={() => toggleRep(name)}
                  className="flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2 text-2xs hover:opacity-80"
                  style={{ borderColor: avatarColorFor(name), color: avatarColorFor(name) }}>
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
                <div className="font-semibold">{failedCals.length} calendar{failedCals.length === 1 ? "" : "s"} not reachable — won't render below even though marked connected:</div>
                <ul className="space-y-0.5">
                  {failedCals.map(c => (
                    <li key={c.id}><span className="font-semibold">{c.member_name}</span> — {statuses?.[c.id]?.error ?? "Unknown error."}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          {combinedEmbed ? (
            <iframe title="Team calendar" src={combinedEmbed} className="h-[620px] w-full border-0" loading="lazy" />
          ) : (
            <div className="p-10 text-center text-xs text-muted-foreground">
              {allActiveCals.length === 0
                ? <>No Google Calendar IDs connected yet. Add a rep's calendar ID (Google Calendar → Settings → Integrate calendar → Calendar ID) and make sure the calendar is shared publicly or with the team.</>
                : <>No calendars match this filter.</>}
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
            <span className="ml-1.5 font-normal normal-case text-muted-foreground">· click to load a rep's calendar, click again to remove</span>
          </div>
          <div className="divide-y divide-border">
            {(cals ?? []).map(c => {
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
                <div key={c.id} role="button" tabIndex={0} onClick={() => toggleRep(c.member_name)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleRep(c.member_name); } }}
                  aria-pressed={selected}
                  className={cn(
                    "flex w-full flex-wrap items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors cursor-pointer",
                    selected ? "bg-[color:var(--color-accent)]/[0.06]" : "hover:bg-muted/20",
                  )}
                  style={selected ? { boxShadow: `inset 2px 0 0 0 ${color}` } : undefined}
                >
                  <AvatarInitials name={c.member_name} size="sm" />
                  <span className="font-medium">{c.member_name}</span>
                  <span className="rounded border border-border px-1.5 py-0.5 text-3xs uppercase tracking-wider text-muted-foreground">{c.role.replace("_", " ")}</span>
                  <span className="truncate font-mono text-2xs text-muted-foreground">{c.calendar_id ?? c.ical_url ?? "—"}</span>
                  {c.active && (c.calendar_id || c.ical_url) && (
                    status === undefined ? (
                      <span className="inline-flex items-center gap-1 text-3xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking…</span>
                    ) : status.ok ? (
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs uppercase", CHIP_TONE_CLASSES.success)}><CheckCircle2 className="h-3 w-3" /> Connected</span>
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-3xs uppercase", CHIP_TONE_CLASSES.destructive)}><AlertTriangle className="h-3 w-3" /> Not shared — {status.error ?? "unknown error"}</span>
                    )
                  )}
                  <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {c.calendar_id && (
                      <a className="text-muted-foreground hover:text-foreground" target="_blank" rel="noreferrer"
                        href={`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.calendar_id)}`} aria-label="Open in Google Calendar">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => delCal.mutate(c.id)} className="text-muted-foreground hover:text-destructive" aria-label="Remove calendar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {(cals ?? []).length === 0 && <div className="px-4 py-6 text-center text-xs text-muted-foreground">No rep calendars yet.</div>}
          </div>
        </section>

        {/* Work blocks week grid */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Clock className="h-3.5 w-3.5" /> Work blocks · week of {days[0]}</div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => setWeekStart(shiftWeek(weekStart, -7))}>← Prev</Button>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
              <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => setWeekStart(shiftWeek(weekStart, 7))}>Next →</Button>
              <BlockDialog days={days} onSave={(r) => saveBlock.mutate(r)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {days.map(d => {
              const dayBlocks = (blocks ?? []).filter(b => b.block_date === d && (selectedReps.size === 0 || visibleCals.some(c => c.member_name === b.member_name)));
              const isToday = d === new Date().toISOString().slice(0, 10);
              return (
                <div key={d} className={cn("min-h-[150px] p-2 space-y-1.5", isToday && "bg-primary/5")}>
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    {new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                  </div>
                  {dayBlocks.map(b => {
                    const kind = KINDS.find(k => k.value === b.kind) ?? KINDS[2];
                    return (
                      <div key={b.id} className={cn("group rounded border px-1.5 py-1 text-2xs", kind.tone)}>
                        <div className="flex items-start gap-1">
                          <span className="flex-1 font-medium leading-tight">{b.title}</span>
                          <button onClick={() => delBlock.mutate(b.id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete block">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="font-mono text-3xs opacity-80">{b.start_time ?? ""}{b.end_time ? `–${b.end_time}` : ""}</div>
                        <div className="truncate text-3xs opacity-80">{b.member_name}</div>
                      </div>
                    );
                  })}
                  {dayBlocks.length === 0 && <div className="text-3xs text-muted-foreground/60 italic">—</div>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}

function CalendarDialog({ onSave }: { onSave: (r: Partial<Cal> & { member_name: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("closer");
  const [calId, setCalId] = useState("");
  const [ical, setIcal] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-2xs"><Plus className="h-3 w-3 mr-1" /> Connect calendar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Connect a rep's Google Calendar</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Rep name" value={name} onChange={e => setName(e.target.value)} />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <label className="text-xs text-muted-foreground">Google Calendar ID</label>
            <Input placeholder="rep@gmail.com or ...@group.calendar.google.com" value={calId} onChange={e => setCalId(e.target.value)} />
            <p className="mt-1 text-2xs text-muted-foreground">Google Calendar → Settings → your calendar → Integrate calendar → Calendar ID. Share it with the team so it renders here.</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Secret iCal URL (optional)</label>
            <Input placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={ical} onChange={e => setIcal(e.target.value)} />
          </div>
          <Button className="w-full" disabled={!name.trim() || (!calId.trim() && !ical.trim())}
            onClick={() => { onSave({ member_name: name, role, calendar_id: calId, ical_url: ical }); setOpen(false); setName(""); setCalId(""); setIcal(""); }}>
            Connect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ days, onSave }: { days: string[]; onSave: (r: Omit<Block, "id">) => void }) {
  const [open, setOpen] = useState(false);
  const [member, setMember] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("calls");
  const [date, setDate] = useState(days[0]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:00");
  const [notes, setNotes] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-2xs"><Plus className="h-3 w-3 mr-1" /> Work block</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a work block</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Rep name" value={member} onChange={e => setMember(e.target.value)} />
          <Input placeholder="What's happening? (e.g. Call block, DM sprint)" value={title} onChange={e => setTitle(e.target.value)} />
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="time" value={start} onChange={e => setStart(e.target.value)} />
            <Input type="time" value={end} onChange={e => setEnd(e.target.value)} />
          </div>
          <Textarea rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          <Button className="w-full" disabled={!member.trim() || !title.trim()}
            onClick={() => {
              onSave({ member_name: member.trim(), role: null, title: title.trim(), kind, block_date: date, start_time: start, end_time: end, notes: notes || null });
              setOpen(false); setTitle(""); setNotes("");
            }}>Add block</Button>
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
