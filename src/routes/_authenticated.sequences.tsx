import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { generateCopyFn } from "@/lib/copy-os.functions";
import { mockStorySequenceSlides, withMockDelay } from "@/lib/dev-mock-data";
import { Sparkles, Plus, Trash2, Calendar, Save, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sequences")({
  component: SequencesPage,
});

type SlideDef = { label: string; hint: string };
type Template = { key: string; day: number; dayName: string; title: string; subtitle: string; accent: string; slides: SlideDef[] };

// Modeled exactly on your 7-day Miro cadence (Sun → Sat)
const TEMPLATES: Template[] = [
  {
    key: "flexible", day: 0, dayName: "Sunday", title: "Flexible / Any Sequence",
    subtitle: "Wildcard day — anything that fits the week's narrative.",
    accent: "from-orange-500/20 to-transparent",
    slides: [
      { label: "Slide 1", hint: "Open with the strongest hook you've got." },
      { label: "Slide 2", hint: "Build context or tension." },
      { label: "Slide 3", hint: "Payoff, lesson, or CTA." },
    ],
  },
  {
    key: "story_poll_1", day: 1, dayName: "Monday", title: "Story Poll Sequence #1",
    subtitle: "Open the week with a poll that surfaces what the audience actually wants.",
    accent: "from-amber-500/20 to-transparent",
    slides: [
      { label: "Poll question", hint: 'e.g. "What\'s the main reason you want to get rich?"' },
      { label: "Option 1", hint: "Location Freedom 🌴" },
      { label: "Option 2", hint: "Time Freedom ⏳" },
      { label: "Option 3", hint: "Take Care Of Family ❤️" },
      { label: "Option 4", hint: "Quit Your 9-5 💼" },
      { label: "Follow-up slide", hint: "Reveal the result + tie it to the offer." },
    ],
  },
  {
    key: "wins_nurture", day: 2, dayName: "Tuesday", title: "Wins Nurturing Sequence",
    subtitle: "Take one student/client win and turn it into a 7-slide case study.",
    accent: "from-emerald-500/20 to-transparent",
    slides: [
      { label: "Win Intro", hint: "Introduce the student or result. e.g. \"one of the guys inside the program just hit his first $3k week\"" },
      { label: "Proof", hint: "Show the actual evidence — commission screenshot, discord message, stripe payout." },
      { label: "Context", hint: "Explain the situation before the result. \"when he joined he had zero experience in online sales\"" },
      { label: "Shift", hint: "Explain what they started doing differently. \"we focused on fixing his follow-up process and lead handling\"" },
      { label: "Result", hint: "Highlight the outcome clearly. \"3 weeks later he closed $3.2k in commissions\"" },
      { label: "Lesson", hint: "Extract the insight for viewers. \"most people don't fail because the opportunity is bad, they fail because they don't have the right systems\"" },
      { label: "Reflection", hint: "Instead of asking for a DM, just leave a thought. \"crazy what can happen when you focus on the right things\" or \"love seeing this kind of progress\"" },
    ],
  },
  {
    key: "youtube_vid", day: 3, dayName: "Wednesday", title: "YouTube Vid Sequence",
    subtitle: "Promote the new YouTube drop with story-driven slides that earn the click.",
    accent: "from-red-500/20 to-transparent",
    slides: [
      { label: "Video Hook", hint: "Introduce the video with a strong hook. \"just dropped a new youtube video breaking down how to land your first growth operating client\"" },
      { label: "Problem", hint: "Call out the problem the video solves. \"most people trying to sign clients online are doing outreach completely wrong\"" },
      { label: "Value Tease", hint: "Explain what they'll learn. \"in this video i break down the exact system i use to land clients\"" },
      { label: "Key Insight", hint: "Give one insight from the video. \"most people think growth operating is just marketing, but it's actually revenue infrastructure\"" },
      { label: "Video Preview", hint: "Show a clip from the video — screen recording, short clip, thumbnail." },
      { label: "Watch CTA", hint: "Send them to the video. \"watch the full video here\"" },
    ],
  },
  {
    key: "story_poll_2", day: 4, dayName: "Thursday", title: "Story Poll Sequence #2",
    subtitle: "Mid-week poll — go after the friction, not the dream.",
    accent: "from-violet-500/20 to-transparent",
    slides: [
      { label: "Poll question", hint: '"What\'s stopping you from getting to your goals?"' },
      { label: "Option 1", hint: "Don't Know Where To Start 📝" },
      { label: "Option 2", hint: "Not Around The Right People 👥" },
      { label: "Option 3", hint: "Can't Stay Consistent 🔁" },
      { label: "Option 4", hint: "No Systems To Follow 🧱" },
      { label: "Follow-up slide", hint: "Reveal the result + tie to the offer." },
    ],
  },
  {
    key: "ig_story_funnel", day: 5, dayName: "Friday", title: "Instagram Story Funnel",
    subtitle: "Full 9-slide DM funnel — pattern interrupt through to CTA.",
    accent: "from-pink-500/20 to-transparent",
    slides: [
      { label: "Pattern Interrupt / Hook", hint: "Stops people from tapping through. \"most people in high ticket sales are doing this wrong\"" },
      { label: "Relatability / Origin", hint: "Show you weren't always winning. \"2 years ago i had zero idea how online sales worked\"" },
      { label: "Authority", hint: "Now show credibility. \"now i've helped hundreds of people make commissions\"" },
      { label: "Lifestyle / Outcome", hint: "Show the result of the system — laptop money, freedom lifestyle, working from phone." },
      { label: "Social Proof", hint: "Screenshots of wins — commission screenshots, student wins, discord chats." },
      { label: "Testimonials", hint: "Break down one specific person. \"this is Kaiden, started 3 weeks ago, closed $5.1k in commissions\"" },
      { label: "Opportunity / Offer", hint: "Explain the opportunity. \"every month i open up 10 spots to teach people how to do this\"" },
      { label: "Scarcity", hint: "Push urgency. \"only 3 spots left\" · \"applications closing tonight\"" },
      { label: "Call To Action", hint: "Where the DM happens. \"dm me the word 'freedom'\"" },
    ],
  },
  {
    key: "personal_story", day: 6, dayName: "Saturday", title: "Personal Story Sequence",
    subtitle: "End the week with your own story arc — hero's journey in 8 beats.",
    accent: "from-blue-500/20 to-transparent",
    slides: [
      { label: "Story Hook", hint: "Introduce the story or moment. \"random thought i had today\" or \"this reminded me of when i first started\"" },
      { label: "Situation", hint: "Explain what was happening. \"when i first started trying to make money online i was sending 100+ DMs a day\"" },
      { label: "Struggle", hint: "Share the challenge or frustration. \"and most days i wouldn't even get a single response\"" },
      { label: "Realization", hint: "Explain what changed your perspective. \"then i realized it wasn't about sending more messages, it was about having the right system\"" },
      { label: "Turning Point", hint: "Explain what you started doing differently. \"once i focused on building a proper system everything started to change\"" },
      { label: "Result", hint: "Show the outcome or growth. \"that shift is what eventually led to building teams and helping others do the same\"" },
      { label: "Lesson", hint: "Extract a takeaway for your audience. \"most people aren't failing because they're lazy, they're failing because they're guessing\"" },
      { label: "Reflection / CTA", hint: "End naturally — a thought, or open spots. \"opened up some free spots for people who are in the same position 👇 (link to vsl)\"" },
    ],
  },
];

function templateFor(key: string) { return TEMPLATES.find(t => t.key === key) ?? TEMPLATES[0]; }

function SequencesPage() {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const [activeKey, setActiveKey] = useState<string>("wins_nurture");
  const [editing, setEditing] = useState<{ id?: string; template_key: string; title: string; slides: { label: string; body: string }[]; status: string; client_id: string | null; notes: string } | null>(null);

  const { data: sequences = [], isLoading: sequencesLoading, isError: sequencesError, error: sequencesErrorObj, refetch: refetchSequences } = useQuery({
    queryKey: ["story_sequences", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_sequences")
        .select("*")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["copy_clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("copy_clients").select("id, display_name").eq("org_id", orgId!).order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const t = templateFor(activeKey);

  const newDraft = () => {
    setEditing({
      template_key: t.key,
      title: t.title,
      status: "draft",
      client_id: clients[0]?.id ?? null,
      notes: "",
      slides: t.slides.map(s => ({ label: s.label, body: "" })),
    });
  };

  const generateFn = useServerFn(generateCopyFn);
  const generating = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No draft");
      const brief = [
        `Story sequence template: ${t.title} (${t.dayName}).`,
        `Produce one piece of body copy per slide, in order. Return ONLY a JSON array of strings, one entry per slide, same count and order as provided. No prose outside the array.`,
        `Slides (label → what it should accomplish):`,
        ...t.slides.map((s, i) => `${i + 1}. ${s.label} — ${s.hint}`),
        editing.notes ? `\nExtra context: ${editing.notes}` : "",
      ].join("\n");
      if (devBypass) return withMockDelay(mockStorySequenceSlides(t.slides.length));
      const out = await generateFn({ data: {
        copy_type: "story_sequence" as never,
        goal: `${t.title} — slide-by-slide body copy`,
        angle: t.subtitle,
        brief,
        client_id: editing.client_id ?? null,
        swipe_ids: [],
      } });
      // Try to parse a JSON array out of the response
      const text = out.output ?? "";
      const match = text.match(/\[[\s\S]*\]/);
      let arr: string[] = [];
      if (match) {
        try { const parsed = JSON.parse(match[0]); if (Array.isArray(parsed)) arr = parsed.map(String); } catch { /* ignore */ }
      }
      if (arr.length === 0) {
        // Fallback: split by "Slide N" markers
        arr = text.split(/\n?\s*Slide\s*\d+[:.\-)]\s*/i).filter(Boolean).slice(0, t.slides.length);
      }
      if (arr.length === 0) throw new Error("AI response couldn't be split into slides — try regenerating.");
      return arr;
    },
    onSuccess: (arr) => {
      if (!editing) return;
      const merged = editing.slides.map((s, i) => ({ ...s, body: arr[i] ?? s.body }));
      setEditing({ ...editing, slides: merged });
      toast.success("Slides drafted — edit each as needed.");
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Generation failed"),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing || !orgId) throw new Error("No workspace");
      const payload = {
        org_id: orgId, client_id: editing.client_id,
        day_of_week: t.day, template_key: editing.template_key,
        title: editing.title, slides: editing.slides as never,
        status: editing.status, notes: editing.notes,
      };
      if (editing.id) {
        const { error } = await (supabase.from("story_sequences") as never as { update: (p: unknown) => { eq: (k: string, v: string) => Promise<{ error: unknown }> } }).update(payload).eq("id", editing.id);
        if (error) throw error as Error;
      } else {
        const { error } = await (supabase.from("story_sequences") as never as { insert: (p: unknown) => Promise<{ error: unknown }> }).insert(payload);
        if (error) throw error as Error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["story_sequences"] });
      toast.success("Saved");
      setEditing(null);
    },
    onError: (e: unknown) => toast.error((e as Error)?.message ?? "Save failed"),
  });

  return (
    <>
      <TopBar title="Story Sequences" subtitle="7-day cadence — pick the day, fill the beats, ship the story." />
      <div className="p-4 md:p-6 space-y-4">
        {/* Day picker */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {TEMPLATES.map(tpl => {
            const active = tpl.key === activeKey;
            return (
              <button key={tpl.key} onClick={() => setActiveKey(tpl.key)}
                className={cn(
                  "text-left rounded-lg border p-3 transition bg-gradient-to-br",
                  tpl.accent,
                  active ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-primary/40",
                )}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{tpl.dayName}</div>
                <div className="text-sm font-semibold mt-1 leading-tight">{tpl.title}</div>
                <div className="text-[10px] text-muted-foreground mt-1.5 line-clamp-2">{tpl.subtitle}</div>
              </button>
            );
          })}
        </div>

        {/* Template detail / editor */}
        <Card className={cn("p-4 bg-gradient-to-br", t.accent)}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{t.dayName} · Template</div>
              <h2 className="text-xl font-semibold mt-1">{t.title}</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{t.subtitle}</p>
            </div>
            <div className="flex gap-2">
              {!editing && <Button onClick={newDraft}><Plus className="h-4 w-4 mr-1.5" />New draft</Button>}
            </div>
          </div>

          {!editing && (
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {t.slides.map((s, i) => (
                <div key={i} className="rounded-md border border-border/60 bg-background/60 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Slide {i + 1}</div>
                  <div className="text-sm font-semibold mt-0.5">{s.label}</div>
                  <div className="text-xs text-muted-foreground mt-1.5">{s.hint}</div>
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div className="mt-4 space-y-3">
              <div className="grid sm:grid-cols-3 gap-2">
                <Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Sequence title" />
                <Select value={editing.client_id ?? ""} onValueChange={v => setEditing({ ...editing, client_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Client (voice)" /></SelectTrigger>
                  <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.display_name}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={editing.status} onValueChange={v => setEditing({ ...editing, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea rows={2} placeholder="Extra context for AI (optional)" value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => generating.mutate()} disabled={generating.isPending} variant="secondary">
                  <Wand2 className="h-4 w-4 mr-1.5" />{generating.isPending ? "Drafting all slides…" : "AI-draft all slides"}
                </Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1.5" />{save.isPending ? "Saving…" : "Save sequence"}</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {editing.slides.map((s, i) => (
                  <div key={i} className="rounded-md border border-border/60 bg-background/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Slide {i + 1}</div>
                      <div className="text-xs font-semibold">{s.label}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">{t.slides[i]?.hint}</div>
                    <Textarea rows={5} className="mt-2" value={s.body}
                      onChange={ev => {
                        const next = [...editing.slides]; next[i] = { ...next[i], body: ev.target.value };
                        setEditing({ ...editing, slides: next });
                      }}
                      placeholder="Write this slide…" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Saved sequences */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Saved sequences</h3>
            <Badge variant="outline">{sequences.length}</Badge>
          </div>
          {sequences.length === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No saved sequences yet — pick a day above and hit "New draft" to start.
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sequences.map((s) => {
                const tpl = templateFor(String(s.template_key));
                const slides = Array.isArray(s.slides) ? (s.slides as { label: string; body: string }[]) : [];
                return (
                  <Card key={s.id} className={cn("p-3 bg-gradient-to-br", tpl.accent)}>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{tpl.dayName}</div>
                      <Badge variant={s.status === "ready" ? "default" : s.status === "posted" ? "secondary" : "outline"}>{s.status}</Badge>
                    </div>
                    <div className="text-sm font-semibold mt-1">{s.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">{slides.length} slides · {new Date(s.updated_at).toLocaleDateString()}</div>
                    <div className="text-xs mt-2 line-clamp-3 whitespace-pre-wrap">{slides[0]?.body || "(empty)"}</div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing({
                        id: s.id, template_key: String(s.template_key), title: s.title, status: s.status,
                        client_id: s.client_id ?? null, notes: s.notes ?? "",
                        slides: slides.length ? slides : tpl.slides.map(sl => ({ label: sl.label, body: "" })),
                      })}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-destructive"
                        onClick={async () => {
                          const { error } = await supabase.from("story_sequences").delete().eq("id", s.id);
                          if (error) { toast.error(error.message); return; }
                          qc.invalidateQueries({ queryKey: ["story_sequences"] });
                        }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
