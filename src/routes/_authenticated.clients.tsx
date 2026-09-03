import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockClients, mockPreCloseSummary, withMockDelay } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  BadgeCheck,
  HeartPulse,
  Repeat,
  AlertTriangle,
  Sparkles,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { generatePreCloseFn } from "@/lib/pre-close.functions";
import { notifyClientStageChangedFn } from "@/lib/client-events.functions";
import { KanbanBoard, KanbanCardAnatomy } from "@/components/kanban-board";
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import {
  daysUntilDate,
  clientAtRiskReason,
  evaluateTransparentHealth,
  HEALTH_STATUS_OPTIONS,
  type HealthStatus,
} from "@/lib/client-risk";
import { deduplicatePaymentRecords, evaluateAttributionEvidence } from "@/lib/acquisition";
import {
  generatePaymentSchedule,
  paymentProgress,
  expectedVsActualSeries,
  collectionRatePct,
  effectiveScheduleStatus,
} from "@/lib/mentee-payments";
import { AttributionEvidencePanel } from "@/components/attribution-evidence-panel";
import { AttributionPathPanel, type AttributionPath } from "@/components/attribution-path-panel";
import { MenteeOperationsPanel } from "@/components/mentee-operations-panel";
import { CollectionsChart } from "@/components/mentee-collections-chart";
import { MenteeScheduledComms } from "@/components/mentee-scheduled-comms";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";

export const Route = createFileRoute("/_authenticated/clients")({
  component: Mentees,
  validateSearch: (s: Record<string, unknown>) => ({
    openId: typeof s.openId === "string" ? s.openId : undefined,
  }),
});

// Order matches the spec's exact renewal pipeline stage list (section 7).
const STAGES = [
  { key: "not_started", label: "Not Started", tone: "default" },
  { key: "outreach_started", label: "Outreach Started", tone: "info" },
  { key: "conversation", label: "Renewal Conversation", tone: "info" },
  { key: "proposal", label: "Proposal / Payment Link Sent", tone: "warning" },
  { key: "won", label: "Renewed", tone: "success" },
  { key: "churned", label: "Churned", tone: "destructive" },
] as const;

const stageLabel = (value: string | null | undefined) =>
  STAGES.find((stage) => stage.key === value)?.label ??
  (value || "not_started").replaceAll("_", " ");

type Stage = (typeof STAGES)[number]["key"];

type PaymentRow = {
  id: string;
  client_id: string | null;
  amount_cents: number;
  status: string;
  collected_at: string;
  currency: string;
};

type ScheduleRow = {
  id: string;
  client_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
};

type RenewalWorkItemRow = {
  id: string;
  client_id: string;
  owner_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  stage: string;
  reason: string | null;
  risk: string;
};

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
  renewal_date: string | null;
  renewal_conv_started: boolean | null;
  renewal_stage: string | null;
  notes: string | null;
  pre_close_summary: string | null;
};

function ClientPortfolioHero({
  contractedLtv,
  active,
  atRisk,
}: {
  contractedLtv: number;
  active: number;
  atRisk: number;
}) {
  return (
    <div className="hover-lift relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contracted LTV
          </div>
          <div className="display-serif mt-1 text-5xl font-bold tabular-nums text-spectrum-hot md:text-6xl">
            ${contractedLtv.toLocaleString()}
          </div>
        </div>
        {atRisk > 0 && (
          <span className="badge-glass shrink-0 font-mono normal-case tracking-normal text-destructive">
            {atRisk} at-risk
          </span>
        )}
      </div>
      <div className="relative text-2xs text-muted-foreground">
        {active} active mentee{active === 1 ? "" : "s"}
      </div>
    </div>
  );
}

function MenteeLifecycleEvidence({
  client,
  payments,
  schedule,
  health,
  renewal,
  orgId,
}: {
  client: ClientRow;
  payments: PaymentRow[];
  schedule: ScheduleRow[];
  health: ReturnType<typeof evaluateTransparentHealth> | undefined;
  renewal: RenewalWorkItemRow | undefined;
  orgId: string | undefined;
}) {
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState("");
  const clientPayments = deduplicatePaymentRecords(
    payments.filter((payment) => payment.client_id === client.id),
  );
  const collectedCents = clientPayments
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);
  const outstandingCents = Math.max(0, (client.contract_value_cents ?? 0) - collectedCents);
  const forecastedCents = client.expected_next_payment_cents ?? 0;
  const evidence = evaluateAttributionEvidence({
    model: "lead_source",
    supportingEvents: clientPayments.length ? ["client_record", "payment"] : ["client_record"],
    knownTouchpoints: clientPayments.length ? 2 : 1,
    sampleSize: clientPayments.length,
    directOutcomeLinked: clientPayments.length > 0,
    drilldownKey: client.id,
  });
  const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

  const { data: activity = [] } = useQuery({
    queryKey: ["client-activity", orgId, client.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_activity_events")
        .select("id, event_type, body, actor_name, created_at")
        .eq("client_id", client.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("client_activity_events")
        .insert({ org_id: orgId!, client_id: client.id, event_type: "note", body });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["client-activity", orgId, client.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lifecyclePath: AttributionPath[] = [
    {
      id: "mentee-lifecycle",
      label:
        "Source/campaign → capture mechanism → setter/dialer → closer → offer → payment plan → cash → health → outcome",
      stages: [
        {
          key: "source",
          label: "Source / Campaign",
          value: null,
          detail: "No verified lead join stored on the mentee record",
        },
        {
          key: "capture",
          label: "Capture Mechanism",
          value: null,
          detail: "Not connected — lives on the originating lead, not the mentee",
        },
        {
          key: "rep",
          label: "Setter / Dialer / Closer",
          value: null,
          detail: "Not connected — join via lead_id → calls when available",
        },
        {
          key: "offer",
          label: "Offer",
          value: client.offer_name ? 1 : 0,
          detail: client.offer_name ?? "No offer recorded",
        },
        {
          key: "plan",
          label: "Payment Plan",
          value: client.payment_plan ? 1 : 0,
          detail: client.payment_plan ? `${schedule.length} scheduled` : "Paid in full",
        },
        {
          key: "cash",
          label: "Cash Collected",
          value: Math.round(collectedCents / 100),
          detail: money(collectedCents),
        },
        {
          key: "health",
          label: "Health",
          value: health?.score ?? null,
          detail: health?.status ?? "unavailable",
        },
        {
          key: "outcome",
          label: "Renewal / Upgrade / Churn",
          value: null,
          detail: stageLabel(client.renewal_stage),
        },
      ],
    },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
      <AttributionEvidencePanel
        evidence={evidence}
        title={`Lifecycle evidence · ${client.full_name}`}
        unavailableMessage="No verified acquisition-to-retention relationship is available for this mentee."
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Contracted", money(client.contract_value_cents ?? 0)],
          ["Collected", money(collectedCents)],
          ["Outstanding", money(outstandingCents)],
          ["Forecasted", money(forecastedCents)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border/60 bg-card/60 p-2.5">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/60 bg-card/60 p-3">
        <div className="flex items-center justify-between">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Health — {health?.status ?? "unavailable"}{" "}
            {health?.score != null ? `(${health.score})` : ""}
          </div>
          {renewal?.next_action && (
            <span className="text-3xs text-cyan-300">Next: {renewal.next_action}</span>
          )}
        </div>
        <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
          {(health?.reasons ?? ["Insufficient lifecycle and payment data"]).map((r) => (
            <li key={r}>· {r}</li>
          ))}
        </ul>
      </div>

      {client.payment_plan && (
        <div className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Payment-plan timeline
          </div>
          {schedule.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {schedule
                .sort((a, b) => a.due_date.localeCompare(b.due_date))
                .map((s) => (
                  <span
                    key={s.id}
                    className={`rounded px-1.5 py-0.5 text-3xs font-mono ${
                      s.status === "paid"
                        ? "bg-emerald-500/10 text-emerald-500"
                        : s.status === "overdue"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                    title={`${money(s.amount_cents)} · ${s.status}`}
                  >
                    {s.due_date}
                  </span>
                ))}
            </div>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">
              No schedule generated yet — save the mentee with plan details to generate one.
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-card/60 p-3">
        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
          Payment ledger
        </div>
        {clientPayments.length ? (
          <div className="mt-2 max-h-32 overflow-y-auto">
            <table className="w-full text-2xs">
              <tbody>
                {clientPayments.slice(0, 20).map((p) => (
                  <tr key={p.id} className="border-t border-border/40">
                    <td className="py-1 text-muted-foreground">
                      {new Date(p.collected_at).toLocaleDateString()}
                    </td>
                    <td className="py-1 uppercase text-muted-foreground">{p.status}</td>
                    <td className="py-1 text-right font-mono">{money(p.amount_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-1 text-xs text-muted-foreground">No payment records yet.</div>
        )}
      </div>

      <AttributionPathPanel
        title="Mentee lifecycle attribution"
        subtitle="Original source through to renewal/upgrade/churn — stages without a verified join show Not Connected, never guessed"
        paths={lifecyclePath}
      />

      <div className="rounded-lg border border-border/60 bg-card/60 p-3">
        <div className="text-3xs uppercase tracking-wider text-muted-foreground">
          Activity timeline
        </div>
        <div className="mt-2 flex gap-1.5">
          <Input
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Add a note…"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7 text-2xs"
            disabled={!noteDraft.trim() || addNote.isPending}
            onClick={() => addNote.mutate(noteDraft.trim())}
          >
            Add
          </Button>
        </div>
        {activity.length ? (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-2xs">
            {activity.map((a) => (
              <li key={a.id} className="border-t border-border/40 pt-1.5 first:border-0 first:pt-0">
                <span className="text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()} ·{" "}
                </span>
                <span className="uppercase text-muted-foreground">{a.event_type}</span>
                {a.body ? <span> — {a.body}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 text-xs text-muted-foreground">No activity logged yet.</div>
        )}
      </div>
    </div>
  );
}

function Mentees() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const [query, setQuery] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthStatus | "all">("all");
  const [collectionsRange, setCollectionsRange] = useState<
    "7d" | "30d" | "mtd" | "quarter" | "custom"
  >("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const generatePreClose = useServerFn(generatePreCloseFn);
  const notifyStageChanged = useServerFn(notifyClientStageChangedFn);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockClients() as unknown as ClientRow[];
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, full_name, email, phone, offer_name, start_date, contract_value_cents, invested_to_date_cents, expected_next_payment_cents, expected_next_payment_date, payment_plan, installments_remaining, installment_amount_cents, status, renewal_date, renewal_conv_started, renewal_stage, notes, pre_close_summary",
        )
        .eq("org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  // Deep link from anywhere a mentee name appears elsewhere in the app
  // (?openId=…) — opens the same profile drawer every other entry point uses.
  const { openId } = Route.useSearch();
  useEffect(() => {
    if (!openId || !clients) return;
    const match = clients.find((c) => c.id === openId);
    if (match) {
      setEditing(match);
      setPlanChecked(!!match.payment_plan);
    }
  }, [openId, clients]);

  const { data: payments = [], isLoading: paymentsLoading } = useQuery({
    queryKey: ["mentee-payments", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return [] as PaymentRow[];
      const { data, error } = await supabase
        .from("payments")
        .select("id, client_id, amount_cents, status, collected_at, currency")
        .eq("org_id", orgId!)
        .order("collected_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const { data: scheduleItems = [] } = useQuery({
    queryKey: ["payment-schedule-items", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_schedule_items")
        .select("id, client_id, due_date, amount_cents, status")
        .eq("org_id", orgId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });

  const { data: renewalWorkItems = [] } = useQuery({
    queryKey: ["renewal-work-items", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_work_items")
        .select("id, client_id, owner_id, next_action, next_action_at, stage, reason, risk")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as RenewalWorkItemRow[];
    },
  });

  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass
        ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS)
        : settingsFn({ data: { orgId: orgId! } }),
  });
  const renewalAtRiskDays =
    workspaceSettings?.clients.renewalAtRiskDays ??
    DEFAULT_WORKSPACE_SETTINGS.clients.renewalAtRiskDays;

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: Stage }) => {
      const current = clients?.find((c) => c.id === id);
      const fromStage = (current?.renewal_stage as string | null) ?? "not_started";
      if (fromStage === stage) return;
      const patch: { renewal_stage: string; renewal_conv_started?: boolean; status?: string } = {
        renewal_stage: stage,
      };
      if (stage === "conversation") patch.renewal_conv_started = true;
      if (stage === "churned") patch.status = "churned";
      if (stage === "won") patch.status = "active";
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
      // Keep renewal_work_items (the real Renewal Action / Next Step record)
      // in sync with the kanban stage, and log it to the activity timeline.
      const existingRenewal = renewalByClient.get(id);
      const renewalPatch = { stage, renewal_date: current?.renewal_date ?? null };
      if (existingRenewal) {
        await supabase.from("renewal_work_items").update(renewalPatch).eq("id", existingRenewal.id);
      } else {
        await supabase
          .from("renewal_work_items")
          .insert({ org_id: orgId!, client_id: id, ...renewalPatch });
      }
      await supabase.from("client_activity_events").insert({
        org_id: orgId!,
        client_id: id,
        event_type: "renewal_stage_changed",
        body: `${stageLabel(fromStage)} → ${stageLabel(stage)}`,
      });
      // Fire Slack/Discord/webhook notification — non-blocking on failure
      try {
        await notifyStageChanged({
          data: { client_id: id, from_stage: fromStage, to_stage: stage },
        });
      } catch {
        /* ignore */
      }
    },
    onSuccess: () => {
      toast.success("Stage updated · team notified");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["renewal-work-items", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const buildPatch = (f: FormData) => {
    const isPlan = f.get("payment_plan") === "on";
    const installmentsLeft = Number(f.get("installments_remaining") || 0);
    const installmentAmt = Math.round(Number(f.get("installment_amount") || 0) * 100);
    // Auto-fill next payment $ from per-installment amount when on a plan and no override entered
    const nextPaymentRaw = Number(f.get("expected_next_payment") || 0);
    const nextPaymentCents =
      nextPaymentRaw > 0 ? Math.round(nextPaymentRaw * 100) : isPlan ? installmentAmt : 0;
    return {
      full_name: String(f.get("full_name") || ""),
      email: String(f.get("email") || "") || null,
      phone: String(f.get("phone") || "") || null,
      offer_name: String(f.get("offer_name") || "") || null,
      contract_value_cents: Math.round(Number(f.get("contract_value") || 0) * 100),
      invested_to_date_cents: Math.round(Number(f.get("invested_to_date") || 0) * 100),
      expected_next_payment_cents: nextPaymentCents,
      expected_next_payment_date: String(f.get("expected_next_payment_date") || "") || null,
      start_date: String(f.get("start_date") || new Date().toISOString().slice(0, 10)),
      renewal_date: isPlan ? String(f.get("renewal_date") || "") || null : null,
      payment_plan: isPlan,
      installments_remaining: isPlan ? installmentsLeft : 0,
      installment_amount_cents: isPlan ? installmentAmt : 0,
      notes: String(f.get("notes") || "") || null,
    };
  };

  // Strict payment-plan schedule (spec section 7) — regenerated from the
  // form's current plan fields on every save, so it never drifts from what
  // the mentee record actually says. Only touches rows that haven't been
  // paid yet; a real payment already recorded against a due date is untouched.
  const syncPaymentSchedule = async (clientId: string, patch: ReturnType<typeof buildPatch>) => {
    if (!orgId) return;
    await supabase
      .from("payment_schedule_items")
      .delete()
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .neq("status", "paid");
    const rows = generatePaymentSchedule({
      id: clientId,
      payment_plan: patch.payment_plan,
      installments_remaining: patch.installments_remaining,
      installment_amount_cents: patch.installment_amount_cents,
      expected_next_payment_date: patch.expected_next_payment_date,
    });
    if (rows.length) {
      await supabase.from("payment_schedule_items").upsert(
        rows.map((r) => ({ org_id: orgId, client_id: clientId, ...r })),
        { onConflict: "org_id,client_id,due_date", ignoreDuplicates: true },
      );
    }
  };

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const patch = buildPatch(f);
      const { data, error } = await supabase
        .from("clients")
        .insert({ org_id: orgId!, status: "active", ...patch })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) await syncPaymentSchedule(data.id, patch);
    },
    onSuccess: () => {
      toast.success("Mentee added");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["payment-schedule-items", orgId] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const update = useMutation({
    mutationFn: async ({ id, f }: { id: string; f: FormData }) => {
      const patch = buildPatch(f);
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
      await syncPaymentSchedule(id, patch);
    },
    onSuccess: () => {
      toast.success("Mentee updated");
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["payment-schedule-items", orgId] });
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const preClose = useMutation({
    mutationFn: async (clientId: string) => {
      if (devBypass) {
        const r = await withMockDelay(mockPreCloseSummary());
        // No real write happens under dev bypass — patch the cached mock row directly.
        qc.setQueryData<ClientRow[]>(["clients", orgId, devBypass], (prev) =>
          (prev ?? []).map((c) => (c.id === clientId ? { ...c, pre_close_summary: r.summary } : c)),
        );
        return r;
      }
      return generatePreClose({ data: { client_id: clientId, org_id: orgId! } });
    },
    onSuccess: () => {
      toast.success("Pre-close summary generated");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const active = clients?.filter((c) => c.status === "active").length ?? 0;
  const contractedLtv =
    (clients?.reduce((s, c) => s + (c.contract_value_cents ?? 0), 0) ?? 0) / 100;
  const renewalsDue =
    clients?.filter((c) => {
      const d = daysUntilDate(c.renewal_date);
      return d !== null && d >= 0 && d < renewalAtRiskDays;
    }).length ?? 0;
  const paidCollectionsCents = deduplicatePaymentRecords(
    payments.filter((p) => p.status === "paid"),
  ).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const openPlans =
    clients?.filter((c) => c.payment_plan && (c.installments_remaining ?? 0) > 0).length ?? 0;
  const outstandingBalanceCents = (clients ?? []).reduce(
    (sum, c) => sum + Math.max((c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0), 0),
    0,
  );
  const forecast30DayCents = (clients ?? []).reduce((sum, c) => {
    const days = daysUntilDate(c.expected_next_payment_date);
    return days !== null && days >= 0 && days <= 30
      ? sum + (c.expected_next_payment_cents ?? 0)
      : sum;
  }, 0);

  // Portfolio Cash Health (spec section 7) — the additional KPIs beyond what
  // was already on the page. Collected cash MTD is deliberately distinct
  // from all-time "Paid collections" above (never combined into one LTV).
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const collectedMtdCents = deduplicatePaymentRecords(
    payments.filter((p) => p.status === "paid" && new Date(p.collected_at) >= monthStart),
  ).reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);
  const dueNext7dCents = (clients ?? []).reduce((sum, c) => {
    const days = daysUntilDate(c.expected_next_payment_date);
    return days !== null && days >= 0 && days <= 7
      ? sum + (c.expected_next_payment_cents ?? 0)
      : sum;
  }, 0);
  const failedPaymentsCount = payments.filter((p) => p.status === "failed").length;
  // Ages "scheduled" rows past their due date into "overdue" at read time —
  // see effectiveScheduleStatus for why (no background job mutates status).
  const effectiveScheduleItems = useMemo(
    () => scheduleItems.map((s) => ({ ...s, status: effectiveScheduleStatus(s) })),
    [scheduleItems],
  );
  const collectionRate = collectionRatePct(effectiveScheduleItems);
  const atRiskFutureCashCents = (clients ?? [])
    .filter((c) => clientAtRiskReason(c, renewalAtRiskDays))
    .reduce(
      (sum, c) =>
        sum + Math.max((c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0), 0),
      0,
    );

  const failedCentsByClient = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      if (p.status !== "failed" || !p.client_id) continue;
      m.set(p.client_id, (m.get(p.client_id) ?? 0) + p.amount_cents);
    }
    return m;
  }, [payments]);
  const lastActivityByClient = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of payments) {
      if (!p.client_id) continue;
      const cur = m.get(p.client_id);
      if (!cur || p.collected_at > cur) m.set(p.client_id, p.collected_at);
    }
    return m;
  }, [payments]);
  const scheduleByClient = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    for (const s of effectiveScheduleItems) {
      const arr = m.get(s.client_id) ?? [];
      arr.push(s);
      m.set(s.client_id, arr);
    }
    return m;
  }, [effectiveScheduleItems]);
  const renewalByClient = useMemo(
    () => new Map(renewalWorkItems.map((r) => [r.client_id, r])),
    [renewalWorkItems],
  );
  // Transparent health (visible reasons, never a bare number) — the same
  // evaluateTransparentHealth() that client-risk.test.ts already covers,
  // now actually wired into the UI instead of only unit-tested.
  const healthByClient = useMemo(() => {
    const m = new Map<string, ReturnType<typeof evaluateTransparentHealth>>();
    for (const c of clients ?? []) {
      const lastActivity = lastActivityByClient.get(c.id);
      const daysSinceActivity = lastActivity
        ? Math.max(0, -1 * (daysUntilDate(lastActivity.slice(0, 10)) ?? 0))
        : null;
      m.set(
        c.id,
        evaluateTransparentHealth({
          renewalDate: c.renewal_date,
          renewalConversationStarted: c.renewal_conv_started,
          overdueCents:
            Math.max(0, (c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0)) > 0 &&
            daysUntilDate(c.expected_next_payment_date) != null &&
            (daysUntilDate(c.expected_next_payment_date) ?? 0) < 0
              ? (c.expected_next_payment_cents ?? 0)
              : 0,
          failedCents: failedCentsByClient.get(c.id) ?? 0,
          daysSinceActivity,
        }),
      );
    }
    return m;
  }, [clients, failedCentsByClient, lastActivityByClient]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter((c) => {
      if (healthFilter !== "all" && healthByClient.get(c.id)?.status !== healthFilter) return false;
      if (!q) return true;
      return [c.full_name, c.email, c.phone, c.offer_name, c.notes].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      );
    });
  }, [clients, query, healthFilter, healthByClient]);
  const {
    page: tablePage,
    setPage: setTablePage,
    pageCount: tablePageCount,
    paged: pagedView,
    total: tableTotal,
    pageSize: tablePageSize,
  } = usePagination(view, 25);

  // At-risk list (auto-tagged) — renewal-proximity only, most urgent first
  // (overdue, then soonest). See client-risk.ts for why health_score isn't used.
  const atRisk = useMemo(() => {
    return view
      .map((c) => ({ c, reason: clientAtRiskReason(c, renewalAtRiskDays) }))
      .filter((x) => x.reason)
      .sort(
        (a, b) =>
          (daysUntilDate(a.c.renewal_date) ?? Infinity) -
          (daysUntilDate(b.c.renewal_date) ?? Infinity),
      );
  }, [view, renewalAtRiskDays]);

  // LTV by offer
  const ltvByOffer = useMemo(() => {
    const m = new Map<string, { count: number; total: number }>();
    for (const c of view) {
      const k = c.offer_name || "(no offer)";
      const cur = m.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += c.contract_value_cents ?? 0;
      m.set(k, cur);
    }
    return Array.from(m.entries())
      .map(([offer, v]) => ({
        offer,
        count: v.count,
        total: v.total,
        avg: v.count ? v.total / v.count : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [view]);

  // Group clients by renewal_stage for kanban
  const byStage = useMemo(() => {
    const m = new Map<Stage, ClientRow[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    for (const c of view) {
      const stage = (c.renewal_stage as Stage) || "not_started";
      const arr = m.get(stage) ?? m.get("not_started")!;
      arr.push(c);
    }
    return m;
  }, [view]);

  return (
    <>
      <TopBar title="Mentees & Renewals" subtitle="Collected LTV, health, and renewal pipeline" />
      <div className="p-6 space-y-5">
        {/* Page hero (B1) — Total LTV relocated into a richer mega-number (same
            value, not duplicated below); everything else stays in the flat grid.
            Health/renewals/at-risk are threshold-driven semantic state, correctly
            left untouched. */}
        <BentoGrid cols={2} rowHeight="9rem">
          <BentoCell span="wide">
            <ClientPortfolioHero
              contractedLtv={contractedLtv}
              active={active}
              atRisk={atRisk.length}
            />
          </BentoCell>
        </BentoGrid>

        {/* "Avg health" used to live here — removed, not just re-thresholded.
            health_score is a dead column (never computed or edited anywhere),
            so an average of it is always ~100 for every workspace forever;
            displaying it implied real health tracking that doesn't exist. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Active mentees"
            value={active}
            spectrum="hot"
            icon={<BadgeCheck className="h-4 w-4" />}
          />
          <StatCard
            label={`Renewals <${renewalAtRiskDays}d`}
            value={renewalsDue}
            accent={renewalsDue ? "warning" : "primary"}
            icon={<Repeat className="h-4 w-4" />}
          />
          <StatCard
            label="At-risk"
            value={atRisk.length}
            accent={atRisk.length ? "destructive" : "primary"}
            icon={<AlertTriangle className="h-4 w-4" />}
            hint="Auto-flagged"
          />
          <StatCard
            label="Paid collections"
            value={`$${(paidCollectionsCents / 100).toLocaleString()}`}
            spectrum="hot"
            icon={<BadgeCheck className="h-4 w-4" />}
            hint={
              paymentsLoading
                ? "Loading ledger"
                : `${payments.filter((p) => p.status === "paid").length} payments`
            }
          />
          <StatCard
            label="Open payment plans"
            value={openPlans}
            spectrum="mid"
            icon={<Repeat className="h-4 w-4" />}
            hint="Installments remaining"
          />
          <StatCard
            label="Forecast · next 30d"
            value={`$${(forecast30DayCents / 100).toLocaleString()}`}
            spectrum="mid"
            icon={<Repeat className="h-4 w-4" />}
            hint="Scheduled payment events"
          />
          <StatCard
            label="Outstanding balance"
            value={`$${(outstandingBalanceCents / 100).toLocaleString()}`}
            spectrum="hot"
            icon={<AlertTriangle className="h-4 w-4" />}
            hint="Contracted less invested"
          />
          <StatCard
            label="Collected cash MTD"
            value={`$${(collectedMtdCents / 100).toLocaleString()}`}
            spectrum="hot"
            icon={<BadgeCheck className="h-4 w-4" />}
            hint="Month-to-date, distinct from all-time"
          />
          <StatCard
            label="Due next 7d"
            value={`$${(dueNext7dCents / 100).toLocaleString()}`}
            spectrum="mid"
            icon={<Repeat className="h-4 w-4" />}
          />
          <StatCard
            label="Failed / retry-pending"
            value={failedPaymentsCount}
            accent={failedPaymentsCount ? "destructive" : "primary"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
          <StatCard
            label="Collection rate"
            value={collectionRate == null ? "—" : `${collectionRate.toFixed(0)}%`}
            spectrum="mid"
            icon={<Repeat className="h-4 w-4" />}
            hint={
              collectionRate == null
                ? "No scheduled payments logged yet"
                : "Paid / due schedule items"
            }
          />
          <StatCard
            label="At-risk future cash"
            value={`$${(atRiskFutureCashCents / 100).toLocaleString()}`}
            accent={atRiskFutureCashCents ? "destructive" : "primary"}
            icon={<AlertTriangle className="h-4 w-4" />}
          />
        </div>

        <CollectionsChart
          scheduleItems={scheduleItems}
          payments={payments}
          range={collectionsRange}
          onRangeChange={setCollectionsRange}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
        />

        <GlassTableShell
          toolbar={
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Collections ledger · source-backed payments only
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Collected</th>
                <th className="p-3 text-left">Mentee</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-right font-mono">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.slice(0, 8).map((payment) => {
                const mentee = clients?.find((client) => client.id === payment.client_id);
                return (
                  <tr key={payment.id} className="border-t border-border/70">
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(payment.collected_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">{mentee?.full_name ?? "Unavailable"}</td>
                    <td className="p-3 text-xs uppercase text-muted-foreground">
                      {payment.status}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {payment.currency}{" "}
                      {(payment.amount_cents / 100).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                );
              })}
              {!paymentsLoading && payments.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">
                    No payment records available for this workspace.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search mentees by name, email, offer, notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {view.length} / {clients?.length ?? 0}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setHealthFilter("all")}
                className={`rounded border px-2 py-1 text-2xs ${healthFilter === "all" ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
              >
                All health
              </button>
              {HEALTH_STATUS_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHealthFilter(h)}
                  className={`rounded border px-2 py-1 text-2xs capitalize ${healthFilter === h ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
                >
                  {h.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/onboarding">
              <Button size="sm" variant="outline">
                Onboarding intake
              </Button>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  Add mentee
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New mentee</DialogTitle>
                </DialogHeader>
                <ClientForm
                  onSubmit={(f) => create.mutate(f)}
                  planChecked={planChecked}
                  setPlanChecked={setPlanChecked}
                  pending={create.isPending}
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="kanban">
          <TabsList>
            <TabsTrigger value="kanban">Renewal pipeline</TabsTrigger>
            <TabsTrigger value="atrisk">At-risk · {atRisk.length}</TabsTrigger>
            <TabsTrigger value="ltv">LTV by offer</TabsTrigger>
            <TabsTrigger value="table">All mentees</TabsTrigger>
            <TabsTrigger value="operations">Recovery & renewal ops</TabsTrigger>
          </TabsList>

          <TabsContent value="kanban">
            <div className="text-xs text-muted-foreground mb-2">
              Drag cards between columns to update renewal stage.
            </div>
            <KanbanBoard
              columns={STAGES.map((s) => ({ key: s.key, label: s.label, tone: s.tone }))}
              itemsByColumn={byStage}
              onDropItem={(id, stage) => updateStage.mutate({ id, stage: stage as Stage })}
              sumBy={(c) => c.contract_value_cents ?? 0}
              loading={clientsLoading}
              renderCard={(c) => {
                const risk = clientAtRiskReason(c, renewalAtRiskDays);
                return (
                  <KanbanCardAnatomy
                    title={
                      <button
                        type="button"
                        className="text-left font-medium text-foreground hover:text-primary hover:underline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(c);
                          setPlanChecked(!!c.payment_plan);
                        }}
                      >
                        {c.full_name}
                      </button>
                    }
                    warning={risk ?? undefined}
                    metaLines={[
                      c.offer_name || "—",
                      `Next step: ${c.renewal_stage === "won" || c.renewal_stage === "churned" ? "Completed" : "Renewal action required"}`,
                    ]}
                    chip={
                      <div className="flex items-center justify-between text-2xs font-mono">
                        <span className="text-muted-foreground">{c.renewal_date ?? "no date"}</span>
                        <span className="text-spectrum-hot">
                          ${Math.round((c.contract_value_cents ?? 0) / 100).toLocaleString()}
                        </span>
                      </div>
                    }
                  />
                );
              }}
            />
          </TabsContent>

          <TabsContent value="atrisk">
            <GlassTableShell
              toolbar={
                <div className="text-2xs font-semibold uppercase tracking-wider text-destructive">
                  Auto-flagged: renewal &lt; {renewalAtRiskDays}d with no conversation started, or
                  renewal overdue
                </div>
              }
            >
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Mentee</th>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-left p-3">Renewal</th>
                    <th className="text-left p-3">Stage</th>
                    <th className="text-left p-3">Reason</th>
                    <th className="text-right p-3 font-mono">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map(({ c, reason }) => (
                    <tr key={c.id} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="font-medium">{c.full_name}</div>
                        <div className="text-2xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                      <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                      <td className="p-3 text-xs uppercase">{stageLabel(c.renewal_stage)}</td>
                      <td className="p-3 text-xs text-destructive">{reason}</td>
                      <td className="p-3 text-right font-mono">
                        ${Math.round((c.contract_value_cents ?? 0) / 100).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                  {clientsLoading && (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!clientsLoading && atRisk.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState
                          icon={<HeartPulse className="h-4 w-4" />}
                          title="No mentees at risk"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>

          <TabsContent value="ltv">
            <GlassTableShell>
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-right p-3 font-mono">Mentees</th>
                    <th className="text-right p-3 font-mono">Total LTV</th>
                    <th className="text-right p-3 font-mono">Avg deal</th>
                    <th className="text-left p-3">% of revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {ltvByOffer.map((o) => {
                    const sharePct = contractedLtv > 0 ? (o.total / 100 / contractedLtv) * 100 : 0;
                    return (
                      <tr key={o.offer} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3 font-medium">{o.offer}</td>
                        <td className="p-3 text-right font-mono">{o.count}</td>
                        <td className="p-3 text-right font-mono text-spectrum-hot">
                          ${Math.round(o.total / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${Math.round(o.avg / 100).toLocaleString()}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${sharePct}%` }}
                              />
                            </div>
                            <span className="text-2xs font-mono w-12 text-right">
                              {sharePct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ltvByOffer.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState icon={<Repeat className="h-4 w-4" />} title="No offers yet" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <MenteeOperationsPanel
              orgId={orgId}
              clients={view}
              payments={payments}
              renewalAtRiskDays={renewalAtRiskDays}
            />
            <MenteeScheduledComms orgId={orgId} clients={view} />
          </TabsContent>
          <TabsContent value="table">
            <GlassTableShell
              footer={
                tableTotal > 0 ? (
                  <Pagination
                    page={tablePage}
                    pageCount={tablePageCount}
                    onPage={setTablePage}
                    total={tableTotal}
                    pageSize={tablePageSize}
                  />
                ) : undefined
              }
            >
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Mentee</th>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-right p-3 font-mono">Contract</th>
                    <th className="text-right p-3 font-mono">Balance</th>
                    <th className="text-center p-3">Plan progress</th>
                    <th className="text-left p-3">Next payment</th>
                    <th className="text-left p-3">Last payment</th>
                    <th className="text-left p-3">Renewal</th>
                    <th className="text-left p-3">Stage</th>
                    <th className="text-left p-3">Owner / next step</th>
                    <th className="text-left p-3">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedView.map((c) => {
                    const schedule = scheduleByClient.get(c.id) ?? [];
                    const progress = paymentProgress(schedule);
                    const lastPayment = lastActivityByClient.get(c.id);
                    const balanceCents = Math.max(
                      0,
                      (c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0),
                    );
                    const renewal = renewalByClient.get(c.id);
                    const health = healthByClient.get(c.id);
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-border/70 hover:bg-muted/20 cursor-pointer"
                        onClick={() => {
                          setEditing(c);
                          setPlanChecked(!!c.payment_plan);
                        }}
                      >
                        <td className="p-3">
                          <div className="font-medium flex items-center gap-2">
                            {c.full_name}
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="text-2xs text-muted-foreground">{c.email}</div>
                        </td>
                        <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                        <td className="p-3 text-right font-mono">
                          ${Math.round((c.contract_value_cents ?? 0) / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-mono">
                          ${Math.round(balanceCents / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-center text-xs">
                          {c.payment_plan ? (
                            progress.total ? (
                              <div className="mx-auto flex max-w-[110px] items-center gap-1.5">
                                <div className="h-1.5 flex-1 overflow-hidden rounded bg-muted">
                                  <div
                                    className="h-full bg-primary"
                                    style={{
                                      width: `${progress.total ? (progress.paid / progress.total) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-mono text-3xs">{progress.label}</span>
                              </div>
                            ) : (
                              <span className="text-3xs text-muted-foreground">
                                {c.installments_remaining} left (no schedule)
                              </span>
                            )
                          ) : (
                            "PIF"
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {c.expected_next_payment_date ?? "—"}
                          {c.expected_next_payment_cents ? (
                            <div className="text-3xs text-muted-foreground">
                              ${Math.round(c.expected_next_payment_cents / 100).toLocaleString()}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {lastPayment ? new Date(lastPayment).toLocaleDateString() : "—"}
                        </td>
                        <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                        <td className="p-3">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">
                            {stageLabel(c.renewal_stage)}
                          </span>
                        </td>
                        <td className="p-3 text-2xs text-muted-foreground max-w-[160px] truncate">
                          {renewal?.next_action ?? "Unassigned"}
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-3xs uppercase ${
                              health?.status === "critical"
                                ? "bg-destructive/15 text-destructive"
                                : health?.status === "at_risk"
                                  ? "bg-destructive/10 text-destructive"
                                  : health?.status === "watch"
                                    ? "bg-amber-500/10 text-amber-500"
                                    : health?.status === "healthy"
                                      ? "bg-emerald-500/10 text-emerald-500"
                                      : "bg-muted text-muted-foreground"
                            }`}
                            title={health?.reasons.join(" · ")}
                          >
                            {(health?.status ?? "unavailable").replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {clientsLoading && (
                    <tr>
                      <td colSpan={11} className="p-10 text-center text-sm text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!clientsLoading && tableTotal === 0 && (
                    <tr>
                      <td colSpan={11}>
                        <EmptyState
                          icon={<Search className="h-4 w-4" />}
                          title={query ? "No matches" : "No mentees yet"}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>
        </Tabs>

        <Dialog
          open={!!editing}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit mentee</DialogTitle>
            </DialogHeader>
            {editing && (
              <>
                <MenteeLifecycleEvidence
                  client={editing}
                  payments={payments}
                  schedule={scheduleByClient.get(editing.id) ?? []}
                  health={healthByClient.get(editing.id)}
                  renewal={renewalByClient.get(editing.id)}
                  orgId={orgId}
                />
                <ClientForm
                  initial={editing}
                  onSubmit={(f) => update.mutate({ id: editing.id, f })}
                  planChecked={planChecked}
                  setPlanChecked={setPlanChecked}
                  pending={update.isPending}
                />
                <div className="border-t border-border pt-4 mt-2 space-y-2">
                  <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground">
                    <Sparkles className="h-3 w-3" /> Pre-close summary
                  </div>
                  {editing.pre_close_summary ? (
                    <p className="text-sm whitespace-pre-wrap rounded bg-muted/30 p-3">
                      {editing.pre_close_summary}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No summary yet.</p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={preClose.isPending}
                    onClick={() => preClose.mutate(editing.id)}
                  >
                    {preClose.isPending
                      ? "Generating…"
                      : editing.pre_close_summary
                        ? "Regenerate from DMs + calls"
                        : "Generate from DMs + calls"}
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

function ClientForm({
  initial,
  onSubmit,
  planChecked,
  setPlanChecked,
  pending,
}: {
  initial?: ClientRow;
  onSubmit: (f: FormData) => void;
  planChecked: boolean;
  setPlanChecked: (v: boolean) => void;
  pending: boolean;
}) {
  const [installmentsLeft, setInstallmentsLeft] = useState<number>(
    initial?.installments_remaining ?? 0,
  );
  const [installmentAmt, setInstallmentAmt] = useState<number>(
    initial ? (initial.installment_amount_cents ?? 0) / 100 : 0,
  );
  const remainingBalance = installmentsLeft * installmentAmt;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input name="full_name" required defaultValue={initial?.full_name} />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input name="email" type="email" defaultValue={initial?.email ?? ""} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input name="phone" defaultValue={initial?.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label>Offer</Label>
          <Input
            name="offer_name"
            placeholder="Mastermind / 1:1 / Course"
            defaultValue={initial?.offer_name ?? ""}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label>Contract $</Label>
          <Input
            name="contract_value"
            type="number"
            step="0.01"
            defaultValue={initial ? (initial.contract_value_cents ?? 0) / 100 : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Invested to date $</Label>
          <Input
            name="invested_to_date"
            type="number"
            step="0.01"
            defaultValue={initial ? (initial.invested_to_date_cents ?? 0) / 100 : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Start date</Label>
          <Input
            name="start_date"
            type="date"
            defaultValue={initial?.start_date ?? new Date().toISOString().slice(0, 10)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          name="payment_plan"
          checked={planChecked}
          onChange={(e) => setPlanChecked(e.target.checked)}
        />{" "}
        Payment plan (uncheck for paid-in-full)
      </label>
      {planChecked && (
        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Installments left</Label>
              <Input
                name="installments_remaining"
                type="number"
                min={0}
                value={installmentsLeft}
                onChange={(e) => setInstallmentsLeft(Number(e.target.value || 0))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>$ per installment</Label>
              <Input
                name="installment_amount"
                type="number"
                step="0.01"
                min={0}
                value={installmentAmt}
                onChange={(e) => setInstallmentAmt(Number(e.target.value || 0))}
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-muted-foreground">Remaining balance</span>
            <span className="font-mono font-semibold text-spectrum-hot">
              ${remainingBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Next payment $ <span className="text-muted-foreground font-normal">(auto)</span>
              </Label>
              <Input
                name="expected_next_payment"
                type="number"
                step="0.01"
                placeholder={installmentAmt ? String(installmentAmt) : "0"}
                defaultValue={
                  initial?.expected_next_payment_cents
                    ? initial.expected_next_payment_cents / 100
                    : ""
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Next payment date</Label>
              <Input
                name="expected_next_payment_date"
                type="date"
                defaultValue={initial?.expected_next_payment_date ?? ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Renewal date</Label>
            <Input name="renewal_date" type="date" defaultValue={initial?.renewal_date ?? ""} />
          </div>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "…" : initial ? "Save changes" : "Save mentee"}
      </Button>
    </form>
  );
}
