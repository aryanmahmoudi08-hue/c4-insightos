/**
 * Payments ledger logic — processor/payment-type vocabulary, catalog-linked
 * plan-structure resolution, deal classification, and shared cash-position
 * math. Kept pure/testable and separate from the route, mirroring
 * mentee-payments.ts's own pattern in this repo.
 */

export const PROCESSOR_KEYS = [
  "wise",
  "paypal",
  "fanbasis",
  "whop",
  "stripe",
  "bank_transfer",
  "other",
] as const;
export type ProcessorKey = (typeof PROCESSOR_KEYS)[number];

export const PROCESSOR_LABELS: Record<ProcessorKey, string> = {
  wise: "Wise",
  paypal: "PayPal",
  fanbasis: "Fanbasis",
  whop: "Whop",
  stripe: "Stripe",
  bank_transfer: "Bank Transfer",
  other: "Other",
};

/** Never processor-sourced (no live processor integration exists yet) — a
 * null value here honestly means "not logged", not "unknown processor". */
export function resolveProcessorLabel(processor: string | null | undefined): string {
  if (!processor) return "Not logged";
  return PROCESSOR_LABELS[processor as ProcessorKey] ?? processor;
}

export const PAYMENT_TYPE_KEYS = ["deposit", "installment", "pif", "renewal", "other"] as const;
export type PaymentTypeKey = (typeof PAYMENT_TYPE_KEYS)[number];

export const PAYMENT_TYPE_LABELS: Record<PaymentTypeKey, string> = {
  deposit: "Deposit",
  installment: "Installment",
  pif: "Paid in Full",
  renewal: "Renewal",
  other: "Other",
};

export function resolvePaymentTypeLabel(paymentType: string | null | undefined): string {
  if (!paymentType) return "Not logged";
  return PAYMENT_TYPE_LABELS[paymentType as PaymentTypeKey] ?? paymentType;
}

/* ---------------------------- Plan structure ---------------------------- */

export type OfferPaymentPlanRow = {
  id: string;
  offer_id: string;
  label: string;
  cadence: string;
  installment_amount_cents: number | null;
  installment_count: number | null;
  total_contracted_value_cents: number | null;
  deposit_cents: number | null;
};

export type PlanClientInput = {
  payment_plan: boolean | null;
  installments_remaining: number | null;
  installment_amount_cents: number | null;
  contract_value_cents: number | null;
};

export type PlanStructure = {
  source: "catalog" | "custom" | "pif";
  label: string;
  cadence: string | null;
  installmentCount: number | null;
  installmentAmountCents: number | null;
  depositCents: number | null;
  totalCents: number | null;
};

/** Resolves a client's real payment-plan structure — catalog-sourced when
 * linked to a real `offer_payment_plans` row (exact cadence/installment
 * count/amount as configured), otherwise falls back to the client's own flat
 * fields, honestly labeled "Custom (unlinked)" rather than silently assumed
 * to match a configured plan it was never actually assigned to. */
export function resolvePlanStructure(
  client: PlanClientInput,
  plan: OfferPaymentPlanRow | null,
): PlanStructure {
  if (!client.payment_plan) {
    return {
      source: "pif",
      label: "Paid in Full",
      cadence: "single",
      installmentCount: 1,
      installmentAmountCents: client.contract_value_cents,
      depositCents: null,
      totalCents: client.contract_value_cents,
    };
  }
  if (plan) {
    return {
      source: "catalog",
      label: plan.label,
      cadence: plan.cadence,
      installmentCount: plan.installment_count,
      installmentAmountCents: plan.installment_amount_cents,
      depositCents: plan.deposit_cents,
      totalCents: plan.total_contracted_value_cents,
    };
  }
  return {
    source: "custom",
    label: "Custom (unlinked)",
    cadence: "custom",
    installmentCount: client.installments_remaining,
    installmentAmountCents: client.installment_amount_cents,
    depositCents: null,
    totalCents: client.contract_value_cents,
  };
}

/** "$2,500 × 2" / "Paid in full" / a catalog plan's own label when the
 * installment shape isn't cleanly expressible as amount × count. */
export function formatPlanStructure(plan: PlanStructure, money: (cents: number) => string): string {
  if (plan.source === "pif") return "Paid in full";
  if (plan.installmentCount && plan.installmentAmountCents) {
    return `${money(plan.installmentAmountCents)} × ${plan.installmentCount}`;
  }
  return plan.label;
}

/* ---------------------------- Deal classification ---------------------------- */

export type DealClassification = "pif" | "payment_plan" | "low_ticket_mrr";

export const DEAL_CLASSIFICATION_LABELS: Record<DealClassification, string> = {
  pif: "Paid in Full",
  payment_plan: "Payment Plan",
  low_ticket_mrr: "Low-Ticket MRR",
};

/** PIF vs. payment-plan is always knowable from `payment_plan` alone. MRR-
 * ness is not — it can only be confirmed via a real catalog link
 * (`offer_payment_plans.cadence === 'mrr'` or `offers.pricing_type ===
 * 'mrr'`); an unlinked payment-plan client defaults to the honest
 * "payment_plan" classification rather than a guessed MRR label. */
export function dealClassification(
  client: PlanClientInput,
  plan: OfferPaymentPlanRow | null,
  offerPricingType: string | null,
): DealClassification {
  if (!client.payment_plan) return "pif";
  if (plan && (plan.cadence === "mrr" || offerPricingType === "mrr")) return "low_ticket_mrr";
  return "payment_plan";
}

/* ---------------------------- Ticket tier ---------------------------- */

/** $1,000. A single payment below this is low ticket; at or above it is high. */
export const LOW_TICKET_CEILING_CENTS = 100_000;

export type TicketTier = "low" | "high";

/**
 * Tier from the deal itself, not from what the lead looked like on application.
 *
 * `leads.ticket_tier` is a guess made by the intake form before anyone has
 * paid; this reads the money that actually changed hands. The three branches
 * are the operator's own rule, and the middle one is the whole reason this
 * function exists rather than a bare `amount < 1000` comparison:
 *
 *   - low-ticket MRR is low ticket by definition, whatever any single charge is
 *   - a payment plan is a HIGH-ticket deal split into installments. Comparing
 *     a $500 monthly installment on a $5,000 plan against the ceiling would
 *     reclassify that client as low ticket every single month.
 *   - paid-in-full is the only case where one payment is the whole contract,
 *     so it is the only case where comparing against the ceiling is valid.
 */
export function ticketTierFromDeal(
  classification: DealClassification,
  contractValueCents: number | null,
): TicketTier {
  if (classification === "low_ticket_mrr") return "low";
  if (classification === "payment_plan") return "high";
  return (contractValueCents ?? 0) < LOW_TICKET_CEILING_CENTS ? "low" : "high";
}

/* ---------------------------- Cash position ---------------------------- */

export type CashPositionPayment = {
  id: string;
  client_id: string | null;
  amount_cents: number;
  status: string;
};

export type ClientCashInput = {
  id: string;
  contract_value_cents: number | null;
  expected_next_payment_cents: number | null;
};

export type ClientCashPosition = {
  collectedCents: number;
  outstandingCents: number;
  forecastedCents: number;
};

/** Real collected/outstanding/forecasted cash for one client — the single
 * source of truth both the mentee renewal panel's compact chip and the
 * payment ledger read, so the two never disagree about a client's cash
 * position. Dedupes payment rows by id first. */
export function computeClientCashPosition(
  client: ClientCashInput,
  payments: CashPositionPayment[],
): ClientCashPosition {
  const seen = new Set<string>();
  const clientPayments = payments.filter((p) => {
    if (p.client_id !== client.id) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  const collectedCents = clientPayments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount_cents, 0);
  const outstandingCents = Math.max(0, (client.contract_value_cents ?? 0) - collectedCents);
  const forecastedCents = client.expected_next_payment_cents ?? 0;
  return { collectedCents, outstandingCents, forecastedCents };
}

/* ---------------------------- Grouping ---------------------------- */

export type GroupTotal = { key: string; label: string; totalCents: number; count: number };

function groupBy<T>(
  rows: T[],
  keyFn: (row: T) => string,
  labelFn: (key: string) => string,
  amountFn: (row: T) => number,
): GroupTotal[] {
  const m = new Map<string, { totalCents: number; count: number }>();
  for (const row of rows) {
    const key = keyFn(row);
    const cur = m.get(key) ?? { totalCents: 0, count: 0 };
    cur.totalCents += amountFn(row);
    cur.count += 1;
    m.set(key, cur);
  }
  return Array.from(m.entries())
    .map(([key, v]) => ({ key, label: labelFn(key), totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function groupByProcessor(
  payments: { processor: string | null; amount_cents: number }[],
): GroupTotal[] {
  return groupBy(
    payments,
    (p) => p.processor ?? "unlogged",
    (k) => (k === "unlogged" ? "Not logged" : resolveProcessorLabel(k)),
    (p) => p.amount_cents,
  );
}

export function groupByPaymentType(
  payments: { payment_type: string | null; amount_cents: number }[],
): GroupTotal[] {
  return groupBy(
    payments,
    (p) => p.payment_type ?? "unlogged",
    (k) => (k === "unlogged" ? "Not logged" : resolvePaymentTypeLabel(k)),
    (p) => p.amount_cents,
  );
}

export function groupByTicketTier(
  rows: { tierKey: string | null; amount_cents: number }[],
  tierLabels: Map<string, string>,
): GroupTotal[] {
  return groupBy(
    rows,
    (r) => r.tierKey ?? "unknown",
    (k) => (k === "unknown" ? "Unknown" : (tierLabels.get(k) ?? k)),
    (r) => r.amount_cents,
  );
}

export function groupByDealClassification(
  rows: { classification: DealClassification; amount_cents: number }[],
): GroupTotal[] {
  return groupBy(
    rows,
    (r) => r.classification,
    (k) => DEAL_CLASSIFICATION_LABELS[k as DealClassification] ?? k,
    (r) => r.amount_cents,
  );
}
