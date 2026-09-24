import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calendlyBookingToCallRow,
  calendlySignedPayload,
  classifyCalendlyChange,
  isCalendlyTimestampFresh,
  parseCalendlySignatureHeader,
  type CalendlyScheduledEvent,
  type CalendlyWebhookBody,
} from "@/lib/calendly";

// calls.rescheduled_from_external_id is new and not in the generated Supabase
// type snapshot yet — same cast the other new tables need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

function verify(rawBody: string, signingKey: string, header: string | null): boolean {
  const parsed = parseCalendlySignatureHeader(header);
  if (!parsed || !signingKey) return false;
  if (!isCalendlyTimestampFresh(parsed.timestamp)) return false;
  const expected = createHmac("sha256", signingKey)
    .update(calendlySignedPayload(parsed.timestamp, rawBody))
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The invitee payload carries only a URI for its scheduled event, so the
 * start time needs a second read against Calendly's API. Returns null rather
 * than throwing: a booking with an unknown time is still worth recording, and
 * the row stores scheduled_for null instead of a guess. */
async function fetchScheduledEvent(
  eventUri: string,
  apiToken: string,
): Promise<CalendlyScheduledEvent | null> {
  if (!eventUri || !apiToken) return null;
  try {
    const response = await fetch(eventUri, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!response.ok) {
      console.error("[calendly] scheduled event fetch", response.status);
      return null;
    }
    const body = (await response.json()) as { resource?: CalendlyScheduledEvent };
    return body.resource ?? null;
  } catch (e) {
    console.error("[calendly] scheduled event fetch failed", e);
    return null;
  }
}

export const Route = createFileRoute("/api/public/calendly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const connectionId = url.searchParams.get("connection_id");
        if (!connectionId)
          return Response.json({ error: "Missing connection_id" }, { status: 400 });

        const { data: connection, error: connectionError } = await admin
          .from("connector_connections")
          .select("id, org_id, config")
          .eq("id", connectionId)
          .eq("connector_id", "calendly")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[calendly] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Calendly connection" }, { status: 404 });

        // Raw body, never re-serialized — Calendly signs the exact bytes.
        const rawBody = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const signingKey = typeof config.signingKey === "string" ? config.signingKey : "";
        const apiToken = typeof config.apiToken === "string" ? config.apiToken : "";

        if (!verify(rawBody, signingKey, request.headers.get("calendly-webhook-signature"))) {
          return Response.json({ error: "Invalid Calendly signature" }, { status: 401 });
        }

        let body: CalendlyWebhookBody;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
        }

        const eventType = body.event ?? "";
        const invitee = body.payload ?? {};

        await admin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "calendly",
          connection_id: connection.id,
          resource: eventType || "unknown",
          external_id: invitee.uri ?? null,
          payload: body,
        });

        const change = classifyCalendlyChange(eventType, invitee);
        if (!change) return Response.json({ ok: true, captured: true, mapped: false });
        if (!invitee.uri) return Response.json({ error: "Missing invitee uri" }, { status: 400 });

        if (change.kind === "booked") {
          const scheduledEvent = await fetchScheduledEvent(invitee.event ?? "", apiToken);
          const row = calendlyBookingToCallRow({
            orgId: connection.org_id,
            invitee,
            scheduledEvent,
            rescheduledFrom: change.rescheduledFrom,
          });
          const { error } = await admin
            .from("calls")
            .upsert(row, { onConflict: "org_id,source_connector,external_id" });
          if (error) {
            console.error("[calendly] booking upsert", error);
            return Response.json({ error: "Could not record booking" }, { status: 500 });
          }
          return Response.json({ ok: true, mapped: true, action: "booked" });
        }

        // Both remaining cases close out the existing booking. They're
        // distinguished so a reschedule reads as a move on the calendar rather
        // than a lost booking with an unexplained new one beside it.
        const { data: existing, error: findError } = await admin
          .from("calls")
          .select("id")
          .eq("org_id", connection.org_id)
          .eq("source_connector", "calendly")
          .eq("external_id", invitee.uri)
          .maybeSingle();
        if (findError) {
          console.error("[calendly] cancel lookup", findError);
          return Response.json({ error: "Could not record cancellation" }, { status: 500 });
        }
        // A cancellation for a booking that was never synced (created before
        // this connector existed) isn't an error — it's captured in
        // raw_payloads and there's simply nothing here to close.
        if (!existing?.id) {
          return Response.json({ ok: true, mapped: false, reason: "no matching booking" });
        }

        const { error: cancelError } = await admin
          .from("calls")
          .update({ cancelled: true })
          .eq("id", existing.id);
        if (cancelError) {
          console.error("[calendly] cancel update", cancelError);
          return Response.json({ error: "Could not record cancellation" }, { status: 500 });
        }

        // The calendar colours blocks off call_confirmations.overall_status,
        // which already has distinct 'cancelled' and 'rescheduled' values —
        // that's where the distinction has to land to be visible. cancelled_reason
        // lives on this table too, not on `calls`.
        const { error: confirmError } = await admin.from("call_confirmations").upsert(
          {
            call_id: existing.id,
            org_id: connection.org_id,
            overall_status: change.kind === "superseded" ? "rescheduled" : "cancelled",
            cancelled_reason:
              change.kind === "superseded" ? "Rescheduled by invitee via Calendly" : null,
          },
          { onConflict: "call_id" },
        );
        if (confirmError) {
          // The booking is already marked cancelled above; failing to record
          // the nuance shouldn't 500 a webhook Calendly will then retry.
          console.error("[calendly] confirmation status", confirmError);
        }
        return Response.json({ ok: true, mapped: true, action: change.kind });
      },
    },
  },
});
