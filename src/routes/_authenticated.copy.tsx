import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { generateCopyFn, reviewCopyFn, suggestAnglesFn, extractFingerprintFn } from "@/lib/copy-os.functions";
import { Sparkles, Wand2, Search, Plus, Trash2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/copy")({
  component: CopyOSPage,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (typeof s.tab === "string" ? s.tab : "generate") as string,
    type: (typeof s.type === "string" ? s.type : "") as string,
  }),
});

const COPY_TYPES: { value: string; label: string }[] = [
  { value: "story_sequence", label: "Story sequence" },
  { value: "email_sequence", label: "Email sequence" },
  { value: "email_single", label: "Single email" },
  { value: "short_form_hook", label: "Short-form hook (3-5)" },
  { value: "short_form_script", label: "Short-form reel script" },
  { value: "long_form_reel", label: "Long-form reel script" },
  { value: "vsl_script", label: "VSL script" },
  { value: "sales_page", label: "Sales page" },
  { value: "dm_outreach", label: "DM outreach" },
  { value: "youtube_hook", label: "YouTube hook/title" },
  { value: "sms", label: "SMS" },
  { value: "lead_magnet", label: "Lead magnet" },
  { value: "music_video_concept", label: "Music video concept" },
];

function useClients() {
  return useQuery({
    queryKey: ["copy_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("copy_clients").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useSwipes() {
  return useQuery({
    queryKey: ["copy_swipes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("copy_swipes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function CopyOSPage() {
  return (
    <div className="flex-1 min-w-0">
      <TopBar title="CopyOS" subtitle="KJ-framework-trained copy, calibrated to each client's voice." />
      <div className="p-4 md:p-6">
        <Tabs defaultValue="generate">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="generate"><Wand2 className="h-3.5 w-3.5 mr-1.5" />Generate</TabsTrigger>
            <TabsTrigger value="clients"><FileText className="h-3.5 w-3.5 mr-1.5" />Client DNA</TabsTrigger>
            <TabsTrigger value="swipes"><Search className="h-3.5 w-3.5 mr-1.5" />Swipe library</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="angles"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Angle bank</TabsTrigger>
          </TabsList>
          <TabsContent value="generate" className="mt-4"><GenerateTab /></TabsContent>
          <TabsContent value="clients" className="mt-4"><ClientsTab /></TabsContent>
          <TabsContent value="swipes" className="mt-4"><SwipesTab /></TabsContent>
          <TabsContent value="review" className="mt-4"><ReviewTab /></TabsContent>
          <TabsContent value="angles" className="mt-4"><AnglesTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GenerateTab() {
  const { data: clients = [] } = useClients();
  const { data: swipes = [] } = useSwipes();
  const [clientId, setClientId] = useState<string>("");
  const [copyType, setCopyType] = useState<string>("short_form_hook");
  const [goal, setGoal] = useState("");
  const [angle, setAngle] = useState("");
  const [brief, setBrief] = useState("");
  const [selectedSwipes, setSelectedSwipes] = useState<string[]>([]);
  const [output, setOutput] = useState("");
  const genFn = useServerFn(generateCopyFn);
  const m = useMutation({
    mutationFn: () => genFn({ data: {
      client_id: clientId || null, copy_type: copyType as any,
      goal: goal || null, angle: angle || null, brief: brief || null,
      swipe_ids: selectedSwipes,
    }}),
    onSuccess: (r) => { setOutput(r.output); toast.success("Generated."); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Client</label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="(no client — KJ house voice)" /></SelectTrigger>
            <SelectContent>
              {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Copy type</label>
          <Select value={copyType} onValueChange={setCopyType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {COPY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Goal (CTA / outcome)</label>
          <Input value={goal} onChange={e => setGoal(e.target.value)} placeholder="Book a call / reply to DM / click link" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Angle (optional)</label>
          <Input value={angle} onChange={e => setAngle(e.target.value)} placeholder="Leave blank for AI to suggest" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Brief</label>
          <Textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4} placeholder="What is this piece about? Any specifics, offer details, deadlines, etc." />
        </div>
        {swipes.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">Reference swipes (max 5)</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {swipes.slice(0, 30).map(s => {
                const sel = selectedSwipes.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => {
                    setSelectedSwipes(prev => sel ? prev.filter(x => x !== s.id) : prev.length < 5 ? [...prev, s.id] : prev);
                  }} className={`text-[11px] px-2 py-1 rounded border ${sel ? "bg-primary/20 border-primary" : "border-border"}`}>
                    {s.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Button onClick={() => m.mutate()} disabled={m.isPending} className="w-full">
          <Wand2 className="h-4 w-4 mr-2" />{m.isPending ? "Generating…" : "Generate copy"}
        </Button>
      </Card>
      <Card className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Output</div>
        {output ? (
          <pre className="whitespace-pre-wrap text-sm font-sans">{output}</pre>
        ) : (
          <div className="text-sm text-muted-foreground">Run a generation to see output here.</div>
        )}
        {output && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}>Copy to clipboard</Button>
        )}
      </Card>
    </div>
  );
}

function ClientsTab() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [editing, setEditing] = useState<any | null>(null);
  const fpFn = useServerFn(extractFingerprintFn);

  const save = async (row: any) => {
    const payload = {
      display_name: row.display_name, niche: row.niche || null,
      sacred_cows: row.sacred_cows || null, competitors: row.competitors || null,
      voice_transcripts: row.voice_transcripts || null, notes: row.notes || null,
      offer_details: row.offer_details ?? {}, avatar_research: row.avatar_research ?? {},
    };
    if (row.id) {
      const { error } = await supabase.from("copy_clients").update(payload).eq("id", row.id);
      if (error) return toast.error(error.message);
    } else {
      const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
      if (!m?.org_id) return toast.error("No workspace");
      const { error } = await supabase.from("copy_clients").insert({ ...payload, org_id: m.org_id });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["copy_clients"] });
    setEditing(null);
    toast.success("Saved");
  };

  const del = async (id: string) => {
    if (!confirm("Delete this client DNA?")) return;
    await supabase.from("copy_clients").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["copy_clients"] });
  };

  if (editing) {
    return (
      <Card className="p-4 space-y-3 max-w-3xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Name</label><Input value={editing.display_name ?? ""} onChange={e => setEditing({ ...editing, display_name: e.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Niche</label><Input value={editing.niche ?? ""} onChange={e => setEditing({ ...editing, niche: e.target.value })} /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Offer details (promise, mechanism, price, objections)</label>
          <Textarea rows={3} value={editing._offer_text ?? JSON.stringify(editing.offer_details ?? {}, null, 2)} onChange={e => {
            try { setEditing({ ...editing, offer_details: JSON.parse(e.target.value), _offer_text: e.target.value }); }
            catch { setEditing({ ...editing, _offer_text: e.target.value }); }
          }} placeholder='{"promise":"...","mechanism":"...","price":"...","objections":["..."]}' />
        </div>
        <div><label className="text-xs text-muted-foreground">Avatar — customer bubble (dreams, fears, suspicions, past failures, enemies)</label>
          <Textarea rows={3} value={editing._avatar_text ?? JSON.stringify(editing.avatar_research ?? {}, null, 2)} onChange={e => {
            try { setEditing({ ...editing, avatar_research: JSON.parse(e.target.value), _avatar_text: e.target.value }); }
            catch { setEditing({ ...editing, _avatar_text: e.target.value }); }
          }} placeholder='{"dreams":"...","fears":"...","suspicions":"...","past_failures":"...","enemies":"..."}' />
        </div>
        <div><label className="text-xs text-muted-foreground">Sacred cows they kill</label>
          <Textarea rows={2} value={editing.sacred_cows ?? ""} onChange={e => setEditing({ ...editing, sacred_cows: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Competitors / enemies</label>
          <Textarea rows={2} value={editing.competitors ?? ""} onChange={e => setEditing({ ...editing, competitors: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Voice transcripts (paste their existing video transcripts)</label>
          <Textarea rows={6} value={editing.voice_transcripts ?? ""} onChange={e => setEditing({ ...editing, voice_transcripts: e.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Notes</label>
          <Textarea rows={2} value={editing.notes ?? ""} onChange={e => setEditing({ ...editing, notes: e.target.value })} /></div>
        {editing.voice_fingerprint && (
          <div className="text-xs"><Badge variant="outline">Voice fingerprint extracted</Badge>
            <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded max-h-32 overflow-auto">{JSON.stringify(editing.voice_fingerprint, null, 2)}</pre></div>
        )}
        <div className="flex gap-2">
          <Button onClick={() => save(editing)}>Save</Button>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          {editing.id && editing.voice_transcripts && (
            <Button variant="outline" onClick={async () => {
              try { const fp = await fpFn({ data: { client_id: editing.id } }); setEditing({ ...editing, voice_fingerprint: fp }); toast.success("Voice fingerprint extracted"); qc.invalidateQueries({ queryKey: ["copy_clients"] }); }
              catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}>Extract voice fingerprint</Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => setEditing({ display_name: "", offer_details: {}, avatar_research: {} })}><Plus className="h-4 w-4 mr-1" />New client DNA</Button>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clients.map(c => (
          <Card key={c.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{c.display_name}</div>
                {c.niche && <div className="text-xs text-muted-foreground truncate">{c.niche}</div>}
              </div>
              <button onClick={() => del(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex gap-1 mt-2 flex-wrap">
              {c.voice_fingerprint && <Badge variant="outline" className="text-[10px]">Voice ✓</Badge>}
              {c.avatar_research && Object.keys(c.avatar_research).length > 0 && <Badge variant="outline" className="text-[10px]">Avatar ✓</Badge>}
            </div>
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setEditing(c)}>Edit</Button>
          </Card>
        ))}
        {clients.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No clients yet. Add one to start generating copy in their voice.</div>}
      </div>
    </div>
  );
}

function SwipesTab() {
  const qc = useQueryClient();
  const { data: swipes = [] } = useSwipes();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const filtered = swipes.filter((s: any) => {
    if (!q) return true;
    const hay = `${s.title} ${s.copy_type} ${s.angle ?? ""} ${s.emotion ?? ""} ${s.body}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const save = async (row: any) => {
    const payload = { title: row.title, copy_type: row.copy_type, angle: row.angle || null, emotion: row.emotion || null, body: row.body, source: row.source || null, tags: row.tags ?? [] };
    if (row.id) await supabase.from("copy_swipes").update(payload).eq("id", row.id);
    else {
      const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
      if (!m?.org_id) return toast.error("No workspace");
      await supabase.from("copy_swipes").insert({ ...payload, org_id: m.org_id });
    }
    qc.invalidateQueries({ queryKey: ["copy_swipes"] });
    setEditing(null);
  };

  if (editing) {
    return (
      <Card className="p-4 space-y-3 max-w-2xl">
        <Input placeholder="Title" value={editing.title ?? ""} onChange={e => setEditing({ ...editing, title: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <Select value={editing.copy_type ?? ""} onValueChange={v => setEditing({ ...editing, copy_type: v })}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>{COPY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Angle" value={editing.angle ?? ""} onChange={e => setEditing({ ...editing, angle: e.target.value })} />
          <Input placeholder="Emotion (urgency, curiosity…)" value={editing.emotion ?? ""} onChange={e => setEditing({ ...editing, emotion: e.target.value })} />
        </div>
        <Textarea rows={8} placeholder="Swipe body" value={editing.body ?? ""} onChange={e => setEditing({ ...editing, body: e.target.value })} />
        <Input placeholder="Source (optional)" value={editing.source ?? ""} onChange={e => setEditing({ ...editing, source: e.target.value })} />
        <div className="flex gap-2"><Button onClick={() => save(editing)}>Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search swipes…" value={q} onChange={e => setQ(e.target.value)} />
        <Button size="sm" onClick={() => setEditing({ copy_type: "email_single" })}><Plus className="h-4 w-4 mr-1" />Add swipe</Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((s: any) => (
          <Card key={s.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.title}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{s.copy_type}</Badge>
                  {s.angle && <Badge variant="outline" className="text-[10px]">{s.angle}</Badge>}
                  {s.emotion && <Badge variant="outline" className="text-[10px]">{s.emotion}</Badge>}
                </div>
              </div>
              <button onClick={async () => { await supabase.from("copy_swipes").delete().eq("id", s.id); qc.invalidateQueries({ queryKey: ["copy_swipes"] }); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="text-xs text-muted-foreground mt-2 line-clamp-4 whitespace-pre-wrap">{s.body}</div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEditing(s)}>Edit</Button>
          </Card>
        ))}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No swipes match.</div>}
      </div>
    </div>
  );
}

function ReviewTab() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [copy, setCopy] = useState("");
  const [result, setResult] = useState<any>(null);
  const reviewFn = useServerFn(reviewCopyFn);
  const m = useMutation({
    mutationFn: () => reviewFn({ data: { copy, client_id: clientId || null } }),
    onSuccess: (r) => setResult(r),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger><SelectValue placeholder="Client (optional)" /></SelectTrigger>
          <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea rows={14} placeholder="Paste copy to review…" value={copy} onChange={e => setCopy(e.target.value)} />
        <Button onClick={() => m.mutate()} disabled={m.isPending || copy.length < 10}>{m.isPending ? "Reviewing…" : "Review against KJ frameworks"}</Button>
      </Card>
      <Card className="p-4">
        {!result && <div className="text-sm text-muted-foreground">Review output appears here.</div>}
        {result && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><div className="text-3xl font-semibold">{result.score}</div><div className="text-xs text-muted-foreground">/ 100</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Big Domino</div><div>{result.big_domino}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Strengths</div><ul className="list-disc pl-5 space-y-0.5">{result.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Weaknesses</div><ul className="list-disc pl-5 space-y-0.5">{result.weaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Line edits</div>
              <div className="space-y-2">{result.line_edits.map((e: any, i: number) => (
                <div key={i} className="border-l-2 border-primary/50 pl-2 text-xs"><div className="text-muted-foreground line-through">{e.line}</div><div>{e.fix}</div></div>
              ))}</div>
            </div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Rewrite</div><pre className="whitespace-pre-wrap font-sans">{result.rewrite_suggestion}</pre></div>
          </div>
        )}
      </Card>
    </div>
  );
}

function AnglesTab() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [result, setResult] = useState<any>(null);
  const fn = useServerFn(suggestAnglesFn);
  const m = useMutation({
    mutationFn: () => fn({ data: { client_id: clientId || null, count: 12 } }),
    onSuccess: (r) => setResult(r),
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 max-w-md">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger><SelectValue placeholder="Client (optional)" /></SelectTrigger>
          <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
        </Select>
        <Button onClick={() => m.mutate()} disabled={m.isPending}><Sparkles className="h-4 w-4 mr-1" />{m.isPending ? "Generating…" : "Generate angles"}</Button>
      </div>
      {result && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.angles.map((a: any, i: number) => (
            <Card key={i} className="p-3">
              <Badge variant="outline" className="text-[10px] mb-2">{a.trigger}</Badge>
              <div className="text-sm font-medium">{a.hook}</div>
              <div className="text-xs text-muted-foreground mt-2">→ {a.big_domino}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
