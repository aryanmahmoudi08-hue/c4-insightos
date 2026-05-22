import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Video, Layers, Pencil, ExternalLink, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeContent } from "@/lib/analyze-content.functions";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Platform = Database["public"]["Enums"]["content_platform"];
type Angle = Database["public"]["Enums"]["content_angle"];

type PieceRow = {
  id: string; title: string | null; platform: Platform; hook: string | null;
  angle: Angle | null; posted_at: string | null; url: string | null;
  funnel_stage: string | null; body: string | null;
  content_metrics: { views: number | null; leads_generated: number | null; closes: number | null;
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

  const { data: pieces } = useQuery({
    queryKey: ["content", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, hook, angle, posted_at, url, funnel_stage, body, content_metrics(views, leads_generated, closes, cash_collected_cents, hook_retention_pct)")
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
                <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? "…" : "Save"}</Button>
              </form>
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
                  <tr><th className="text-left p-3">Hook / Title</th><th className="text-left p-3">Platform</th><th className="text-left p-3">Angle</th>
                    <th className="text-center p-3">Funnel</th>
                    <th className="text-center p-3">Link</th>
                    <th className="text-right p-3 font-mono">Views</th><th className="text-right p-3 font-mono">Leads</th>
                    <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash</th>
                    <th className="text-right p-3 font-mono">Retention</th><th className="text-right p-3"></th></tr>
                </thead>
                <tbody>
                  {(pieces ?? []).map((p) => {
                    const m = (p.content_metrics ?? [])[0];
                    return (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                        <td className="p-3">
                          <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{p.title || "(untitled)"}</div>
                              {p.hook && <div className="truncate text-[11px] text-muted-foreground">{p.hook}</div>}
                            </div>
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
                    );
                  })}
                  {(!pieces || pieces.length === 0) && (
                    <tr><td colSpan={11} className="p-10 text-center text-sm text-muted-foreground">No content yet. Log your first piece.</td></tr>
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
                            {slot.pieces.slice(0, 3).map(p => (
                              <div key={p.id} className="truncate rounded bg-accent/15 text-accent px-1 py-0.5" title={p.title ?? ""}>
                                {p.title ?? p.platform}
                              </div>
                            ))}
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
    </>
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
