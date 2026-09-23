import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";
import { normalizePaymentToUsd } from "@/lib/fx.server";

/** Whop's Standard Webhooks-style scheme (docs.whop.com/developer/guides/
 * webhooks): HMAC-SHA256 of `${webhook-id}.${webhook-timestamp}.${rawBody}`,
 * base64-encoded, sent as `v1,<sig>` in the webhook-signature header. The
 * ws_ secret is used exactly as Whop provides it — not stripped, not
 * base64-decoded (Whop's own docs are explicit on this point, unlike the
 * general Standard Webhooks spec other providers follow). */
function verifyWhopSignature(
  body: string,
  secret: string,
  webhookId: string | null,
  webhookTimestamp: string | null,
  signatureHeader: string | null,
): boolean {
  if (!webhookId || !webhookTimestamp || !signatureHeader) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(webhookTimestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const signatures = signatureHeader
    .split(" ")
    .map((part) => part.split(",")[1])
    .filter((v): v is string => !!v);
  if (signatures.length === 0) return false;

  const expected = createHmac("sha256", secret)
    .update(`${webhookId}.${webhookTimestamp}.${body}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((sig) => {
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
  });
}

const HANDLED_TYPES = new Set(["payment.succeeded", "payment.failed"]);

export const Route = createFileRoute("/api/public/whop")({
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
          .eq("connector_id", "whop")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[whop] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Whop connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        const verified = verifyWhopSignature(
          body,
          secret,
          request.headers.get("webhook-id"),
          request.headers.get("webhook-timestamp"),
          request.headers.get("webhook-signature"),
        );
        if (!verified) return Response.json({ error: "Invalid Whop signature" }, { status: 401 });

        const event = JSON.parse(body);

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "whop",
          connection_id: connection.id,
          resource: event.type ?? "unknown",
          external_id: event.data?.id ?? event.id ?? null,
          payload: event,
          processed_at: new Date().toISOString(),
        });

        if (!HANDLED_TYPES.has(event.type)) {
          return Response.json({ ok: true, skipped: event.type });
        }

        const payment = event.data ?? {};
        const paymentId = payment.id as string | undefined;
        if (!paymentId) return Response.json({ error: "Missing payment id" }, { status: 400 });

        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("external_id", paymentId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        // Whop reports money as a decimal (e.g. 6.9), not cents — every
        // other field in this app's payments table is cents, so this is the
        // one real unit conversion this connector has to do.
        // settlement_amount is what the customer was actually charged
        // (gross, matching how Stripe's charge.amount is used elsewhere in
        // this app); amount_after_fees is Whop's own cut deducted, a
        // different, smaller number — not what "cash collected" means here.
        const grossAmount = payment.settlement_amount ?? payment.amount_after_fees ?? 0;
        const originalAmountCents = Math.round(Number(grossAmount) * 100);
        const originalCurrency = String(
          payment.currency ?? payment.settlement_currency ?? "usd",
        ).toUpperCase();
        const email: string | null = payment.user?.email ?? null;

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
        const collectedAt = payment.paid_at ?? payment.created_at ?? new Date().toISOString();
        // Remediation (currency-mixing audit): amount_cents/currency must
        // always be canonical USD — Whop supports non-USD settlement
        // currencies per-product, not only USD.
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
            source_connector: "whop",
            external_id: paymentId,
            processor: "whop",
            failure_reason: succeeded ? null : (payment.substatus ?? "Unknown failure"),
            raw: { email, member_id: payment.member?.id ?? null, event_type: event.type },
            original_amount_cents: originalAmountCents,
            original_currency: originalCurrency,
            fx_rate: normalized.fxRate,
            fx_rate_date: normalized.fxRateDate,
            fx_source: normalized.fxSource,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[whop] payment insert", insertError);
          return Response.json({ error: "Could not save payment" }, { status: 500 });
        }

        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: succeeded ? "payment.collected" : "payment.failed",
          subject_type: "payment",
          subject_id: inserted?.id ?? null,
          payload: {
            amount_cents: originalAmountCents,
            currency: originalCurrency,
            email,
            source: "whop",
          },
        });

        if (succeeded) {
          await dispatchEvent(connection.org_id, "payment.collected", {
            amount_cents: originalAmountCents,
            currency: originalCurrency,
            email,
            source: "whop",
            client_id: clientId,
          });
        }

        return Response.json({ ok: true, payment_id: inserted?.id, matched_client: !!clientId });
      },
    },
  },
});
