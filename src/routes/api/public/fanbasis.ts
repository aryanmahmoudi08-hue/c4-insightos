import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { announcePayment } from "@/lib/payment-events.server";
import { normalizePaymentToUsd } from "@/lib/fx.server";

/** Fanbasis (rebranded externally as "Commas" — same processor, same API):
 * HMAC-SHA256 of the raw request body, hex-encoded, sent in the
 * x-webhook-signature header. No timestamp header, so no replay-window
 * check is possible at the signature layer — the external_id idempotency
 * check below is this endpoint's only defense against a resent event. */
function verifyFanbasisSignature(body: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
}

const HANDLED_TYPES = new Set(["payment.succeeded", "payment.failed"]);

export const Route = createFileRoute("/api/public/fanbasis")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const connectionId = url.searchParams.get("connection_id");
        if (!connectionId)
          return Response.json({ error: "Missing connection_id" }, { status: 400 });

        const { data: connection, error: connectionError } = await supabaseAdmin
          .from("connector_connections")
          .select("id, org_id, config")
          .eq("id", connectionId)
          .eq("connector_id", "fanbasis")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[fanbasis] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Fanbasis/Commas connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        if (!verifyFanbasisSignature(body, secret, request.headers.get("x-webhook-signature"))) {
          return Response.json({ error: "Invalid Fanbasis/Commas signature" }, { status: 401 });
        }

        const event = JSON.parse(body);

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "fanbasis",
          connection_id: connection.id,
          resource: event.type ?? "unknown",
          external_id: event.data?.payment_id ?? null,
          payload: event,
          processed_at: new Date().toISOString(),
        });

        // Refunds and chargebacks → #refunds-disputes. Commas' webhook docs
        // aren't public, so this matches any event type that names a refund,
        // dispute or chargeback and reads the same fields its payment events
        // use (decimal amount, buyer.*). Check raw_payloads after the first
        // real one and tighten if a field is named differently.
        if (/refund|dispute|chargeback/i.test(String(event.type ?? ""))) {
          const d = event.data ?? {};
          const isRefund = /refund/i.test(String(event.type));
          const id = d.refund_id ?? d.dispute_id ?? d.chargeback_id ?? d.id ?? d.payment_id;
          if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
          const { recordRefundOrDispute } = await import("@/lib/refund-dispute-events.server");
          const r = await recordRefundOrDispute(connection.org_id, {
            kind: isRefund ? "refund" : "dispute",
            processor: "fanbasis",
            externalId: `${event.type}:${id}`,
            paymentExternalId: d.payment_id ?? null,
            status: d.status ?? null,
            reason: d.reason ?? d.refund_reason ?? d.dispute_reason ?? null,
            amount: d.amount != null ? Number(d.amount) : null,
            currency: d.currency ?? null,
            evidenceDueAt: d.evidence_due_at ?? d.due_by ?? null,
            email: d.buyer?.email ?? d.email ?? null,
            name: d.buyer?.name ?? null,
            phone: d.buyer?.phone ?? null,
            product: d.product?.name ?? d.product_name ?? null,
            occurredAt: d.created_at ?? null,
            raw: { event_type: event.type, data: d },
          });
          return Response.json({ ok: true, dispute_id: r.id, announced: r.announced });
        }

        if (!HANDLED_TYPES.has(event.type)) {
          return Response.json({ ok: true, skipped: event.type });
        }

        const payment = event.data ?? {};
        const paymentId = payment.payment_id as string | undefined;
        if (!paymentId) return Response.json({ error: "Missing payment id" }, { status: 400 });

        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("external_id", paymentId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        // Commas reports money as a decimal (e.g. 29.00), not cents.
        const originalAmountCents = Math.round(Number(payment.amount ?? 0) * 100);
        const originalCurrency = String(payment.currency ?? "usd").toUpperCase();
        const email: string | null = payment.buyer?.email ?? null;

        let clientId: string | null = null;
        if (email) {
          const { data: client } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("org_id", connection.org_id)
            .ilike("email", email)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          clientId = client?.id ?? null;
        }

        const succeeded = event.type === "payment.succeeded";
        const collectedAt = new Date().toISOString();
        // Remediation (currency-mixing audit): amount_cents/currency must
        // always be canonical USD — Fanbasis/Commas reports whatever
        // currency the buyer paid in, not only USD.
        const normalized = await normalizePaymentToUsd(
          originalAmountCents,
          originalCurrency,
          collectedAt,
        );
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("payments")
          .insert({
            org_id: connection.org_id,
            client_id: clientId,
            amount_cents: normalized.amountCents,
            currency: normalized.currency,
            status: succeeded ? "paid" : "failed",
            collected_at: collectedAt,
            source_connector: "fanbasis",
            external_id: paymentId,
            processor: "fanbasis",
            failure_reason: succeeded ? null : "Payment failed",
            raw: { email, event_type: event.type },
            original_amount_cents: originalAmountCents,
            original_currency: originalCurrency,
            fx_rate: normalized.fxRate,
            fx_rate_date: normalized.fxRateDate,
            fx_source: normalized.fxSource,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[fanbasis] payment insert", insertError);
          return Response.json({ error: "Could not save payment" }, { status: 500 });
        }

        // Collected or failed, announced the same way for every processor —
        // failures used to be logged but never dispatched, so no channel
        // could subscribe to them. See payment-events.server.ts.
        await announcePayment(connection.org_id, inserted?.id);

        return Response.json({ ok: true, payment_id: inserted?.id, matched_client: !!clientId });
      },
    },
  },
});
