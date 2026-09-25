import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { useDateRange } from "@/hooks/use-date-range";
import { useMoney } from "@/hooks/use-money";
import { toast } from "sonner";
import { buildDemoCoreDataset } from "@/lib/demo-fixtures";
import {
  mockClients,
  mockPayments,
  mockOfferTiers,
  mockOffers,
  mockOfferPaymentPlans,
  mockClientPlanLinks,
  mockPaymentRecoveryItems,
  mockTicketTierByOffer,
  mockPaymentScheduleItems,
} from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { TaxonomySelect } from "@/components/taxonomy-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassTableShell, Pagination, usePagination } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import { MenteeRenewalPanel } from "@/components/mentee-renewal-panel";
import {
  RecoveryQueuePanel,
  RECOVERY_ACTIONS,
  type RecoveryActionKey,
  type RecoveryCommsInfo,
} from "@/components/recovery-queue-panel";
import { ChartTooltip } from "@/components/chart-tooltip";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { Derivation } from "@/lib/funnel-derivation";
import {
  Banknote,
  AlertTriangle,
  X,
  Bell,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import {
  resolveProcessorLabel,
  resolvePaymentTypeLabel,
  resolvePlanStructure,
  formatPlanStructure,
  dealClassification,
  ticketTierFromDeal,
  groupByProcessor,
  groupByPaymentType,
  groupByTicketTier,
  groupByDealClassification,
  type OfferPaymentPlanRow,
  type DealClassification,
  type PlanStructure,
} from "@/lib/payments-ledger";
import {
  reconcileRecoveryQueue,
  installmentUrgency,
  INSTALLMENT_URGENCY_LABELS,
  expectedVsActualSeries,
  type RecoveryItemRow,
} from "@/lib/mentee-payments";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    client: typeof s.client === "string" ? s.client : undefined,
    q: typeof s.q === "string" ? s.q : undefined,
  }),
});

const NOT_A_FUNNEL_METRIC: Derivation = {
  status: "insufficient_data",
  sentence: "A payment ledger, not a funnel stage — no upstream constraint to derive.",
};

type ClientRow = {
  id: string;
  lead_id: string | null;
  full_name: string;
  offer_name: string | null;
  contract_value_cents: number | null;
  invested_to_date_cents: number | null;
  payment_plan: boolean | null;
  installments_remaining: number | null;
  installment_amount_cents: number | null;
  expected_next_payment_cents: number | null;
  expected_next_payment_date: string | null;
  offer_payment_plan_id: string | null;
};

type ScheduleRow = {
  id: string;
  client_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
  payment_id: string | null;
};

type PaymentRow = {
  id: string;
  client_id: string | null;
  amount_cents: number;
  status: string;
  collected_at: string;
  currency: string;
  processor: string | null;
  payment_type: string | null;
  failure_reason: string | null;
};

type LeadTierRow = { id: string; ticket_tier: string | null };
type OfferTierRow = { key: string; label: string };
type OfferRow = { id: string; pricing_type: string | null; tier_key: string | null };
type RecoveryRow = {
  id: string;
  client_id: string | null;
  payment_id: string | null;
  amount_cents: number;
  due_at: string | null;
  status: string;
  owner_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
  provider_execution_status: string;
};

const defaultTierLabel = (key: string, tierLabels: Map<string, string>) =>
  tierLabels.get(key) ??
  (key === "high"
    ? "High Ticket"
    : key === "low"
      ? "Low Ticket"
      : key[0].toUpperCase() + key.slice(1));

const titleCase = (s: string) => s[0].toUpperCase() + s.slice(1).replaceAll("_", " ");

/** A ledger table column header that doubles as its own filter — click
 * "Processor" (or whichever value is currently picked) right on the
 * column heading to change what the whole ledger is filtered by, instead
 * of a separate filters row disconnected from the table. Default/
 * unfiltered state shows the bare column name ("Processor"), never "All
 * Processor" — there's nothing to disambiguate once it's the column's own
 * label. Styled to match the plain <th> headers around it (text-2xs
 * uppercase tracking-wider text-muted-foreground) so it reads as part of
 * the header row, not a separate control. */
function ChartHeaderFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const selectedLabel = options.find((o) => o.value === value)?.label;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-auto w-auto gap-1 border-none bg-transparent p-0 text-2xs uppercase tracking-wider text-muted-foreground shadow-none hover:text-foreground focus:ring-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-70"
      >
        <SelectValue>{value === "all" ? label : (selectedLabel ?? label)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="capitalize">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PaymentsPage() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { demoMode } = useDemoMode();
  const { range } = useDateRange();
  const money = useMoney();
  const { client: clientSearchParam, q: initialQuery } = Route.useSearch();

  const { data: clients = [] } = useQuery({
    queryKey: ["payments-clients", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        const links = mockClientPlanLinks();
        return mockClients().map((c) => ({
          ...c,
          offer_payment_plan_id: links[c.id] ?? null,
        })) as unknown as ClientRow[];
      }
      if (demoMode) {
        const demo = buildDemoCoreDataset();
        return demo.clients.map((c) => ({
          id: c.id,
          lead_id: c.lead_id,
          full_name: c.full_name,
          offer_name: c.offer_name,
          contract_value_cents: c.contract_value_cents,
          invested_to_date_cents: c.invested_to_date_cents,
          payment_plan: c.payment_plan,
          installments_remaining: c.installments_remaining,
          installment_amount_cents: c.installment_amount_cents,
          expected_next_payment_cents: c.payment_plan ? c.installment_amount_cents : null,
          expected_next_payment_date: null,
          offer_payment_plan_id: null,
        })) as ClientRow[];
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- offer_payment_plan_id predates the last generated-types.ts refresh
      const { data, error } = await (supabase as any)
        .from("clients")
        .select(
          "id, lead_id, full_name, offer_name, contract_value_cents, invested_to_date_cents, payment_plan, installments_remaining, installment_amount_cents, expected_next_payment_cents, expected_next_payment_date, offer_payment_plan_id",
        )
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as ClientRow[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["payments-ledger", orgId, devBypass, demoMode, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      // Dev Bypass / Demo Mode have no server to apply the .gte/.lte below,
      // so the fixtures are filtered here with the exact same bounds — a
      // fixture payment outside the selected range must disappear from
      // "This Range" the same way a real out-of-range row would.
      const rangeStartMs = new Date(`${range.from}T00:00:00`).getTime();
      const rangeEndMs = new Date(`${range.to}T23:59:59`).getTime();
      const inRange = (collectedAt: string) => {
        const t = new Date(collectedAt).getTime();
        return t >= rangeStartMs && t <= rangeEndMs;
      };
      if (devBypass) {
        return (mockPayments() as unknown as PaymentRow[]).filter((p) => inRange(p.collected_at));
      }
      if (demoMode) {
        return (buildDemoCoreDataset().payments as unknown as PaymentRow[]).filter((p) =>
          inRange(p.collected_at),
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- processor/payment_type/failure_reason predate the last generated-types.ts refresh
      const { data, error } = await (supabase as any)
        .from("payments")
        .select(
          "id, client_id, amount_cents, status, collected_at, currency, processor, payment_type, failure_reason",
        )
        .eq("org_id", orgId!)
        .gte("collected_at", `${range.from}T00:00:00`)
        .lte("collected_at", `${range.to}T23:59:59`)
        .order("collected_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  // Same queryKey MenteeRenewalPanel uses for the identical table — React
  // Query shares the cache, so this doesn't double-fetch. Not date-range
  // scoped — a schedule item due next week matters regardless of which
  // range the ledger is currently showing.
  const { data: scheduleItems = [] } = useQuery({
    queryKey: ["payment-schedule-items", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockPaymentScheduleItems() as unknown as ScheduleRow[];
      if (demoMode) {
        const demo = buildDemoCoreDataset();
        return demo.payments
          .filter((p) => p.status === "pending")
          .map((p) => ({
            id: `schedule-${p.id}`,
            client_id: p.client_id,
            due_date: p.collected_at.slice(0, 10),
            amount_cents: p.amount_cents,
            status: "pending",
            payment_id: null,
          })) as ScheduleRow[];
      }
      const { data, error } = await supabase
        .from("payment_schedule_items")
        .select("id, client_id, due_date, amount_cents, status, payment_id")
        .eq("org_id", orgId!)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ScheduleRow[];
    },
  });

  // Same queryKey MenteeScheduledComms uses — shared cache, and this feeds
  // the comms indicators on Recovery Queue / Renewal cards (req. #3), never
  // a second, disconnected comms UI.
  const { data: scheduledComms = [] } = useQuery({
    queryKey: ["scheduled-communications", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_communications")
        .select("id, client_id, trigger_type, channel, scheduled_for, send_status")
        .eq("org_id", orgId!)
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        trigger_type: string;
        channel: string;
        scheduled_for: string;
        send_status: string;
      }>;
    },
  });

  const clientLeadIds = useMemo(
    () => Array.from(new Set(clients.map((c) => c.lead_id).filter((id): id is string => !!id))),
    [clients],
  );
  const { data: leadTiers = [] } = useQuery({
    queryKey: ["payments-lead-tiers", orgId, devBypass, demoMode, clientLeadIds.join(",")],
    enabled: !!orgId,
    queryFn: async () => {
      // Plain Dev Bypass has no realistic lead graph to join against
      // (mockClients() carries lead_id: null, same honest gap as Mentees &
      // Renewals's own attribution strip) — tier is derived from offer_name
      // via mockTicketTierByOffer() instead, purely for this fixture.
      if (devBypass) return [] as LeadTierRow[];
      if (demoMode) {
        const demo = buildDemoCoreDataset();
        return demo.leads.map((l) => ({ id: l.id, ticket_tier: l.ticket_tier })) as LeadTierRow[];
      }
      if (!clientLeadIds.length) return [] as LeadTierRow[];
      const { data, error } = await supabase
        .from("leads")
        .select("id, ticket_tier")
        .in("id", clientLeadIds);
      if (error) throw error;
      return (data ?? []) as LeadTierRow[];
    },
  });

  const { data: offerTiers = [] } = useQuery({
    queryKey: ["payments-offer-tiers", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockOfferTiers() as OfferTierRow[];
      if (demoMode) return [] as OfferTierRow[];
      const { data, error } = await supabase
        .from("offer_tiers")
        .select("key, label")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as OfferTierRow[];
    },
  });

  const { data: offers = [] } = useQuery({
    queryKey: ["payments-offers", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockOffers() as OfferRow[];
      if (demoMode) return [] as OfferRow[];
      const { data, error } = await supabase
        .from("offers")
        .select("id, pricing_type, tier_key")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as OfferRow[];
    },
  });

  const { data: offerPaymentPlans = [] } = useQuery({
    queryKey: ["payments-offer-plans", orgId, devBypass, demoMode],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockOfferPaymentPlans() as OfferPaymentPlanRow[];
      if (demoMode) return [] as OfferPaymentPlanRow[];
      const { data, error } = await supabase
        .from("offer_payment_plans")
        .select(
          "id, offer_id, label, cadence, installment_amount_cents, installment_count, total_contracted_value_cents, deposit_cents",
        )
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as OfferPaymentPlanRow[];
    },
  });

  const { data: recoveryItems = [] } = useQuery({
    queryKey: ["payments-recovery", orgId, devBypass, demoMode, payments.length],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockPaymentRecoveryItems() as RecoveryRow[];
      if (demoMode) {
        // No dedicated fixture table for payment_recovery_items — honestly
        // derived from the same real payments already fetched above (failed
        // attempts), never separately invented numbers.
        return payments
          .filter((p) => p.status === "failed")
          .map((p) => ({
            id: `recovery-${p.id}`,
            client_id: p.client_id,
            payment_id: p.id,
            amount_cents: p.amount_cents,
            due_at: p.collected_at,
            status: "failed",
            owner_id: null,
            next_action: "Retry or follow up with mentee",
            next_action_at: null,
            provider_execution_status: "unavailable",
          })) as RecoveryRow[];
      }
      const { data, error } = await supabase
        .from("payment_recovery_items")
        .select(
          "id, client_id, payment_id, amount_cents, due_at, status, owner_id, next_action, next_action_at, provider_execution_status",
        )
        .eq("org_id", orgId!)
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RecoveryRow[];
    },
  });

  const tierLabels = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of offerTiers) m.set(t.key, t.label);
    return m;
  }, [offerTiers]);
  const devTierByOffer = useMemo(() => (devBypass ? mockTicketTierByOffer() : {}), [devBypass]);
  const leadTierById = useMemo(
    () => new Map(leadTiers.map((l) => [l.id, l.ticket_tier])),
    [leadTiers],
  );
  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const planById = useMemo(
    () => new Map(offerPaymentPlans.map((p) => [p.id, p])),
    [offerPaymentPlans],
  );
  const offerByPlanId = useMemo(() => {
    const m = new Map<string, OfferRow | undefined>();
    for (const plan of offerPaymentPlans)
      m.set(
        plan.id,
        offers.find((o) => o.id === plan.offer_id),
      );
    return m;
  }, [offerPaymentPlans, offers]);

  type LedgerRow = {
    payment: PaymentRow;
    client: ClientRow | undefined;
    tierKey: string | null;
    tierLabel: string;
    structure: PlanStructure | null;
    classification: DealClassification | null;
  };

  const ledgerRows: LedgerRow[] = useMemo(() => {
    return payments.map((p) => {
      const client = p.client_id ? clientsById.get(p.client_id) : undefined;
      const plan = client?.offer_payment_plan_id
        ? (planById.get(client.offer_payment_plan_id) ?? null)
        : null;
      const offer = client?.offer_payment_plan_id
        ? (offerByPlanId.get(client.offer_payment_plan_id) ?? null)
        : null;
      // Tier is derived from the deal, not from `leads.ticket_tier`. That
      // column is the intake form's guess made before anyone paid; the
      // classification below reads what the client actually signed. The lead
      // tier stays as the fallback for a client with no classifiable deal yet.
      const leadTierKey = client
        ? ((client.lead_id ? leadTierById.get(client.lead_id) : null) ??
          (client.offer_name ? (devTierByOffer[client.offer_name] ?? null) : null))
        : null;
      const planInput = client
        ? {
            payment_plan: client.payment_plan,
            installments_remaining: client.installments_remaining,
            installment_amount_cents: client.installment_amount_cents,
            contract_value_cents: client.contract_value_cents,
          }
        : null;
      const structure = planInput ? resolvePlanStructure(planInput, plan) : null;
      const classification = planInput
        ? dealClassification(planInput, plan, offer?.pricing_type ?? null)
        : null;
      const tierKey = classification
        ? ticketTierFromDeal(classification, client?.contract_value_cents ?? null)
        : leadTierKey;
      return {
        payment: p,
        client,
        tierKey,
        tierLabel: tierKey ? defaultTierLabel(tierKey, tierLabels) : "Unknown",
        structure,
        classification,
      };
    });
  }, [payments, clientsById, planById, offerByPlanId, leadTierById, devTierByOffer, tierLabels]);

  const [tierFilter, setTierFilter] = useState("all");
  const [processorFilter, setProcessorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("all");
  const [cadenceFilter, setCadenceFilter] = useState("all");

  const tierOptions = useMemo(() => {
    const keys = new Set(ledgerRows.map((r) => r.tierKey).filter((k): k is string => !!k));
    return Array.from(keys).map((k) => ({ value: k, label: defaultTierLabel(k, tierLabels) }));
  }, [ledgerRows, tierLabels]);
  const processorOptions = useMemo(() => {
    const keys = new Set(
      ledgerRows.map((r) => r.payment.processor).filter((k): k is string => !!k),
    );
    return Array.from(keys).map((k) => ({ value: k, label: resolveProcessorLabel(k) }));
  }, [ledgerRows]);
  const statusOptions = useMemo(() => {
    const keys = new Set(ledgerRows.map((r) => r.payment.status));
    return Array.from(keys).map((k) => ({ value: k, label: titleCase(k) }));
  }, [ledgerRows]);
  const paymentTypeOptions = useMemo(() => {
    const keys = new Set(
      ledgerRows.map((r) => r.payment.payment_type).filter((k): k is string => !!k),
    );
    return Array.from(keys).map((k) => ({ value: k, label: resolvePaymentTypeLabel(k) }));
  }, [ledgerRows]);
  const cadenceOptions = useMemo(() => {
    const keys = new Set(
      ledgerRows.map((r) => r.structure?.cadence).filter((k): k is string => !!k),
    );
    return Array.from(keys).map((k) => ({ value: k, label: titleCase(k) }));
  }, [ledgerRows]);

  const filteredRows = useMemo(() => {
    return ledgerRows.filter((r) => {
      if (clientSearchParam && r.client?.id !== clientSearchParam) return false;
      if (tierFilter !== "all" && r.tierKey !== tierFilter) return false;
      if (processorFilter !== "all" && r.payment.processor !== processorFilter) return false;
      if (statusFilter !== "all" && r.payment.status !== statusFilter) return false;
      if (paymentTypeFilter !== "all" && r.payment.payment_type !== paymentTypeFilter) return false;
      if (cadenceFilter !== "all" && r.structure?.cadence !== cadenceFilter) return false;
      return true;
    });
  }, [
    ledgerRows,
    clientSearchParam,
    tierFilter,
    processorFilter,
    statusFilter,
    paymentTypeFilter,
    cadenceFilter,
  ]);

  const clientBeingViewed = clientSearchParam ? clientsById.get(clientSearchParam) : undefined;

  const totalCollectedCents = filteredRows
    .filter((r) => r.payment.status === "paid")
    .reduce((s, r) => s + r.payment.amount_cents, 0);
  const distinctClientIds = useMemo(
    () =>
      Array.from(new Set(filteredRows.map((r) => r.client?.id).filter((id): id is string => !!id))),
    [filteredRows],
  );
  const totalContractedCents = distinctClientIds.reduce(
    (s, id) => s + (clientsById.get(id)?.contract_value_cents ?? 0),
    0,
  );
  // "As of now" — deliberately NOT derived from `distinctClientIds`/`payments`
  // (both scoped to the selected reporting range). Every client's real
  // all-time outstanding balance, from the same canonical
  // contract_value_cents - invested_to_date_cents formula buildRecoveryQueue()
  // and the renewal panel already use — so this can never disagree with them,
  // and a client with zero payments in the current range still counts.
  const totalOutstandingCents = clients.reduce(
    (s, c) => s + Math.max(0, (c.contract_value_cents ?? 0) - (c.invested_to_date_cents ?? 0)),
    0,
  );
  // The one canonical reconciliation — this Recovery Queue and its total are
  // the only "who's at risk" surface on the page (req. §G). `clients` here
  // is already the full RecoveryQueueClient shape (invested_to_date_cents +
  // expected_next_payment_date added above specifically for this).
  const reconciled = useMemo(
    () => reconcileRecoveryQueue(clients, payments, recoveryItems as RecoveryItemRow[]),
    [clients, payments, recoveryItems],
  );
  const reconciledActive = clientSearchParam
    ? reconciled.active.filter((r) => r.client.id === clientSearchParam)
    : reconciled.active;
  const failedAtRiskCents = clientSearchParam
    ? reconciledActive.reduce((s, r) => s + r.amountCents, 0)
    : reconciled.totalCents;

  const processorTotals = useMemo(
    () =>
      groupByProcessor(
        filteredRows
          .filter((r) => r.payment.status === "paid")
          .map((r) => ({ processor: r.payment.processor, amount_cents: r.payment.amount_cents })),
      ),
    [filteredRows],
  );
  const paymentTypeTotals = useMemo(
    () =>
      groupByPaymentType(
        filteredRows
          .filter((r) => r.payment.status === "paid")
          .map((r) => ({
            payment_type: r.payment.payment_type,
            amount_cents: r.payment.amount_cents,
          })),
      ),
    [filteredRows],
  );
  const tierTotals = useMemo(
    () =>
      groupByTicketTier(
        filteredRows
          .filter((r) => r.payment.status === "paid")
          .map((r) => ({ tierKey: r.tierKey, amount_cents: r.payment.amount_cents })),
        tierLabels,
      ),
    [filteredRows, tierLabels],
  );
  const classificationTotals = useMemo(
    () =>
      groupByDealClassification(
        filteredRows
          .filter((r) => r.payment.status === "paid" && r.classification)
          .map((r) => ({
            classification: r.classification!,
            amount_cents: r.payment.amount_cents,
          })),
      ),
    [filteredRows],
  );

  type PaymentsMetric = "collected" | "contracted" | "outstanding" | "failedAtRisk";
  const [selectedMetric, setSelectedMetric] = useState<PaymentsMetric | null>(null);
  type PaymentDetailRow = { id: string; c1: string; c2: string; c3: string; c4: string };
  const metricPanel = useMemo(() => {
    if (!selectedMetric) return null;
    let title = "";
    let headers: [string, string, string, string] = ["Client", "", "", ""];
    let rows: PaymentDetailRow[] = [];
    if (selectedMetric === "collected") {
      title = "Collected payments";
      headers = ["Client", "Amount", "Date", "Processor"];
      rows = filteredRows
        .filter((r) => r.payment.status === "paid")
        .map((r) => ({
          id: r.payment.id,
          c1: r.client?.full_name ?? "Unknown client",
          c2: money(r.payment.amount_cents),
          c3: new Date(r.payment.collected_at).toLocaleDateString(),
          c4: resolveProcessorLabel(r.payment.processor),
        }));
    } else if (selectedMetric === "contracted") {
      title = "Contracted clients in view";
      headers = ["Client", "Contract", "Tier", "Plan"];
      rows = distinctClientIds.map((id) => {
        const client = clientsById.get(id)!;
        const row = ledgerRows.find((r) => r.client?.id === id);
        return {
          id,
          c1: client.full_name,
          c2: money(client.contract_value_cents ?? 0),
          c3: row?.tierLabel ?? "Unknown",
          c4: row?.structure ? formatPlanStructure(row.structure, money) : "—",
        };
      });
    } else if (selectedMetric === "outstanding") {
      title = "Outstanding balance";
      headers = ["Client", "Contract", "Outstanding", "Tier"];
      // All-time, same as the summary card above — not limited to clients
      // with a payment inside the currently selected reporting range.
      rows = clients
        .map((client) => {
          const outstandingCents = Math.max(
            0,
            (client.contract_value_cents ?? 0) - (client.invested_to_date_cents ?? 0),
          );
          const row = ledgerRows.find((r) => r.client?.id === client.id);
          return {
            id: client.id,
            c1: client.full_name,
            c2: money(client.contract_value_cents ?? 0),
            c3: money(outstandingCents),
            c4: row?.tierLabel ?? "Unknown",
            outstanding: outstandingCents,
          };
        })
        .filter((r) => r.outstanding > 0)
        .map(({ id, c1, c2, c3, c4 }) => ({ id, c1, c2, c3, c4 }));
    } else {
      title = "Failed & at-risk payments";
      headers = ["Client", "Amount", "Status", "Next action"];
      rows = reconciledActive.map((r) => ({
        id: r.client.id,
        c1: r.client.full_name,
        c2: money(r.amountCents),
        c3: r.tracked ? titleCase(r.recoveryItem!.status) : "Not yet tracked",
        c4: r.recoveryItem?.next_action ?? "Not assigned",
      }));
    }
    const columns: DetailColumn<PaymentDetailRow>[] = [
      { key: "c1", label: headers[0], render: (r) => r.c1 },
      { key: "c2", label: headers[1], render: (r) => r.c2, align: "right" },
      { key: "c3", label: headers[2], render: (r) => r.c3 },
      { key: "c4", label: headers[3], render: (r) => r.c4, align: "right" },
    ];
    return {
      title,
      columns,
      rows,
      rowKey: (r: PaymentDetailRow) => r.id,
      cap: NOT_A_FUNNEL_METRIC,
      working: NOT_A_FUNNEL_METRIC,
      emptyRowsLabel: "No records for this metric in the current view.",
    };
  }, [
    selectedMetric,
    filteredRows,
    distinctClientIds,
    clientsById,
    clients,
    ledgerRows,
    reconciledActive,
    money,
  ]);

  const {
    page: tablePage,
    setPage: setTablePage,
    pageCount: tablePageCount,
    paged: pagedRows,
    total: tableTotal,
    pageSize: tablePageSize,
  } = usePagination(filteredRows, 25);

  // Recovery Queue actions — the one write path to payment_recovery_items
  // (req. §G). Mirrors the exact mutation logic that used to live in
  // MenteeOperationsPanel, now updating the specific row the reconciliation
  // already resolved instead of re-finding it.
  const qc = useQueryClient();
  const recoveryAction = useMutation({
    mutationFn: async ({
      row,
      actionKey,
    }: {
      row: (typeof reconciled.active)[number];
      actionKey: RecoveryActionKey;
    }) => {
      const actionLabel = RECOVERY_ACTIONS.find((a) => a.key === actionKey)!.label;
      const status = actionKey === "resolved" ? "recovered" : undefined;
      const patch = {
        org_id: orgId!,
        client_id: row.client.id,
        amount_cents: row.amountCents,
        due_at: row.dueDate,
        next_action: actionLabel,
        next_action_at: new Date().toISOString(),
        ...(status ? { status } : {}),
      };
      if (row.recoveryItem) {
        const { error } = await supabase
          .from("payment_recovery_items")
          .update(patch)
          .eq("id", row.recoveryItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("payment_recovery_items")
          .insert({ status: "due", ...patch });
        if (error) throw error;
      }
      await supabase.from("client_activity_events").insert({
        org_id: orgId!,
        client_id: row.client.id,
        event_type: "payment_recovery",
        body: `${actionLabel} (${money(row.amountCents)})`,
      });
    },
    onSuccess: () => {
      toast.success("Logged — provider execution still unavailable (no payment-provider secret)");
      qc.invalidateQueries({ queryKey: ["payments-recovery", orgId] });
      qc.invalidateQueries({ queryKey: ["client-activity", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearStale = useMutation({
    mutationFn: async (item: RecoveryItemRow) => {
      const { error } = await supabase
        .from("payment_recovery_items")
        .update({ status: "recovered" })
        .eq("id", item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cleared");
      qc.invalidateQueries({ queryKey: ["payments-recovery", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Comms indicators (req. #3) — same queryKey as MenteeScheduledComms, so
  // this is read-only context on top of data that component already owns,
  // never a second/disconnected comms system. Most recent payment_due row
  // per client.
  const commsByClient = useMemo(() => {
    const latestByClient = new Map<string, (typeof scheduledComms)[number]>();
    for (const c of scheduledComms) {
      if (c.trigger_type !== "payment_due") continue;
      const existing = latestByClient.get(c.client_id);
      if (!existing || c.scheduled_for > existing.scheduled_for) {
        latestByClient.set(c.client_id, c);
      }
    }
    const m = new Map<string, RecoveryCommsInfo>();
    for (const [clientId, c] of latestByClient) {
      m.set(clientId, {
        label: new Date(c.scheduled_for).toLocaleDateString(),
        tone: c.send_status === "sent" ? "sent" : "queued",
      });
    }
    return m;
  }, [scheduledComms]);

  // Payment Notifications (req. #1) — a live, computed feed, not a
  // persisted alert log (the real `alerts` table has zero writers anywhere
  // in this app — see plan). Every card traces to a real row; nothing here
  // is an event type this system can't actually support.
  type PaymentNotification = {
    id: string;
    tone: "info" | "warning" | "destructive" | "success";
    label: string;
    detail: string;
  };
  const notifications = useMemo(() => {
    const rows: PaymentNotification[] = [];
    for (const s of scheduleItems) {
      const client = clientsById.get(s.client_id);
      if (!client) continue;
      const urgency = installmentUrgency(s);
      if (urgency === "due_today" || urgency === "due_soon") {
        rows.push({
          id: `due-${s.id}`,
          tone: urgency === "due_today" ? "warning" : "info",
          label: `${INSTALLMENT_URGENCY_LABELS[urgency]} — ${client.full_name}`,
          detail: `${money(s.amount_cents)} due ${s.due_date}`,
        });
      } else if (urgency === "overdue") {
        rows.push({
          id: `overdue-${s.id}`,
          tone: "destructive",
          label: `Overdue — ${client.full_name}`,
          detail: `${money(s.amount_cents)} was due ${s.due_date}`,
        });
      }
    }
    for (const p of payments) {
      if (p.status !== "failed" || !p.client_id) continue;
      const client = clientsById.get(p.client_id);
      if (!client) continue;
      rows.push({
        id: `failed-${p.id}`,
        tone: "destructive",
        label: `Failed payment — ${client.full_name}`,
        detail: `${money(p.amount_cents)} on ${new Date(p.collected_at).toLocaleDateString()}`,
      });
    }
    for (const r of reconciled.active) {
      if (r.recoveryItem?.status === "retry") {
        rows.push({
          id: `retry-${r.client.id}`,
          tone: "warning",
          label: `Retry pending — ${r.client.full_name}`,
          detail: "Logged intent to retry — not an automated processor retry",
        });
      }
      if (
        r.recoveryItem?.next_action === "Log promise-to-pay" &&
        r.recoveryItem.next_action_at &&
        new Date(r.recoveryItem.next_action_at) <= new Date()
      ) {
        rows.push({
          id: `promise-${r.client.id}`,
          tone: "info",
          label: `Promise-to-pay due — ${r.client.full_name}`,
          detail: `${money(r.amountCents)} logged ${new Date(r.recoveryItem.next_action_at).toLocaleDateString()}`,
        });
      }
    }
    for (const item of recoveryItems) {
      if (item.status !== "recovered" || !item.client_id) continue;
      const client = clientsById.get(item.client_id);
      if (!client) continue;
      rows.push({
        id: `recovered-${item.id}`,
        tone: "success",
        label: `Payment recovered — ${client.full_name}`,
        detail: item.next_action ?? "Marked resolved",
      });
    }
    for (const c of clients) {
      if (c.payment_plan && (c.installments_remaining ?? 0) === 1) {
        rows.push({
          id: `ending-${c.id}`,
          tone: "info",
          label: `Payment plan ending soon — ${c.full_name}`,
          detail: "1 installment remaining",
        });
      }
    }
    return rows;
  }, [scheduleItems, clientsById, payments, reconciled.active, recoveryItems, clients, money]);

  // Expected vs. Actual Collections (req. #4/§D) — real, already-tested
  // logic (expectedVsActualSeries), revived here; nothing computed twice.
  const expectedVsActual = useMemo(
    () => expectedVsActualSeries(scheduleItems, payments, range.from, range.to),
    [scheduleItems, payments, range.from, range.to],
  );

  return (
    <>
      <TopBar
        title="Payments"
        subtitle="Every payment coming in, plus the full mentee renewal & retention picture"
        showDateRange
      />
      <div className="p-4 md:p-6 space-y-5">
        {clientBeingViewed && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-spectrum-mid/30 bg-spectrum-mid/5 px-3 py-2 text-xs">
            <span>
              Showing payments for{" "}
              <span className="font-medium text-foreground">{clientBeingViewed.full_name}</span>{" "}
              only.
            </span>
            <Link
              to="/payments"
              search={{ client: undefined } as never}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <X className="h-3 w-3" /> Clear
            </Link>
          </div>
        )}

        {/* Filters — Ticket Tier / Processor / Status / Payment Type are now
            clickable column headers right on the ledger table below;
            Cadence has no matching column, so it stays here. */}
        {cadenceOptions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card/50 p-3">
            <span className="mr-1 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Filters
            </span>
            <TaxonomySelect
              label="Cadence"
              value={cadenceFilter}
              onChange={setCadenceFilter}
              options={cadenceOptions}
            />
          </div>
        )}

        {/* Current financial position — full visual weight, first
            viewport (req. #4/#J tier 1). */}
        <div className="flex items-center gap-2">
          <div className="eyebrow">— This Range</div>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total collected"
            value={money(totalCollectedCents)}
            spectrum="hot"
            emphasis="strong"
            icon={<Banknote className="h-4 w-4" />}
            hint={`${filteredRows.filter((r) => r.payment.status === "paid").length} payments in range`}
            onClick={() => setSelectedMetric("collected")}
          />
          <StatCard
            label="Total contracted"
            value={money(totalContractedCents)}
            spectrum="cold"
            emphasis="subtle"
            hint={`${distinctClientIds.length} client${distinctClientIds.length === 1 ? "" : "s"} active in this range`}
            onClick={() => setSelectedMetric("contracted")}
          />
          <StatCard
            label="Total outstanding"
            value={money(totalOutstandingCents)}
            spectrum="mid"
            hint="As of now — not scoped to date range"
            onClick={() => setSelectedMetric("outstanding")}
          />
          <StatCard
            label="Failed & at-risk"
            value={money(failedAtRiskCents)}
            accent={failedAtRiskCents ? "destructive" : "primary"}
            icon={<AlertTriangle className="h-4 w-4" />}
            hint={`${reconciledActive.length} open item${reconciledActive.length === 1 ? "" : "s"} · live, not scoped to date range`}
            onClick={() => setSelectedMetric("failedAtRisk")}
          />
        </div>

        {/* Supporting detail for tier 1 ("what happened") — directly below
            the stat row, not buried under analytics. */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payment ledger · one row per real payment
            </div>
          }
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
                <th className="p-3 text-left">Client</th>
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-right font-sans tabular-nums">Amount</th>
                <th className="p-3 text-left">
                  <ChartHeaderFilter
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statusOptions}
                  />
                </th>
                <th className="p-3 text-left">
                  <ChartHeaderFilter
                    label="Processor"
                    value={processorFilter}
                    onChange={setProcessorFilter}
                    options={processorOptions}
                  />
                </th>
                <th className="p-3 text-left">
                  <ChartHeaderFilter
                    label="Type"
                    value={paymentTypeFilter}
                    onChange={setPaymentTypeFilter}
                    options={paymentTypeOptions}
                  />
                </th>
                <th className="p-3 text-left">
                  <ChartHeaderFilter
                    label="Tier"
                    value={tierFilter}
                    onChange={setTierFilter}
                    options={tierOptions}
                  />
                </th>
                <th className="p-3 text-left">Plan</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => (
                <tr key={r.payment.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-3">
                    {r.client ? (
                      <Link
                        to="/payments"
                        search={{ client: r.client.id } as never}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {r.client.full_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Unknown client</span>
                    )}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {new Date(r.payment.collected_at).toLocaleDateString()}
                  </td>
                  <td className="p-3 text-right font-sans tabular-nums">
                    {money(r.payment.amount_cents)}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-3xs uppercase ${
                        r.payment.status === "paid"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : r.payment.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : r.payment.status === "refunded" || r.payment.status === "partial"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-muted text-muted-foreground"
                      }`}
                      title={r.payment.failure_reason ?? undefined}
                    >
                      {titleCase(r.payment.status)}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{resolveProcessorLabel(r.payment.processor)}</td>
                  <td className="p-3 text-xs">{resolvePaymentTypeLabel(r.payment.payment_type)}</td>
                  <td className="p-3 text-xs">{r.tierLabel}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {r.structure ? formatPlanStructure(r.structure, money) : "—"}
                  </td>
                </tr>
              ))}
              {tableTotal === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<Banknote className="h-4 w-4" />}
                      title="No payments match the current filters"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        {/* Payment Operations (req. #4/§J tier 3) — "what needs action
            today," visually prominent, not buried under a tab. */}
        <div className="flex items-center gap-2">
          <div className="eyebrow">— Payment Operations</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card/70 p-4">
          <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Bell className="h-3.5 w-3.5 text-cyan-400" />
            Payment notifications
            <span className="ml-1 font-sans tabular-nums">{notifications.length}</span>
          </div>
          <p className="relative mt-1 text-3xs text-muted-foreground">
            Live, computed from real payment/schedule/recovery records — not a persisted alert log.
          </p>
          {notifications.length ? (
            <ul className="relative mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                    n.tone === "destructive"
                      ? "border-destructive/30 bg-destructive/5"
                      : n.tone === "warning"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : n.tone === "success"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border/60 bg-muted/10"
                  }`}
                >
                  <span className="min-w-0 truncate font-medium text-foreground">{n.label}</span>
                  <span className="shrink-0 text-3xs text-muted-foreground">{n.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="relative mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Nothing needs attention right now.
            </div>
          )}
        </div>

        <RecoveryQueuePanel
          active={reconciledActive}
          stale={clientSearchParam ? [] : reconciled.stale}
          onAction={(row, actionKey) => recoveryAction.mutate({ row, actionKey })}
          onClearStale={(item) => clearStale.mutate(item)}
          actionPending={recoveryAction.isPending || clearStale.isPending}
          commsByClient={commsByClient}
        />

        {/* Expected Cash (req. #4/§J tier 4) — revived, already-tested
            logic (expectedVsActualSeries), zero call sites before this. */}
        <div className="flex items-center gap-2">
          <div className="eyebrow">— Expected Cash</div>
          <div className="h-px flex-1 bg-border" />
        </div>
        <div className="hover-lift relative overflow-hidden rounded-xl border border-border bg-card/70 p-4">
          <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
          <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5 text-spectrum-cold" />
            Expected vs. actual collections
          </div>
          <p className="relative mt-1 text-3xs text-muted-foreground">
            Expected — real scheduled installments due in range. Actual — real payments collected.
          </p>
          {expectedVsActual.length ? (
            <div className="relative mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={expectedVsActual}
                  margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    minTickGap={24}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip
                        contentStyle={{ fontSize: 11 }}
                        labelStyle={{ color: "var(--foreground)" }}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="expectedCents"
                    name="Expected"
                    stroke="var(--spectrum-cold)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="actualCents"
                    name="Actual"
                    stroke="var(--spectrum-hot)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="relative mt-3 text-xs text-muted-foreground">
              No scheduled installments or collections in this date range yet.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="eyebrow">— Payment Breakdown</div>
          <div className="h-px flex-1 bg-border" />
        </div>
        {/* Plan structure / classification breakdown */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="hover-lift relative overflow-hidden rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-lg" />
            <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Collected by processor
            </div>
            {processorTotals.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {processorTotals.map((r) => (
                    <tr key={r.key} className="border-t border-border/40">
                      <td className="py-1 pr-2">{r.label}</td>
                      <td className="py-1 text-right font-sans tabular-nums text-spectrum-hot">
                        {money(r.totalCents)}
                      </td>
                      <td className="py-1 pl-2 text-right font-sans tabular-nums text-muted-foreground">
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-2xs text-muted-foreground">No collected cash yet.</div>
            )}
          </div>

          <div className="hover-lift relative overflow-hidden rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-lg" />
            <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Collected by payment type
            </div>
            {paymentTypeTotals.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {paymentTypeTotals.map((r) => (
                    <tr key={r.key} className="border-t border-border/40">
                      <td className="py-1 pr-2">{r.label}</td>
                      <td className="py-1 text-right font-sans tabular-nums text-spectrum-hot">
                        {money(r.totalCents)}
                      </td>
                      <td className="py-1 pl-2 text-right font-sans tabular-nums text-muted-foreground">
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-2xs text-muted-foreground">No collected cash yet.</div>
            )}
          </div>

          <div className="hover-lift relative overflow-hidden rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-lg" />
            <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              High vs. low ticket
            </div>
            {tierTotals.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {tierTotals.map((r) => (
                    <tr key={r.key} className="border-t border-border/40">
                      <td className="py-1 pr-2">{r.label}</td>
                      <td className="py-1 text-right font-sans tabular-nums text-spectrum-hot">
                        {money(r.totalCents)}
                      </td>
                      <td className="py-1 pl-2 text-right font-sans tabular-nums text-muted-foreground">
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-2xs text-muted-foreground">
                No tier data connected for these payments yet.
              </div>
            )}
          </div>

          <div className="hover-lift relative overflow-hidden rounded-lg border border-border/60 bg-card/60 p-3">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-lg" />
            <div className="relative text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              PIF vs. payment plan vs. low-ticket MRR
            </div>
            {classificationTotals.length ? (
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {classificationTotals.map((r) => (
                    <tr key={r.key} className="border-t border-border/40">
                      <td className="py-1 pr-2">{r.label}</td>
                      <td className="py-1 text-right font-sans tabular-nums text-spectrum-hot">
                        {money(r.totalCents)}
                      </td>
                      <td className="py-1 pl-2 text-right font-sans tabular-nums text-muted-foreground">
                        {r.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="mt-2 text-2xs text-muted-foreground">No classified deals yet.</div>
            )}
          </div>
        </div>

        <MenteeRenewalPanel openClientId={clientSearchParam} initialQuery={initialQuery} />
      </div>
      {metricPanel && (
        <MetricDetailPanel
          open={!!selectedMetric}
          onOpenChange={(v) => !v && setSelectedMetric(null)}
          title={metricPanel.title}
          columns={metricPanel.columns}
          rows={metricPanel.rows}
          rowKey={metricPanel.rowKey}
          cap={metricPanel.cap}
          working={metricPanel.working}
          emptyRowsLabel={metricPanel.emptyRowsLabel}
        />
      )}
    </>
  );
}
