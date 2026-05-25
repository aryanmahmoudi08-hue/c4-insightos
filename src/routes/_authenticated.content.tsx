import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useMemo, useState, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Video, Layers, Pencil, ExternalLink, Trash2, Sparkles, ChevronRight, ChevronDown, Eye, Heart } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeContent } from "@/lib/analyze-content.functions";
import { coachContentFn } from "@/lib/coach-content.functions";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Platform = Database["public"]["Enums"]["content_platform"];
type Angle = Database["public"]["Enums"]["content_angle"];

type PieceRow = {
  id: string; title: string | null; platform: Platform; hook: string | null;
  angle: Angle | null; posted_at: string | null; url: string | null;
  funnel_stage: string | null; body: string | null;
  content_metrics: { views: number | null; likes: number | null; leads_generated: number | null; closes: number | null;
    cash_collected_cents: number | null; hook_retention_pct: number | null }[] | null;
};

type Prefill = { id?: string; title?: string; hook?: string; platform?: Platform; angle?: Angle; url?: string; funnel_stage?: string; transcript?: string; views?: number; leads?: number; retention?: number };

export const Route = createFileRoute("/_authenticated/content")({ component: ContentIntel });

function ContentIntel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [slidesFor, setSlidesFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overviewFor, setOverviewFor] = useState<PieceRow | null>(null);

  const toggleExpand = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const { data: pieces } = useQuery({
    queryKey: ["content", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, hook, angle, posted_at, url, funnel_stage, body, content_metrics(views, likes, leads_generated, closes, cash_collected_cents, hook_retention_pct)")
        .eq("org_id", orgId!)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data as unknown as PieceRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const editingId = prefill?.id;
      const payload = {
        org_id: orgId!,
        title: String(form.get("title") || ""),
        hook: String(form.get("hook") || "") || null,
        platform: form.get("platform") as Platform,
        angle: (form.get("angle") as Angle) || null,
        url: String(form.get("url") || "") || null,
        funnel_stage: String(form.get("funnel_stage") || "") || null,
        body: String(form.get("transcript") || "") || null,
      };
      let contentId = editingId;
      if (editingId) {
        const { error } = await supabase.from("content_pieces").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: piece, error } = await supabase
          .from("content_pieces")
          .insert({ ...payload, posted_at: new Date().toISOString() })
          .select("id").single();
        if (error) throw error;
        contentId = piece.id;
      }
      const metrics = {
        views: Number(form.get("views") || 0),
        leads_generated: Number(form.get("leads") || 0),
        hook_retention_pct: Number(form.get("retention") || 0),
      };
      if (editingId) {
        const { data: existing } = await supabase
          .from("content_metrics").select("id").eq("content_id", editingId).limit(1).maybeSingle();
        if (existing) {
          await supabase.from("content_metrics").update(metrics).eq("id", existing.id);
        } else {
          await supabase.from("content_metrics").insert({ org_id: orgId!, content_id: contentId!, ...metrics });
        }
      } else {
        await supabase.from("content_metrics").insert({ org_id: orgId!, content_id: contentId!, ...metrics });
      }
    },
    onSuccess: () => { toast.success(prefill?.id ? "Content updated" : "Content logged"); qc.invalidateQueries({ queryKey: ["content"] }); setOpen(false); setPrefill(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("content_metrics").delete().eq("content_id", id);
      await supabase.from("slide_metrics").delete().eq("org_id", orgId!).in("slide_id",
        (await supabase.from("story_slides").select("id").eq("content_id", id)).data?.map(s => s.id) ?? []);
      await supabase.from("story_slides").delete().eq("content_id", id);
      await supabase.from("lead_content_touches").delete().eq("content_id", id);
      const { error } = await supabase.from("content_pieces").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["content"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const edit = (p: PieceRow) => {
    const m = (p.content_metrics ?? [])[0];
    setPrefill({
      id: p.id,
      title: p.title ?? undefined,
      hook: p.hook ?? undefined,
      platform: p.platform,
      angle: p.angle ?? undefined,
      url: p.url ?? undefined,
      funnel_stage: p.funnel_stage ?? undefined,
      transcript: p.body ?? undefined,
      views: m?.views ?? 0,
      leads: m?.leads_generated ?? 0,
      retention: m?.hook_retention_pct ?? 0,
    });
    setOpen(true);
  };

  // Weekly calendar grid (last 6 weeks)
  const calendar = useMemo(() => {
    const today = new Date();
    const day = today.getDay(); // Sun=0
    const start = new Date(today); start.setDate(today.getDate() - day - 35); // 6 weeks back, Sunday
    const weeks: { date: string; pieces: PieceRow[] }[][] = [];
    for (let w = 0; w < 6; w++) {
      const week: { date: string; pieces: PieceRow[] }[] = [];
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start.getTime() + (w * 7 + d) * 86400e3);
        const iso = dt.toISOString().slice(0, 10);
        week.push({ date: iso, pieces: [] });
      }
      weeks.push(week);
    }
    for (const p of pieces ?? []) {
      if (!p.posted_at) continue;
      const iso = p.posted_at.slice(0, 10);
      for (const week of weeks) {
        const slot = week.find(s => s.date === iso);
        if (slot) { slot.pieces.push(p); break; }
      }
    }
    return weeks;
  }, [pieces]);

  return (
    <>
      <TopBar title="Content Intelligence" subtitle="Hooks, retention, cash-per-view" />
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{pieces?.length ?? 0} pieces tracked</div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPrefill(null); }}>
            <DialogTrigger asChild><Button size="sm" onClick={() => setPrefill(null)}><Plus className="h-4 w-4" />Log content</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{prefill?.id ? "Edit content piece" : "Log content piece"}</DialogTitle></DialogHeader>
              <ContentForm key={prefill?.id ?? "new"} prefill={prefill} onSubmit={(fd) => save.mutate(fd)} pending={save.isPending} />
            </DialogContent>
          </Dialog>
        </div>

        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">Table</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
              <table className="w-full min-w-[1200px] text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-6 p-3"></th>
                    <th className="text-left p-3">Title</th><th className="text-left p-3">Platform</th><th className="text-left p-3">Angle</th>
                    <th className="text-center p-3">Funnel</th>
                    <th className="text-center p-3">Link</th>
                    <th className="text-right p-3 font-mono">Views</th><th className="text-right p-3 font-mono">Leads</th>
                    <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash</th>
                    <th className="text-right p-3 font-mono">Retention</th><th className="text-right p-3"></th></tr>
                </thead>
                <tbody>
                  {(pieces ?? []).map((p) => {
                    const m = (p.content_metrics ?? [])[0];
                    const isOpen = expanded.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-t border-border hover:bg-muted/20">
                          <td className="p-3 align-top">
                            <button onClick={() => toggleExpand(p.id)} className="text-muted-foreground hover:text-foreground" title={isOpen ? "Hide transcript" : "Show transcript"}>
                              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                          <td className="p-3">
                            <div className="flex items-start gap-2"><Video className="h-3.5 w-3.5 text-muted-foreground mt-0.5" />
                              <button onClick={() => setOverviewFor(p)} className="min-w-0 text-left group">
                                <div className="truncate font-medium group-hover:text-accent group-hover:underline">
                                  {(p.title || "(untitled)")}{p.hook ? <span className="text-muted-foreground font-normal"> — {p.hook}</span> : null}
                                </div>
                              </button>
                            </div>
                          </td>
                          <td className="p-3 text-xs uppercase text-muted-foreground">{p.platform}</td>
                          <td className="p-3 text-xs">{p.angle ?? "—"}</td>
                          <td className="p-3 text-center">
                            {p.funnel_stage ? (
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-mono uppercase ${
                                p.funnel_stage === "TOF" ? "bg-blue-500/15 text-blue-400" :
                                p.funnel_stage === "MOF" ? "bg-amber-500/15 text-amber-400" :
                                p.funnel_stage === "BOF" ? "bg-emerald-500/15 text-emerald-400" :
                                "bg-muted text-muted-foreground"
                              }`}>{p.funnel_stage}</span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-3 text-center">{p.url ? (
                            <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline" title={p.url}>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : <span className="text-muted-foreground">—</span>}</td>
                          <td className="p-3 text-right font-mono">{m?.views?.toLocaleString() ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.leads_generated ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.closes ?? "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.cash_collected_cents ? "$"+Math.round(m.cash_collected_cents/100) : "—"}</td>
                          <td className="p-3 text-right font-mono">{m?.hook_retention_pct ? m.hook_retention_pct+"%" : "—"}</td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => edit(p)}>
                              <Pencil className="h-3 w-3" />Edit
                            </Button>
                            {p.platform === "story_sequence" && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSlidesFor(p.id)}>
                                <Layers className="h-3 w-3" />Slides
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => { if (confirm(`Delete "${p.title || "this piece"}"? This cannot be undone.`)) del.mutate(p.id); }}>
                              <Trash2 className="h-3 w-3" />Delete
                            </Button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr key={p.id + "-tx"} className="bg-muted/10 border-t border-border/50">
                            <td></td>
                            <td colSpan={11} className="p-3">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
                              <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-64 overflow-y-auto rounded bg-background/50 p-3 border border-border">
                                {p.body || <span className="text-muted-foreground italic">No transcript yet. Add one via Edit.</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {(!pieces || pieces.length === 0) && (
                    <tr><td colSpan={12} className="p-10 text-center text-sm text-muted-foreground">No content yet. Log your first piece.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>


          <TabsContent value="calendar">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => <div key={d} className="p-1 text-center">{d}</div>)}
              </div>
              <div className="space-y-1">
                {calendar.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map(slot => {
                      const today = new Date().toISOString().slice(0, 10);
                      const isToday = slot.date === today;
                      const dayNum = Number(slot.date.slice(8, 10));
                      return (
                        <div key={slot.date} className={`min-h-[72px] rounded border ${isToday ? "border-primary bg-primary/5" : "border-border bg-card"} p-1.5 text-[11px]`}>
                          <div className={`font-mono mb-1 ${isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>{dayNum}</div>
                          <div className="space-y-0.5">
                            {slot.pieces.slice(0, 3).map(p => {
                              const m = (p.content_metrics ?? [])[0];
                              const stage = p.funnel_stage ?? "—";
                              const stageCls = stage === "TOF" ? "bg-blue-500/15 text-blue-400" :
                                stage === "MOF" ? "bg-amber-500/15 text-amber-400" :
                                stage === "BOF" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground";
                              return (
                                <button key={p.id} onClick={() => setOverviewFor(p)} className="w-full flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent/10 text-left" title={p.title ?? ""}>
                                  <span className={`rounded px-1 py-px text-[9px] font-mono uppercase ${stageCls}`}>{stage}</span>
                                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground"><Eye className="h-2.5 w-2.5" />{m?.views ?? 0}</span>
                                  <span className="flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground"><Heart className="h-2.5 w-2.5" />{m?.likes ?? 0}</span>
                                </button>
                              );
                            })}
                            {slot.pieces.length > 3 && <div className="text-muted-foreground">+{slot.pieces.length - 3}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <SlidesPanel orgId={orgId} contentId={slidesFor} onClose={() => setSlidesFor(null)} />
      <OverviewPanel piece={overviewFor} onClose={() => setOverviewFor(null)} onEdit={(p) => { setOverviewFor(null); edit(p); }} />
    </>
  );
}

function ContentForm({ prefill, onSubmit, pending }: { prefill: Prefill | null; onSubmit: (fd: FormData) => void; pending: boolean }) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [hook, setHook] = useState(prefill?.hook ?? "");
  const [platform, setPlatform] = useState<Platform>(prefill?.platform ?? "reel");
  const [angle, setAngle] = useState<Angle>(prefill?.angle ?? "authority");
  const [funnel, setFunnel] = useState(prefill?.funnel_stage ?? "TOF");
  const [url, setUrl] = useState(prefill?.url ?? "");
  const [transcript, setTranscript] = useState(prefill?.transcript ?? "");
  const analyze = useServerFn(analyzeContent);
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalyze = async () => {
    if (!transcript.trim()) { toast.error("Paste the transcript first"); return; }
    setAnalyzing(true);
    try {
      const r = await analyze({ data: { transcript, hook, title } });
      setHook(r.hook);
      setAngle(r.angle as Angle);
      setFunnel(r.funnel_stage);
      toast.success(`Detected: ${r.funnel_stage} · ${r.angle}`, { description: r.rationale });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("platform", platform); fd.set("angle", angle); fd.set("funnel_stage", funnel);
      onSubmit(fd);
    }}>
      <div className="space-y-1.5"><Label>Title</Label><Input name="title" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label>Video URL</Label><Input name="url" type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} /></div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Full transcript</Label>
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={runAnalyze} disabled={analyzing}>
            <Sparkles className="h-3 w-3" />{analyzing ? "Analyzing…" : "AI: detect hook, angle, funnel"}
          </Button>
        </div>
        <Textarea name="transcript" rows={6} placeholder="Paste the entire reel transcript here…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
      </div>
      <div className="space-y-1.5"><Label>Hook (first 3 sec)</Label><Textarea name="hook" rows={2} value={hook} onChange={(e) => setHook(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Platform / format</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["reel","story_sequence","post","carousel","youtube","youtube_short","tiktok","vsl","ad_creative","email","dm","other"].map(p =>
              <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Angle</Label>
          <Select value={angle} onValueChange={(v) => setAngle(v as Angle)}><SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["authority","story","contrarian","tutorial","case_study","aspirational","fear","social_proof"].map(p =>
              <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="space-y-1.5"><Label>Funnel stage</Label>
        <Select value={funnel} onValueChange={setFunnel}><SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent>
            <SelectItem value="TOF">TOF — Top of Funnel (awareness)</SelectItem>
            <SelectItem value="MOF">MOF — Middle of Funnel (consideration)</SelectItem>
            <SelectItem value="BOF">BOF — Bottom of Funnel (conversion)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Views</Label><Input name="views" type="number" defaultValue={prefill?.views ?? 0} /></div>
        <div className="space-y-1.5"><Label>Leads</Label><Input name="leads" type="number" defaultValue={prefill?.leads ?? 0} /></div>
        <div className="space-y-1.5"><Label>Retention %</Label><Input name="retention" type="number" step="0.1" defaultValue={prefill?.retention ?? 0} /></div>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "…" : "Save"}</Button>
    </form>
  );
}

function SlidesPanel({ orgId, contentId, onClose }: { orgId?: string; contentId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: slides } = useQuery({
    queryKey: ["slides", contentId],
    enabled: !!contentId && !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("story_slides")
        .select("id, sequence_index, caption, cta, slide_metrics(views, exits, taps_forward, taps_back, replies, link_clicks)")
        .eq("content_id", contentId!)
        .order("sequence_index");
      return data ?? [];
    },
  });
  const add = useMutation({
    mutationFn: async (f: FormData) => {
      const seq = Number(f.get("sequence_index") || (slides?.length ?? 0) + 1);
      const { data: slide, error } = await supabase.from("story_slides").insert({
        org_id: orgId!, content_id: contentId!, sequence_index: seq,
        caption: String(f.get("caption") || "") || null, cta: String(f.get("cta") || "") || null,
      }).select("id").single();
      if (error) throw error;
      await supabase.from("slide_metrics").insert({
        org_id: orgId!, slide_id: slide.id,
        views: Number(f.get("views") || 0), exits: Number(f.get("exits") || 0),
        taps_forward: Number(f.get("taps_forward") || 0), taps_back: Number(f.get("taps_back") || 0),
        replies: Number(f.get("replies") || 0), link_clicks: Number(f.get("link_clicks") || 0),
      });
    },
    onSuccess: () => { toast.success("Slide tracked"); qc.invalidateQueries({ queryKey: ["slides"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const chartData = (slides ?? []).map(s => {
    const m = (s.slide_metrics ?? [])[0];
    return { slide: `#${s.sequence_index}`, views: m?.views ?? 0, exits: m?.exits ?? 0 };
  });

  return (
    <Dialog open={!!contentId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Story sequence · slide drop-off</DialogTitle></DialogHeader>
        {chartData.length > 0 && (
          <div className="h-48 rounded border border-border bg-card p-2">
            <ResponsiveContainer>
              <LineChart data={chartData}>
                <XAxis dataKey="slide" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Line type="monotone" dataKey="views" stroke="oklch(0.65 0.18 250)" strokeWidth={2} />
                <Line type="monotone" dataKey="exits" stroke="oklch(0.65 0.22 25)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        <div className="space-y-1">
          {(slides ?? []).map(s => {
            const m = (s.slide_metrics ?? [])[0];
            const dropoff = m?.views ? Math.round(((m.exits ?? 0) / m.views) * 100) : 0;
            return (
              <div key={s.id} className="flex items-center gap-3 rounded border border-border bg-card/40 p-2 text-xs">
                <span className="font-mono text-accent w-8">#{s.sequence_index}</span>
                <span className="flex-1 truncate">{s.caption ?? <span className="text-muted-foreground">—</span>}</span>
                <span className="font-mono">{m?.views ?? 0}v</span>
                <span className={`font-mono ${dropoff > 30 ? "text-destructive" : "text-muted-foreground"}`}>{dropoff}% exit</span>
              </div>
            );
          })}
          {(!slides || slides.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No slides yet.</div>}
        </div>
        <form className="space-y-2 border-t border-border pt-3" onSubmit={(e) => { e.preventDefault(); add.mutate(new FormData(e.currentTarget)); (e.target as HTMLFormElement).reset(); }}>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Add slide</div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="sequence_index" type="number" placeholder="Seq #" />
            <Input name="caption" placeholder="Caption" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input name="views" type="number" placeholder="Views" />
            <Input name="exits" type="number" placeholder="Exits" />
            <Input name="taps_forward" type="number" placeholder="Fwd" />
            <Input name="taps_back" type="number" placeholder="Back" />
            <Input name="replies" type="number" placeholder="Replies" />
            <Input name="link_clicks" type="number" placeholder="Clicks" />
          </div>
          <Button type="submit" size="sm" className="w-full" disabled={add.isPending}>Add slide</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OverviewPanel({ piece, onClose, onEdit }: { piece: PieceRow | null; onClose: () => void; onEdit: (p: PieceRow) => void }) {
  const coach = useServerFn(coachContentFn);
  const m = (piece?.content_metrics ?? [])[0];
  const { data: coaching, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["coach", piece?.id],
    enabled: !!piece,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => coach({ data: {
      title: piece!.title, hook: piece!.hook, transcript: piece!.body,
      angle: piece!.angle, funnel_stage: piece!.funnel_stage, platform: piece!.platform,
      views: m?.views ?? 0, leads: m?.leads_generated ?? 0, closes: m?.closes ?? 0,
      cash_cents: m?.cash_collected_cents ?? 0, retention_pct: Number(m?.hook_retention_pct ?? 0),
    } }),
  });

  if (!piece) return null;
  const stage = piece.funnel_stage ?? "—";
  const stageCls = stage === "TOF" ? "bg-blue-500/15 text-blue-400" :
    stage === "MOF" ? "bg-amber-500/15 text-amber-400" :
    stage === "BOF" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground";

  return (
    <Dialog open={!!piece} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{piece.title || "(untitled)"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="uppercase text-muted-foreground">{piece.platform}</span>
          <span className={`rounded px-1.5 py-0.5 font-mono uppercase text-[10px] ${stageCls}`}>{stage}</span>
          {piece.angle && <span className="rounded bg-muted px-1.5 py-0.5">{piece.angle}</span>}
          {piece.posted_at && <span className="text-muted-foreground">· {new Date(piece.posted_at).toLocaleDateString()}</span>}
          {piece.url && <a href={piece.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-accent hover:underline"><ExternalLink className="h-3 w-3" />Open</a>}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[
            ["Views", m?.views?.toLocaleString() ?? "—"],
            ["Leads", m?.leads_generated ?? "—"],
            ["Closes", m?.closes ?? "—"],
            ["Cash", m?.cash_collected_cents ? "$"+Math.round(m.cash_collected_cents/100) : "—"],
            ["Retention", m?.hook_retention_pct ? m.hook_retention_pct+"%" : "—"],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded border border-border bg-card/40 p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="font-mono text-sm">{v}</div>
            </div>
          ))}
        </div>

        {piece.hook && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Hook (first 3s)</div>
            <div className="text-sm">{piece.hook}</div>
          </div>
        )}

        {piece.body && (
          <div className="rounded border border-border bg-card/40 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Transcript</div>
            <div className="whitespace-pre-wrap text-xs text-foreground/90 max-h-48 overflow-y-auto">{piece.body}</div>
          </div>
        )}

        <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-accent" />AI coach review</div>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Thinking…" : "Re-analyze"}
            </Button>
          </div>
          {isLoading || isFetching ? (
            <div className="text-xs text-muted-foreground">Analyzing transcript and metrics…</div>
          ) : coaching ? (
            <div className="space-y-3 text-sm">
              <div>{coaching.summary}</div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-success,oklch(0.7_0.16_150))] mb-1">What worked</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">How to improve</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-accent mb-1">Try these hooks next time</div>
                <ul className="list-disc pl-5 space-y-1 text-xs">{coaching.next_hook_ideas.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No review yet.</div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(piece)}><Pencil className="h-3 w-3" />Edit piece</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

