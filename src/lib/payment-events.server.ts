/**
 * Announce a payment a processor just reported — collected or failed — on
 * the event bus and to its Discord channels.
 *
 * Every payment handler (Fanbasis/Commas, Whop, Stripe, PayPal, Wise) wrote
 * a payment.failed row to the event log but only ever dispatched
 * payment.collected, so a failure could never reach a subscription and
 * #payments-failed could only be fed from Zapier. Both now go out through
 * here.
 *
 * Built from the payment row the handler just saved, not from each
 * provider's payload, so every processor reads the same way and the failure
 * reason is whatever that handler already recorded.
 *
 * What the message can say about the buyer comes from AscendOS's own data,
 * never guessed from a provider field:
 *   - the lead, matched by email
 *   - the client, when the handler matched one: offer and payment-plan
 *     progress from their payment schedule ("2/5 paid")
 *   - how many successful payments this buyer made before this one, which
 *     is what tells a failed plan installment from a failed first purchase
 *
 * Fired once per payment through the same ledger as every other event, so a
 * Discord 429 is retried rather than lost.
 */
import { paymentProgress, type ScheduleItemRow } from "./mentee-payments";
import { db, fireOnce, leadSummary } from "./notify.server";
import { escapeLike } from "./sql-like";

type PaymentRow = {
  id: string;
  status: string;
  processor: string | null;
  source_connector: string | null;
  amount_cents: number;
  currency: string;
  original_amount_cents: number | null;
  original_currency: string | null;
  failure_reason: string | null;
  client_id: string | null;
  collected_at: string;
  raw: { email?: string | null } | null;
};

export async function announcePayment(orgId: string, paymentId: string | null | undefined) {
  if (!paymentId) return;
  try {
    const { data: p } = await db
      .from("payments")
      .select(
        "id, status, processor, source_connector, amount_cents, currency, original_amount_cents, original_currency, failure_reason, client_id, collected_at, raw",
      )
      .eq("org_id", orgId)
      .eq("id", paymentId)
      .maybeSingle();
    const payment = p as PaymentRow | null;
    if (!payment) return;

    const succeeded = payment.status === "paid";
    const email = payment.raw?.email?.trim() || null;

    const [lead, client, schedule, prior] = await Promise.all([
      email ? leadSummary(orgId, { email }) : Promise.resolve(null),
      payment.client_id
        ? db
            .from("clients")
            .select("full_name, email, offer_name, payment_plan")
            .eq("org_id", orgId)
            .eq("id", payment.client_id)
            .maybeSingle()
            .then((r: { data: unknown }) => r.data)
        : Promise.resolve(null),
      payment.client_id
        ? db
            .from("payment_schedule_items")
            .select("id, client_id, due_date, amount_cents, status")
            .eq("org_id", orgId)
            .eq("client_id", payment.client_id)
            .then((r: { data: unknown }) => (r.data ?? []) as ScheduleItemRow[])
        : Promise.resolve([] as ScheduleItemRow[]),
      priorSuccessfulPayments(orgId, payment, email),
    ]);
    const attempt = succeeded ? null : await failedAttemptNumber(orgId, payment, email);
    const c = client as {
      full_name: string | null;
      offer_name: string | null;
      payment_plan: boolean | null;
    } | null;
    const progress = schedule.length ? paymentProgress(schedule) : null;
    // No client record (most processor payments, and Stan): name the product
    // by matching the amount to an offer's price or one of its plans.
    const product =
      c?.offer_name ??
      (await offerByAmount(orgId, payment.amount_cents)) ??
      (payment.raw as { product?: string | null } | null)?.product ??
      null;

    await fireOnce(
      orgId,
      succeeded ? "payment.collected" : "payment.failed",
      `payment:${payment.id}`,
      { type: "payment", id: payment.id },
      {
        payment_id: payment.id,
        // As charged, in the buyer's currency; amount_usd_cents is the
        // canonical figure the dashboards sum.
        amount_cents: payment.original_amount_cents ?? payment.amount_cents,
        currency: payment.original_currency ?? payment.currency,
        amount_usd_cents: payment.amount_cents,
        processor: payment.processor ?? payment.source_connector,
        failure_reason: succeeded ? null : payment.failure_reason,
        email,
        lead_id: lead?.id ?? null,
        lead: lead && { ...lead, full_name: lead.full_name ?? c?.full_name ?? null },
        client_id: payment.client_id,
        client_name: c?.full_name ?? null,
        offer_name: c?.offer_name ?? product,
        product,
        failed_attempt_number: attempt,
        payment_plan: c?.payment_plan ?? null,
        plan_progress: progress?.label ?? null,
        prior_successful_payments: prior,
        collected_at: payment.collected_at,
        // Kept for anyone already reading the old JSON shape.
        source: payment.source_connector,
      },
    );
  } catch (err) {
    console.error("announcePayment:", err);
  }
}

/** The active offer whose price, or one of whose plans' total, deposit or
 *  installment, equals this amount (USD cents). Null when none or several
 *  different offers match. */
async function offerByAmount(orgId: string, cents: number): Promise<string | null> {
  if (!cents) return null;
  const { data } = await db
    .from("offers")
    .select(
      "name, price_cents, offer_payment_plans(total_contracted_value_cents, deposit_cents, installment_amount_cents)",
    )
    .eq("org_id", orgId)
    .eq("is_active", true);
  const names = new Set<string>();
  for (const o of (data ?? []) as Array<{
    name: string;
    price_cents: number | null;
    offer_payment_plans: Array<Record<string, number | null>> | null;
  }>) {
    const amounts = [
      o.price_cents,
      ...(o.offer_payment_plans ?? []).flatMap((p) => [
        p.total_contracted_value_cents,
        p.deposit_cents,
        p.installment_amount_cents,
      ]),
    ];
    if (amounts.includes(cents)) names.add(o.name);
  }
  return names.size === 1 ? [...names][0] : null;
}

/** Which failed attempt this is: this failure plus the buyer's failures
 *  since their last successful payment, from AscendOS's own payment rows.
 *  Null when the buyer cannot be identified. */
async function failedAttemptNumber(
  orgId: string,
  payment: PaymentRow,
  email: string | null,
): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byBuyer = (q: any) =>
    payment.client_id
      ? q.eq("client_id", payment.client_id)
      : q.ilike("raw->>email", escapeLike(email ?? ""));
  if (!payment.client_id && !email) return null;
  const { data: lastPaid } = await byBuyer(
    db
      .from("payments")
      .select("collected_at")
      .eq("org_id", orgId)
      .eq("status", "paid")
      .lt("collected_at", payment.collected_at),
  )
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let q = byBuyer(
    db
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("status", "paid")
      .neq("id", payment.id)
      .lte("collected_at", payment.collected_at),
  );
  if (lastPaid?.collected_at) q = q.gt("collected_at", lastPaid.collected_at);
  const { count, error } = await q;
  return error ? null : (count ?? 0) + 1;
}

/** Successful payments from the same buyer before this one — by client when
 *  the handler matched one, otherwise by the email the processor sent. */
async function priorSuccessfulPayments(
  orgId: string,
  payment: PaymentRow,
  email: string | null,
): Promise<number | null> {
  let q = db
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "paid")
    .neq("id", payment.id)
    .lt("collected_at", payment.collected_at);
  if (payment.client_id) q = q.eq("client_id", payment.client_id);
  else if (email) q = q.ilike("raw->>email", escapeLike(email));
  else return null;
  const { count, error } = await q;
  return error ? null : (count ?? 0);
}
