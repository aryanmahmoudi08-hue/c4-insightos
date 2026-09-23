import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";
import { normalizePaymentToUsd } from "@/lib/fx.server";

/** Stripe's own signature scheme (https://stripe.com/docs/webhooks#verify-manually) —
 * no Stripe SDK dependency, matching this app's existing pattern of verifying
 * webhooks with plain `crypto` (see typeform.ts, twilio-signature.ts). The
 * header carries a timestamp plus one or more v1 signatures (multiple during
 * secret rotation); any matching v1 within a 5-minute tolerance is valid. */
function verifyStripeSignature(body: string, secret: string, header: string | null): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    }),
  );
  const timestamp = parts.t;
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

/** Charges only, deliberately — charge.succeeded/charge.failed fire for a
 * real payment regardless of whether it originated from Checkout, a
 * PaymentIntent, or an Invoice, so this one pair covers every real Stripe
 * setup without guessing which higher-level flow a given workspace uses. */
const HANDLED_TYPES = new Set(["charge.succeeded", "charge.failed"]);

export const Route = createFileRoute("/api/public/stripe")({
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
          .eq("connector_id", "stripe")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[stripe] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Stripe connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        if (!verifyStripeSignature(body, secret, request.headers.get("stripe-signature"))) {
          return Response.json({ error: "Invalid Stripe signature" }, { status: 401 });
        }

        const event = JSON.parse(body);

        // Always recorded, even for event types we don't act on — the same
        // audit trail every other real integration in this app keeps.
        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "stripe",
          connection_id: connection.id,
          resource: event.type ?? "unknown",
          external_id: event.id ?? null,
          payload: event,
          processed_at: new Date().toISOString(),
        });

        if (!HANDLED_TYPES.has(event.type)) {
          return Response.json({ ok: true, skipped: event.type });
        }

        const charge = event.data?.object ?? {};
        const chargeId = charge.id as string | undefined;
        if (!chargeId) return Response.json({ error: "Missing charge id" }, { status: 400 });

        // Stripe retries webhook delivery on any non-2xx/timeout — a charge
        // this app has already recorded must never be inserted twice.
        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("external_id", chargeId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        const email: string | null = charge.billing_details?.email || charge.receipt_email || null;

        // Never invented: a real client match by email, or left unmatched
        // for a human to reconcile — this app doesn't create a client record
        // from a payment webhook alone.
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

        const succeeded = event.type === "charge.succeeded";
        const originalCurrency = (charge.currency ?? "usd").toUpperCase();
        const originalAmountCents = charge.amount ?? 0;
        const collectedAt = new Date((charge.created ?? Date.now() / 1000) * 1000).toISOString();
        // Remediation (currency-mixing audit): amount_cents/currency must
        // always be canonical USD (see 20260907100000_currency_fx_foundation.sql's
        // own comment) — Stripe can settle a charge in any currency the
        // connected account accepts, not only USD, so this can't be assumed
        // identity. original_amount_cents/original_currency keep the real,
        // unconverted figures as provenance.
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
            source_connector: "stripe",
            external_id: chargeId,
            processor: "stripe",
            failure_reason: succeeded ? null : (charge.failure_message ?? "Unknown failure"),
            raw: { email, customer: charge.customer ?? null, event_type: event.type },
            original_amount_cents: originalAmountCents,
            original_currency: originalCurrency,
            fx_rate: normalized.fxRate,
            fx_rate_date: normalized.fxRateDate,
            fx_source: normalized.fxSource,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[stripe] payment insert", insertError);
          return Response.json({ error: "Could not save payment" }, { status: 500 });
        }

        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: succeeded ? "payment.collected" : "payment.failed",
          subject_type: "payment",
          subject_id: inserted?.id ?? null,
          payload: {
            amount_cents: charge.amount,
            currency: charge.currency,
            email,
            source: "stripe",
          },
        });

        if (succeeded) {
          await dispatchEvent(connection.org_id, "payment.collected", {
            amount_cents: charge.amount,
            currency: charge.currency,
            email,
            source: "stripe",
            client_id: clientId,
          });
        }

        return Response.json({ ok: true, payment_id: inserted?.id, matched_client: !!clientId });
      },
    },
  },
});
