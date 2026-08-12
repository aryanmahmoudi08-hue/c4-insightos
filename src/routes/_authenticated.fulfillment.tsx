import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Briefcase, Target, TrendingUp, Search, HeartPulse } from "lucide-react";
import { DailyWinsPanel } from "@/components/daily-wins-panel";
import { BentoGrid, BentoCell } from "@/components/bento-grid";

export const Route = createFileRoute("/_authenticated/fulfillment")({ component: Fulfillment });

type ClientLite = {
  id: string;
  full_name: string;
  email: string | null;
  offer_name: string | null;
  status: string | null;
  health_score: number | null;
  start_date: string;
  pre_close_summary: string | null;
};

function Fulfillment() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { data: clients } = useQuery({
    queryKey: ["fulfillment-clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, email, offer_name, status, health_score, start_date, pre_close_summary")
        .eq("org_id", orgId!)
        .eq("status", "active")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientLite[];
    },
  });

  const { data: intake } = useQuery({
    queryKey: ["fulfillment-intake", orgId, selected],
    enabled: !!orgId && !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_responses")
        .select("responses, submitted_at")
        .eq("org_id", orgId!)
        .eq("client_id", selected!)
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    },
  });

  const activeClient = useMemo(() => clients?.find((c) => c.id === selected) ?? null, [clients, selected]);
  const answers = (intake?.responses ?? {}) as Record<string, string>;
  const avgHealth = clients?.length ? Math.round(clients.reduce((s, c) => s + Number(c.health_score ?? 0), 0) / clients.length) : 0;

  return (
    <>
      <TopBar title="Client Results" subtitle="Track active client goals + progress from intake → outcome" />
      <div className="px-6 pt-6">
        {/* Page hero (B1) — this list's own scope, headcount isn't a funnel metric
            here (no conversion story on a fulfillment roster) so it stays neutral;
            health keeps its threshold-driven semantic color from Clients. */}
        <BentoGrid rowHeight="7rem">
          <BentoCell span="wide">
            <div className="hover-lift relative flex h-full items-center gap-6 overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fulfillment Roster</div>
                <div className="font-mono text-4xl font-bold tabular-nums">{clients?.length ?? 0}</div>
                <div className="text-2xs text-muted-foreground">active client{(clients?.length ?? 0) === 1 ? "" : "s"}</div>
              </div>
              <div className="relative h-10 w-px bg-border" />
              <div className="relative flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className={`font-mono text-2xl font-bold tabular-nums ${avgHealth > 70 ? "text-[color:var(--color-success)]" : avgHealth > 40 ? "text-[color:var(--color-warning)]" : "text-destructive"}`}>{avgHealth}</div>
                  <div className="text-2xs text-muted-foreground">avg health</div>
                </div>
              </div>
            </div>
          </BentoCell>
        </BentoGrid>
      </div>
      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> Active clients · {clients?.length ?? 0}
          </div>
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search clients…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
          </div>
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
            {(clients ?? []).filter(c => {
              const q = query.trim().toLowerCase(); if (!q) return true;
              return [c.full_name, c.email, c.offer_name].some(v => (v ?? "").toLowerCase().includes(q));
            }).map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 hover:bg-muted/30 ${selected === c.id ? "bg-muted/40" : ""}`}>
                <div className="font-medium text-sm">{c.full_name}</div>
                <div className="flex items-center justify-between text-2xs text-muted-foreground mt-0.5">
                  <span>{c.offer_name ?? "—"}</span>
                  <span className="font-mono">health {Number(c.health_score ?? 0)}</span>
                </div>
              </button>
            ))}
            {(!clients || clients.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No active clients.</div>}
          </div>
        </div>

        <div className="lg:col-span-2 rounded-lg border border-border bg-card p-5 space-y-5">
          {!activeClient && <div className="text-center text-xs text-muted-foreground py-16">Select a client to see their goals + onboarding.</div>}
          {activeClient && (
            <>
              <div>
                <div className="text-xs text-muted-foreground">Client</div>
                <div className="display-serif text-xl">{activeClient.full_name}</div>
                <div className="text-xs text-muted-foreground mt-1">{activeClient.offer_name} · started {activeClient.start_date}</div>
              </div>

              {activeClient.pre_close_summary && (
                <div className="rounded-md border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground mb-1">
                    <Target className="h-3 w-3" /> Pre-close summary
                  </div>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{activeClient.pre_close_summary}</p>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-3">
                <SignalCard label="Stated pain" value={answers.current_pain} />
                <SignalCard label="Desired identity (12mo)" value={answers.desired_identity} />
                <SignalCard label="What they've tried" value={answers.tried_before} />
                <SignalCard label="Biggest fear" value={answers.fear} />
                <SignalCard label="Pivotal moment" value={answers.pivotal_moment} />
                <SignalCard label="Belief that shifted" value={answers.beliefs_shifted} />
              </div>

              <div className="rounded-md border border-border p-3">
                <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground mb-2">
                  <TrendingUp className="h-3 w-3" /> Progress checkpoints
                </div>
                <p className="text-xs text-muted-foreground">Use the Clients page to update health score + renewal stage as progress milestones are hit.</p>
              </div>

              <div className="rounded-md border border-border p-3">
                <DailyWinsPanel studentName={activeClient.full_name} />
              </div>
            </>
          )}
        </div>
      </div>

      {!activeClient && (
        <div className="px-6 pb-6 space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <DailyWinsPanel />
          </div>
        </div>
      )}
    </>
  );
}

function SignalCard({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-sm whitespace-pre-wrap min-h-[2.5rem]">{value || <span className="text-muted-foreground italic">no intake answer</span>}</div>
    </div>
  );
}
