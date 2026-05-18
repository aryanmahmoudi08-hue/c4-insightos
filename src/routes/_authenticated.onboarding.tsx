import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Brain, MessageSquareQuote, Sparkles, Cloud } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/onboarding")({ component: Onboarding });

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","at","for","with","by","from","as","is","are","was","were","be","been","being","this","that","these","those","i","you","we","they","he","she","it","my","our","your","their","his","her","its","me","us","them","do","does","did","have","has","had","will","would","could","should","may","might","can","not","no","yes","so","up","out","about","into","over","than","then","just","like","get","got","make","made","go","going","want","need","know","think","really","very","much","more","most","some","any","all","one","two","also","because","when","while","what","why","how","where","which","who","whom","there","here","still","even","ever","never","yet","now","only","own","off","down","through","after","before","again","too","other","each","such","both","few","many"
]);
function topPhrases(texts: string[], n = 2, limit = 20): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    if (!t) continue;
    const words = t.toLowerCase().replace(/[^a-z0-9\s']/g, " ").split(/\s+/).filter(Boolean);
    for (let i = 0; i <= words.length - n; i++) {
      const slice = words.slice(i, i + n);
      if (slice.some(w => STOPWORDS.has(w) || w.length < 3)) continue;
      const phrase = slice.join(" ");
      counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= 2)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

const QUESTIONS = [
  { key: "first_touchpoint", q: "What was the first piece of content / touchpoint that made you discover us?" },
  { key: "pivotal_moment", q: "What was the moment you decided 'I have to work with them'?" },
  { key: "objections_before", q: "What hesitations or doubts almost stopped you from joining?" },
  { key: "join_sooner", q: "What could we have done to make you join 30 days sooner?" },
  { key: "current_pain", q: "What is the #1 problem you're hoping we solve right now?" },
  { key: "desired_identity", q: "12 months from now, who do you want to have become?" },
  { key: "tried_before", q: "What have you tried before that didn't work, and why?" },
  { key: "success_metric", q: "What single result would make this investment a clear 10x ROI?" },
  { key: "fear", q: "What's your biggest fear about this not working?" },
  { key: "beliefs_shifted", q: "What belief about your business shifted when you saw our content?" },
];

function Onboarding() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: responses } = useQuery({
    queryKey: ["onboarding", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_responses")
        .select("id, responses, submitted_at, created_at, share_token, clients(full_name, offer_name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: clients } = useQuery({
    queryKey: ["clients-pick", orgId],
    enabled: !!orgId && open,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, full_name").eq("org_id", orgId!);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const answers: Record<string, string> = {};
      QUESTIONS.forEach(q => { answers[q.key] = String(f.get(q.key) || ""); });
      const client_id = (f.get("client_id") as string) || null;
      const { error } = await supabase.from("onboarding_responses").insert({
        org_id: orgId!,
        client_id,
        responses: answers,
        submitted_at: new Date().toISOString(),
      });
      if (error) throw error;
      // Fire event for content team
      await supabase.from("events").insert({
        org_id: orgId!,
        event_type: "onboarding.submitted",
        subject_type: "onboarding_response",
        payload: { answers, client_id },
      });
    },
    onSuccess: () => { toast.success("Onboarding captured · content team alerted"); qc.invalidateQueries({ queryKey: ["onboarding"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const total = responses?.length ?? 0;
  const submitted = responses?.filter(r => r.submitted_at).length ?? 0;

  return (
    <>
      <TopBar title="Client Onboarding Psychology" subtitle="Deep intake — pain, beliefs, identity shifts feeding the content engine" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total intakes" value={total} icon={<Brain className="h-4 w-4" />} accent="accent" />
          <StatCard label="Submitted" value={submitted} accent="success" />
          <StatCard label="Pending" value={total - submitted} accent="warning" />
          <StatCard label="Insight signals" value={submitted * QUESTIONS.length} icon={<Sparkles className="h-4 w-4" />} accent="primary" />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Each submission triggers a content-team event with extracted beliefs & pain</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />New intake</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Onboarding intake</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="space-y-1.5"><Label>Client</Label>
                  <Select name="client_id"><SelectTrigger><SelectValue placeholder="Pick client"/></SelectTrigger>
                    <SelectContent>{(clients ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {QUESTIONS.map(q => (
                  <div key={q.key} className="space-y-1.5">
                    <Label className="text-xs leading-snug">{q.q}</Label>
                    <Textarea name={q.key} rows={2} maxLength={2000} />
                  </div>
                ))}
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Saving…" : "Submit intake"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden lg:col-span-1">
            <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Recent intakes</div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {(responses ?? []).map(r => (
                <button key={r.id} onClick={() => setSelected(r.id)} className={`w-full text-left p-3 hover:bg-muted/30 ${selected === r.id ? "bg-muted/40" : ""}`}>
                  <div className="font-medium text-sm">{r.clients?.full_name ?? "(no client linked)"}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
                </button>
              ))}
              {(!responses || responses.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No intakes yet.</div>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 lg:col-span-2">
            {selected ? (() => {
              const r = responses?.find(x => x.id === selected);
              if (!r) return null;
              const ans = (r.responses ?? {}) as Record<string, string>;
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold"><MessageSquareQuote className="h-4 w-4 text-accent" /> {r.clients?.full_name ?? "Intake"}</div>
                  {QUESTIONS.map(q => ans[q.key] ? (
                    <div key={q.key} className="space-y-1">
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{q.q}</div>
                      <div className="rounded bg-muted/30 p-3 text-sm whitespace-pre-wrap">{ans[q.key]}</div>
                    </div>
                  ) : null)}
                </div>
              );
            })() : <div className="text-center text-xs text-muted-foreground py-10">Select an intake to view answers</div>}
          </div>
        </div>
      </div>
    </>
  );
}
