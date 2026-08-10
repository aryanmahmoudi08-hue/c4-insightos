import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { SlimHeader } from "@/components/slim-header";
import { Sparkline } from "@/components/sparkline";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Video, Plus, Upload, Wand2, Loader2, TrendingDown, TrendingUp, Save, Play, Mic, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listVsls, upsertVsl, deleteVsl, listSnapshots, addSnapshot,
  importCsvRows, analyzeVsl, transcribeAudio, type VslKind,
} from "@/lib/vsl.functions";

export const Route = createFileRoute("/_authenticated/vsl")({ component: VslPage });

const KIND_LABEL: Record<VslKind, string> = {
  main: "Main VSL",
  webinar: "Webinar VSL",
  post_booking: "Post-booking Confirmation",
};
const KIND_ORDER: VslKind[] = ["main", "webinar", "post_booking"];

function fmtNum(n: number) { return Intl.NumberFormat().format(Math.round(n || 0)); }
function fmtPct(n: number) { return `${(Number(n) || 0).toFixed(1)}%`; }
function mmss(sec: number) { const s = Math.max(0, Math.floor(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }

function VslPage() {
  const load = useServerFn(listVsls);
  const { data: vsls = [], isLoading } = useQuery({ queryKey: ["vsls"], queryFn: () => load() });
  const [kind, setKind] = useState<VslKind>("main");

  const grouped = useMemo(() => {
    const m: Record<VslKind, any[]> = { main: [], webinar: [], post_booking: [] };
    for (const v of vsls as any[]) m[v.kind as VslKind]?.push(v);
    return m;
  }, [vsls]);

  return (
    <>
      <TopBar title="VSL Analytics" subtitle="Wistia performance, drop-off, and script alignment across your video funnel." />
      <div className="p-4 md:p-6 space-y-5">
        <Tabs value={kind} onValueChange={(v) => setKind(v as VslKind)}>
          <TabsList className="w-full justify-start">
            {KIND_ORDER.map(k => (
              <TabsTrigger key={k} value={k} className="gap-2">
                <Video className="h-3.5 w-3.5" />
                {KIND_LABEL[k]}
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono">{grouped[k].length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {KIND_ORDER.map(k => (
            <TabsContent key={k} value={k} className="space-y-4 mt-4">
              <SlimHeader
                icon={<Video className="h-4 w-4" />}
                title={KIND_LABEL[k]}
                subtitle="Import Wistia metrics, drop your transcript, and let AI point at the drop-off."
                right={<NewVslButton kind={k} />}
              />
              {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
              {!isLoading && grouped[k].length === 0 && (
                <EmptyState
                  icon={<Video className="h-6 w-6" />}
                  title={`No ${KIND_LABEL[k]} yet`}
                  description="Create one, paste its Wistia sheet, and start tracking play rate, retention, and drop-off timestamps."
                />
              )}
              {grouped[k].map((v: any) => <VslCard key={v.id} vsl={v} />)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </>
  );
}

function NewVslButton({ kind }: { kind: VslKind }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertVsl);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [wid, setWid] = useState("");
  const [sheet, setSheet] = useState("");
  const m = useMutation({
    mutationFn: async () => upsert({ data: { kind, name: name.trim(), wistia_video_id: wid.trim() || undefined, sheet_url: sheet.trim() || undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vsls"] }); toast.success("VSL added"); setOpen(false); setName(""); setWid(""); setSheet(""); },
    onError: (e: any) => toast.error(e.message || "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New {KIND_LABEL[kind]}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main offer VSL v3" /></div>
          <div><Label>Wistia video ID (optional)</Label><Input value={wid} onChange={e => setWid(e.target.value)} placeholder="abc123xyz" /></div>
          <div><Label>Google Sheet URL (optional, for reference)</Label><Input value={sheet} onChange={e => setSheet(e.target.value)} placeholder="https://docs.google.com/spreadsheets/…" /></div>
          <Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending} className="w-full">
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VslCard({ vsl }: { vsl: any }) {
  const qc = useQueryClient();
  const loadSnaps = useServerFn(listSnapshots);
  const analyze = useServerFn(analyzeVsl);
  const del = useServerFn(deleteVsl);
  const [insights, setInsights] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const { data: snaps = [] } = useQuery({
    queryKey: ["vsl_snaps", vsl.id],
    queryFn: () => loadSnaps({ data: { vsl_id: vsl.id } }),
  });
  const latest = snaps[0];
  const history = [...snaps].reverse();
  const spark = (k: string) => history.map((s: any) => Number(s[k] ?? 0));

  const onAnalyze = async () => {
    setAnalyzing(true);
    try { setInsights(await analyze({ data: { vsl_id: vsl.id } })); toast.success("Analysis ready"); }
    catch (e: any) { toast.error(e.message || "Analysis failed"); }
    finally { setAnalyzing(false); }
  };
  const onDelete = async () => {
    if (!confirm(`Delete "${vsl.name}"? Snapshots will also be removed.`)) return;
    try {
      await del({ data: { id: vsl.id } });
      qc.invalidateQueries({ queryKey: ["vsls"] });
      toast.success("Deleted");
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{vsl.name}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {vsl.wistia_video_id ? `Wistia · ${vsl.wistia_video_id}` : "No Wistia ID set"}
            {vsl.sheet_url && <> · <a href={vsl.sheet_url} target="_blank" rel="noreferrer" className="underline">Sheet</a></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onAnalyze} disabled={analyzing} className="gap-1.5">
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />} AI Analyze
          </Button>
          <ImportDialog vslId={vsl.id} />
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4">
        <StatCard label="Total plays" value={latest ? fmtNum(latest.total_plays) : "—"} hint={<Sparkline data={spark("total_plays")} /> as any} />
        <StatCard label="Unique viewers" value={latest ? fmtNum(latest.unique_viewers) : "—"} accent="accent" hint={<Sparkline data={spark("unique_viewers")} /> as any} />
        <StatCard label="Play rate" value={latest ? fmtPct(latest.play_rate) : "—"} accent="success" hint={<Sparkline data={spark("play_rate")} /> as any} />
        <StatCard label="Avg % watched" value={latest ? fmtPct(latest.avg_percent_watched) : "—"} accent={latest && latest.avg_percent_watched < 40 ? "destructive" : "success"} hint={<Sparkline data={spark("avg_percent_watched")} /> as any} />
        <StatCard label="Page loads" value={latest ? fmtNum(latest.page_loads) : "—"} hint={<Sparkline data={spark("page_loads")} /> as any} />
      </div>

      {insights && <InsightsBlock insights={insights} />}

      <ScriptTranscriptEditor vsl={vsl} />
    </div>
  );
}

function InsightsBlock({ insights }: { insights: any }) {
  return (
    <div className="border-t border-border p-4 space-y-3 bg-muted/20 animate-in fade-in-0 slide-in-from-top-1 duration-300">
      {insights.headline && <div className="text-sm font-medium">{insights.headline}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive mb-1.5"><TrendingDown className="h-3 w-3" /> Bottlenecks</div>
          <ul className="space-y-2">
            {(insights.bottlenecks ?? []).map((b: any, i: number) => (
              <li key={i} className="rounded border border-destructive/20 bg-destructive/5 p-2 text-xs">
                <div className="font-semibold">{b.title}</div>
                <div className="text-muted-foreground mt-0.5">{b.body}</div>
                {b.recommendation && <div className="mt-1 text-foreground">→ {b.recommendation}</div>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--color-success)] mb-1.5"><TrendingUp className="h-3 w-3" /> Double down</div>
          <ul className="space-y-2">
            {(insights.double_down ?? []).map((b: any, i: number) => (
              <li key={i} className="rounded border border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/5 p-2 text-xs">
                <div className="font-semibold">{b.title}</div>
                <div className="text-muted-foreground mt-0.5">{b.body}</div>
                {b.recommendation && <div className="mt-1 text-foreground">→ {b.recommendation}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {insights.drop_off_moments?.length ? (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Drop-off moments</div>
          <div className="flex flex-wrap gap-1.5">
            {insights.drop_off_moments.map((d: any, i: number) => (
              <span key={i} className="rounded bg-background border border-border px-2 py-1 text-[11px]">
                <span className="font-mono text-destructive">{d.timestamp}</span> · {d.why}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImportDialog({ vslId }: { vslId: string }) {
  const qc = useQueryClient();
  const csv = useServerFn(importCsvRows);
  const one = useServerFn(addSnapshot);
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [form, setForm] = useState({ total_plays: "", unique_viewers: "", play_rate: "", avg_percent_watched: "", page_loads: "" });

  const doCsv = useMutation({
    mutationFn: async () => csv({ data: { vsl_id: vslId, csv: csvText } }),
    onSuccess: (r: any) => { toast.success(`Imported ${r.inserted} rows`); qc.invalidateQueries({ queryKey: ["vsl_snaps", vslId] }); setOpen(false); setCsvText(""); },
    onError: (e: any) => toast.error(e.message),
  });
  const doOne = useMutation({
    mutationFn: async () => one({ data: {
      vsl_id: vslId,
      total_plays: Number(form.total_plays) || 0,
      unique_viewers: Number(form.unique_viewers) || 0,
      play_rate: Number(form.play_rate) || 0,
      avg_percent_watched: Number(form.avg_percent_watched) || 0,
      page_loads: Number(form.page_loads) || 0,
    } }),
    onSuccess: () => { toast.success("Snapshot added"); qc.invalidateQueries({ queryKey: ["vsl_snaps", vslId] }); setOpen(false); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Import</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import Wistia metrics</DialogTitle></DialogHeader>
        <Tabs defaultValue="csv">
          <TabsList><TabsTrigger value="csv">Paste sheet (CSV)</TabsTrigger><TabsTrigger value="manual">Manual entry</TabsTrigger></TabsList>
          <TabsContent value="csv" className="space-y-2">
            <div className="text-[11px] text-muted-foreground">
              Copy-paste rows from your Google Sheet. Recognized columns: <span className="font-mono">video_name, plays, unique_visitors, play_rate, avg_percent_watched, page_loads, last_updated</span>.
              Include the header row.
            </div>
            <Textarea rows={10} value={csvText} onChange={e => setCsvText(e.target.value)} placeholder={"video_name,plays,unique_visitors,play_rate,avg_percent_watched,page_loads,last_updated\nMain VSL v3,1240,910,73.4,42.1,1690,2026-07-04"} className="font-mono text-xs" />
            <Button className="w-full" disabled={!csvText.trim() || doCsv.isPending} onClick={() => doCsv.mutate()}>
              {doCsv.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import CSV"}
            </Button>
          </TabsContent>
          <TabsContent value="manual" className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(form) as Array<keyof typeof form>).map(k => (
                <div key={k}>
                  <Label className="text-[11px] capitalize">{k.replace(/_/g, " ")}</Label>
                  <Input type="number" step="any" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                </div>
              ))}
            </div>
            <Button className="w-full" disabled={doOne.isPending} onClick={() => doOne.mutate()}>
              {doOne.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add snapshot"}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ScriptTranscriptEditor({ vsl }: { vsl: any }) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertVsl);
  const trans = useServerFn(transcribeAudio);
  const [script, setScript] = useState<string>(vsl.script || "");
  const [transcriptText, setTranscriptText] = useState<string>(() => {
    const arr = Array.isArray(vsl.transcript_json) ? vsl.transcript_json : [];
    return arr.map((l: any) => `[${mmss(l.t)}] ${l.text}`).join("\n");
  });
  const [uploading, setUploading] = useState(false);

  const parseTranscript = (txt: string) => {
    const out: Array<{ t: number; text: string }> = [];
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*(.*)$/);
      if (!m) { if (line.trim()) out.push({ t: out.length ? out[out.length - 1].t + 5 : 0, text: line.trim() }); continue; }
      const h = m[3] ? Number(m[1]) : 0;
      const mm = m[3] ? Number(m[2]) : Number(m[1]);
      const ss = m[3] ? Number(m[3]) : Number(m[2]);
      out.push({ t: h * 3600 + mm * 60 + ss, text: m[4].trim() });
    }
    return out;
  };

  const save = useMutation({
    mutationFn: async () => upsert({ data: {
      id: vsl.id, kind: vsl.kind, name: vsl.name,
      wistia_video_id: vsl.wistia_video_id ?? undefined,
      sheet_url: vsl.sheet_url ?? undefined,
      script, transcript_json: parseTranscript(transcriptText),
    } }),
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["vsls"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const onFile = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast.error("File must be under 25 MB");
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const r: any = await trans({ data: { vsl_id: vsl.id, filename: file.name, mime: file.type || "audio/mpeg", base64 } });
      toast.success(`Transcribed ${r.lines} lines`);
      qc.invalidateQueries({ queryKey: ["vsls"] });
    } catch (e: any) { toast.error(e.message || "Transcription failed"); }
    finally { setUploading(false); }
  };

  return (
    <div className="border-t border-border p-4">
      <Tabs defaultValue="transcript">
        <TabsList>
          <TabsTrigger value="transcript">Transcript · timeline</TabsTrigger>
          <TabsTrigger value="script">Raw script</TabsTrigger>
        </TabsList>
        <TabsContent value="transcript" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-muted-foreground">
              One line per beat. Prefix with <span className="font-mono">[m:ss]</span> to lock a timestamp. Match drop-off moments to what's being said.
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs cursor-pointer hover:bg-muted">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                Auto-transcribe
                <input type="file" accept="audio/*,video/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ""; }} />
              </label>
              <Button size="sm" className="gap-1.5" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
              </Button>
            </div>
          </div>
          <Textarea rows={10} value={transcriptText} onChange={e => setTranscriptText(e.target.value)}
            className="font-mono text-xs"
            placeholder={"[0:00] Hook — you're leaving money on the table if…\n[0:12] Story: last month a client…\n[1:04] Objection handle:…"} />
          <TranscriptPreview txt={transcriptText} />
        </TabsContent>
        <TabsContent value="script" className="space-y-2">
          <Textarea rows={12} value={script} onChange={e => setScript(e.target.value)} placeholder="Paste the full VSL script (no timestamps needed)." />
          <Button size="sm" className="gap-1.5" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save script
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TranscriptPreview({ txt }: { txt: string }) {
  const lines = txt.split(/\r?\n/).filter(l => l.trim()).slice(0, 40);
  if (!lines.length) return null;
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border border-border bg-background/60 divide-y divide-border">
      {lines.map((l, i) => {
        const m = l.match(/^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*(.*)$/);
        return (
          <div key={i} className="flex gap-3 px-2.5 py-1 text-xs">
            <span className="font-mono text-[10px] text-accent w-14 shrink-0 pt-0.5">{m ? m[1] : "—"}</span>
            <span className="min-w-0">{m ? m[2] : l}</span>
          </div>
        );
      })}
    </div>
  );
}
