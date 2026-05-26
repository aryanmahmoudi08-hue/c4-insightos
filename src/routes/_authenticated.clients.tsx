import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, BadgeCheck, HeartPulse, Repeat, AlertTriangle, Sparkles, Pencil } from "lucide-react";
import { toast } from "sonner";
import { generatePreCloseFn } from "@/lib/pre-close.functions";

export const Route = createFileRoute("/_authenticated/clients")({ component: Clients });

const STAGES = [
  { key: "not_started", label: "Not Started", tone: "bg-muted text-muted-foreground" },
  { key: "conversation", label: "Conversation", tone: "bg-accent/15 text-accent" },
  { key: "proposal", label: "Proposal Sent", tone: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]" },
  { key: "won", label: "Renewed", tone: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]" },
  { key: "churned", label: "Churned", tone: "bg-destructive/15 text-destructive" },
] as const;

type Stage = typeof STAGES[number]["key"];

type ClientRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  offer_name: string | null;
  start_date: string;
  contract_value_cents: number | null;
  invested_to_date_cents: number | null;
  expected_next_payment_cents: number | null;
  expected_next_payment_date: string | null;
  payment_plan: boolean | null;
  installments_remaining: number | null;
  installment_amount_cents: number | null;
  status: string | null;
  health_score: number | null;
  renewal_date: string | null;
  renewal_conv_started: boolean | null;
  renewal_stage: string | null;
  notes: string | null;
  pre_close_summary: string | null;
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  return Math.floor((new Date(date).getTime() - Date.now()) / 86400e3);
}

function atRiskReason(c: ClientRow): string | null {
  const reasons: string[] = [];
  const hs = Number(c.health_score ?? 100);
  if (hs < 50) reasons.push(`health ${hs}`);
  const dru = daysUntil(c.renewal_date);
  if (dru !== null && dru >= 0 && dru < 30 && !c.renewal_conv_started) reasons.push(`renewal in ${dru}d, no convo`);
  if (dru !== null && dru < 0) reasons.push(`renewal ${Math.abs(dru)}d overdue`);
  return reasons.length ? reasons.join(" · ") : null;
}

function Clients() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const generatePreClose = useServerFn(generatePreCloseFn);

  const { data: clients } = useQuery({
    queryKey: ["clients", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, email, phone, offer_name, start_date, contract_value_cents, invested_to_date_cents, expected_next_payment_cents, expected_next_payment_date, payment_plan, installments_remaining, installment_amount_cents, status, health_score, renewal_date, renewal_conv_started, renewal_stage, notes, pre_close_summary")
        .eq("org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const patch: { renewal_stage: string; renewal_conv_started?: boolean; status?: string } = { renewal_stage: stage };
      if (stage === "conversation") patch.renewal_conv_started = true;
      if (stage === "churned") patch.status = "churned";
      if (stage === "won") patch.status = "active";
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Stage updated"); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const buildPatch = (f: FormData) => {
    const isPlan = f.get("payment_plan") === "on";
    const installmentsLeft = Number(f.get("installments_remaining") || 0);
    const installmentAmt = Math.round(Number(f.get("installment_amount") || 0) * 100);
    // Auto-fill next payment $ from per-installment amount when on a plan and no override entered
    const nextPaymentRaw = Number(f.get("expected_next_payment") || 0);
    const nextPaymentCents = nextPaymentRaw > 0
      ? Math.round(nextPaymentRaw * 100)
      : (isPlan ? installmentAmt : 0);
    return {
      full_name: String(f.get("full_name") || ""),
      email: String(f.get("email") || "") || null,
      phone: String(f.get("phone") || "") || null,
      offer_name: String(f.get("offer_name") || "") || null,
      contract_value_cents: Math.round(Number(f.get("contract_value") || 0) * 100),
      invested_to_date_cents: Math.round(Number(f.get("invested_to_date") || 0) * 100),
      expected_next_payment_cents: nextPaymentCents,
      expected_next_payment_date: String(f.get("expected_next_payment_date") || "") || null,
      start_date: String(f.get("start_date") || new Date().toISOString().slice(0,10)),
      renewal_date: isPlan ? (String(f.get("renewal_date") || "") || null) : null,
      payment_plan: isPlan,
      installments_remaining: isPlan ? installmentsLeft : 0,
      installment_amount_cents: isPlan ? installmentAmt : 0,
      notes: String(f.get("notes") || "") || null,
    };
  };

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const { error } = await supabase.from("clients").insert({ org_id: orgId!, status: "active", ...buildPatch(f) });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Client added"); qc.invalidateQueries({ queryKey: ["clients"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormData }) => {
      const { error } = await supabase.from("clients").update(buildPatch(f)).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Client updated"); qc.invalidateQueries({ queryKey: ["clients"] }); setEditing(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const preClose = useMutation({
    mutationFn: async (clientId: string) => generatePreClose({ data: { client_id: clientId, org_id: orgId! } }),
    onSuccess: () => { toast.success("Pre-close summary generated"); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const active = clients?.filter(c => c.status === "active").length ?? 0;
  const ltv = (clients?.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0) ?? 0) / 100;
  const avgHealth = clients?.length ? Math.round(clients.reduce((s, c) => s + Number(c.health_score ?? 0), 0) / clients.length) : 0;
  const renewalsDue = clients?.filter(c => c.renewal_date && new Date(c.renewal_date) < new Date(Date.now()+30*86400000)).length ?? 0;

  // At-risk list (auto-tagged)
  const atRisk = useMemo(() => {
    return (clients ?? [])
      .map(c => ({ c, reason: atRiskReason(c) }))
      .filter(x => x.reason)
      .sort((a, b) => (Number(a.c.health_score ?? 100) - Number(b.c.health_score ?? 100)));
  }, [clients]);

  // LTV by offer
  const ltvByOffer = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const c of clients ?? []) {
      const k = c.offer_name || "(no offer)";
      const cur = m.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += c.contract_value_cents ?? 0;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([offer, v]) => ({ offer, count: v.count, total: v.total, avg: v.count ? v.total / v.count : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [clients]);

  // Group clients by renewal_stage for kanban
  const byStage = useMemo(() => {
    const m = new Map<Stage, ClientRow[]>();
    STAGES.forEach(s => m.set(s.key, []));
    for (const c of clients ?? []) {
      const stage = (c.renewal_stage as Stage) || "not_started";
      const arr = m.get(stage) ?? m.get("not_started")!;
      arr.push(c);
    }
    return m;
  }, [clients]);

  const onDrop = (e: React.DragEvent, stage: Stage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) updateStage.mutate({ id, stage });
  };

  return (
    <>
      <TopBar title="Clients & Renewals" subtitle="Lifetime value, health, and renewal pipeline" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatCard label="Active clients" value={active} accent="success" icon={<BadgeCheck className="h-4 w-4" />} />
          <StatCard label="Total LTV" value={`$${ltv.toLocaleString()}`} accent="primary" />
          <StatCard label="Avg health" value={`${avgHealth}`} accent={avgHealth > 70 ? "success" : avgHealth > 40 ? "warning" : "destructive"} icon={<HeartPulse className="h-4 w-4" />} />
          <StatCard label="Renewals <30d" value={renewalsDue} accent={renewalsDue ? "warning" : "primary"} icon={<Repeat className="h-4 w-4" />} />
          <StatCard label="At-risk" value={atRisk.length} accent={atRisk.length ? "destructive" : "primary"} icon={<AlertTriangle className="h-4 w-4" />} hint="Auto-flagged" />
        </div>

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{clients?.length ?? 0} clients</div>
          <div className="flex gap-2">
            <Link to="/onboarding"><Button size="sm" variant="outline">Onboarding intake</Button></Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Add client</Button></DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
                <ClientForm onSubmit={(f) => create.mutate(f)} planChecked={planChecked} setPlanChecked={setPlanChecked} pending={create.isPending} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Renewal pipeline</TabsTrigger>
            <TabsTrigger value="atrisk">At-risk · {atRisk.length}</TabsTrigger>
            <TabsTrigger value="ltv">LTV by offer</TabsTrigger>
            <TabsTrigger value="table">All clients</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <div className="text-xs text-muted-foreground mb-2">Drag cards between columns to update renewal stage.</div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {STAGES.map(stage => {
                const rows = byStage.get(stage.key) ?? [];
                const total = rows.reduce((s, r) => s + (r.contract_value_cents ?? 0), 0);
                return (
                  <div key={stage.key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, stage.key)}
                    className="rounded-lg border border-border bg-card min-h-[300px]"
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                      <span className={`text-[10px] uppercase tracking-wider rounded px-1.5 py-0.5 ${stage.tone}`}>{stage.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground">{rows.length} · ${Math.round(total/100).toLocaleString()}</span>
                    </div>
                    <div className="p-2 space-y-2">
                      {rows.map(c => {
                        const risk = atRiskReason(c);
                        return (
                          <div key={c.id}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id)}
                            className="cursor-grab active:cursor-grabbing rounded-md border border-border bg-background p-2 hover:border-primary/50 transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-sm leading-tight">{c.full_name}</div>
                              {risk && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{c.offer_name || "—"}</div>
                            <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono">
                              <span className="text-muted-foreground">{c.renewal_date ?? "no date"}</span>
                              <span className="text-[color:var(--color-success)]">${Math.round((c.contract_value_cents ?? 0)/100).toLocaleString()}</span>
                            </div>
                            {risk && <div className="mt-1 text-[10px] text-destructive">{risk}</div>}
                          </div>
                        );
                      })}
                      {rows.length === 0 && <div className="text-[11px] text-muted-foreground text-center py-6">Drop here</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="atrisk">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-destructive/5 text-xs font-semibold uppercase tracking-wider text-destructive">
                Auto-flagged: health &lt; 50, or renewal &lt; 30d with no conversation started, or renewal overdue
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Client</th>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-right p-3 font-mono">Health</th>
                    <th className="text-left p-3">Renewal</th>
                    <th className="text-left p-3">Stage</th>
                    <th className="text-left p-3">Reason</th>
                    <th className="text-right p-3 font-mono">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map(({ c, reason }) => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/20">
                      <td className="p-3"><div className="font-medium">{c.full_name}</div><div className="text-[11px] text-muted-foreground">{c.email}</div></td>
                      <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                      <td className="p-3 text-right font-mono text-destructive">{Number(c.health_score ?? 0)}</td>
                      <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                      <td className="p-3 text-xs uppercase">{(c.renewal_stage || "not_started").replace("_", " ")}</td>
                      <td className="p-3 text-xs text-destructive">{reason}</td>
                      <td className="p-3 text-right font-mono">${Math.round((c.contract_value_cents ?? 0)/100).toLocaleString()}</td>
                    </tr>
                  ))}
                  {atRisk.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">No clients at risk. 🟢</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="ltv">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-right p-3 font-mono">Clients</th>
                    <th className="text-right p-3 font-mono">Total LTV</th>
                    <th className="text-right p-3 font-mono">Avg deal</th>
                    <th className="text-left p-3">% of revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {ltvByOffer.map(o => {
                    const sharePct = ltv > 0 ? (o.total / 100 / ltv) * 100 : 0;
                    return (
                      <tr key={o.offer} className="border-t border-border hover:bg-muted/20">
                        <td className="p-3 font-medium">{o.offer}</td>
                        <td className="p-3 text-right font-mono">{o.count}</td>
                        <td className="p-3 text-right font-mono text-[color:var(--color-success)]">${Math.round(o.total/100).toLocaleString()}</td>
                        <td className="p-3 text-right font-mono">${Math.round(o.avg/100).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${sharePct}%` }} />
                            </div>
                            <span className="text-[11px] font-mono w-12 text-right">{sharePct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ltvByOffer.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">No offers yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="table">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr><th className="text-left p-3">Client</th><th className="text-left p-3">Offer</th><th className="text-left p-3">Start</th>
                    <th className="text-right p-3 font-mono">Contract</th><th className="text-center p-3">Plan</th>
                    <th className="text-right p-3 font-mono">Health</th><th className="text-left p-3">Renewal</th><th className="text-left p-3">Stage</th></tr>
                </thead>
                <tbody>
                  {(clients ?? []).map(c => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => { setEditing(c); setPlanChecked(!!c.payment_plan); }}>
                      <td className="p-3"><div className="font-medium flex items-center gap-2">{c.full_name}<Pencil className="h-3 w-3 text-muted-foreground" /></div><div className="text-[11px] text-muted-foreground">{c.email}</div></td>
                      <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{c.start_date}</td>
                      <td className="p-3 text-right font-mono">${Math.round((c.contract_value_cents ?? 0)/100).toLocaleString()}</td>
                      <td className="p-3 text-center text-xs">{c.payment_plan ? `${c.installments_remaining} left` : "PIF"}</td>
                      <td className="p-3 text-right font-mono">{Number(c.health_score ?? 0)}</td>
                      <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                      <td className="p-3"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{(c.renewal_stage || "not_started").replace("_", " ")}</span></td>
                    </tr>
                  ))}
                  {(!clients || clients.length === 0) && <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">No clients yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit client</DialogTitle></DialogHeader>
            {editing && (
              <>
                <ClientForm initial={editing} onSubmit={(f) => update.mutate({ id: editing.id, f })} planChecked={planChecked} setPlanChecked={setPlanChecked} pending={update.isPending} />
                <div className="border-t border-border pt-4 mt-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Sparkles className="h-3 w-3" /> Pre-close summary</div>
                  {editing.pre_close_summary ? (
                    <p className="text-sm whitespace-pre-wrap rounded bg-muted/30 p-3">{editing.pre_close_summary}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No summary yet.</p>
                  )}
                  <Button size="sm" variant="outline" disabled={preClose.isPending} onClick={() => preClose.mutate(editing.id)}>
                    {preClose.isPending ? "Generating…" : (editing.pre_close_summary ? "Regenerate from DMs + calls" : "Generate from DMs + calls")}
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function ClientForm({ initial, onSubmit, planChecked, setPlanChecked, pending }: {
  initial?: ClientRow;
  onSubmit: (f: FormData) => void;
  planChecked: boolean;
  setPlanChecked: (v: boolean) => void;
  pending: boolean;
}) {
  const [installmentsLeft, setInstallmentsLeft] = useState<number>(initial?.installments_remaining ?? 0);
  const [installmentAmt, setInstallmentAmt] = useState<number>(initial ? (initial.installment_amount_cents ?? 0) / 100 : 0);
  const remainingBalance = installmentsLeft * installmentAmt;

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Name</Label><Input name="full_name" required defaultValue={initial?.full_name} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" defaultValue={initial?.email ?? ""} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Phone</Label><Input name="phone" defaultValue={initial?.phone ?? ""} /></div>
        <div className="space-y-1.5"><Label>Offer</Label><Input name="offer_name" placeholder="Mastermind / 1:1 / Course" defaultValue={initial?.offer_name ?? ""} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label>Contract $</Label><Input name="contract_value" type="number" step="0.01" defaultValue={initial ? (initial.contract_value_cents ?? 0)/100 : ""} /></div>
        <div className="space-y-1.5"><Label>Invested to date $</Label><Input name="invested_to_date" type="number" step="0.01" defaultValue={initial ? (initial.invested_to_date_cents ?? 0)/100 : ""} /></div>
        <div className="space-y-1.5"><Label>Start date</Label><Input name="start_date" type="date" defaultValue={initial?.start_date ?? new Date().toISOString().slice(0,10)} /></div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" name="payment_plan" checked={planChecked} onChange={(e) => setPlanChecked(e.target.checked)} /> Payment plan (uncheck for paid-in-full)
      </label>
      {planChecked && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Installments left</Label>
              <Input name="installments_remaining" type="number" min={0} value={installmentsLeft}
                onChange={(e) => setInstallmentsLeft(Number(e.target.value || 0))} />
            </div>
            <div className="space-y-1.5">
              <Label>$ per installment</Label>
              <Input name="installment_amount" type="number" step="0.01" min={0} value={installmentAmt}
                onChange={(e) => setInstallmentAmt(Number(e.target.value || 0))} />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">Remaining balance</span>
            <span className="font-mono font-semibold text-[color:var(--color-success)]">
              ${remainingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Next payment $ <span className="text-muted-foreground font-normal">(auto)</span></Label>
              <Input name="expected_next_payment" type="number" step="0.01"
                placeholder={installmentAmt ? String(installmentAmt) : "0"}
                defaultValue={initial?.expected_next_payment_cents ? (initial.expected_next_payment_cents/100) : ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Next payment date</Label>
              <Input name="expected_next_payment_date" type="date" defaultValue={initial?.expected_next_payment_date ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Renewal date</Label>
            <Input name="renewal_date" type="date" defaultValue={initial?.renewal_date ?? ""} />
          </div>
        </div>
      )}
      <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} /></div>
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "…" : initial ? "Save changes" : "Save client"}</Button>
    </form>
  );
}
