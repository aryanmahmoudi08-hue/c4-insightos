import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { analyzeDailyWinsFn } from "@/lib/daily-wins.functions";
import { mockDailyWinsInsight, withMockDelay } from "@/lib/dev-mock-data";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trophy, DollarSign, Brain, Dumbbell, Sparkles, Link2, AlertTriangle, Loader2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

type Win = {
  id: string;
  student_name: string;
  win_date: string;
  yesterday_status: string;
  win_types: string[] | null;
  win_description: string;
  financial_amount_cents: number | null;
  financial_source: string | null;
  proof_url: string | null;
  energy_score: number | null;
  blocker: string | null;
  tomorrow_needle_mover: string | null;
  priority: string;
};

const RANGES = [
  { label: "Today", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function DailyWinsPanel({ studentName }: { studentName?: string }) {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const [days, setDays] = useState(7);
  const [insight, setInsight] = useState("");

  const since = useMemo(() => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10), [days]);

  const { data: wins } = useQuery({
    queryKey: ["daily-wins", orgId, days, studentName ?? "all"],
    enabled: !!orgId,
    queryFn: async () => {
      let q = supabase
        .from("daily_wins")
        .select("id, student_name, win_date, yesterday_status, win_types, win_description, financial_amount_cents, financial_source, proof_url, energy_score, blocker, tomorrow_needle_mover, priority")
        .eq("org_id", orgId!)
        .gte("win_date", since)
        .order("win_date", { ascending: false });
      if (studentName) q = q.ilike("student_name", studentName);
      const { data, error } = await q.limit(300);
      if (error) throw error;
      return (data ?? []) as Win[];
    },
  });

  const rows = wins ?? [];
  const cash = rows.reduce((s, w) => s + (w.financial_amount_cents ?? 0), 0);
  const financialCount = rows.filter((w) => (w.win_types ?? []).includes("financial")).length;
  const avgEnergy = rows.length ? rows.reduce((s, w) => s + (w.energy_score ?? 0), 0) / rows.filter(w => w.energy_score != null).length : 0;
  const kept = rows.filter((w) => w.yesterday_status === "done").length;

  // Repeat-blocker detection → save-call trigger.
  const repeatBlockers = useMemo(() => {
    const map = new Map<string, { name: string; blocker: string; count: number }>();
    for (const w of rows) {
      if (!w.blocker?.trim()) continue;
      const key = `${w.student_name.toLowerCase()}|${w.blocker.trim().toLowerCase().slice(0, 40)}`;
      const cur = map.get(key);
      if (cur) cur.count += 1;
      else map.set(key, { name: w.student_name, blocker: w.blocker.trim(), count: 1 });
    }
    return [...map.values()].filter((b) => b.count >= 3).sort((a, b) => b.count - a.count);
  }, [rows]);

  const analyze = useServerFn(analyzeDailyWinsFn);
  const m = useMutation({
    mutationFn: async () => {
      if (devBypass) return withMockDelay(mockDailyWinsInsight());
      return analyze({ data: { days } });
    },
    onSuccess: (r) => setInsight(r.insight),
    onError: (e: Error) => toast.error(e.message),
  });

  const formLink = orgId ? `${typeof window !== "undefined" ? window.location.origin : ""}/daily-win?org=${orgId}` : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-[color:var(--color-warning)]" />
          <span className="text-sm font-semibold">The Daily W {studentName && <span className="font-normal text-muted-foreground">· {studentName}</span>}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setDays(r.days)}
              className={cn("rounded border px-2 py-1 text-[11px]", days === r.days ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40")}>
              {r.label}
            </button>
          ))}
          <Button size="sm" variant="outline" className="h-7 text-[11px]"
            onClick={() => { navigator.clipboard.writeText(formLink); toast.success("Daily W form link copied — send it to your students."); }}>
            <Link2 className="h-3 w-3 mr-1" /> Copy form link
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Mini label="Logs" value={rows.length} />
        <Mini label="Financial wins" value={financialCount} tone="success" />
        <Mini label="Cash logged" value={`$${Math.round(cash / 100).toLocaleString()}`} tone="success" />
        <Mini label="Commitments kept" value={rows.length ? `${Math.round((kept / rows.length) * 100)}%` : "—"} />
        <Mini label="Avg energy" value={avgEnergy ? avgEnergy.toFixed(1) : "—"} tone={avgEnergy && avgEnergy < 5 ? "danger" : "default"} />
      </div>

      {repeatBlockers.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Save-call triggers · same blocker 3+ days
          </div>
          {repeatBlockers.map((b, i) => (
            <div key={i} className="text-xs"><span className="font-medium">{b.name}</span> — {b.blocker} <span className="font-mono text-destructive">×{b.count}</span></div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" /> AI coach read · last {days}d
          </div>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Reading…</> : "Analyze wins"}
          </Button>
        </div>
        {insight
          ? <div className="text-xs leading-relaxed whitespace-pre-wrap">{insight}</div>
          : <p className="text-xs text-muted-foreground">Surfaces what to double down on, the bottlenecks holding students back, and who needs a save call.</p>}
      </div>

      <div className="space-y-2">
        {rows.map((w) => <WinRow key={w.id} w={w} />)}
        {rows.length === 0 && <div className="py-8 text-center text-xs text-muted-foreground italic">No daily wins in this window. Share the form link — it's non-negotiable.</div>}
      </div>
    </div>
  );
}

function WinRow({ w }: { w: Win }) {
  const financial = (w.win_types ?? []).includes("financial");
  const [proof, setProof] = useState<string | null>(null);
  useEffect(() => {
    if (!w.proof_url) return;
    let live = true;
    supabase.storage.from("win-proof").createSignedUrl(w.proof_url, 3600).then(({ data }) => {
      if (live && data?.signedUrl) setProof(data.signedUrl);
    });
    return () => { live = false; };
  }, [w.proof_url]);

  return (
    <div className={cn("rounded-md border p-3 space-y-1.5 text-xs",
      financial ? "border-[color:var(--color-success)]/45 bg-[color:var(--color-success)]/5" : "border-border bg-card")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{w.student_name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{w.win_date}</span>
        {financial && (
          <span className="inline-flex items-center gap-1 rounded bg-[color:var(--color-success)]/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-success)]">
            <Flame className="h-3 w-3" /> High priority
          </span>
        )}
        {(w.win_types ?? []).map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {t === "financial" ? <DollarSign className="h-3 w-3" /> : t === "mental" ? <Brain className="h-3 w-3" /> : <Dumbbell className="h-3 w-3" />}{t}
          </span>
        ))}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">energy {w.energy_score ?? "—"}/10 · {w.yesterday_status}</span>
      </div>
      <div className="whitespace-pre-wrap">{w.win_description}</div>
      {financial && w.financial_amount_cents != null && (
        <div className="font-mono text-[color:var(--color-success)]">
          ${Math.round(w.financial_amount_cents / 100).toLocaleString()} {w.financial_source && `— ${w.financial_source}`}
        </div>
      )}
      {proof && <img src={proof} alt="Win proof" loading="lazy" className="max-h-48 w-full rounded border border-border object-cover" />}
      {w.blocker && <div className="text-muted-foreground"><span className="uppercase tracking-wider text-[10px] text-destructive">Blocker</span> — {w.blocker}</div>}
      {w.tomorrow_needle_mover && <div className="text-muted-foreground"><span className="uppercase tracking-wider text-[10px]">Tomorrow</span> — {w.tomorrow_needle_mover}</div>}
    </div>
  );
}

function Mini({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "danger" }) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 font-mono text-lg font-semibold tabular-nums",
        tone === "success" && "text-[color:var(--color-success)]",
        tone === "danger" && "text-destructive")}>{value}</div>
    </div>
  );
}
