/**
 * Refunds and disputes (chargebacks), from every processor, saved and
 * announced to #refunds-disputes.
 *
 * Every payment handler used to record only "paid" and "failed", so a refund
 * or a chargeback never reached AscendOS. The Whop, Fanbasis/Commas, Stripe
 * and PayPal webhooks, and the Zapier ingest (Stan, or any processor without
 * a webhook), now map their event to a RefundDisputeInput and call
 * recordRefundOrDispute.
 *
 * The alert is built to win the dispute: who the buyer is, what they bought
 * and which tier it is, who closed and set the deal (tagged), the evidence
 * deadline, and the evidence itself — the signed contract and the call
 * recording from the closer's post-call report.
 */
import { normalizePaymentToUsd } from "./fx.server";
import { db, fireOnce, leadSummary } from "./notify.server";
import { offerByAmount, repTag, saleFor } from "./payment-events.server";
import { escapeLike } from "./sql-like";

export type RefundDisputeKind = "refund" | "dispute" | "dispute_alert";

export type RefundDisputeInput = {
  kind: RefundDisputeKind;
  processor: string;
  /** The processor's id for the refund/dispute itself. */
  externalId: string;
  /** The processor's id for the payment being refunded/disputed. */
  paymentExternalId?: string | null;
  status?: string | null;
  reason?: string | null;
  /** In whole units of `currency` (e.g. 2500.00), as processors report it. */
  amount?: number | null;
  currency?: string | null;
  evidenceDueAt?: string | null;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  product?: string | null;
  occurredAt?: string | null;
  raw?: unknown;
};

/** Statuses after which a dispute needs nothing more from us. */
const DISPUTE_FINAL = new Set(["won", "lost", "closed", "warning_closed", "prevented", "resolved"]);

/** A refund only counts (and only takes the payment off revenue) once the
 *  processor says it went through. */
function refundSucceeded(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  return !s || ["succeeded", "completed", "refunded", "success", "paid"].includes(s);
}

export async function recordRefundOrDispute(
  orgId: string,
  input: RefundDisputeInput,
): Promise<{ id: string | null; announced: boolean }> {
  const processor = input.processor.trim().toLowerCase();
  let email = input.email?.trim().toLowerCase() || null;
  const currency = (input.currency || "USD").toUpperCase();
  const originalCents =
    input.amount != null && Number.isFinite(Number(input.amount))
      ? Math.round(Number(input.amount) * 100)
      : null;
  const occurredAt = validDate(input.occurredAt) ?? new Date().toISOString();
  const usd =
    originalCents != null ? await normalizePaymentToUsd(originalCents, currency, occurredAt) : null;

  // The payment it reverses, when we recorded it.
  let paymentId: string | null = null;
  let paymentAmountCents: number | null = null;
  if (input.paymentExternalId) {
    const { data } = await db
      .from("payments")
      .select("id, amount_cents, raw")
      .eq("org_id", orgId)
      .eq("external_id", input.paymentExternalId)
      .maybeSingle();
    if (data) {
      paymentId = data.id;
      paymentAmountCents = Number(data.amount_cents) || null;
      // Some dispute payloads (Stripe's) carry no buyer email; the payment
      // we saved does.
      const rawEmail = (data.raw as { email?: string | null } | null)?.email;
      if (!email && rawEmail) email = rawEmail.trim().toLowerCase();
    }
  }

  const lead = email ? await leadSummary(orgId, { email }) : null;

  const { data: saved, error } = await db
    .from("payment_disputes")
    .upsert(
      {
        org_id: orgId,
        kind: input.kind,
        processor,
        external_id: input.externalId,
        payment_external_id: input.paymentExternalId ?? null,
        payment_id: paymentId,
        status: input.status ?? null,
        reason: input.reason ?? null,
        amount_cents: usd?.amountCents ?? null,
        currency: usd?.currency ?? "USD",
        original_amount_cents: originalCents,
        original_currency: currency,
        evidence_due_at: validDate(input.evidenceDueAt),
        email,
        name: input.name?.trim() || null,
        phone: input.phone?.trim() || null,
        product: input.product?.trim() || null,
        lead_id: lead?.id ?? null,
        raw: (input.raw ?? {}) as never,
        occurred_at: occurredAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,processor,external_id" },
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`payment_disputes upsert: ${error.message}`);
  const rowId = (saved?.id as string | undefined) ?? null;

  // A completed refund takes the payment off revenue: the dashboards sum
  // status = 'paid'. Partial refunds keep it as 'partial'.
  if (input.kind === "refund" && paymentId && refundSucceeded(input.status)) {
    const full = !usd || !paymentAmountCents || usd.amountCents >= paymentAmountCents;
    await db
      .from("payments")
      .update({ status: full ? "refunded" : "partial" })
      .eq("org_id", orgId)
      .eq("id", paymentId);
  }

  const announced = await announceRefundOrDispute(orgId, rowId, input, {
    email,
    usdCents: usd?.amountCents ?? null,
    originalCents,
    currency,
    lead,
  });
  return { id: rowId, announced };
}

async function announceRefundOrDispute(
  orgId: string,
  rowId: string | null,
  input: RefundDisputeInput,
  ctx: {
    email: string | null;
    usdCents: number | null;
    originalCents: number | null;
    currency: string;
    lead: Awaited<ReturnType<typeof leadSummary>> | null;
  },
): Promise<boolean> {
  if (!rowId) return false;
  // A refund still pending says nothing new; announce it once it lands.
  if (input.kind === "refund" && !refundSucceeded(input.status)) return false;

  const email = ctx.email;
  const sale = await saleFor(orgId, ctx.lead?.email ?? email);
  const mentions = new Set<string>();
  const closerTag = sale ? await repTag(orgId, { name: sale.closerName }, mentions) : null;
  const setterTag = sale?.setterId
    ? await repTag(orgId, { userId: sale.setterId, name: sale.setterName }, mentions)
    : null;

  const product =
    input.product?.trim() ||
    (ctx.usdCents ? await offerByAmount(orgId, ctx.usdCents) : null) ||
    null;
  const tier = await tierFor(orgId, product, ctx.lead);
  const evidence = await closedCallEvidence(orgId, ctx.lead?.id ?? null, email);
  const history = await buyerHistory(orgId, email);

  const status = (input.status ?? "").toLowerCase();
  const eventType =
    input.kind === "refund"
      ? "payment.refunded"
      : DISPUTE_FINAL.has(status)
        ? "payment.dispute_resolved"
        : "payment.disputed";

  // One message per state: a dispute that opens, then is won, posts twice.
  const fireKey = `${input.kind}:${input.processor}:${input.externalId}:${status || "-"}`;

  return fireOnce(
    orgId,
    eventType,
    fireKey,
    { type: "payment_dispute", id: rowId },
    {
      dispute_id: rowId,
      kind: input.kind,
      processor: input.processor.toLowerCase(),
      status: input.status ?? null,
      reason: input.reason ?? null,
      amount_cents: ctx.originalCents,
      currency: ctx.currency,
      amount_usd_cents: ctx.usdCents,
      evidence_due_at: validDate(input.evidenceDueAt),
      email,
      lead_id: ctx.lead?.id ?? null,
      lead: {
        ...(ctx.lead ?? {}),
        full_name: ctx.lead?.full_name ?? input.name ?? null,
        phone: ctx.lead?.phone ?? input.phone ?? null,
        email: ctx.lead?.email ?? email,
      },
      product,
      tier,
      closer_name: sale?.closerName ?? null,
      setter_name: sale?.setterName ?? null,
      closer_tag: closerTag || null,
      setter_tag: setterTag || null,
      mention_user_ids: [...mentions],
      revenue_cents: sale?.contractValueCents || null,
      collected_to_date_cents: history.collectedCents || null,
      closed_at: evidence?.closedAt ?? null,
      contract_url: evidence?.contractUrl ?? null,
      recording_url: evidence?.recordingUrl ?? null,
      occurred_at: validDate(input.occurredAt) ?? new Date().toISOString(),
    },
  );
}

/** "High Ticket" / "Low Ticket"…, from the offer the product names, else the
 *  lead's own ticket tier (leads.ticket_tier). */
async function tierFor(
  orgId: string,
  product: string | null,
  lead: { id: string | null } | null,
): Promise<string | null> {
  let key: string | null = null;
  if (product) {
    const { data } = await db
      .from("offers")
      .select("tier_key")
      .eq("org_id", orgId)
      .ilike("name", escapeLike(product))
      .limit(1)
      .maybeSingle();
    key = (data?.tier_key as string | undefined) ?? null;
  }
  if (!key && lead?.id) {
    const { data } = await db
      .from("leads")
      .select("ticket_tier")
      .eq("org_id", orgId)
      .eq("id", lead.id)
      .maybeSingle();
    key = (data?.ticket_tier as string | undefined) ?? null;
  }
  if (!key) return null;
  const { data: tier } = await db
    .from("offer_tiers")
    .select("label")
    .eq("org_id", orgId)
    .eq("key", key)
    .maybeSingle();
  return (tier?.label as string | undefined) ?? key;
}

/** The signed contract and call recording from the buyer's closed call.
 *  An uploaded contract is linked through a signed URL good for 30 days —
 *  long enough to answer any card-network deadline. */
async function closedCallEvidence(orgId: string, leadId: string | null, email: string | null) {
  if (!leadId && !email) return null;
  let q = db
    .from("calls")
    .select("id, closed, scheduled_for, created_at, recording_url, contract_url, contract_path")
    .eq("org_id", orgId)
    .order("closed", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  q = leadId ? q.eq("lead_id", leadId) : q.ilike("lead_email", escapeLike(email!));
  const { data } = await q.maybeSingle();
  if (!data) return null;
  let contractUrl = (data.contract_url as string | null) || null;
  if (!contractUrl && data.contract_path) {
    const { data: signed } = await db.storage
      .from("call-contracts")
      .createSignedUrl(data.contract_path, 60 * 60 * 24 * 30);
    contractUrl = signed?.signedUrl ?? null;
  }
  return {
    closedAt: data.closed ? ((data.scheduled_for ?? data.created_at) as string) : null,
    contractUrl,
    recordingUrl: (data.recording_url as string | null) || null,
  };
}

async function buyerHistory(orgId: string, email: string | null) {
  if (!email) return { collectedCents: 0 };
  const { data } = await db
    .from("payments")
    .select("amount_cents, status, raw")
    .eq("org_id", orgId)
    .in("status", ["paid", "partial", "refunded"])
    .ilike("raw->>email", escapeLike(email));
  const collectedCents = ((data ?? []) as Array<{ amount_cents: number; status: string }>)
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
  return { collectedCents };
}

function validDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
