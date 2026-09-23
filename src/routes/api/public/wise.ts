import { createFileRoute } from "@tanstack/react-router";
import { createVerify, constants } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";
import { normalizePaymentToUsd } from "@/lib/fx.server";

/** Wise signs webhooks with RSA-SHA256 (PKCS1 padding) against a KEY PAIR —
 * not a shared HMAC secret like every other processor here. Verification is
 * against Wise's own PUBLIC key (published in their developer docs), which
 * the user pastes in at connect time rather than this app hardcoding a
 * value that could silently go stale if Wise ever rotates it. Signature
 * arrives base64-encoded in the X-Signature-SHA256 header, over the raw
 * body. */
function verifyWiseSignature(
  body: string,
  publicKeyPem: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(body);
    verifier.end();
    return verifier.verify(
      { key: publicKeyPem, padding: constants.RSA_PKCS1_PADDING },
      signature,
      "base64",
    );
  } catch (err) {
    console.error("[wise] signature verify threw", err);
    return false;
  }
}

export const Route = createFileRoute("/api/public/wise")({
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
          .eq("connector_id", "wise")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[wise] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Wise connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const publicKey = typeof config.publicKey === "string" ? config.publicKey : "";
        if (!verifyWiseSignature(body, publicKey, request.headers.get("x-signature-sha256"))) {
          return Response.json({ error: "Invalid Wise signature" }, { status: 401 });
        }

        const event = JSON.parse(body);

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "wise",
          connection_id: connection.id,
          resource: event.event_type ?? "unknown",
          external_id: event.data?.resource?.id != null ? String(event.data.resource.id) : null,
          payload: event,
          processed_at: new Date().toISOString(),
        });

        // Only balances#update credits represent real money actually
        // landing in the business's account — transfers#state-change and
        // the other event types Wise sends only carry a thin resource
        // reference (id/type/profile_id), not an amount, so there's nothing
        // honest to record as a payment from those without a second,
        // separately-authenticated API call this endpoint doesn't make.
        if (event.event_type !== "balances#update" || event.data?.transaction_type !== "credit") {
          return Response.json({ ok: true, skipped: event.event_type });
        }

        const creditData = event.data;
        // Wise reports amount as a decimal (e.g. 70), not cents.
        const originalAmountCents = Math.round(Number(creditData.amount ?? 0) * 100);
        const originalCurrency = String(creditData.currency ?? "usd").toUpperCase();
        // No payer email is present on this event — Wise's balance-credit
        // notification only carries a transfer reference, not buyer
        // identity, so this payment is always left for manual client
        // matching. Never guessed from the reference string.
        const externalId =
          creditData.transfer_reference ||
          `wise-${creditData.balance_id}-${creditData.occurred_at}-${creditData.amount}`;

        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("external_id", externalId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        const collectedAt = creditData.occurred_at ?? new Date().toISOString();
        // Remediation (currency-mixing audit): amount_cents/currency must
        // always be canonical USD — Wise's whole purpose is international
        // transfers, so a non-USD balance credit here is the norm, not an
        // edge case.
        const normalized = await normalizePaymentToUsd(
          originalAmountCents,
          originalCurrency,
          collectedAt,
        );
        const { data: inserted, error: insertError } = await supabaseAdmin
          .from("payments")
          .insert({
            org_id: connection.org_id,
            client_id: null,
            amount_cents: normalized.amountCents,
            currency: normalized.currency,
            status: "paid",
            collected_at: collectedAt,
            source_connector: "wise",
            external_id: externalId,
            processor: "wise",
            raw: {
              balance_id: creditData.balance_id,
              channel_name: creditData.channel_name,
              transfer_reference: creditData.transfer_reference ?? null,
              needs_manual_client_match: true,
            },
            original_amount_cents: originalAmountCents,
            original_currency: originalCurrency,
            fx_rate: normalized.fxRate,
            fx_rate_date: normalized.fxRateDate,
            fx_source: normalized.fxSource,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[wise] payment insert", insertError);
          return Response.json({ error: "Could not save payment" }, { status: 500 });
        }

        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: "payment.collected",
          subject_type: "payment",
          subject_id: inserted?.id ?? null,
          payload: {
            amount_cents: originalAmountCents,
            currency: originalCurrency,
            source: "wise",
            needs_manual_client_match: true,
          },
        });

        await dispatchEvent(connection.org_id, "payment.collected", {
          amount_cents: originalAmountCents,
          currency: originalCurrency,
          source: "wise",
          client_id: null,
        });

        return Response.json({ ok: true, payment_id: inserted?.id, matched_client: false });
      },
    },
  },
});
