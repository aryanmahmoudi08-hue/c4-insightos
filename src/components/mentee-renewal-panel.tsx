import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { buildDemoCoreDataset } from "@/lib/demo-fixtures";
import {
  mockClients,
  mockPreCloseSummary,
  mockPayments,
  mockPaymentScheduleItems,
  mockRenewalWorkItems,
  withMockDelay,
} from "@/lib/dev-mock-data";
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
import {
  daysUntilDate,
  clientAtRiskReason,
  evaluateTransparentHealth,
  HEALTH_STATUS_OPTIONS,
  type HealthStatus,
} from "@/lib/client-risk";
import { deduplicatePaymentRecords, evaluateAttributionEvidence } from "@/lib/acquisition";
import { normalizeAcquisitionSource } from "@/lib/acquisition-source";
import {
  resolveLead,
  type TrafficLeadRow,
  type TrafficContentRow,
  type TrafficSourceRow,
} from "@/lib/traffic-hierarchy";
import {
  generatePaymentSchedule,
  paymentProgress,
  effectiveScheduleStatus,
  renewalRatePct,
  renewalPipelineValueCents,
  churnedValueCents,
  renewalConversionBy,
  averageTenureAtRenewalOutcome,
  collectedLtvByOffer,
  churnReasonBreakdown,
  daysBetween,
  installmentUrgency,
  INSTALLMENT_URGENCY_LABELS,
} from "@/lib/mentee-payments";
import { computeClientCashPosition } from "@/lib/payments-ledger";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import type { Derivation } from "@/lib/funnel-derivation";
import { MenteeOperationsPanel } from "@/components/mentee-operations-panel";
import { MenteeScheduledComms } from "@/components/mentee-scheduled-comms";
import { useMoney } from "@/hooks/use-money";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";

// Order matches the spec's exact renewal pipeline stage list (section 7).
const STAGES = [
  { key: "not_started", label: "Not Started", tone: "default" },
  { key: "outreach_started", label: "Outreach Started", tone: "info" },
  // Post-QA remediation: this column's box/card presentation must show
  // Renewal Action / Next Step, not a generic "Conversation" box — the
  // underlying "conversation" stage key/value stays (real workflow state,
  // still read/written via renewal_conv_started), only the label changes.
  { key: "conversation", label: "Renewal Action / Next Step", tone: "info" },
  { key: "proposal", label: "Proposal / Payment Link Sent", tone: "warning" },
  { key: "won", label: "Renewed", tone: "success" },
  { key: "churned", label: "Churned", tone: "destructive" },
] as const;

const stageLabel = (value: string | null | undefined) =>
  STAGES.find((stage) => stage.key === value)?.label ??
  (value || "not_started").replaceAll("_", " ");

type Stage = (typeof STAGES)[number]["key"];

/**
 * Demo / Preview Data mode (Priority 5) — Mentees & Renewals joins the
 * isolated demo system, built from the shared `buildDemoCoreDataset()`
 * fixture rather than a second one. `scheduleItems`/`renewalWorkItems` have
 * no dedicated fixture table — they're honestly derived from the same
 * clients/payments the KPI tiles already show (pending payments become
 * schedule rows, clients with a real renewal_stage become work items), not
 * separately invented numbers.
 */
function demoMenteesDataset() {
  const demo = buildDemoCoreDataset();
  const clients: MenteeRow[] = demo.clients.map((c) => ({
    id: c.id,
    lead_id: c.lead_id,
    full_name: c.full_name,
    email: c.email,
    phone: null,
    offer_name: c.offer_name,
    start_date: c.start_date,
    contract_value_cents: c.contract_value_cents,
    invested_to_date_cents: c.invested_to_date_cents,
    expected_next_payment_cents: c.payment_plan ? c.installment_amount_cents : null,
    expected_next_payment_date: null,
    payment_plan: c.payment_plan,
    installments_remaining: c.installments_remaining,
    installment_amount_cents: c.installment_amount_cents,
    status: c.status,
    renewal_date: c.renewal_date,
    renewal_conv_started: c.renewal_conv_started,
    renewal_stage: c.renewal_stage,
    notes: c.notes,
    pre_close_summary: null,
  }));
  const payments: PaymentRow[] = demo.payments.map((p) => ({
    id: p.id,
    client_id: p.client_id,
    amount_cents: p.amount_cents,
    status: p.status,
    collected_at: p.collected_at,
    currency: p.currency,
  }));
  const scheduleItems: ScheduleRow[] = demo.payments
    .filter((p) => p.status === "pending")
    .map((p) => ({
      id: `schedule-${p.id}`,
      client_id: p.client_id,
      due_date: p.collected_at.slice(0, 10),
      amount_cents: p.amount_cents,
      status: "pending",
      payment_id: null,
    }));
  const renewalWorkItems: RenewalWorkItemRow[] = demo.clients
    .filter((c) => c.renewal_stage)
    .map((c) => ({
      id: `renewal-${c.id}`,
      client_id: c.id,
      owner_id: null,
      next_action:
        c.renewal_stage === "overdue" ? "Reach out — renewal overdue" : "Send renewal offer",
      next_action_at: c.renewal_date,
      stage: c.renewal_stage!,
      reason: null,
      risk: c.status === "at_risk" ? "high" : c.renewal_stage === "overdue" ? "medium" : "low",
    }));
  return { clients, payments, scheduleItems, renewalWorkItems };
}

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
  payment_id: string | null;
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
  renewal_outcome?: string | null;
};

type MenteeAttribution = {
  source: string;
  setterName: string | null;
  closerName: string | null;
};

type MenteeRow = {
  id: string;
  lead_id: string | null;
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

/** One "renewal conversion by X" breakdown — reused for offer/health-band/
 * payment-plan/acquisition-source/closer cuts so the five tables in the
 * Analytics tab share one real implementation instead of five near-copies. */
function RenewalConversionTable({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; won: number; churned: number; ratePct: number }[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3">
      <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </div>
      {rows.length ? (
        <table className="mt-2 w-full text-xs">
          <thead className="text-3xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left py-1 font-normal">Segment</th>
              <th className="text-right py-1 font-normal font-sans tabular-nums">Won</th>
              <th className="text-right py-1 font-normal font-sans tabular-nums">Churned</th>
              <th className="text-right py-1 font-normal font-sans tabular-nums">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/40">
                <td className="py-1 pr-2 truncate max-w-[140px]" title={r.key}>
                  {r.key}
                </td>
                <td className="py-1 text-right font-sans tabular-nums text-emerald-500">{r.won}</td>
                <td className="py-1 text-right font-sans tabular-nums text-destructive">
                  {r.churned}
                </td>
                <td className="py-1 text-right font-sans tabular-nums">{r.ratePct.toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-2 text-2xs text-muted-foreground">
          No decided (won or churned) renewals yet.
        </div>
      )}
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
  attribution,
}: {
  client: MenteeRow;
  payments: PaymentRow[];
  schedule: ScheduleRow[];
  health: ReturnType<typeof evaluateTransparentHealth> | undefined;
  renewal: RenewalWorkItemRow | undefined;
  orgId: string | undefined;
  attribution: MenteeAttribution | undefined;
}) {
  const qc = useQueryClient();
  const { demoMode } = useDemoMode();
  const [noteDraft, setNoteDraft] = useState("");
  const clientPayments = deduplicatePaymentRecords(
    payments.filter((payment) => payment.client_id === client.id),
  );
  // Single source of truth for collected/outstanding — also used by
  // Payments' full ledger, so the two pages can never disagree.
  const { collectedCents, outstandingCents } = computeClientCashPosition(client, payments);
  const knownTouchpoints =
    [attribution?.source, attribution?.setterName, attribution?.closerName].filter(Boolean).length +
    (clientPayments.length ? 1 : 0);
  const evidence = evaluateAttributionEvidence({
    model: "lead_source",
    supportingEvents: [
      ...(attribution?.source ? ["lead_record"] : []),
      ...(clientPayments.length ? ["payment"] : []),
      "client_record",
    ],
    knownTouchpoints: Math.max(1, knownTouchpoints),
    sampleSize: clientPayments.length,
    directOutcomeLinked: !!attribution?.source && clientPayments.length > 0,
    drilldownKey: client.id,
  });
  const money = useMoney();

  const { data: activity = [] } = useQuery({
    queryKey: ["client-activity", orgId, client.id],
    // Demo mode isolation (item 31/32) — client.id under demoMode is a
    // fixture id, never a real client_activity_events row; disabling the
    // query keeps it an honest empty state instead of a pointless real
    // fetch, and the addNote mutation below is disabled the same way so a
    // demo-mode note can never write a real production row.
    enabled: !!orgId && !demoMode,
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
      if (demoMode) throw new Error("Notes aren't available in demo data.");
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

  // Compact lifecycle strip: Original Source → Setter/Dialer → Closer → Offer →
  // Payment Plan → Cash. The first three resolve via clients.lead_id joined
  // to leads/calls/profiles (same resolution traffic-hierarchy.ts uses for
  // Traffic); when a mentee has no lead_id, or Dev Bypass has no realistic
  // lead graph to join against, they honestly render "Not Connected" rather
  // than guessing.
  const lifecycleSegments: { label: string; value: string | null; fallback: string }[] = [
    { label: "Original Source", value: attribution?.source ?? null, fallback: "Not Connected" },
    { label: "Setter / Dialer", value: attribution?.setterName ?? null, fallback: "Not Connected" },
    { label: "Closer", value: attribution?.closerName ?? null, fallback: "Not Connected" },
    { label: "Offer", value: client.offer_name, fallback: "Unavailable" },
    {
      label: "Payment Plan",
      value: client.payment_plan ? "Payment Plan" : "Paid in full",
      fallback: "Unavailable",
    },
    { label: "Cash", value: money(collectedCents), fallback: "Unavailable" },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/70 bg-muted/10 p-4">
      <div className="rounded-lg border border-border/60 bg-card/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Lifecycle attribution
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/payments"
              search={{ client: client.id } as never}
              className="text-3xs font-medium text-spectrum-mid hover:underline"
            >
              View Payments →
            </Link>
            <Link
              to="/attribution"
              search={{ menteeId: client.id } as never}
              className="text-3xs font-medium text-spectrum-mid hover:underline"
            >
              View Full Attribution →
            </Link>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {lifecycleSegments.map((seg, i) => (
            <div key={seg.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/40">→</span>}
              <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-1">
                <div className="text-4xs uppercase tracking-wider text-muted-foreground">
                  {seg.label}
                </div>
                <div
                  className={`font-sans tabular-nums text-2xs ${seg.value ? "text-foreground" : "text-muted-foreground italic"}`}
                >
                  {seg.value ?? seg.fallback}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 text-3xs text-muted-foreground">
          <span className="font-medium capitalize text-foreground">{evidence.coverage}</span>{" "}
          attribution · <span className="capitalize">{evidence.strength}</span> confidence ·{" "}
          {evidence.knownTouchpoints} touchpoint{evidence.knownTouchpoints === 1 ? "" : "s"}
        </div>
      </div>
      {/* Compact cash-position chip — the full contracted/collected/
          outstanding/forecasted breakdown and payment-by-payment ledger now
          live on Payments (via computeClientCashPosition, the same function
          that page uses), so this page shows just enough for a renewal
          conversation without duplicating that ledger here. */}
      <Link
        to="/payments"
        search={{ client: client.id } as never}
        className="flex items-center justify-between rounded-lg border border-border/60 bg-card/60 p-3 hover:bg-muted/20"
      >
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Cash position
          </div>
          <div className="mt-1 font-sans text-sm tabular-nums">
            {outstandingCents > 0 ? `Owes ${money(outstandingCents)}` : "Paid in full"}
            <span className="ml-2 text-2xs text-muted-foreground">
              {money(collectedCents)} collected of {money(client.contract_value_cents ?? 0)}
            </span>
          </div>
        </div>
        <span className="text-3xs font-medium text-spectrum-mid">View payments →</span>
      </Link>

      {/* Per-installment visibility (req. #1) — not just an aggregate
          balance: every scheduled installment, its own real due
          date/amount/status. Never fabricates a "missed" state — only
          scheduled/due soon/due today/overdue/paid, exactly what
          `installmentUrgency()` can honestly derive from real data. */}
      {client.payment_plan && (
        <div className="rounded-lg border border-border/60 bg-card/60 p-3">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Payment plan — {schedule.length} installment{schedule.length === 1 ? "" : "s"}
          </div>
          {schedule.length ? (
            <ul className="mt-2 space-y-1">
              {[...schedule]
                .sort((a, b) => a.due_date.localeCompare(b.due_date))
                .map((s, i) => {
                  const urgency = installmentUrgency(s);
                  const tone =
                    urgency === "paid"
                      ? "text-emerald-500"
                      : urgency === "overdue"
                        ? "text-destructive"
                        : urgency === "due_today" || urgency === "due_soon"
                          ? "text-amber-400"
                          : "text-muted-foreground";
                  return (
                    <li key={s.id} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Installment {i + 1} of {schedule.length} — {s.due_date}
                      </span>
                      <span className="flex items-center gap-2 font-sans tabular-nums">
                        <span>{money(s.amount_cents)}</span>
                        <span className={`text-3xs uppercase ${tone}`}>
                          {INSTALLMENT_URGENCY_LABELS[urgency]}
                        </span>
                      </span>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <div className="mt-1 text-xs text-muted-foreground">
              No schedule generated yet — save the mentee with plan details to generate one.
            </div>
          )}
        </div>
      )}

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
          <div className="mt-2 text-xs text-muted-foreground">
            {demoMode
              ? "Demo data not connected for this activity log."
              : "No activity logged yet."}
          </div>
        )}
      </div>
    </div>
  );
}

const NOT_A_ROSTER_METRIC: Derivation = {
  status: "insufficient_data",
  sentence: "A mentee/payment roster, not a funnel stage — no upstream constraint to derive.",
};

/**
 * Full mentee/renewal relationship management — LTV hero, renewal pipeline
 * kanban, health/at-risk tracking, recovery & renewal ops, retention
 * analytics, and the per-mentee edit profile (lifecycle attribution, notes,
 * activity timeline). Embedded inside the Payments page (formerly its own
 * route at /clients, now retired) so payment ledger and mentee relationship
 * management live on one page. `openClientId` mirrors the old route's
 * `?openId=` deep link — any page linking to a specific mentee now links to
 * `/payments?client=<id>` instead, which this component watches to open the
 * same edit dialog. `initialQuery` seeds the name-search box from `?q=`.
 */
export function MenteeRenewalPanel({
  openClientId,
  initialQuery,
}: {
  openClientId?: string;
  initialQuery?: string;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { demoMode } = useDemoMode();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MenteeRow | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [healthFilter, setHealthFilter] = useState<HealthStatus | "all">("all");
  const generatePreClose = useServerFn(generatePreCloseFn);
  const notifyStageChanged = useServerFn(notifyClientStageChangedFn);

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ["clients", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockClients() as unknown as MenteeRow[];
      if (demoMode) return demoMenteesDataset().clients;
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, lead_id, full_name, email, phone, offer_name, start_date, contract_value_cents, invested_to_date_cents, expected_next_payment_cents, expected_next_payment_date, payment_plan, installments_remaining, installment_amount_cents, status, renewal_date, renewal_conv_started, renewal_stage, notes, pre_close_summary",
        )
        .eq("org_id", orgId!)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MenteeRow[];
    },
  });

  // Deep link from anywhere a mentee name appears elsewhere in the app
  // (Payments' ?client=…) — opens the same profile drawer every other entry
  // point uses.
  useEffect(() => {
    if (!openClientId || !clients) return;
    const match = clients.find((c) => c.id === openClientId);
    if (match) {
      setEditing(match);
      setPlanChecked(!!match.payment_plan);
    }
  }, [openClientId, clients]);

  const { data: payments = [] } = useQuery({
    queryKey: ["mentee-payments", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockPayments() as unknown as PaymentRow[];
      if (demoMode) return demoMenteesDataset().payments;
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
    queryKey: ["payment-schedule-items", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockPaymentScheduleItems() as unknown as ScheduleRow[];
      if (demoMode) return demoMenteesDataset().scheduleItems;
      const { data, error } = await supabase
        .from("payment_schedule_items")
        .select("id, client_id, due_date, amount_cents, status, payment_id")
        .eq("org_id", orgId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });

  const { data: renewalWorkItems = [] } = useQuery({
    queryKey: ["renewal-work-items", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockRenewalWorkItems() as unknown as RenewalWorkItemRow[];
      if (demoMode) return demoMenteesDataset().renewalWorkItems;
      const { data, error } = await supabase
        .from("renewal_work_items")
        .select(
          "id, client_id, owner_id, next_action, next_action_at, stage, reason, risk, renewal_outcome",
        )
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as RenewalWorkItemRow[];
    },
  });

  const leadIdsKey = (clients ?? [])
    .map((c) => c.lead_id)
    .filter(Boolean)
    .sort()
    .join(",");
  const { data: menteeAttribution = {} } = useQuery({
    queryKey: ["mentee-lead-attribution", orgId, devBypass, demoMode, leadIdsKey],
    enabled: !!orgId && !!clients?.length,
    queryFn: async (): Promise<Record<string, MenteeAttribution>> => {
      // Plain Dev Bypass has no realistic lead/call graph to join against —
      // mockClients() intentionally carries lead_id: null rather than
      // inventing a fake linkage just to fill this strip, so this honestly
      // returns empty (every mentee renders "Not Connected") same as today.
      if (devBypass && !demoMode) return {};
      if (demoMode) {
        const demo = buildDemoCoreDataset();
        const result: Record<string, MenteeAttribution> = {};
        for (const c of demo.clients) {
          if (!c.lead_id) continue;
          const lead = demo.leads.find((l) => l.id === c.lead_id);
          if (!lead) continue;
          const call =
            demo.calls.find((call) => call.lead_id === lead.id && call.closed) ??
            demo.calls.find((call) => call.lead_id === lead.id);
          result[c.id] = {
            source: normalizeAcquisitionSource(null, lead.source_platform),
            setterName: call
              ? (demo.teamMembers.find((t) => t.id === call.setter_id)?.name ?? null)
              : null,
            closerName: call?.closer_name ?? null,
          };
        }
        return result;
      }
      const leadIds = (clients ?? []).map((c) => c.lead_id).filter((id): id is string => !!id);
      if (!leadIds.length) return {};
      const [{ data: leadRows, error: leadErr }, { data: callRows, error: callErr }] =
        await Promise.all([
          supabase
            .from("leads")
            .select(
              "id, status, created_at, traffic_source_id, source_content_id, first_touch_content_id, source_platform, source_format, source_campaign",
            )
            .in("id", leadIds),
          supabase
            .from("calls")
            .select("lead_id, setter_id, closer_id, closed, created_at")
            .in("lead_id", leadIds),
        ]);
      if (leadErr) throw leadErr;
      if (callErr) throw callErr;

      const contentIds = Array.from(
        new Set(
          (leadRows ?? [])
            .flatMap((l) => [l.source_content_id, l.first_touch_content_id])
            .filter((id): id is string => !!id),
        ),
      );
      const sourceIds = Array.from(
        new Set(
          (leadRows ?? []).map((l) => l.traffic_source_id).filter((id): id is string => !!id),
        ),
      );
      const [{ data: contentRows }, { data: sourceRows }] = await Promise.all([
        contentIds.length
          ? supabase
              .from("content_pieces")
              .select("id, title, platform, source_platform, funnel_stage")
              .in("id", contentIds)
          : Promise.resolve({ data: [] as TrafficContentRow[] }),
        sourceIds.length
          ? supabase
              .from("traffic_sources")
              .select("id, name, category, utm_source, utm_campaign")
              .in("id", sourceIds)
          : Promise.resolve({ data: [] as TrafficSourceRow[] }),
      ]);
      const contentById = new Map(
        ((contentRows ?? []) as TrafficContentRow[]).map((c) => [c.id, c]),
      );
      const sourceById = new Map(((sourceRows ?? []) as TrafficSourceRow[]).map((s) => [s.id, s]));

      const callsByLead = new Map<string, (typeof callRows)[number][]>();
      for (const c of callRows ?? []) {
        if (!c.lead_id) continue;
        const list = callsByLead.get(c.lead_id) ?? [];
        list.push(c);
        callsByLead.set(c.lead_id, list);
      }
      const callByLead = new Map<string, { setter_id: string | null; closer_id: string | null }>();
      for (const [leadId, calls] of callsByLead) {
        const closed = calls.filter((c) => c.closed);
        const pool = closed.length ? closed : calls;
        const pick = pool.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];
        callByLead.set(leadId, pick);
      }
      const repIds = Array.from(
        new Set(
          Array.from(callByLead.values())
            .flatMap((c) => [c.setter_id, c.closer_id])
            .filter((id): id is string => !!id),
        ),
      );
      const { data: profileRows } = repIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", repIds)
        : { data: [] as { id: string; display_name: string | null }[] };
      const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.display_name ?? p.id]));
      const leadById = new Map(((leadRows ?? []) as TrafficLeadRow[]).map((l) => [l.id, l]));

      const result: Record<string, MenteeAttribution> = {};
      for (const client of clients ?? []) {
        if (!client.lead_id) continue;
        const lead = leadById.get(client.lead_id);
        if (!lead) continue;
        const resolved = resolveLead(lead, contentById, sourceById);
        const call = callByLead.get(client.lead_id);
        result[client.id] = {
          source: resolved.platform,
          setterName: call?.setter_id ? (nameById.get(call.setter_id) ?? call.setter_id) : null,
          closerName: call?.closer_id ? (nameById.get(call.closer_id) ?? call.closer_id) : null,
        };
      }
      return result;
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
      // Capture a real churn reason into the previously-unused
      // renewal_outcome column so the Analytics tab's "Churn reason
      // breakdown" has something besides "Not tracked" going forward —
      // optional (Cancel/blank leaves it honestly untracked, never a
      // fabricated default), matching this codebase's existing lightweight
      // window.confirm()-for-destructive-actions convention (copy.tsx).
      const churnReason =
        stage === "churned"
          ? (window.prompt("Why is this mentee churning? (optional)") ?? "").trim() || null
          : null;
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
      // Keep renewal_work_items (the real Renewal Action / Next Step record)
      // in sync with the kanban stage, and log it to the activity timeline.
      const existingRenewal = renewalByClient.get(id);
      const renewalPatch: {
        stage: Stage;
        renewal_date: string | null;
        renewal_outcome?: string;
      } = { stage, renewal_date: current?.renewal_date ?? null };
      if (churnReason) renewalPatch.renewal_outcome = churnReason;
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
        qc.setQueryData<MenteeRow[]>(["clients", orgId, devBypass], (prev) =>
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
  // Ages "scheduled" rows past their due date into "overdue" at read time —
  // see effectiveScheduleStatus for why (no background job mutates status).
  const effectiveScheduleItems = useMemo(
    () => scheduleItems.map((s) => ({ ...s, status: effectiveScheduleStatus(s) })),
    [scheduleItems],
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

  // Real, per-client payment context (outstanding/overdue-installment-count/
  // next payment) surfaced on renewal records — never a placeholder for a
  // field that isn't actually available.
  const paymentContextByClient = useMemo(() => {
    const m = new Map<
      string,
      {
        outstandingCents: number;
        overdueCount: number;
        nextPaymentCents: number | null;
        nextPaymentDate: string | null;
      }
    >();
    for (const c of view) {
      const position = computeClientCashPosition(c, payments);
      const overdueCount = (scheduleByClient.get(c.id) ?? []).filter(
        (s) => s.status === "overdue",
      ).length;
      m.set(c.id, {
        outstandingCents: position.outstandingCents,
        overdueCount,
        nextPaymentCents: c.expected_next_payment_cents,
        nextPaymentDate: c.expected_next_payment_date,
      });
    }
    return m;
  }, [view, payments, scheduleByClient]);

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

  // Retention & renewal analytics (Analytics tab) — all derived from the
  // same filtered `view` array the rest of the page's KPIs already use, and
  // the same real payments/schedule arrays behind the Portfolio Cash Health
  // strip, so nothing here can drift from what's shown elsewhere.
  const collectedLtvByOfferRows = useMemo(() => {
    const offerByClientId = new Map(view.map((c) => [c.id, c.offer_name]));
    return collectedLtvByOffer(payments, offerByClientId);
  }, [view, payments]);
  const collectedByOffer = useMemo(
    () => new Map(collectedLtvByOfferRows.map((r) => [r.offer, r.collectedCents])),
    [collectedLtvByOfferRows],
  );
  const renewalRate = useMemo(() => renewalRatePct(view), [view]);
  const pipelineValueCents = useMemo(() => renewalPipelineValueCents(view), [view]);
  const churnValueCents = useMemo(() => churnedValueCents(view), [view]);
  const avgTenureAtOutcome = useMemo(() => averageTenureAtRenewalOutcome(view), [view]);
  const conversionByOffer = useMemo(
    () =>
      renewalConversionBy(
        view.map((c) => ({ key: c.offer_name || "(no offer)", renewal_stage: c.renewal_stage })),
      ),
    [view],
  );
  const conversionByHealth = useMemo(
    () =>
      renewalConversionBy(
        view.map((c) => ({
          key: healthByClient.get(c.id)?.status ?? "unavailable",
          renewal_stage: c.renewal_stage,
        })),
      ),
    [view, healthByClient],
  );
  const conversionByPlanType = useMemo(
    () =>
      renewalConversionBy(
        view.map((c) => ({
          key: c.payment_plan ? "Payment plan" : "Paid in full",
          renewal_stage: c.renewal_stage,
        })),
      ),
    [view],
  );
  const conversionBySource = useMemo(
    () =>
      renewalConversionBy(
        view.map((c) => ({
          key: menteeAttribution[c.id]?.source ?? "Unknown / Unattributed",
          renewal_stage: c.renewal_stage,
        })),
      ),
    [view, menteeAttribution],
  );
  const conversionByCloser = useMemo(
    () =>
      renewalConversionBy(
        view.map((c) => ({
          key: menteeAttribution[c.id]?.closerName ?? "Unknown",
          renewal_stage: c.renewal_stage,
        })),
      ),
    [view, menteeAttribution],
  );
  const churnedClientIds = useMemo(
    () => view.filter((c) => c.renewal_stage === "churned").map((c) => c.id),
    [view],
  );
  const churnReasonByClientId = useMemo(
    () => new Map(renewalWorkItems.map((r) => [r.client_id, r.renewal_outcome ?? null])),
    [renewalWorkItems],
  );
  const churnReasons = useMemo(
    () => churnReasonBreakdown(churnedClientIds, churnReasonByClientId),
    [churnedClientIds, churnReasonByClientId],
  );
  // Group clients by renewal_stage for kanban
  const byStage = useMemo(() => {
    const m = new Map<Stage, MenteeRow[]>();
    STAGES.forEach((s) => m.set(s.key, []));
    for (const c of view) {
      const stage = (c.renewal_stage as Stage) || "not_started";
      const arr = m.get(stage) ?? m.get("not_started")!;
      arr.push(c);
    }
    return m;
  }, [view]);

  // StatCard drilldowns — every metric filters the SAME real arrays already
  // used to compute the number itself (never a parallel/re-derived
  // population), mapped into one shared display-row shape so the panel below
  // has a single concrete type regardless of which metric was clicked. These
  // are financial/roster snapshots, not funnel stages, so cap/working always
  // carry the same honest "not a funnel stage" Derivation.
  type MenteeMetric = "active" | "renewalsDue" | "atRisk";
  const [selectedMetric, setSelectedMetric] = useState<MenteeMetric | null>(null);
  const money = useMoney();
  const moneyStr = (cents: number | null | undefined) => (cents == null ? "—" : money(cents));
  type MenteeDetailRow = { id: string; c1: string; c2: string; c3: string; c4: string };
  const menteePanel = useMemo(() => {
    if (!selectedMetric) return null;
    const clientRow = (c: MenteeRow, c2: string, c3: string, c4: string): MenteeDetailRow => ({
      id: c.id,
      c1: c.full_name,
      c2,
      c3,
      c4,
    });
    let title = "";
    let headers: [string, string, string, string] = ["Name", "", "", ""];
    let rows: MenteeDetailRow[] = [];
    switch (selectedMetric) {
      case "active":
        title = "Active mentees";
        headers = ["Name", "Status", "Contract", "Renewal"];
        rows = (clients ?? [])
          .filter((c) => c.status === "active")
          .map((c) =>
            clientRow(c, c.status ?? "—", moneyStr(c.contract_value_cents), c.renewal_date ?? "—"),
          );
        break;
      case "renewalsDue":
        title = `Renewals < ${renewalAtRiskDays}d`;
        headers = ["Name", "Renewal Date", "Days Until Renewal", "Contract"];
        rows = (clients ?? [])
          .filter((c) => {
            const d = daysUntilDate(c.renewal_date);
            return d !== null && d >= 0 && d < renewalAtRiskDays;
          })
          .map((c) =>
            clientRow(
              c,
              c.renewal_date ?? "—",
              String(daysUntilDate(c.renewal_date) ?? "—"),
              moneyStr(c.contract_value_cents),
            ),
          );
        break;
      case "atRisk":
        title = "At-risk mentees";
        headers = ["Name", "Reason", "Renewal Date", "At-risk Amount"];
        rows = atRisk.map(({ c, reason }) =>
          clientRow(
            c,
            reason ?? "—",
            c.renewal_date ?? "—",
            moneyStr(Math.max((c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0), 0)),
          ),
        );
        break;
    }
    const columns: DetailColumn<MenteeDetailRow>[] = [
      { key: "c1", label: headers[0], render: (r) => r.c1 },
      { key: "c2", label: headers[1], render: (r) => r.c2 },
      { key: "c3", label: headers[2], render: (r) => r.c3, align: "right" },
      { key: "c4", label: headers[3], render: (r) => r.c4, align: "right" },
    ];
    return {
      title,
      columns,
      rows,
      rowKey: (r: MenteeDetailRow) => r.id,
      cap: NOT_A_ROSTER_METRIC,
      working: NOT_A_ROSTER_METRIC,
      emptyRowsLabel: "No records for this metric in the current data.",
    };
  }, [selectedMetric, clients, atRisk, renewalAtRiskDays, moneyStr]);

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <div className="eyebrow">— Renewal Operations</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Promoted out of the tab strip — this is the daily-use part
            (req. #4/#J): renewal pipeline + workflow, always visible, no
            click required. Kanban cards now carry real payment context
            (req. #5) instead of forcing a second screen for "can they
            actually renew right now." */}
        <div className="text-xs text-muted-foreground">
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
            const renewal = renewalByClient.get(c.id);
            const nextActionLine =
              c.renewal_stage === "won" || c.renewal_stage === "churned"
                ? "Renewal action: Completed"
                : `Renewal action: ${renewal?.next_action ?? "Not yet assigned"}${
                    renewal?.next_action_at
                      ? ` · ${new Date(renewal.next_action_at).toLocaleDateString()}`
                      : ""
                  }`;
            const ctx = paymentContextByClient.get(c.id);
            const ctxLine = ctx
              ? [
                  ctx.outstandingCents > 0 ? `${money(ctx.outstandingCents)} outstanding` : null,
                  ctx.overdueCount > 0 ? `${ctx.overdueCount} overdue` : null,
                  ctx.nextPaymentCents && ctx.nextPaymentDate
                    ? `Next: ${money(ctx.nextPaymentCents)} on ${ctx.nextPaymentDate}`
                    : null,
                ]
                  .filter((p): p is string => !!p)
                  .join(" · ") || null
              : null;
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
                metaLines={[c.offer_name || "—", nextActionLine, ...(ctxLine ? [ctxLine] : [])]}
                chip={
                  <div className="flex items-center justify-between text-2xs font-sans tabular-nums">
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

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <MenteeOperationsPanel
            orgId={orgId}
            clients={view}
            renewalAtRiskDays={renewalAtRiskDays}
            paymentContextByClient={paymentContextByClient}
            onOpenMentee={(mc) => {
              const full = view.find((v) => v.id === mc.id);
              if (full) {
                setEditing(full);
                setPlanChecked(!!full.payment_plan);
              }
            }}
          />
          <MenteeScheduledComms orgId={orgId} clients={view} />
        </div>

        <div className="flex items-center gap-2">
          <div className="eyebrow">— Mentee Portfolio</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Restrained, compact — contextual portfolio information, not a
            second primary dashboard (req. #6). Same StatCard-driven drill
            mechanism as before, just a slim inline strip instead of a
            mega-number hero + 3 full-size cards. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-xs">
          <span className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portfolio · all time
          </span>
          <button
            type="button"
            onClick={() => setSelectedMetric("active")}
            className="font-sans tabular-nums text-foreground hover:text-primary"
          >
            <strong className="text-spectrum-hot">${contractedLtv.toLocaleString()}</strong> value
          </button>
          <button
            type="button"
            onClick={() => setSelectedMetric("active")}
            className="font-sans tabular-nums text-muted-foreground hover:text-foreground"
          >
            {active} active
          </button>
          <button
            type="button"
            onClick={() => setSelectedMetric("renewalsDue")}
            className={`font-sans tabular-nums hover:text-foreground ${renewalsDue ? "text-amber-400" : "text-muted-foreground"}`}
          >
            {renewalsDue} renewals &lt;{renewalAtRiskDays}d
          </button>
          <button
            type="button"
            onClick={() => setSelectedMetric("atRisk")}
            className={`font-sans tabular-nums hover:text-foreground ${atRisk.length ? "text-destructive" : "text-muted-foreground"}`}
          >
            {atRisk.length} at-risk
          </button>
        </div>

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

        <Tabs defaultValue="table">
          <TabsList>
            <TabsTrigger value="table">All mentees</TabsTrigger>
            <TabsTrigger value="atrisk">At-risk · {atRisk.length}</TabsTrigger>
            <TabsTrigger value="ltv">LTV by offer</TabsTrigger>
            <TabsTrigger value="analytics">Retention analytics</TabsTrigger>
          </TabsList>

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
                    <th className="text-right p-3 font-sans tabular-nums">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map(({ c, reason }) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-border/70 hover:bg-muted/20"
                      onClick={() => {
                        setEditing(c);
                        setPlanChecked(!!c.payment_plan);
                      }}
                    >
                      <td className="p-3">
                        <div className="font-medium">{c.full_name}</div>
                        <div className="text-2xs text-muted-foreground">{c.email}</div>
                      </td>
                      <td className="p-3 text-xs">{c.offer_name ?? "—"}</td>
                      <td className="p-3 text-xs">{c.renewal_date ?? "—"}</td>
                      <td className="p-3 text-xs uppercase">{stageLabel(c.renewal_stage)}</td>
                      <td className="p-3 text-xs text-destructive">{reason}</td>
                      <td className="p-3 text-right font-sans tabular-nums">
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
            {/* Contracted (this table) and Collected (from the Retention tab's
                former standalone table, now a column here) sit side by side
                but stay two distinct columns — never summed into one number,
                same discipline as before, just one less tab click apart. */}
            <GlassTableShell>
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Offer</th>
                    <th className="text-right p-3 font-sans tabular-nums">Mentees</th>
                    <th className="text-right p-3 font-sans tabular-nums">Contracted</th>
                    <th className="text-right p-3 font-sans tabular-nums">Collected</th>
                    <th className="text-right p-3 font-sans tabular-nums">Avg deal</th>
                    <th className="text-left p-3">% of revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {ltvByOffer.map((o) => {
                    const sharePct = contractedLtv > 0 ? (o.total / 100 / contractedLtv) * 100 : 0;
                    const collectedCents = collectedByOffer.get(o.offer) ?? 0;
                    return (
                      <tr key={o.offer} className="border-t border-border/70 hover:bg-muted/20">
                        <td className="p-3 font-medium">{o.offer}</td>
                        <td className="p-3 text-right font-sans tabular-nums">{o.count}</td>
                        <td className="p-3 text-right font-sans tabular-nums text-spectrum-cold">
                          ${Math.round(o.total / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums text-spectrum-hot">
                          {moneyStr(collectedCents)}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
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
                            <span className="text-2xs font-sans tabular-nums w-12 text-right">
                              {sharePct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {ltvByOffer.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <EmptyState icon={<Repeat className="h-4 w-4" />} title="No offers yet" />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            {/* Payment-collection rates (plan completion, on-time, failed,
                refund) now live on Payments — this tab stays focused on
                renewal outcomes. */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard
                label="Renewal rate"
                value={renewalRate != null ? `${renewalRate.toFixed(0)}%` : "Not enough data"}
                hint="Won / (won + churned)"
              />
              <StatCard
                label="Renewal pipeline value"
                value={moneyStr(pipelineValueCents)}
                hint="Contract value, non-terminal stage"
              />
              <StatCard
                label="Churned value"
                value={moneyStr(churnValueCents)}
                hint="Contract value, churned stage"
              />
              <StatCard
                label="Avg. tenure at renewal decision"
                value={
                  avgTenureAtOutcome != null
                    ? `${avgTenureAtOutcome.toFixed(0)}d`
                    : "Not enough data"
                }
                hint="start_date → renewal_date"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <RenewalConversionTable
                title="Renewal conversion by offer"
                rows={conversionByOffer}
              />
              <RenewalConversionTable
                title="Renewal conversion by health band"
                rows={conversionByHealth}
              />
              <RenewalConversionTable
                title="Renewal conversion by plan type"
                rows={conversionByPlanType}
              />
              <RenewalConversionTable
                title="Renewal conversion by acquisition source"
                rows={conversionBySource}
              />
              <RenewalConversionTable
                title="Renewal conversion by closer"
                rows={conversionByCloser}
              />

              <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Churn reason breakdown
                </div>
                {churnedClientIds.length ? (
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {churnReasons.map((r) => (
                        <tr key={r.reason} className="border-t border-border/40">
                          <td className="py-1 pr-2 truncate max-w-[160px]" title={r.reason}>
                            {r.reason}
                          </td>
                          <td className="py-1 text-right font-sans tabular-nums">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="mt-2 text-2xs text-muted-foreground">No churned mentees yet.</div>
                )}
                {churnedClientIds.length > 0 &&
                  churnReasons.every((r) => r.reason === "Not tracked") && (
                    <div className="mt-2 text-3xs text-muted-foreground italic">
                      No churn reason has been captured for these mentees yet — dragging a mentee
                      into "Churned" now prompts for one.
                    </div>
                  )}
              </div>
            </div>

            {/* Collected LTV by offer moved into the "LTV by offer" tab as a
                column next to Contracted — still never blended into one
                number, just no longer a separate tab click away. */}
            <div className="rounded-lg border border-border/60 bg-muted/10 p-3 text-2xs text-muted-foreground">
              <span className="font-medium text-foreground">Not connected: </span>
              Gross/Net Revenue Retention, Save/Recovery Rate, Default vs. Cancellation Rate, and
              Average Time to Pay in Full are not shown here — this schema has no period-cohort
              snapshot table and no historical risk-state-transition log, so any of these would
              require guessing rather than computing a real number. They can be added once that
              tracking exists.
            </div>
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
                    <th className="text-right p-3 font-sans tabular-nums">Contract</th>
                    <th className="text-right p-3 font-sans tabular-nums">Balance</th>
                    <th className="text-center p-3">Plan progress</th>
                    <th className="text-left p-3">Payment status</th>
                    <th className="text-right p-3 font-sans tabular-nums">Days overdue</th>
                    <th className="text-left p-3">Cadence</th>
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
                    const scheduleEffective = schedule.map((s) => ({
                      ...s,
                      effective: effectiveScheduleStatus(s),
                    }));
                    const overdueItems = scheduleEffective
                      .filter((s) => s.effective === "overdue")
                      .sort((a, b) => a.due_date.localeCompare(b.due_date));
                    const nextUpcoming = scheduleEffective
                      .filter((s) => s.effective === "scheduled")
                      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                    const paymentStatusLabel = !c.payment_plan
                      ? "Paid in full"
                      : overdueItems.length
                        ? "Overdue"
                        : nextUpcoming
                          ? "Scheduled"
                          : scheduleEffective.length
                            ? "Paid"
                            : "No schedule";
                    const daysOverdue = overdueItems.length
                      ? Math.abs(daysBetween(overdueItems[0].due_date) ?? 0)
                      : null;
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
                        <td className="p-3 text-right font-sans tabular-nums">
                          ${Math.round((c.contract_value_cents ?? 0) / 100).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums">
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
                                <span className="font-sans tabular-nums text-3xs">
                                  {progress.label}
                                </span>
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
                        <td className="p-3">
                          <span
                            className={`rounded px-1.5 py-0.5 text-3xs uppercase ${
                              paymentStatusLabel === "Overdue"
                                ? "bg-destructive/15 text-destructive"
                                : paymentStatusLabel === "Scheduled"
                                  ? "bg-cyan-500/10 text-cyan-300"
                                  : paymentStatusLabel === "Paid" ||
                                      paymentStatusLabel === "Paid in full"
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {paymentStatusLabel}
                          </span>
                        </td>
                        <td className="p-3 text-right font-sans tabular-nums text-xs">
                          {daysOverdue != null ? (
                            <span className="text-destructive">{daysOverdue}d</span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {c.payment_plan ? "Monthly" : "—"}
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
                      <td colSpan={14} className="p-10 text-center text-sm text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!clientsLoading && tableTotal === 0 && (
                    <tr>
                      <td colSpan={14}>
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
                  attribution={menteeAttribution[editing.id]}
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
      {menteePanel && (
        <MetricDetailPanel
          open={!!selectedMetric}
          onOpenChange={(v) => !v && setSelectedMetric(null)}
          title={menteePanel.title}
          columns={menteePanel.columns}
          rows={menteePanel.rows}
          rowKey={menteePanel.rowKey}
          cap={menteePanel.cap}
          working={menteePanel.working}
          emptyRowsLabel={menteePanel.emptyRowsLabel}
        />
      )}
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
  initial?: MenteeRow;
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
            <span className="font-sans tabular-nums font-semibold text-spectrum-hot">
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
