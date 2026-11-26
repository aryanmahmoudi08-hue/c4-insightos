import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { announcePayment } from "@/lib/payment-events.server";
import { normalizePaymentToUsd } from "@/lib/fx.server";

/** PayPal doesn't sign webhooks with a shared secret you can check locally —
 * it requires calling PayPal's own verify-webhook-signature API with the
 * five PAYPAL-* headers plus your stored webhook_id, using an OAuth token
 * obtained from your REST app's client_id/secret. This is the one processor
 * here where "verification" is a live outbound call, not local crypto. */
async function getPayPalAccessToken(clientId: string, clientSecret: string, base: string) {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth token request failed [${res.status}]`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function verifyPayPalSignature(
  request: Request,
  rawBody: string,
  config: { clientId: string; clientSecret: string; webhookId: string; env: string },
): Promise<boolean> {
  const base =
    config.env === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const accessToken = await getPayPalAccessToken(config.clientId, config.clientSecret, base);

  const verifyBody = {
    auth_algo: request.headers.get("paypal-auth-algo"),
    cert_url: request.headers.get("paypal-cert-url"),
    transmission_id: request.headers.get("paypal-transmission-id"),
    transmission_sig: request.headers.get("paypal-transmission-sig"),
    transmission_time: request.headers.get("paypal-transmission-time"),
    webhook_id: config.webhookId,
    webhook_event: JSON.parse(rawBody),
  };
  if (
    !verifyBody.auth_algo ||
    !verifyBody.cert_url ||
    !verifyBody.transmission_id ||
    !verifyBody.transmission_sig ||
    !verifyBody.transmission_time
  ) {
    return false;
  }

  const res = await fetch(`${base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(verifyBody),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

const HANDLED_TYPES = new Set(["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED"]);

export const Route = createFileRoute("/api/public/paypal")({
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
          .eq("connector_id", "paypal")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[paypal] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown PayPal connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, string>;

        let verified = false;
        try {
          verified = await verifyPayPalSignature(request, body, {
            clientId: config.clientId ?? "",
            clientSecret: config.clientSecret ?? "",
            webhookId: config.webhookId ?? "",
            env: config.env ?? "live",
          });
        } catch (err) {
          console.error("[paypal] verification call failed", err);
        }
        if (!verified) return Response.json({ error: "Invalid PayPal signature" }, { status: 401 });

        const event = JSON.parse(body);

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "paypal",
          connection_id: connection.id,
          resource: event.event_type ?? "unknown",
          external_id: event.resource?.id ?? event.id ?? null,
          payload: event,
          processed_at: new Date().toISOString(),
        });

        // Refunds and disputes → #refunds-disputes. PayPal money is
        // { value: "12.34", currency_code } in whole units.
        const et = String(event.event_type ?? "");
        if (
          et === "PAYMENT.CAPTURE.REFUNDED" ||
          et === "PAYMENT.CAPTURE.REVERSED" ||
          et.startsWith("CUSTOMER.DISPUTE.")
        ) {
          const res = event.resource ?? {};
          const isDispute = et.startsWith("CUSTOMER.DISPUTE.");
          // A refund links back to its capture with rel "up".
          const upHref: string | undefined = (res.links ?? []).find(
            (l: { rel?: string }) => l.rel === "up",
          )?.href;
          const money = isDispute ? res.dispute_amount : res.amount;
          const txn = res.disputed_transactions?.[0] ?? {};
          const { recordRefundOrDispute } = await import("@/lib/refund-dispute-events.server");
          const r = await recordRefundOrDispute(connection.org_id, {
            kind: isDispute ? "dispute" : "refund",
            processor: "paypal",
            externalId: String(res.dispute_id ?? res.id ?? event.id),
            paymentExternalId: isDispute
              ? (txn.seller_transaction_id ?? null)
              : (upHref?.split("/").pop() ?? null),
            status: isDispute
              ? (res.dispute_outcome?.outcome_code ?? res.status ?? null)
              : (res.status ?? "COMPLETED"),
            reason: res.reason ?? (et === "PAYMENT.CAPTURE.REVERSED" ? "reversed by PayPal" : null),
            amount: money?.value != null ? Number(money.value) : null,
            currency: money?.currency_code ?? null,
            evidenceDueAt: res.seller_response_due_date ?? null,
            email: txn.buyer?.email ?? res.payer?.email_address ?? null,
            name: txn.buyer?.name ?? null,
            occurredAt: res.create_time ?? event.create_time ?? null,
            raw: { event_type: et, resource: res },
          });
          return Response.json({ ok: true, dispute_id: r.id, announced: r.announced });
        }

        if (!HANDLED_TYPES.has(event.event_type)) {
          return Response.json({ ok: true, skipped: event.event_type });
        }

        const resource = event.resource ?? {};
        const captureId = resource.id as string | undefined;
        if (!captureId) return Response.json({ error: "Missing capture id" }, { status: 400 });

        const { data: existing } = await supabaseAdmin
          .from("payments")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("external_id", captureId)
          .maybeSingle();
        if (existing) return Response.json({ ok: true, duplicate: true });

        // PayPal reports amount.value as a decimal string (e.g. "50.00").
        const originalAmountCents = Math.round(Number(resource.amount?.value ?? 0) * 100);
        const originalCurrency = String(resource.amount?.currency_code ?? "usd").toUpperCase();
        // Payer email lives one level up on the order, not always on the
        // capture resource itself — present here only when PayPal includes
        // it, never fetched via a second call this endpoint doesn't make.
        const email: string | null = resource.payer?.email_address ?? null;

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

        const succeeded = event.event_type === "PAYMENT.CAPTURE.COMPLETED";
        const collectedAt = resource.create_time ?? new Date().toISOString();
        // Remediation (currency-mixing audit): amount_cents/currency must
        // always be canonical USD — PayPal reports whatever currency the
        // buyer paid in, not only USD.
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
            source_connector: "paypal",
            external_id: captureId,
            processor: "paypal",
            failure_reason: succeeded
              ? null
              : (resource.status_details?.reason ?? "Unknown failure"),
            raw: { email, event_type: event.event_type },
            original_amount_cents: originalAmountCents,
            original_currency: originalCurrency,
            fx_rate: normalized.fxRate,
            fx_rate_date: normalized.fxRateDate,
            fx_source: normalized.fxSource,
          })
          .select("id")
          .maybeSingle();
        if (insertError) {
          console.error("[paypal] payment insert", insertError);
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
