import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Close signs webhooks with an HMAC whose key is the hex `signature_key`
 * returned when the subscription is created — hex-DECODED to bytes first, per
 * Close's own reference implementation (`bytearray.fromhex(key)`). The signed
 * string is the `close-sig-timestamp` header followed by the raw body, in that
 * order, and the digest is hex. Getting any of those three details wrong fails
 * open-looking (every delivery just rejects), so they're spelled out here.
 * https://developer.close.com/topics/webhooks/ */
function verifyCloseSignature(
  rawBody: string,
  hexKey: string,
  timestamp: string | null,
  sigHash: string | null,
): boolean {
  if (!timestamp || !sigHash || !hexKey) return false;
  if (!/^[0-9a-fA-F]+$/.test(hexKey) || hexKey.length % 2 !== 0) return false;
  const expected = createHmac("sha256", Buffer.from(hexKey, "hex"))
    .update(`${timestamp}${rawBody}`, "utf8")
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sigHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

type CloseContact = {
  emails?: Array<{ email?: string }>;
  phones?: Array<{ phone?: string }>;
};

/** Close's Lead shape, narrowed to the fields this mirror actually reads.
 * Names are Close's own (developer.close.com/api/resources/leads). */
type CloseLead = {
  id?: string;
  name?: string;
  display_name?: string;
  status_label?: string;
  contacts?: CloseContact[];
};

function firstEmail(lead: CloseLead): string | null {
  for (const c of lead.contacts ?? []) {
    for (const e of c.emails ?? []) if (e.email) return e.email;
  }
  return null;
}

function firstPhone(lead: CloseLead): string | null {
  for (const c of lead.contacts ?? []) {
    for (const p of c.phones ?? []) if (p.phone) return p.phone;
  }
  return null;
}

export const Route = createFileRoute("/api/public/close")({
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
          .eq("connector_id", "close")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[close] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Close connection" }, { status: 404 });

        const rawBody = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const signatureKey = typeof config.signatureKey === "string" ? config.signatureKey : "";
        if (
          !verifyCloseSignature(
            rawBody,
            signatureKey,
            request.headers.get("close-sig-timestamp"),
            request.headers.get("close-sig-hash"),
          )
        ) {
          return Response.json({ error: "Invalid Close signature" }, { status: 401 });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
        }

        const event = body?.event ?? {};
        const objectType: string = event.object_type ?? "unknown";
        const action: string = event.action ?? "unknown";

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "close",
          connection_id: connection.id,
          resource: `${objectType}.${action}`,
          external_id: event.object_id ?? null,
          payload: body,
        });

        // Leads are the only object this mirror maps today. Opportunities,
        // activities and tasks are captured raw above so nothing is lost, but
        // Close's Opportunity has no clean counterpart in this schema (see
        // docs/ascendos-current-state.md) — mapping one would be a guess.
        if (objectType !== "lead") {
          return Response.json({ ok: true, captured: true, mapped: false });
        }

        // Deliberately not handling "deleted" as a delete. Leads here are
        // referenced by calls, payments and attribution rows; removing one on
        // a webhook would silently destroy AscendOS-side history that Close
        // never owned. The deletion is captured in raw_payloads for review.
        if (action === "deleted") {
          return Response.json({ ok: true, captured: true, mapped: false, reason: "delete" });
        }

        const lead: CloseLead = event.data ?? {};
        const closeId: string | undefined = lead.id ?? event.object_id;
        if (!closeId) return Response.json({ error: "Missing Close lead id" }, { status: 400 });

        const mirrored = {
          org_id: connection.org_id,
          source_connector: "close",
          external_id: closeId,
          full_name: lead.display_name || lead.name || null,
          email: firstEmail(lead),
          phone: firstPhone(lead),
        };

        // Status is deliberately NOT mirrored. Close's status_label is
        // org-configured free text, while public.leads.status is a fixed enum
        // that the entire funnel (show rate, close rate, attribution) is
        // computed from. There is no defensible automatic mapping between
        // them, and guessing would quietly corrupt every downstream metric —
        // so a mirrored lead keeps the column's own default on insert and is
        // never restatused on update. The real label stays visible in
        // raw_payloads until a mapping is configured.
        const { error: upsertError } = await supabaseAdmin
          .from("leads")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(mirrored as any, { onConflict: "org_id,source_connector,external_id" });
        if (upsertError) {
          console.error("[close] lead upsert", upsertError);
          return Response.json({ error: "Could not mirror lead" }, { status: 500 });
        }

        return Response.json({ ok: true, mapped: true, close_lead_id: closeId });
      },
    },
  },
});
