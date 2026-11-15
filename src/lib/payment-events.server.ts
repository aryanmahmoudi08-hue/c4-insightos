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
    const c = client as {
      full_name: string | null;
      offer_name: string | null;
      payment_plan: boolean | null;
    } | null;
    const progress = schedule.length ? paymentProgress(schedule) : null;

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
        offer_name: c?.offer_name ?? null,
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
