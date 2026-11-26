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
  // Processors with no lead behind them (Stan through Zapier) send the
  // buyer's name and phone with the payment, so the message can still say
  // who paid.
  raw: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    product?: string | null;
  } | null;
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
    // Who sold it and what the deal is worth: the buyer's most recent call
    // with a closer on it (the post-call report), and the setter on it.
    const sale = await saleFor(orgId, lead?.email ?? email);
    // Tag the closer and setter on the deal in Discord when their roster
    // entry has a Discord user; otherwise the message names them.
    const mentions = new Set<string>();
    const closerTag = sale ? await repTag(orgId, { name: sale.closerName }, mentions) : null;
    const setterTag = sale?.setterId
      ? await repTag(orgId, { userId: sale.setterId, name: sale.setterName }, mentions)
      : null;
    const buyer = {
      full_name: payment.raw?.name?.trim() || null,
      phone: payment.raw?.phone?.trim() || null,
      email,
    };
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
        // "other" is a placeholder for a processor without its own handler
        // (Stan); its real name is in source_connector.
        processor:
          (payment.processor && payment.processor !== "other"
            ? payment.processor
            : payment.source_connector) ?? payment.processor,
        failure_reason: succeeded ? null : payment.failure_reason,
        email,
        lead_id: lead?.id ?? null,
        lead: lead
          ? {
              ...lead,
              full_name: lead.full_name ?? c?.full_name ?? buyer.full_name,
              phone: lead.phone ?? buyer.phone,
            }
          : buyer.full_name || buyer.phone
            ? { ...buyer, full_name: buyer.full_name ?? c?.full_name ?? null }
            : null,
        client_id: payment.client_id,
        client_name: c?.full_name ?? null,
        offer_name: c?.offer_name ?? product,
        product,
        failed_attempt_number: attempt,
        payment_plan: c?.payment_plan ?? null,
        plan_progress: progress?.label ?? null,
        prior_successful_payments: prior,
        closer_name: sale?.closerName ?? null,
        setter_name: sale?.setterName ?? null,
        closer_tag: closerTag || null,
        setter_tag: setterTag || null,
        mention_user_ids: [...mentions],
        // Revenue: the deal value the closer logged, else the offer's price.
        revenue_cents: sale?.contractValueCents || (await offerPriceByName(orgId, product)) || null,
        collected_to_date_cents: succeeded ? await collectedToDate(orgId, payment, email) : null,
        collected_at: payment.collected_at,
        // Kept for anyone already reading the old JSON shape.
        source: payment.source_connector,
      },
    );
  } catch (err) {
    console.error("announcePayment:", err);
  }
}

/** The buyer's latest call with a closer on it: closer, setter, deal value. */
export async function saleFor(orgId: string, email: string | null) {
  if (!email) return null;
  const { data: call } = await db
    .from("calls")
    .select("closer_name, closer_id, setter_id, contract_value_cents, closed")
    .eq("org_id", orgId)
    .ilike("lead_email", escapeLike(email))
    .not("closer_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!call) return null;
  const c = call as {
    closer_name: string | null;
    setter_id: string | null;
    contract_value_cents: number | null;
  };
  // Calls rarely carry a setter; the lead's assigned setter in the CRM is
  // the next best record of who set it.
  if (!c.setter_id) {
    const { data: lead } = await db
      .from("leads")
      .select("assigned_setter_id")
      .eq("org_id", orgId)
      .ilike("email", escapeLike(email))
      .not("assigned_setter_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    c.setter_id = (lead?.assigned_setter_id as string | undefined) ?? null;
  }
  let setterName: string | null = null;
  if (c.setter_id) {
    const { data: tm } = await db
      .from("team_members")
      .select("name")
      .eq("org_id", orgId)
      .eq("user_id", c.setter_id)
      .limit(1)
      .maybeSingle();
    setterName = (tm?.name as string | undefined) ?? null;
    if (!setterName) {
      const { data: prof } = await db
        .from("profiles")
        .select("display_name")
        .eq("id", c.setter_id)
        .maybeSingle();
      setterName = (prof?.display_name as string | undefined) ?? null;
    }
  }
  return {
    closerName: c.closer_name,
    setterId: c.setter_id,
    setterName,
    contractValueCents: Number(c.contract_value_cents) || 0,
  };
}

/** "<@123>" for a rep whose roster entry has a Discord user (added to
 *  `mentions` so the message is allowed to ping them), else their name. */
export async function repTag(
  orgId: string,
  ref: { userId?: string | null; name?: string | null },
  mentions: Set<string>,
): Promise<string> {
  const name = ref.name?.trim() || "";
  const { data } = await db
    .from("team_members")
    .select("name, user_id, discord_user_id, active")
    .eq("org_id", orgId);
  const rows = (
    (data ?? []) as Array<{
      name: string | null;
      user_id: string | null;
      discord_user_id: string | null;
      active: boolean | null;
    }>
  ).filter((m) => m.active !== false);
  const m =
    (ref.userId ? rows.find((r) => r.user_id === ref.userId) : undefined) ??
    (name ? rows.find((r) => r.name?.trim().toLowerCase() === name.toLowerCase()) : undefined);
  const id = m?.discord_user_id?.trim();
  if (id && /^\d+$/.test(id)) {
    mentions.add(id);
    return `<@${id}>`;
  }
  return m?.name ?? name;
}

/** An active offer's price by its name (the product on the payment). */
async function offerPriceByName(orgId: string, name: string | null): Promise<number | null> {
  if (!name) return null;
  const { data } = await db
    .from("offers")
    .select("price_cents")
    .eq("org_id", orgId)
    .eq("name", name)
    .limit(1)
    .maybeSingle();
  return (data?.price_cents as number | undefined) ?? null;
}

/** Everything this buyer has paid, this payment included (USD cents). */
async function collectedToDate(
  orgId: string,
  payment: PaymentRow,
  email: string | null,
): Promise<number | null> {
  let q = db
    .from("payments")
    .select("amount_cents")
    .eq("org_id", orgId)
    .eq("status", "paid")
    .lte("collected_at", payment.collected_at);
  if (payment.client_id) q = q.eq("client_id", payment.client_id);
  else if (email) q = q.ilike("raw->>email", escapeLike(email));
  else return null;
  const { data, error } = await q;
  if (error) return null;
  return ((data ?? []) as Array<{ amount_cents: number }>).reduce(
    (t, r) => t + (Number(r.amount_cents) || 0),
    0,
  );
}

/** The active offer whose price, or one of whose plans' total, deposit or
 *  installment, equals this amount (USD cents). Null when none or several
 *  different offers match. */
export async function offerByAmount(orgId: string, cents: number): Promise<string | null> {
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
