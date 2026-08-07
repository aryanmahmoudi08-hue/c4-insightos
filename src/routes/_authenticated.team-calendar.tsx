import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarDays, Plus, Trash2, ExternalLink, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const qc = useQueryClient();
  const [view, setView] = useState<"WEEK" | "MONTH" | "AGENDA">("WEEK");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const { data: cals } = useQuery({
    queryKey: ["team-calendars", orgId],
    enabled: !!orgId,
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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  }), [weekStart]);

  const { data: blocks } = useQuery({
    queryKey: ["work-blocks", orgId, days[0]],
    enabled: !!orgId,
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

  const activeCals = (cals ?? []).filter(c => c.active);
  const combinedEmbed = useMemo(() => {
    const ids = activeCals.map(c => c.calendar_id).filter(Boolean) as string[];
    if (!ids.length) return null;
    const params = ids.map(id => `src=${encodeURIComponent(id)}`).join("&");
    return `https://calendar.google.com/calendar/embed?${params}&mode=${view}&showTitle=0&showPrint=0&showTabs=1&showCalendars=1`;
  }, [activeCals, view]);

  const saveCal = useMutation({
    mutationFn: async (row: Partial<Cal> & { member_name: string }) => {
      const payload = {
        org_id: orgId!,
        member_name: row.member_name.trim(),
        role: row.role ?? "closer",
        calendar_id: row.calendar_id || null,
        ical_url: row.ical_url || null,
        embed_url: row.embed_url || null,
        timezone: row.timezone || null,
        active: true,
      };
      const { error } = await (supabase.from("team_calendars") as never as { upsert: (p: unknown, o: unknown) => Promise<{ error: { message: string } | null }> })
        .upsert(payload, { onConflict: "org_id,member_name" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team-calendars", orgId] }); toast.success("Calendar connected."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delCal = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("team_calendars").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-calendars", orgId] }),
  });

  const saveBlock = useMutation({
    mutationFn: async (row: Omit<Block, "id">) => {
      const { error } = await (supabase.from("work_blocks") as never as { insert: (p: unknown) => Promise<{ error: { message: string } | null }> })
        .insert({ ...row, org_id: orgId! });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["work-blocks", orgId, days[0]] }); toast.success("Work block added."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delBlock = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("work_blocks").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-blocks", orgId, days[0]] }),
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
            <div className="flex items-center gap-1.5">
              {(["WEEK", "MONTH", "AGENDA"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={cn("rounded border px-2 py-1 text-[11px]", view === v ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40")}>
                  {v[0] + v.slice(1).toLowerCase()}
                </button>
              ))}
              <CalendarDialog onSave={(r) => saveCal.mutate(r)} />
            </div>
          </div>
          {combinedEmbed ? (
            <iframe title="Team calendar" src={combinedEmbed} className="h-[620px] w-full border-0" loading="lazy" />
          ) : (
            <div className="p-10 text-center text-xs text-muted-foreground">
              No Google Calendar IDs connected yet. Add a rep's calendar ID (Google Calendar → Settings → Integrate calendar → Calendar ID)
              and make sure the calendar is shared publicly or with the team.
            </div>
          )}
        </section>

        {/* Connected calendars */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider">Connected reps</div>
          <div className="divide-y divide-border">
            {(cals ?? []).map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">{c.member_name}</span>
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{c.role.replace("_", " ")}</span>
                <span className="truncate font-mono text-[11px] text-muted-foreground">{c.calendar_id ?? c.ical_url ?? "—"}</span>
                <div className="ml-auto flex items-center gap-2">
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
            ))}
            {(cals ?? []).length === 0 && <div className="px-4 py-6 text-center text-xs text-muted-foreground">No rep calendars yet.</div>}
          </div>
        </section>

        {/* Work blocks week grid */}
        <section className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><Clock className="h-3.5 w-3.5" /> Work blocks · week of {days[0]}</div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setWeekStart(shiftWeek(weekStart, -7))}>← Prev</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setWeekStart(shiftWeek(weekStart, 7))}>Next →</Button>
              <BlockDialog days={days} onSave={(r) => saveBlock.mutate(r)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {days.map(d => {
              const dayBlocks = (blocks ?? []).filter(b => b.block_date === d);
              const isToday = d === new Date().toISOString().slice(0, 10);
              return (
                <div key={d} className={cn("min-h-[150px] p-2 space-y-1.5", isToday && "bg-primary/5")}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                  </div>
                  {dayBlocks.map(b => {
                    const kind = KINDS.find(k => k.value === b.kind) ?? KINDS[2];
                    return (
                      <div key={b.id} className={cn("group rounded border px-1.5 py-1 text-[11px]", kind.tone)}>
                        <div className="flex items-start gap-1">
                          <span className="flex-1 font-medium leading-tight">{b.title}</span>
                          <button onClick={() => delBlock.mutate(b.id)} className="opacity-0 group-hover:opacity-100" aria-label="Delete block">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="font-mono text-[10px] opacity-80">{b.start_time ?? ""}{b.end_time ? `–${b.end_time}` : ""}</div>
                        <div className="truncate text-[10px] opacity-80">{b.member_name}</div>
                      </div>
                    );
                  })}
                  {dayBlocks.length === 0 && <div className="text-[10px] text-muted-foreground/60 italic">—</div>}
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
        <Button size="sm" className="h-7 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Connect calendar</Button>
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
            <p className="mt-1 text-[11px] text-muted-foreground">Google Calendar → Settings → your calendar → Integrate calendar → Calendar ID. Share it with the team so it renders here.</p>
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
        <Button size="sm" variant="outline" className="h-7 text-[11px]"><Plus className="h-3 w-3 mr-1" /> Work block</Button>
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
