import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CalendarDays, Clock, Copy, CalendarPlus, Check, Film, FileText, Repeat, Mic2, Target, Lightbulb } from "lucide-react";
import { toast } from "sonner";

type Sched = {
  id: string; title: string | null; platform: string; hook: string | null;
  body: string | null; cta: string | null; funnel_stage: string | null;
  angle: string | null; topic: string | null; pipeline_status: string;
  scheduled_date: string | null; scheduled_time: string | null;
  post_format: string | null; repurpose_plan: string | null;
  voice_notes: string | null; why_it_works: string | null; posting_instructions: string | null;
};

// Identity colors (content-format, categorical) — deliberately lower saturation
// than the spectrum data-language and hue-clear of its 230-350 arc, so a format
// badge never reads as funnel-position data. See avatar-initials.tsx for the
// same rule applied to per-person colors.
const FMT_TONE: Record<string, string> = {
  short_form: "bg-[oklch(0.7_0.09_40/15%)] text-[oklch(0.76_0.09_40)] border-[oklch(0.7_0.09_40/30%)]",
  long_form: "bg-[oklch(0.7_0.09_76/15%)] text-[oklch(0.76_0.09_76)] border-[oklch(0.7_0.09_76/30%)]",
  long_to_short: "bg-[oklch(0.7_0.09_112/15%)] text-[oklch(0.76_0.09_112)] border-[oklch(0.7_0.09_112/30%)]",
  story: "bg-[oklch(0.7_0.09_148/15%)] text-[oklch(0.76_0.09_148)] border-[oklch(0.7_0.09_148/30%)]",
  carousel: "bg-[oklch(0.7_0.09_184/15%)] text-[oklch(0.76_0.09_184)] border-[oklch(0.7_0.09_184/30%)]",
  email: "bg-[oklch(0.7_0.09_215/15%)] text-[oklch(0.76_0.09_215)] border-[oklch(0.7_0.09_215/30%)]",
};
export const FORMAT_LABEL: Record<string, string> = {
  short_form: "Short-form",
  long_form: "Long-form",
  long_to_short: "Long-form → clips",
  story: "Story sequence",
  carousel: "Carousel",
  email: "Email / SMS",
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function gcalLink(p: Sched) {
  if (!p.scheduled_date) return "#";
  const t = (p.scheduled_time || "09:00").slice(0, 5);
  const start = new Date(`${p.scheduled_date}T${t}:00`);
  const end = new Date(start.getTime() + 30 * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const details = [
    p.hook ? `HOOK: ${p.hook}` : "",
    p.post_format ? `FORMAT: ${FORMAT_LABEL[p.post_format] ?? p.post_format}` : "",
    p.cta ? `CTA: ${p.cta}` : "",
    p.body ? `\nSCRIPT:\n${p.body}` : "",
  ].filter(Boolean).join("\n");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `POST: ${p.title ?? "Content"}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: details.slice(0, 8000),
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export const Route = createFileRoute("/_authenticated/content-calendar")({ component: ContentCalendar });

function ContentCalendar() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });
  const [openPiece, setOpenPiece] = useState<Sched | null>(null);

  const { data: pieces = [] } = useQuery({
    queryKey: ["content-schedule", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, hook, body, cta, funnel_stage, angle, topic, pipeline_status, scheduled_date, scheduled_time, post_format, repurpose_plan, voice_notes, why_it_works, posting_instructions")
        .eq("org_id", orgId!)
        .not("scheduled_date", "is", null)
        .order("scheduled_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Sched[];
    },
  });

  const markPosted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("content_pieces")
        .update({ pipeline_status: "posted", posted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-schedule"] });
      qc.invalidateQueries({ queryKey: ["content"] });
      toast.success("Marked posted");
      setOpenPiece(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const weeks = useMemo(() => {
    const year = cursor.getFullYear(), month = cursor.getMonth();
    const lead = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    const cells: { date: string; inMonth: boolean; items: Sched[] }[] = [];
    for (let i = 0; i < total; i++) {
      const dt = new Date(year, month, i - lead + 1);
      cells.push({ date: iso(dt), inMonth: dt.getMonth() === month, items: [] });
    }
    for (const p of pieces) {
      const slot = cells.find(c => c.date === p.scheduled_date);
      if (slot) slot.items.push(p);
    }
    for (const c of cells) c.items.sort((a, b) => (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? ""));
    const out: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [pieces, cursor]);

  const monthPieces = pieces.filter(p => (p.scheduled_date ?? "").slice(0, 7) === iso(cursor).slice(0, 7));
  const today = iso(new Date());
  const upcoming = pieces.filter(p => (p.scheduled_date ?? "") >= today).slice(0, 6);

  return (
    <>
      <TopBar title="Content Calendar" subtitle="Every approved post, scripted and scheduled — nothing left to figure out" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Scheduled this month", value: monthPieces.length, icon: CalendarDays },
            { label: "Ready to post", value: monthPieces.filter(p => p.pipeline_status === "ready_to_post").length, icon: Check },
            { label: "Already posted", value: monthPieces.filter(p => p.pipeline_status === "posted").length, icon: Film },
            { label: "Long-form queued", value: monthPieces.filter(p => p.post_format === "long_form" || p.post_format === "long_to_short").length, icon: FileText },
          ].map(s => (
            <Card key={s.label} className="p-3 bg-gradient-to-br from-card to-muted/20">
              <div className="flex items-center justify-between">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="text-2xl font-mono mt-1">{s.value}</div>
            </Card>
          ))}
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(c.getMonth() - 1); return n; })}>‹</Button>
              <div className="display-serif text-lg min-w-[190px] text-center">
                {cursor.toLocaleString("default", { month: "long", year: "numeric" })}
              </div>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0"
                onClick={() => setCursor(c => { const n = new Date(c); n.setMonth(c.getMonth() + 1); return n; })}>›</Button>
              <Button size="sm" variant="ghost"
                onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); }}>Today</Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(FORMAT_LABEL).map(([k, v]) => (
                <span key={k} className={`text-3xs rounded border px-1.5 py-0.5 ${FMT_TONE[k]}`}>{v}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-3xs uppercase tracking-wider text-muted-foreground mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
              <div key={d} className="p-1 text-center font-semibold">{d}</div>
            ))}
          </div>
          <div className="space-y-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map(slot => {
                  const isToday = slot.date === today;
                  return (
                    <div key={slot.date} className={`min-h-[110px] rounded-md border p-1.5 transition ${
                      isToday ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                        : slot.inMonth ? "border-border bg-card hover:bg-muted/20"
                        : "border-border/40 bg-muted/10"
                    }`}>
                      <div className={`font-mono mb-1 text-xs ${isToday ? "text-primary font-bold" : slot.inMonth ? "text-foreground/80" : "text-muted-foreground/40"}`}>
                        {Number(slot.date.slice(8, 10))}
                      </div>
                      <div className="space-y-1">
                        {slot.items.map(p => (
                          <button key={p.id} onClick={() => setOpenPiece(p)}
                            className={`w-full text-left rounded border px-1.5 py-1 hover:brightness-125 transition ${FMT_TONE[p.post_format ?? ""] ?? "bg-muted text-muted-foreground border-border"}`}>
                            <div className="flex items-center gap-1 text-4xs font-mono opacity-80">
                              <Clock className="h-2.5 w-2.5" />{(p.scheduled_time ?? "").slice(0, 5) || "—"}
                              {p.pipeline_status === "posted" && <Check className="h-2.5 w-2.5 ml-auto" />}
                            </div>
                            <div className="text-3xs font-medium leading-tight line-clamp-2 mt-0.5">{p.title || "(untitled)"}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Next up</h3>
          {upcoming.length === 0 ? (
            <Card className="p-8 text-center">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <div className="text-sm font-medium">Nothing scheduled yet</div>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Move a piece to <span className="font-mono">Ready to Post</span> in Content Intelligence — you'll be asked for the day and time, and it lands right here fully scripted.
              </p>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {upcoming.map(p => (
                <Card key={p.id} className="p-3 space-y-1.5 cursor-pointer hover:border-accent/50 transition" onClick={() => setOpenPiece(p)}>
                  <div className="flex items-center justify-between">
                    <span className="text-3xs font-mono text-muted-foreground">
                      {new Date(`${p.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                      {p.scheduled_time ? ` · ${p.scheduled_time.slice(0, 5)}` : ""}
                    </span>
                    <span className={`text-4xs rounded border px-1 py-px ${FMT_TONE[p.post_format ?? ""] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {FORMAT_LABEL[p.post_format ?? ""] ?? p.platform}
                    </span>
                  </div>
                  <div className="text-sm font-medium leading-snug line-clamp-2">{p.title || "(untitled)"}</div>
                  {p.hook && <div className="text-2xs text-muted-foreground line-clamp-2 italic">"{p.hook}"</div>}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!openPiece} onOpenChange={(v) => !v && setOpenPiece(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {openPiece && (
            <>
              <SheetHeader>
                <SheetTitle className="pr-8 leading-snug">{openPiece.title || "(untitled)"}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="font-mono text-3xs">
                    {openPiece.scheduled_date
                      ? new Date(`${openPiece.scheduled_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
                      : "Unscheduled"}
                  </Badge>
                  {openPiece.scheduled_time && <Badge variant="outline" className="font-mono text-3xs">{openPiece.scheduled_time.slice(0, 5)}</Badge>}
                  <Badge className="text-3xs">{FORMAT_LABEL[openPiece.post_format ?? ""] ?? openPiece.platform}</Badge>
                  {openPiece.funnel_stage && <Badge variant="secondary" className="text-3xs">{openPiece.funnel_stage}</Badge>}
                  {openPiece.pipeline_status === "posted" && <Badge variant="secondary" className="text-3xs">Posted</Badge>}
                </div>

                {openPiece.hook && (
                  <Block icon={Target} title="Hook — say this first">
                    <p className="italic">"{openPiece.hook}"</p>
                  </Block>
                )}

                <Block icon={FileText} title="Full script">
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{openPiece.body || "No script written yet."}</pre>
                  <Button size="sm" variant="outline" className="mt-2"
                    onClick={() => { navigator.clipboard.writeText(openPiece.body ?? ""); toast.success("Script copied"); }}>
                    <Copy className="h-3.5 w-3.5 mr-1.5" />Copy script
                  </Button>
                </Block>

                {openPiece.voice_notes && (
                  <Block icon={Mic2} title="How it should sound">
                    <p className="whitespace-pre-wrap">{openPiece.voice_notes}</p>
                  </Block>
                )}
                {openPiece.cta && (
                  <Block icon={Target} title="Call to action">
                    <p className="whitespace-pre-wrap">{openPiece.cta}</p>
                  </Block>
                )}
                {openPiece.repurpose_plan && (
                  <Block icon={Repeat} title="Repurpose plan">
                    <p className="whitespace-pre-wrap">{openPiece.repurpose_plan}</p>
                  </Block>
                )}
                {openPiece.why_it_works && (
                  <Block icon={Lightbulb} title="Why this works">
                    <p className="whitespace-pre-wrap">{openPiece.why_it_works}</p>
                  </Block>
                )}
                {openPiece.posting_instructions && (
                  <Block icon={Clock} title="Posting instructions">
                    <p className="whitespace-pre-wrap">{openPiece.posting_instructions}</p>
                  </Block>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" asChild variant="outline">
                    <a href={gcalLink(openPiece)} target="_blank" rel="noreferrer">
                      <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />Add to Google Calendar
                    </a>
                  </Button>
                  {openPiece.pipeline_status !== "posted" && (
                    <Button size="sm" onClick={() => markPosted.mutate(openPiece.id)} disabled={markPosted.isPending}>
                      <Check className="h-3.5 w-3.5 mr-1.5" />Mark posted
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Block({ icon: Icon, title, children }: { icon: typeof Target; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-3xs uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="h-3 w-3" />{title}
      </div>
      {children}
    </div>
  );
}
