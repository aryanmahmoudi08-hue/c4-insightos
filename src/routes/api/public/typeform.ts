import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function answerValue(answer: any) {
  if (answer == null || typeof answer !== "object") return "";
  if (typeof answer.text === "string") return answer.text;
  if (typeof answer.email === "string") return answer.email;
  if (typeof answer.phone_number === "string") return answer.phone_number;
  if (typeof answer.url === "string") return answer.url;
  if (typeof answer.number === "number") return String(answer.number);
  if (typeof answer.boolean === "boolean") return String(answer.boolean);
  if (answer.choice?.label) return String(answer.choice.label);
  if (Array.isArray(answer.choices?.labels)) return answer.choices.labels.join(", ");
  if (answer.date) return String(answer.date);
  return JSON.stringify(answer);
}

function verifyTypeformSignature(body: string, secret: string, signature: string | null) {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("base64")}`;
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/typeform")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const connectionId = url.searchParams.get("connection_id");
        if (!connectionId) return Response.json({ error: "Missing connection_id" }, { status: 400 });

        const { data: connection, error: connectionError } = await supabaseAdmin
          .from("connector_connections")
          .select("id, org_id, connector_id, config")
          .eq("id", connectionId)
          .eq("connector_id", "typeform")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) return Response.json({ error: connectionError.message }, { status: 500 });
        if (!connection) return Response.json({ error: "Unknown Typeform connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        if (!verifyTypeformSignature(body, secret, request.headers.get("typeform-signature"))) {
          return Response.json({ error: "Invalid Typeform signature" }, { status: 401 });
        }

        const payload = JSON.parse(body);
        const formResponse = payload.form_response ?? {};
        const answers: Record<string, string> = {};
        for (const answer of formResponse.answers ?? []) {
          const key = answer.field?.ref || answer.field?.id || answer.field?.title;
          if (key) answers[String(key)] = answerValue(answer);
        }

        const { data: intake, error: intakeError } = await supabaseAdmin
          .from("onboarding_responses")
          .insert({ org_id: connection.org_id, responses: answers, submitted_at: new Date().toISOString() })
          .select("id")
          .maybeSingle();
        if (intakeError) return Response.json({ error: intakeError.message }, { status: 500 });

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "typeform",
          connection_id: connection.id,
          resource: "form_response",
          external_id: formResponse.token ?? formResponse.response_id ?? null,
          payload,
          processed_at: new Date().toISOString(),
        });
        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: "onboarding.submitted",
          subject_type: "onboarding_response",
          subject_id: intake?.id ?? null,
          payload: { answers, source: "typeform" },
        });

        return Response.json({ ok: true });
      },
    },
  },
});
