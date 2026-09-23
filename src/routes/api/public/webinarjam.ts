import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** WebinarJam's own "Custom Webhook" feature (Settings → Integrations →
 * Custom Webhook, per WebinarJam's support docs) offers exactly two auth
 * options: a bearer token, or a custom header name/value pair — no HMAC
 * signature scheme like Stripe/Whop. This connector uses the bearer-token
 * option (the connector form tells the user to paste their chosen secret
 * into WebinarJam's Authorization field), checked with a constant-time
 * compare the same way every other secret check in this app works. */
function verifySecret(authHeader: string | null, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/webinarjam")({
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
          .eq("connector_id", "webinarjam")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[webinarjam] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown WebinarJam connection" }, { status: 404 });

        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        if (!verifySecret(request.headers.get("authorization"), secret)) {
          return Response.json({ error: "Invalid or missing bearer token" }, { status: 401 });
        }

        const body = await request.text();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let event: any;
        try {
          event = JSON.parse(body);
        } catch {
          return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
        }

        // WebinarJam's custom-webhook payload shape is NOT publicly
        // documented beyond "registration and attendance data" — their own
        // support article stops at auth setup, no field reference. Rather
        // than guess field names (this app's standing rule: never fabricate
        // a mapping), every delivery is captured verbatim here first. Once
        // one real webhook fires (a live registration/attendance event, or
        // WebinarJam's own "Test" send if the custom-webhook UI offers one),
        // inspect the row this creates and THEN wire the real
        // event_type/occurred_at/webinar_id extraction into a call to
        // public.record_webinar_event() — same "run once, inspect, adjust"
        // step already used for the Wistia workflow's field mapping
        // (n8n/README.md). record_webinar_event() also requires a real
        // public.webinars row to attach to (p_webinar_id is a hard FK) —
        // there is currently no UI to create one; that's a second
        // prerequisite, tracked in docs/ascendos-current-state.md, not
        // solved by this route alone.
        const { error: insertError } = await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "webinarjam",
          connection_id: connection.id,
          resource: typeof event.event === "string" ? event.event : "unknown",
          external_id: null,
          payload: event,
        });
        if (insertError) {
          console.error("[webinarjam] raw payload insert", insertError);
          return Response.json({ error: "Could not store payload" }, { status: 500 });
        }

        return Response.json({ ok: true, captured: true });
      },
    },
  },
});
