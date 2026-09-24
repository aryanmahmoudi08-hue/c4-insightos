/**
 * Mentee renewal/retention financial logic (InsightOS upgrade spec, section
 * 7) — consumed by MenteeRenewalPanel, embedded inside the Payments page.
 * Kept pure/testable and separate from the route — mirrors client-risk.ts,
 * speed-to-lead.ts, and operating-workflows.ts's existing pattern in this repo.
 */

/** Calendar-day diff, local-midnight vs local-midnight (see client-risk.ts
 * for why: avoids off-by-one drift from UTC parsing across timezones). */
export function daysBetween(
  date: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(now.toDateString()).getTime();
  return Math.round((target - today) / 86400e3);
}

export type ScheduleClientInput = {
  id: string;
  payment_plan: boolean | null;
  installments_remaining: number | null;
  installment_amount_cents: number | null;
  expected_next_payment_date: string | null;
};

export type GeneratedScheduleItem = {
  due_date: string;
  amount_cents: number;
};

/** Generates the remaining monthly installment schedule for a payment-plan
 * mentee — "$500/month must show every expected $500 payment", not just an
 * aggregate count. Cadence is monthly (the only cadence InsightOS captures
 * today via installment_amount_cents); this is regenerated whenever a
 * payment-plan mentee is created/edited, so it never drifts from the form. */
export function generatePaymentSchedule(client: ScheduleClientInput): GeneratedScheduleItem[] {
  if (!client.payment_plan) return [];
  const count = client.installments_remaining ?? 0;
  const amount = client.installment_amount_cents ?? 0;
  if (count <= 0 || amount <= 0 || !client.expected_next_payment_date) return [];
  const items: GeneratedScheduleItem[] = [];
  // A due date is a calendar date, not an instant — parse and advance it in
  // UTC so it never round-trips through the viewer's zone. Parsing as local
  // midnight and emitting via toISOString() shifted every due date a day
  // earlier for anyone ahead of UTC.
  const start = new Date(`${client.expected_next_payment_date}T00:00:00Z`);
  for (let i = 0; i < count; i++) {
    const due = new Date(start);
    due.setUTCMonth(due.getUTCMonth() + i);
    items.push({ due_date: due.toISOString().slice(0, 10), amount_cents: amount });
  }
  return items;
}

export type ScheduleItemRow = {
  id: string;
  client_id: string;
  due_date: string;
  amount_cents: number;
  status: string;
};

/** The stored `status` only ever moves forward on an explicit write (a
 * payment gets logged, or someone marks a row missed) — there's no
 * background job aging rows from "scheduled" to "overdue" as dates pass.
 * Compute the effective status at read time instead, so a schedule item
 * that's simply never been touched past its due date still reads as
 * overdue rather than staying "scheduled" forever. */
export function effectiveScheduleStatus(
  item: { due_date: string; status: string },
  now: Date = new Date(),
): string {
  if (item.status === "paid") return "paid";
  const days = daysBetween(item.due_date, now);
  if (days != null && days < 0) return "overdue";
  return item.status;
}

export type InstallmentUrgency = "paid" | "due_today" | "due_soon" | "scheduled" | "overdue";

export const INSTALLMENT_URGENCY_LABELS: Record<InstallmentUrgency, string> = {
  paid: "Paid",
  due_today: "Due today",
  due_soon: "Due soon",
  scheduled: "Scheduled",
  overdue: "Overdue",
};

/** Richer read-time classification for a single installment, layering
 * "due today"/"due soon" (≤3 days out, same window `buildRecoveryQueue`'s
 * own `due_next_3d` bucket uses) on top of `effectiveScheduleStatus()`'s
 * existing paid/overdue aging — used for per-installment displays and the
 * Payment Notifications feed. Never invents a "missed" state distinct from
 * overdue — this schema has no real write path that produces one. */
export function installmentUrgency(
  item: { due_date: string; status: string },
  now: Date = new Date(),
): InstallmentUrgency {
  if (item.status === "paid") return "paid";
  const days = daysBetween(item.due_date, now);
  if (days == null) return "scheduled";
  if (days < 0) return "overdue";
  if (days === 0) return "due_today";
  if (days <= 3) return "due_soon";
  return "scheduled";
}

/** Compact "3/5 paid" progress indicator for a mentee's schedule. */
export function paymentProgress(items: ScheduleItemRow[]): {
  paid: number;
  total: number;
  label: string;
} {
  const paid = items.filter((i) => i.status === "paid").length;
  return { paid, total: items.length, label: items.length ? `${paid}/${items.length} paid` : "—" };
}

export type RecoveryBucketKey =
  | "failed_today"
  | "retry_pending"
  | "due_next_3d"
  | "overdue_1_7"
  | "overdue_8_30"
  | "overdue_30_plus"
  | "promise_to_pay_today"
  | "high_value_outstanding";

export const RECOVERY_BUCKET_LABELS: Record<RecoveryBucketKey, string> = {
  failed_today: "Failed Payment Today",
  retry_pending: "Retry Pending",
  due_next_3d: "Due in Next 3 Days",
  overdue_1_7: "Overdue 1–7 Days",
  overdue_8_30: "Overdue 8–30 Days",
  overdue_30_plus: "Overdue 30+ Days",
  promise_to_pay_today: "Promise-to-Pay Due Today",
  high_value_outstanding: "High-Value Outstanding",
};

export type RecoveryQueueClient = {
  id: string;
  full_name: string;
  offer_name: string | null;
  expected_next_payment_date: string | null;
  expected_next_payment_cents: number | null;
  contract_value_cents: number | null;
  invested_to_date_cents: number | null;
};

export type RecoveryPaymentRow = { client_id: string | null; status: string; collected_at: string };

export type RecoveryQueueRow = {
  bucket: RecoveryBucketKey;
  client: RecoveryQueueClient;
  amountCents: number;
  dueDate: string | null;
  ageDays: number | null;
};

/** High-value threshold — $2,000 outstanding, a defensible round-number
 * default until a workspace setting for this exists. */
const HIGH_VALUE_THRESHOLD_CENTS = 200_000;

/** Classifies mentees into the spec's named recovery buckets. A client can
 * land in more than one bucket (e.g. overdue AND high-value) — buckets are
 * views into the same underlying risk, not a single queue with one status. */
export function buildRecoveryQueue(
  clients: RecoveryQueueClient[],
  payments: RecoveryPaymentRow[],
  now: Date = new Date(),
): RecoveryQueueRow[] {
  const rows: RecoveryQueueRow[] = [];
  const paymentsByClient = new Map<string, RecoveryPaymentRow[]>();
  for (const p of payments) {
    if (!p.client_id) continue;
    const arr = paymentsByClient.get(p.client_id) ?? [];
    arr.push(p);
    paymentsByClient.set(p.client_id, arr);
  }
  for (const client of clients) {
    const clientPayments = paymentsByClient.get(client.id) ?? [];
    const failedToday = clientPayments.some(
      (p) => p.status === "failed" && daysBetween(p.collected_at.slice(0, 10), now) === 0,
    );
    if (failedToday) {
      rows.push({
        bucket: "failed_today",
        client,
        amountCents: client.expected_next_payment_cents ?? 0,
        dueDate: client.expected_next_payment_date,
        ageDays: 0,
      });
    }
    const hasFailed = clientPayments.some((p) => p.status === "failed");
    if (hasFailed && !failedToday) {
      rows.push({
        bucket: "retry_pending",
        client,
        amountCents: client.expected_next_payment_cents ?? 0,
        dueDate: client.expected_next_payment_date,
        ageDays: null,
      });
    }
    const dueDays = daysBetween(client.expected_next_payment_date, now);
    if (dueDays != null) {
      if (dueDays >= 0 && dueDays <= 3) {
        rows.push({
          bucket: "due_next_3d",
          client,
          amountCents: client.expected_next_payment_cents ?? 0,
          dueDate: client.expected_next_payment_date,
          ageDays: dueDays,
        });
      } else if (dueDays < 0) {
        const overdueDays = Math.abs(dueDays);
        const bucket: RecoveryBucketKey =
          overdueDays <= 7 ? "overdue_1_7" : overdueDays <= 30 ? "overdue_8_30" : "overdue_30_plus";
        rows.push({
          bucket,
          client,
          amountCents: client.expected_next_payment_cents ?? 0,
          dueDate: client.expected_next_payment_date,
          ageDays: overdueDays,
        });
      }
    }
    const outstanding = Math.max(
      0,
      (client.contract_value_cents ?? 0) - (client.invested_to_date_cents ?? 0),
    );
    if (outstanding >= HIGH_VALUE_THRESHOLD_CENTS) {
      rows.push({
        bucket: "high_value_outstanding",
        client,
        amountCents: outstanding,
        dueDate: client.expected_next_payment_date,
        ageDays: dueDays,
      });
    }
  }
  return rows;
}

/** A real, persisted `payment_recovery_items` row — the shape this
 * reconciliation needs, a subset of the table's real columns. */
export type RecoveryItemRow = {
  id: string;
  client_id: string | null;
  status: string;
  owner_id: string | null;
  next_action: string | null;
  next_action_at: string | null;
};

export type ReconciledRecoveryRow = {
  client: RecoveryQueueClient;
  buckets: RecoveryBucketKey[];
  amountCents: number;
  dueDate: string | null;
  ageDays: number | null;
  /** Whether a real, open `payment_recovery_items` row exists for this
   * client — false means "genuinely qualifies but nothing's been logged
   * yet," not "not at risk." */
  tracked: boolean;
  recoveryItem: RecoveryItemRow | null;
};

export type StaleRecoveryRow = {
  recoveryItem: RecoveryItemRow;
  client: RecoveryQueueClient | undefined;
};

export type ReconciledRecoveryQueue = {
  /** One row per client currently qualifying under `buildRecoveryQueue()`,
   * whether or not a `payment_recovery_items` row exists for them yet. */
  active: ReconciledRecoveryRow[];
  /** Open `payment_recovery_items` rows whose client no longer qualifies
   * under any real bucket (e.g. they paid) — never shown as active. */
  stale: StaleRecoveryRow[];
  /** Sum of `active` amounts — the one canonical "Failed & At-Risk" total,
   * shared by every surface that displays it. */
  totalCents: number;
};

const RECOVERY_OPEN_STATUSES = new Set(["due", "failed", "overdue", "retry"]);

/** The single reconciliation rule between live payment/schedule conditions
 * (`buildRecoveryQueue()`, computed from real `clients`+`payments` rows) and
 * the persisted `payment_recovery_items` table — see mentee-renewal-panel's
 * recovery queue and the Payments ledger's "Failed & At-Risk" stat card,
 * both of which must read from this exact function so they can never
 * disagree. A client who genuinely qualifies is never dropped for lacking a
 * recovery-item row (shown `tracked: false` instead); a recovery-item row
 * whose client no longer qualifies is excluded from `active` and surfaced
 * in `stale` instead of silently vanishing or staying active forever. */
export function reconcileRecoveryQueue(
  clients: RecoveryQueueClient[],
  payments: RecoveryPaymentRow[],
  recoveryItems: RecoveryItemRow[],
  now: Date = new Date(),
): ReconciledRecoveryQueue {
  const rawRows = buildRecoveryQueue(clients, payments, now);
  const byClient = new Map<
    string,
    {
      client: RecoveryQueueClient;
      buckets: RecoveryBucketKey[];
      amountCents: number;
      dueDate: string | null;
      ageDays: number | null;
    }
  >();
  for (const row of rawRows) {
    const cur = byClient.get(row.client.id) ?? {
      client: row.client,
      buckets: [] as RecoveryBucketKey[],
      amountCents: 0,
      dueDate: row.dueDate,
      ageDays: row.ageDays,
    };
    cur.buckets.push(row.bucket);
    cur.amountCents = Math.max(cur.amountCents, row.amountCents);
    if (row.ageDays != null && (cur.ageDays == null || row.ageDays > cur.ageDays)) {
      cur.ageDays = row.ageDays;
    }
    byClient.set(row.client.id, cur);
  }

  const openByClient = new Map<string, RecoveryItemRow>();
  for (const item of recoveryItems) {
    if (!item.client_id || !RECOVERY_OPEN_STATUSES.has(item.status)) continue;
    const existing = openByClient.get(item.client_id);
    if (!existing || (item.next_action_at ?? "") > (existing.next_action_at ?? "")) {
      openByClient.set(item.client_id, item);
    }
  }

  const active: ReconciledRecoveryRow[] = Array.from(byClient.values()).map((agg) => {
    const recoveryItem = openByClient.get(agg.client.id) ?? null;
    return { ...agg, tracked: !!recoveryItem, recoveryItem };
  });

  const stale: StaleRecoveryRow[] = recoveryItems
    .filter(
      (item) =>
        item.client_id && RECOVERY_OPEN_STATUSES.has(item.status) && !byClient.has(item.client_id),
    )
    .map((item) => ({
      recoveryItem: item,
      client: clients.find((c) => c.id === item.client_id),
    }));

  const totalCents = active.reduce((sum, row) => sum + row.amountCents, 0);
  return { active, stale, totalCents };
}

export type ExpectedActualPoint = { date: string; expectedCents: number; actualCents: number };

/** Buckets expected (payment_schedule_items due_date) vs actual (payments
 * collected_at) cash by day, for the Expected vs Actual Collections chart.
 * Both series come from real logged rows — nothing projected beyond what's
 * already scheduled or already collected. */
export function expectedVsActualSeries(
  scheduleItems: { due_date: string; amount_cents: number }[],
  payments: { collected_at: string; amount_cents: number; status: string }[],
  fromDate: string,
  toDate: string,
): ExpectedActualPoint[] {
  const byDate = new Map<string, { expectedCents: number; actualCents: number }>();
  const ensure = (d: string) => {
    if (!byDate.has(d)) byDate.set(d, { expectedCents: 0, actualCents: 0 });
    return byDate.get(d)!;
  };
  for (const item of scheduleItems) {
    const d = item.due_date.slice(0, 10);
    if (d < fromDate || d > toDate) continue;
    ensure(d).expectedCents += item.amount_cents;
  }
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const d = p.collected_at.slice(0, 10);
    if (d < fromDate || d > toDate) continue;
    ensure(d).actualCents += p.amount_cents;
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function collectionRatePct(scheduleItems: { status: string }[]): number | null {
  const total = scheduleItems.filter(
    (i) => i.status === "paid" || i.status === "overdue" || i.status === "missed",
  ).length;
  if (!total) return null;
  const paid = scheduleItems.filter((i) => i.status === "paid").length;
  return (paid / total) * 100;
}

/* ---------------------------- Retention & renewal analytics ---------------------------- */
/**
 * Every function below reads only real, already-collected rows (clients,
 * payments, payment_schedule_items, renewal_work_items) — no period-cohort
 * snapshot table exists in this schema, so anything that would genuinely
 * require one (GRR/NRR, a true "save rate" needing historical risk-state
 * transitions) is deliberately NOT implemented here rather than approximated.
 * See MenteeRenewalPanel (src/components/mentee-renewal-panel.tsx) for how
 * each is surfaced/labeled.
 */

export type RenewalOutcomeClient = {
  renewal_stage: string | null;
  contract_value_cents: number | null;
};

/** Decided-only: won / (won + churned). Mentees still mid-pipeline don't
 * count toward the denominator — they haven't produced an outcome yet. */
export function renewalRatePct(clients: RenewalOutcomeClient[]): number | null {
  const decided = clients.filter((c) => c.renewal_stage === "won" || c.renewal_stage === "churned");
  if (!decided.length) return null;
  return (decided.filter((c) => c.renewal_stage === "won").length / decided.length) * 100;
}

/** Contract value of mentees currently in a non-terminal renewal stage. */
export function renewalPipelineValueCents(clients: RenewalOutcomeClient[]): number {
  return clients
    .filter((c) => c.renewal_stage && c.renewal_stage !== "won" && c.renewal_stage !== "churned")
    .reduce((sum, c) => sum + (c.contract_value_cents ?? 0), 0);
}

/** Contract value of mentees whose renewal stage is churned. */
export function churnedValueCents(clients: RenewalOutcomeClient[]): number {
  return clients
    .filter((c) => c.renewal_stage === "churned")
    .reduce((sum, c) => sum + (c.contract_value_cents ?? 0), 0);
}

export type RenewalConversionRow = { key: string; won: number; churned: number; ratePct: number };

/** Generic won/churned breakdown by any grouping key (offer, health band,
 * payment-plan vs PIF, acquisition source, closer) — one function, reused
 * for every "renewal conversion by X" cut instead of five near-duplicates. */
export function renewalConversionBy(
  rows: { key: string; renewal_stage: string | null }[],
): RenewalConversionRow[] {
  const m = new Map<string, { won: number; churned: number }>();
  for (const r of rows) {
    if (r.renewal_stage !== "won" && r.renewal_stage !== "churned") continue;
    const cur = m.get(r.key) ?? { won: 0, churned: 0 };
    if (r.renewal_stage === "won") cur.won += 1;
    else cur.churned += 1;
    m.set(r.key, cur);
  }
  return Array.from(m.entries())
    .map(([key, v]) => ({
      key,
      won: v.won,
      churned: v.churned,
      ratePct: (v.won / (v.won + v.churned)) * 100,
    }))
    .sort((a, b) => b.won + b.churned - (a.won + a.churned));
}

/** Average days between mentee start_date and renewal_date, for mentees with
 * a decided (won/churned) outcome and a real renewal_date — an honest
 * "tenure to first renewal decision" proxy, not a claim about a precise
 * renewal-event timestamp this schema doesn't separately log. */
export function averageTenureAtRenewalOutcome(
  rows: { renewal_stage: string | null; start_date: string; renewal_date: string | null }[],
): number | null {
  const decided = rows.filter(
    (r) => (r.renewal_stage === "won" || r.renewal_stage === "churned") && r.renewal_date,
  );
  if (!decided.length) return null;
  const totalDays = decided.reduce((sum, r) => {
    const start = new Date(`${r.start_date}T00:00:00`).getTime();
    const end = new Date(`${r.renewal_date}T00:00:00`).getTime();
    return sum + Math.round((end - start) / 86400e3);
  }, 0);
  return totalDays / decided.length;
}

export type OfferLtvRow = { offer: string; collectedCents: number };

/** Collected (not contracted) LTV, grouped by offer — the counterpart to the
 * route's existing contracted-LTV-by-offer table, kept as a separate
 * function since collected/contracted must never be blended into one number. */
export function collectedLtvByOffer(
  payments: { client_id: string | null; amount_cents: number; status: string }[],
  offerByClientId: Map<string, string | null>,
): OfferLtvRow[] {
  const m = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "paid" || !p.client_id) continue;
    const offer = offerByClientId.get(p.client_id) || "(no offer)";
    m.set(offer, (m.get(offer) ?? 0) + p.amount_cents);
  }
  return Array.from(m.entries())
    .map(([offer, collectedCents]) => ({ offer, collectedCents }))
    .sort((a, b) => b.collectedCents - a.collectedCents);
}

export type ChurnReasonRow = { reason: string; count: number };

/** Groups churned mentees by renewal_work_items.renewal_outcome — a real
 * column that exists but (as of this pass) has no capture UI writing to it
 * yet, so most workspaces will show 100% "Not tracked" honestly rather than
 * a fabricated taxonomy. */
export function churnReasonBreakdown(
  churnedClientIds: string[],
  reasonByClientId: Map<string, string | null>,
): ChurnReasonRow[] {
  const m = new Map<string, number>();
  for (const id of churnedClientIds) {
    const reason = reasonByClientId.get(id) || "Not tracked";
    m.set(reason, (m.get(reason) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/* ---------------------------- Payment analytics ---------------------------- */

/** Of ALL scheduled installments (paid + not-yet-due + overdue), how many
 * are done — overall payment-plan progress. Distinct from collectionRatePct,
 * which only looks at items that have already come due. */
export function paymentPlanCompletionRatePct(scheduleItems: { status: string }[]): number | null {
  if (!scheduleItems.length) return null;
  return (scheduleItems.filter((i) => i.status === "paid").length / scheduleItems.length) * 100;
}

/** Of scheduled items marked paid AND linked to a real payment row, what
 * share were collected on or before their due date. Items with no linked
 * payment_id are excluded rather than guessed as on-time or late. */
export function onTimePaymentRatePct(
  scheduleItems: { due_date: string; payment_id: string | null; status: string }[],
  paymentsById: Map<string, { collected_at: string }>,
): number | null {
  const linked = scheduleItems.filter((s) => s.status === "paid" && s.payment_id);
  if (!linked.length) return null;
  const onTime = linked.filter((s) => {
    const payment = paymentsById.get(s.payment_id!);
    return !!payment && payment.collected_at.slice(0, 10) <= s.due_date;
  }).length;
  return (onTime / linked.length) * 100;
}

/** Failed / (paid + failed) — real payment attempts only, never counting a
 * still-pending row as a failure. */
export function failedPaymentRatePct(payments: { status: string }[]): number | null {
  const attempts = payments.filter((p) => p.status === "paid" || p.status === "failed");
  if (!attempts.length) return null;
  return (payments.filter((p) => p.status === "failed").length / attempts.length) * 100;
}

/** Refunded / (paid + refunded). */
export function refundRatePct(payments: { status: string }[]): number | null {
  const base = payments.filter((p) => p.status === "paid" || p.status === "refunded");
  if (!base.length) return null;
  return (payments.filter((p) => p.status === "refunded").length / base.length) * 100;
}

export type AgingBucket = "current" | "overdue_1_7" | "overdue_8_30" | "overdue_31_plus";

export const AGING_BUCKET_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  overdue_1_7: "1–7 days overdue",
  overdue_8_30: "8–30 days overdue",
  overdue_31_plus: "31+ days overdue",
};

/** Dollar total of not-yet-paid scheduled installments, bucketed by how
 * overdue they are (never-due-yet counts as "current"). Uses the same
 * effectiveScheduleStatus day-math as everywhere else, so this always
 * agrees with the recovery queue's own overdue buckets. */
export function outstandingBalanceAging(
  scheduleItems: { due_date: string; amount_cents: number; status: string }[],
  now: Date = new Date(),
): Record<AgingBucket, number> {
  const buckets: Record<AgingBucket, number> = {
    current: 0,
    overdue_1_7: 0,
    overdue_8_30: 0,
    overdue_31_plus: 0,
  };
  for (const item of scheduleItems) {
    if (item.status === "paid") continue;
    const days = daysBetween(item.due_date, now) ?? 0;
    if (days >= 0) {
      buckets.current += item.amount_cents;
      continue;
    }
    const overdueDays = Math.abs(days);
    if (overdueDays <= 7) buckets.overdue_1_7 += item.amount_cents;
    else if (overdueDays <= 30) buckets.overdue_8_30 += item.amount_cents;
    else buckets.overdue_31_plus += item.amount_cents;
  }
  return buckets;
}
