import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import {
  Sparkles, Wand2, Search, Plus, Trash2, FileText, Video, Mail, BookOpen, MessageSquare,
  Flame, Megaphone, Clapperboard, Music, Smartphone, ScrollText, ImagePlus, X,
} from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/copy")({
  component: CopyOSPage,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: (typeof s.tab === "string" ? s.tab : "generate") as string,
    cat: (typeof s.cat === "string" ? s.cat : "content") as string,
    type: (typeof s.type === "string" ? s.type : "") as string,
  }),
});

type CopyTypeDef = { value: string; label: string; icon: typeof Video; desc: string };

const CATEGORIES: Record<string, {
  label: string;
  blurb: string;
  accent: string;       // tailwind ring / border accent
  bgGradient: string;   // hero card gradient
  icon: typeof Video;
  types: CopyTypeDef[];
  fields: Array<{ key: string; label: string; placeholder: string; rows?: number }>;
}> = {
  content: {
    label: "Content",
    blurb: "Short-form hooks, reels, and platform scripts built to stop the scroll in 3 seconds.",
    accent: "border-orange-500/40",
    bgGradient: "from-orange-500/15 via-orange-500/5 to-transparent",
    icon: Video,
    types: [
      { value: "short_form_hook", label: "Hooks (3-5)", icon: Flame, desc: "Pattern-interrupt openers with curiosity + relevance baked in." },
      { value: "short_form_script", label: "Reel / TikTok script", icon: Clapperboard, desc: "Hook → tension → payoff → soft CTA in under 60s." },
      { value: "long_form_reel", label: "Long-form reel (90s+)", icon: Video, desc: "Story-led, mid-funnel reel built to hold for 90s+." },
      { value: "youtube_hook", label: "YouTube hook + title", icon: Megaphone, desc: "Title, thumbnail copy, and 15s spoken hook." },
      { value: "music_video_concept", label: "Music video concept", icon: Music, desc: "Visual concept doc — scenes, beats, hooks." },
    ],
    fields: [
      { key: "platform", label: "Platform", placeholder: "Reels / TikTok / Shorts / YouTube" },
      { key: "duration", label: "Target length", placeholder: "15s, 60s, 3min…" },
      { key: "brief", label: "Topic / angle brief", placeholder: "What's this piece about? What insight, story, or hot take?", rows: 4 },
    ],
  },
  long: {
    label: "Long-form",
    blurb: "Sales pages, VSLs, and lead magnets engineered around one Big Domino — the single belief the reader must accept to buy.",
    accent: "border-amber-500/40",
    bgGradient: "from-amber-500/15 via-amber-500/5 to-transparent",
    icon: BookOpen,
    types: [
      { value: "sales_page", label: "Sales page", icon: ScrollText, desc: "Full long-form sales letter — promise to CTA." },
      { value: "vsl_script", label: "VSL script", icon: Clapperboard, desc: "Spoken VSL with opener, mechanism, proof, stack, close." },
      { value: "lead_magnet", label: "Lead magnet", icon: FileText, desc: "Front-end PDF/guide that pre-sells the next step." },
    ],
    fields: [
      { key: "promise", label: "Headline promise", placeholder: "What does the reader walk away with?" },
      { key: "mechanism", label: "Mechanism / unique angle", placeholder: "Why this works when nothing else has" },
      { key: "objections", label: "Top objections to crush", placeholder: "It's too expensive, I've tried this before, won't work for me…", rows: 3 },
      { key: "brief", label: "Offer details", placeholder: "Price, what's included, deadline, bonuses…", rows: 4 },
    ],
  },
  story: {
    label: "Story Sequences",
    blurb: "Multi-part backstory → journey → new opportunity arcs. Pull the reader through 3-5 connected pieces until the buy feels inevitable.",
    accent: "border-violet-500/40",
    bgGradient: "from-violet-500/15 via-violet-500/5 to-transparent",
    icon: BookOpen,
    types: [
      { value: "story_sequence_full", label: "Full 5-part sequence", icon: BookOpen, desc: "Backstory · journey · enemy reveal · new opportunity · CTA." },
      { value: "story_sequence_mini", label: "3-part mini arc", icon: BookOpen, desc: "Tighter 3-beat arc for warm audiences." },
      { value: "story_sequence_origin", label: "Origin story", icon: BookOpen, desc: "Single piece — the founding story that justifies the offer." },
    ],

    fields: [
      { key: "hero_state", label: "Where the hero is right now", placeholder: "The painful before-state your reader recognises themselves in" },
      { key: "turning_point", label: "Turning point / new opportunity", placeholder: "What changed? What did they discover?" },
      { key: "enemy", label: "The enemy / villain to name", placeholder: "What/who is to blame for the reader's current pain?" },
      { key: "promised_land", label: "Promised land", placeholder: "What the hero (and the reader) gets on the other side", rows: 2 },
      { key: "brief", label: "Offer it leads to", placeholder: "What we want them to do at the end of the sequence", rows: 3 },
    ],
  },
  email: {
    label: "Email / SMS",
    blurb: "Subject-line forward inbox copy and 160-character SMS that gets replies, not unsubs.",
    accent: "border-sky-500/40",
    bgGradient: "from-sky-500/15 via-sky-500/5 to-transparent",
    icon: Mail,
    types: [
      { value: "email_single", label: "Single email", icon: Mail, desc: "One inbox-ready email with subject + preview text." },
      { value: "email_sequence", label: "Email sequence (5)", icon: Mail, desc: "5-email indoctrination or promo arc." },
      { value: "sms", label: "SMS broadcast", icon: Smartphone, desc: "1-3 SMS variants under 160 chars." },
    ],
    fields: [
      { key: "subject_goal", label: "Subject line goal", placeholder: "Open the email — curiosity / urgency / pattern interrupt" },
      { key: "send_context", label: "Send context", placeholder: "What did they last hear from us? Where are they in the funnel?" },
      { key: "brief", label: "What this email/SMS is about", placeholder: "The core message + CTA", rows: 4 },
    ],
  },
};


const ALL_TYPES = Object.values(CATEGORIES).flatMap(c => c.types);

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
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const tab = search.tab || "generate";
  return (
    <div className="flex-1 min-w-0">
      <TopBar title="CopyOS" subtitle="Persuasion-trained copy, calibrated to each client's voice." />
      <div className="p-4 md:p-6">
        <Tabs value={tab} onValueChange={(v) => nav({ search: (prev: Record<string, string>) => ({ ...prev, tab: v }) as never, replace: true })}>
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
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const catKey = (search.cat && CATEGORIES[search.cat]) ? search.cat : "content";
  const cat = CATEGORIES[catKey];

  const [clientId, setClientId] = useState<string>("");
  const [copyType, setCopyType] = useState<string>(search.type || cat.types[0].value);
  // Keep copyType inside the current category's options.
  useEffect(() => {
    if (search.type && cat.types.some(t => t.value === search.type)) {
      setCopyType(search.type);
    } else if (!cat.types.some(t => t.value === copyType)) {
      setCopyType(cat.types[0].value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catKey, search.type]);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [angle, setAngle] = useState("");
  const [goal, setGoal] = useState("");
  const [selectedSwipes, setSelectedSwipes] = useState<string[]>([]);
  const [output, setOutput] = useState("");

  // Reset per-category fields when category changes.
  useEffect(() => { setFields({}); setOutput(""); }, [catKey]);

  const Icon = cat.icon;
  const CopyIcon = cat.types.find(t => t.value === copyType)?.icon ?? Icon;

  const briefBlob = [
    ...cat.fields.map(f => fields[f.key] ? `${f.label}: ${fields[f.key]}` : "").filter(Boolean),
  ].join("\n");

  const genFn = useServerFn(generateCopyFn);
  const m = useMutation({
    mutationFn: () => genFn({ data: {
      client_id: clientId || null, copy_type: copyType as never,
      goal: goal || null, angle: angle || null, brief: briefBlob || null,
      swipe_ids: selectedSwipes,
    }}),
    onSuccess: (r) => { setOutput(r.output); toast.success("Generated."); },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      {/* Category hero — distinct per category */}
      <Card className={cn("p-5 border bg-gradient-to-br relative overflow-hidden", cat.accent, cat.bgGradient)}>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-background/40 backdrop-blur p-3 border border-border/50">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="eyebrow">CopyOS · Generate</div>
            <h2 className="display-serif text-2xl mt-1">{cat.label}</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{cat.blurb}</p>
          </div>
          {/* Category switcher pills */}
          <div className="hidden md:flex gap-1">
            {Object.entries(CATEGORIES).map(([key, c]) => {
              const CIcon = c.icon;
              const active = key === catKey;
              return (
                <button
                  key={key}
                  onClick={() => nav({ search: (prev: Record<string, string>) => ({ ...prev, tab: "generate", cat: key }) as never, replace: true })}
                  className={cn(
                    "text-xs px-2.5 py-1.5 rounded-md border inline-flex items-center gap-1.5 transition",
                    active ? "bg-background/70 border-border" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-background/40",
                  )}
                >
                  <CIcon className="h-3.5 w-3.5" /> {c.label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Copy-type chooser — distinct cards per type, not just a dropdown */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {cat.types.map(t => {
          const TIcon = t.icon;
          const active = t.value === copyType;
          return (
            <button
              key={t.value}
              onClick={() => setCopyType(t.value)}
              className={cn(
                "text-left rounded-lg border p-3 transition",
                active ? cn("border-primary bg-primary/5 ring-1 ring-primary/40") : "border-border hover:border-border/80 hover:bg-card",
              )}
            >
              <div className="flex items-center gap-2">
                <TIcon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                <div className="text-sm font-medium">{t.label}</div>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <CopyIcon className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">{cat.types.find(t => t.value === copyType)?.label} brief</div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Client voice</label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="(no client — house voice)" /></SelectTrigger>
              <SelectContent>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">CTA / outcome</label>
            <Input value={goal} onChange={e => setGoal(e.target.value)}
              placeholder={catKey === "email" ? "Reply / click / book a call" : catKey === "long" ? "Buy / apply / book strategy call" : "Comment / DM / save / share"} />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Angle (optional — leave blank to let the AI pick)</label>
            <Input value={angle} onChange={e => setAngle(e.target.value)} placeholder="Hot take, contrarian angle, story angle…" />
          </div>

          {/* Category-tailored fields */}
          {cat.fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              {f.rows ? (
                <Textarea rows={f.rows} value={fields[f.key] ?? ""} onChange={e => setFields(s => ({ ...s, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              ) : (
                <Input value={fields[f.key] ?? ""} onChange={e => setFields(s => ({ ...s, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              )}
            </div>
          ))}

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
            <Wand2 className="h-4 w-4 mr-2" />{m.isPending ? "Writing…" : `Write ${cat.types.find(t => t.value === copyType)?.label.toLowerCase()}`}
          </Button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Output</div>
            {output && (
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(output); toast.success("Copied"); }}>Copy</Button>
            )}
          </div>
          {output ? (
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">{output}</pre>
          ) : (
            <div className="text-sm text-muted-foreground">
              Hit "Write" — output lands here. Every line is engineered to move the reader one inch closer to the CTA.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function ClientsTab() {
  const qc = useQueryClient();
  const { data: clients = [] } = useClients();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const fpFn = useServerFn(extractFingerprintFn);

  const save = async (row: Record<string, unknown>) => {
    const payload = {
      display_name: row.display_name as string, niche: (row.niche as string) || null,
      sacred_cows: (row.sacred_cows as string) || null, competitors: (row.competitors as string) || null,
      voice_transcripts: (row.voice_transcripts as string) || null, notes: (row.notes as string) || null,
      offer_details: (row.offer_details ?? {}) as never, avatar_research: (row.avatar_research ?? {}) as never,
    };
    if (row.id) {
      const { error } = await (supabase.from("copy_clients") as never as { update: (p: unknown) => { eq: (k: string, v: string) => Promise<{ error: { message: string } | null }> } }).update(payload).eq("id", row.id as string);
      if (error) return toast.error(error.message);
    } else {
      const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
      if (!m?.org_id) return toast.error("No workspace");
      const { error } = await (supabase.from("copy_clients") as never as { insert: (p: unknown) => Promise<{ error: { message: string } | null }> }).insert({ ...payload, org_id: m.org_id });
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
    const e = editing as Record<string, unknown> & { _offer_text?: string; _avatar_text?: string };
    return (
      <Card className="p-4 space-y-3 max-w-3xl">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-muted-foreground">Name</label><Input value={(e.display_name as string) ?? ""} onChange={ev => setEditing({ ...e, display_name: ev.target.value })} /></div>
          <div><label className="text-xs text-muted-foreground">Niche</label><Input value={(e.niche as string) ?? ""} onChange={ev => setEditing({ ...e, niche: ev.target.value })} /></div>
        </div>
        <div><label className="text-xs text-muted-foreground">Offer details (promise, mechanism, price, objections)</label>
          <Textarea rows={3} value={e._offer_text ?? JSON.stringify(e.offer_details ?? {}, null, 2)} onChange={ev => {
            try { setEditing({ ...e, offer_details: JSON.parse(ev.target.value), _offer_text: ev.target.value }); }
            catch { setEditing({ ...e, _offer_text: ev.target.value }); }
          }} placeholder='{"promise":"...","mechanism":"...","price":"...","objections":["..."]}' />
        </div>
        <div><label className="text-xs text-muted-foreground">Avatar — dreams, fears, suspicions, past failures, enemies</label>
          <Textarea rows={3} value={e._avatar_text ?? JSON.stringify(e.avatar_research ?? {}, null, 2)} onChange={ev => {
            try { setEditing({ ...e, avatar_research: JSON.parse(ev.target.value), _avatar_text: ev.target.value }); }
            catch { setEditing({ ...e, _avatar_text: ev.target.value }); }
          }} placeholder='{"dreams":"...","fears":"...","suspicions":"...","past_failures":"...","enemies":"..."}' />
        </div>
        <div><label className="text-xs text-muted-foreground">Sacred cows they kill</label>
          <Textarea rows={2} value={(e.sacred_cows as string) ?? ""} onChange={ev => setEditing({ ...e, sacred_cows: ev.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Competitors / enemies</label>
          <Textarea rows={2} value={(e.competitors as string) ?? ""} onChange={ev => setEditing({ ...e, competitors: ev.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Voice transcripts (paste their existing video transcripts)</label>
          <Textarea rows={6} value={(e.voice_transcripts as string) ?? ""} onChange={ev => setEditing({ ...e, voice_transcripts: ev.target.value })} /></div>
        <div><label className="text-xs text-muted-foreground">Notes</label>
          <Textarea rows={2} value={(e.notes as string) ?? ""} onChange={ev => setEditing({ ...e, notes: ev.target.value })} /></div>
        {e.voice_fingerprint ? (
          <div className="text-xs"><Badge variant="outline">Voice fingerprint extracted</Badge>
            <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded max-h-32 overflow-auto">{JSON.stringify(e.voice_fingerprint, null, 2)}</pre></div>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={() => save(e)}>Save</Button>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          {e.id && e.voice_transcripts ? (
            <Button variant="outline" onClick={async () => {
              try { const fp = await fpFn({ data: { client_id: e.id as string } }); setEditing({ ...e, voice_fingerprint: fp }); toast.success("Voice fingerprint extracted"); qc.invalidateQueries({ queryKey: ["copy_clients"] }); }
              catch (err: unknown) { toast.error((err as Error)?.message ?? "Failed"); }
            }}>Extract voice fingerprint</Button>
          ) : null}
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
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setEditing(c as never)}>Edit</Button>
          </Card>
        ))}
        {clients.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No clients yet. Add one to start writing in their voice.</div>}
      </div>
    </div>
  );
}

function SwipeImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from("copy-swipes").createSignedUrl(path, 3600).then(({ data }) => {
      if (active && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="aspect-square bg-muted rounded animate-pulse" />;
  return <img src={url} alt="swipe" className="aspect-square object-cover rounded border border-border" />;
}

async function uploadSwipeImages(files: File[], orgId: string): Promise<string[]> {
  const paths: string[] = [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const ext = f.name.split(".").pop() || "png";
    const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("copy-swipes").upload(path, f, { contentType: f.type });
    if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
    paths.push(path);
  }
  return paths;
}

function SwipesTab() {
  const qc = useQueryClient();
  const { data: swipes = [] } = useSwipes();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = swipes.filter((s: Record<string, unknown>) => {
    if (!q) return true;
    const hay = `${s.title} ${s.copy_type} ${s.angle ?? ""} ${s.emotion ?? ""} ${s.body}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const save = async (row: Record<string, unknown>) => {
    const payload = {
      title: row.title as string, copy_type: row.copy_type as string,
      angle: (row.angle as string) || null, emotion: (row.emotion as string) || null,
      body: row.body as string, source: (row.source as string) || null,
      tags: (row.tags ?? []) as string[],
      image_urls: (row.image_urls ?? []) as string[],
    };
    if (row.id) await (supabase.from("copy_swipes") as never as { update: (p: unknown) => { eq: (k: string, v: string) => Promise<unknown> } }).update(payload).eq("id", row.id as string);
    else {
      const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
      if (!m?.org_id) return toast.error("No workspace");
      await (supabase.from("copy_swipes") as never as { insert: (p: unknown) => Promise<unknown> }).insert({ ...payload, org_id: m.org_id });
    }
    qc.invalidateQueries({ queryKey: ["copy_swipes"] });
    setEditing(null);
  };

  const handleFiles = async (files: File[]) => {
    if (!editing || files.length === 0) return;
    const { data: m } = await supabase.from("memberships").select("org_id").limit(1).maybeSingle();
    if (!m?.org_id) return toast.error("No workspace");
    const paths = await uploadSwipeImages(files, m.org_id);
    if (paths.length === 0) return;
    const existing = (editing.image_urls ?? []) as string[];
    setEditing({ ...editing, image_urls: [...existing, ...paths] });
    toast.success(`${paths.length} image${paths.length > 1 ? "s" : ""} added`);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); await handleFiles(files); }
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) await handleFiles(files);
  };

  if (editing) {
    const e = editing;
    const images = (e.image_urls ?? []) as string[];
    return (
      <Card className="p-4 space-y-3 max-w-2xl" onPaste={onPaste} onDragOver={ev => ev.preventDefault()} onDrop={onDrop}>
        <Input placeholder="Title" value={(e.title as string) ?? ""} onChange={ev => setEditing({ ...e, title: ev.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <Select value={(e.copy_type as string) ?? ""} onValueChange={v => setEditing({ ...e, copy_type: v })}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>{ALL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Angle" value={(e.angle as string) ?? ""} onChange={ev => setEditing({ ...e, angle: ev.target.value })} />
          <Input placeholder="Emotion (urgency, curiosity…)" value={(e.emotion as string) ?? ""} onChange={ev => setEditing({ ...e, emotion: ev.target.value })} />
        </div>
        <Textarea rows={8} placeholder="Swipe body (paste copy here — or paste images directly into this card)" value={(e.body as string) ?? ""} onChange={ev => setEditing({ ...e, body: ev.target.value })} />
        <Input placeholder="Source (optional)" value={(e.source as string) ?? ""} onChange={ev => setEditing({ ...e, source: ev.target.value })} />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Reference images · paste, drag, or upload</div>
            <Button size="sm" variant="outline" type="button" onClick={() => fileRef.current?.click()}>
              <ImagePlus className="h-3.5 w-3.5 mr-1" />Upload
            </Button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={ev => { const fs = Array.from(ev.target.files ?? []); handleFiles(fs); ev.target.value = ""; }} />
          </div>
          {images.length === 0 ? (
            <div className="border-2 border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground">
              Drop or paste screenshots here (story examples, hooks, ads…)
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {images.map((p) => (
                <div key={p} className="relative group">
                  <SwipeImage path={p} />
                  <button type="button"
                    onClick={() => setEditing({ ...e, image_urls: images.filter(x => x !== p) })}
                    className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5 opacity-0 group-hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2"><Button onClick={() => save(e)}>Save</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input placeholder="Search swipes…" value={q} onChange={e => setQ(e.target.value)} />
        <Button size="sm" onClick={() => setEditing({ copy_type: "email_single", image_urls: [] })}><Plus className="h-4 w-4 mr-1" />Add swipe</Button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {filtered.map((s: Record<string, unknown>) => {
          const imgs = ((s.image_urls ?? []) as string[]);
          return (
          <Card key={s.id as string} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{s.title as string}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{s.copy_type as string}</Badge>
                  {s.angle ? <Badge variant="outline" className="text-[10px]">{s.angle as string}</Badge> : null}
                  {s.emotion ? <Badge variant="outline" className="text-[10px]">{s.emotion as string}</Badge> : null}
                  {imgs.length > 0 ? <Badge variant="outline" className="text-[10px]"><ImagePlus className="h-2.5 w-2.5 mr-0.5" />{imgs.length}</Badge> : null}
                </div>
              </div>
              <button onClick={async () => { await supabase.from("copy_swipes").delete().eq("id", s.id as string); qc.invalidateQueries({ queryKey: ["copy_swipes"] }); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            {imgs.length > 0 && (
              <div className="grid grid-cols-4 gap-1 mt-2">
                {imgs.slice(0, 4).map(p => <SwipeImage key={p} path={p} />)}
              </div>
            )}
            {s.body ? <div className="text-xs text-muted-foreground mt-2 line-clamp-4 whitespace-pre-wrap">{s.body as string}</div> : null}
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEditing(s)}>Edit</Button>
          </Card>
        );})}
        {filtered.length === 0 && <div className="text-sm text-muted-foreground col-span-full">No swipes match.</div>}
      </div>
    </div>
  );
}


function ReviewTab() {
  const { data: clients = [] } = useClients();
  const [clientId, setClientId] = useState("");
  const [copy, setCopy] = useState("");
  const [result, setResult] = useState<{
    score: number; big_domino: string; strengths: string[]; weaknesses: string[];
    line_edits: { line: string; fix: string }[]; rewrite_suggestion: string;
  } | null>(null);
  const reviewFn = useServerFn(reviewCopyFn);
  const m = useMutation({
    mutationFn: () => reviewFn({ data: { copy, client_id: clientId || null } }),
    onSuccess: (r) => setResult(r),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed"),
  });

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="p-4 space-y-3">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger><SelectValue placeholder="Client (optional)" /></SelectTrigger>
          <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea rows={14} placeholder="Paste copy to review…" value={copy} onChange={e => setCopy(e.target.value)} />
        <Button onClick={() => m.mutate()} disabled={m.isPending || copy.length < 10}>{m.isPending ? "Reviewing…" : "Review this copy"}</Button>
      </Card>
      <Card className="p-4">
        {!result && <div className="text-sm text-muted-foreground">Review output appears here.</div>}
        {result && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><div className="text-3xl font-semibold">{result.score}</div><div className="text-xs text-muted-foreground">/ 100</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Big Domino</div><div>{result.big_domino}</div></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Strengths</div><ul className="list-disc pl-5 space-y-0.5">{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Weaknesses</div><ul className="list-disc pl-5 space-y-0.5">{result.weaknesses.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
            <div><div className="text-xs uppercase tracking-wider text-muted-foreground">Line edits</div>
              <div className="space-y-2">{result.line_edits.map((e, i) => (
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
  const [result, setResult] = useState<{ angles: { trigger: string; hook: string; big_domino: string }[] } | null>(null);
  const fn = useServerFn(suggestAnglesFn);
  const m = useMutation({
    mutationFn: () => fn({ data: { client_id: clientId || null, count: 12 } }),
    onSuccess: (r) => setResult(r),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Failed"),
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
          {result.angles.map((a, i) => (
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
