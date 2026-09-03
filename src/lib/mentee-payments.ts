/**
 * Mentees & Renewals financial logic (InsightOS upgrade spec, section 7).
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
  const start = new Date(`${client.expected_next_payment_date}T00:00:00`);
  for (let i = 0; i < count; i++) {
    const due = new Date(start);
    due.setMonth(due.getMonth() + i);
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
