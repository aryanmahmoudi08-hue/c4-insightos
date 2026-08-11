import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { submitDailyWinFn, lastNeedleMoverFn } from "@/lib/daily-wins.functions";
import { Trophy, Brain, Dumbbell, DollarSign, CheckCircle2, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/daily-win")({
  component: DailyWinForm,
  validateSearch: (s: Record<string, unknown>) => ({ org: typeof s.org === "string" ? s.org : "" }),
  head: () => ({
    meta: [
      { title: "The Daily W — Client Non-Negotiable Log" },
      { name: "description", content: "Log today's win before you log off. Financial, mental, or physical — no zero days." },
      { property: "og:title", content: "The Daily W — Client Non-Negotiable Log" },
      { property: "og:description", content: "Submit your daily win, energy score, blocker, and tomorrow's needle-mover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const WIN_TYPES = [
  { value: "financial", label: "Financial", icon: DollarSign, hint: "Cash in, closed a client, a paid offer landed", tone: "success" },
  { value: "mental", label: "Mental", icon: Brain, hint: "Mindset, discipline, beat a fear, said no to a distraction", tone: "accent" },
  { value: "physical", label: "Physical", icon: Dumbbell, hint: "Trained, ate right, slept, energy", tone: "primary" },
] as const;

const STATUSES = [
  { value: "done", label: "Done", emoji: "✅" },
  { value: "partial", label: "Partial", emoji: "🟡" },
  { value: "no", label: "No", emoji: "❌" },
] as const;

function DailyWinForm() {
  const { org } = Route.useSearch();
  const submit = useServerFn(submitDailyWinFn);
  const loadCommitment = useServerFn(lastNeedleMoverFn);

  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [commitment, setCommitment] = useState("");
  const [status, setStatus] = useState<string>("done");
  const [workDone, setWorkDone] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [source, setSource] = useState("");
  const [energy, setEnergy] = useState(7);
  const [blocker, setBlocker] = useState("");
  const [tomorrow, setTomorrow] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const financial = types.includes("financial");

  const pullCommitment = async () => {
    if (!name.trim() || !org) return;
    try {
      const r = await loadCommitment({ data: { org_id: org, student_name: name.trim() } });
      if (r.commitment) { setCommitment(r.commitment); toast.success("Pulled yesterday's needle-mover."); }
    } catch { /* silent — first submission has no history */ }
  };

  const m = useMutation({
    mutationFn: async () => {
      let proof_url: string | null = null;
      if (file) {
        setUploading(true);
        const path = `${org}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
        const { error } = await supabase.storage.from("win-proof").upload(path, file);
        setUploading(false);
        if (error) throw new Error(`Proof upload failed: ${error.message}`);
        proof_url = path;
      }
      return submit({ data: {
        org_id: org,
        student_name: name.trim(),
        win_date: date,
        yesterday_commitment: commitment || null,
        yesterday_status: status as never,
        work_done: workDone || null,
        win_types: types as never,
        win_description: description.trim(),
        financial_amount_cents: financial && amount ? Math.round(parseFloat(amount.replace(/[^\d.]/g, "")) * 100) : null,
        financial_source: financial ? (source || null) : null,
        proof_url,
        energy_score: energy,
        blocker: blocker || null,
        tomorrow_needle_mover: tomorrow || null,
      }});
    },
    onSuccess: () => setDone(true),
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = !!org && name.trim().length > 1 && types.length > 0 && description.trim().length > 2;

  if (!org) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md text-center space-y-2">
          <h1 className="display-serif text-2xl">Missing workspace link</h1>
          <p className="text-sm text-muted-foreground">Ask your coach for your personal Daily W link — it ends in <code>?org=…</code>.</p>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="max-w-md text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 mx-auto text-[color:var(--color-success)]" />
          <h1 className="display-serif text-3xl">Logged. No zero days.</h1>
          <p className="text-sm text-muted-foreground">
            Tomorrow's needle-mover: <span className="text-foreground font-medium">{tomorrow || "—"}</span>
          </p>
          <Button variant="outline" onClick={() => { setDone(false); setDescription(""); setTypes([]); setAmount(""); setSource(""); setFile(null); setBlocker(""); setWorkDone(""); }}>
            Log another day
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <Trophy className="h-8 w-8 mx-auto text-[color:var(--color-warning)]" />
          <h1 className="display-serif text-3xl">The Daily W</h1>
          <p className="text-sm text-muted-foreground">Client non-negotiable log. Submit every day before you log off. No zero days.</p>
        </header>

        <Section n={1} title="Identity">
          <Field label="Your name">
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={pullCommitment} placeholder="First + last name" />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </Section>

        <Section n={2} title="Accountability — did you do what you said?">
          <Field label="Yesterday your #1 needle-mover was…">
            <Input value={commitment} onChange={(e) => setCommitment(e.target.value)} placeholder="Auto-fills from yesterday's log" />
          </Field>
          <Field label="Did you do it?">
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((s) => (
                <button key={s.value} type="button" onClick={() => setStatus(s.value)}
                  className={cn("rounded-md border px-3 py-1.5 text-sm transition",
                    status === s.value ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40")}>
                  {s.emoji} {s.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="What did you actually get done today that moved you forward?">
            <Textarea rows={3} value={workDone} onChange={(e) => setWorkDone(e.target.value)} placeholder="1–3 sentences" />
          </Field>
        </Section>

        <Section n={3} title="The Win">
          <div className="rounded-md border border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/5 px-3 py-2 text-xs">
            Did you win today? <span className="font-semibold">Yes.</span> Every day has a win — your job is to find it.
          </div>
          <Field label="What type of win was it? (select all that apply)">
            <div className="grid sm:grid-cols-3 gap-2">
              {WIN_TYPES.map((t) => {
                const active = types.includes(t.value);
                const Icon = t.icon;
                return (
                  <button key={t.value} type="button"
                    onClick={() => setTypes((prev) => active ? prev.filter((x) => x !== t.value) : [...prev, t.value])}
                    className={cn("text-left rounded-lg border p-3 transition",
                      active
                        ? t.value === "financial"
                          ? "border-[color:var(--color-success)] bg-[color:var(--color-success)]/10"
                          : "border-primary bg-primary/10"
                        : "border-border hover:bg-muted/30")}>
                    <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4" />{t.label}</div>
                    <div className="text-2xs text-muted-foreground mt-1">{t.hint}</div>
                  </button>
                );
              })}
            </div>
            {financial && <div className="text-2xs text-[color:var(--color-success)] mt-1.5">Financial wins are logged as HIGH PRIORITY and pushed to the wins wall.</div>}
          </Field>
          <Field label="Describe your win — be specific.">
            <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What happened, and why it matters" />
          </Field>
          {financial && (
            <>
              <Field label="How much?">
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" inputMode="decimal" />
              </Field>
              <Field label="From what?">
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Closed a client, upsell, retainer…" />
              </Field>
            </>
          )}
          <Field label="Proof (optional — strongly encouraged for financial wins)">
            <label className="flex items-center gap-2 text-sm cursor-pointer rounded-md border border-dashed border-border px-3 py-2.5 hover:bg-muted/30">
              <ImagePlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">{file ? file.name : "Attach a screenshot — payment, PR, workout"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </Field>
        </Section>

        <Section n={4} title="Momentum & coach radar">
          <Field label={`Energy / mindset today — ${energy}/10`}>
            <input type="range" min={1} max={10} value={energy} onChange={(e) => setEnergy(Number(e.target.value))} className="w-full accent-[color:var(--color-success)]" />
          </Field>
          <Field label="Biggest blocker right now">
            <Textarea rows={3} value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Be honest — this is what your coach acts on" />
          </Field>
          <Field label="Your #1 needle-mover for TOMORROW">
            <Input value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} placeholder="One thing. This becomes tomorrow's accountability question." />
          </Field>
        </Section>

        <Button className="w-full h-11" disabled={!valid || m.isPending || uploading} onClick={() => m.mutate()}>
          {m.isPending || uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploading ? "Uploading proof…" : "Logging…"}</> : "Submit today's W"}
        </Button>
        <p className="text-center text-2xs text-muted-foreground pb-8">C4 · InsightOS accountability log</p>
      </div>
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-2xs font-mono">{n}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
