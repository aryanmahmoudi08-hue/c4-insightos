import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";

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
        if (connectionError) { console.error("[typeform] connection lookup", connectionError); return Response.json({ error: "Lookup failed" }, { status: 500 }); }
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

        const pick = (...keys: string[]) => { for (const k of keys) { if (answers[k]) return answers[k]; } return ""; };
        const application_data = {
          experience: pick("experience"),
          work_school: pick("work_school", "work", "school"),
          focus: pick("focus"),
          goal: pick("goal"),
          candidate_fit: pick("candidate_fit", "fit"),
          serious_status: pick("serious_status", "serious"),
          time: pick("time"),
          income: pick("income"),
          capital: pick("capital"),
          credit: pick("credit"),
          commitment: pick("commitment"),
        };
        const full_name = [pick("first_name"), pick("last_name")].filter(Boolean).join(" ").trim() || pick("name", "full_name") || null;
        const email = pick("email") || null;
        const phone = pick("phone") || null;
        const handle = pick("handle", "instagram", "ig") || null;
        const isApplication = Object.values(application_data).some(Boolean) || (connection.config as any)?.kind === "application";

        let leadId: string | null = null;
        let intakeId: string | null = null;
        if (isApplication) {
          const { data: lead, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              org_id: connection.org_id,
              full_name, email, phone, handle,
              status: "dm_received" as any,
              source_connector: "typeform",
              application_data,
              qualification_notes: pick("candidate_fit"),
            } as any)
            .select("id")
            .maybeSingle();
          if (leadErr) { console.error("[typeform] lead insert", leadErr); return Response.json({ error: "Could not save application" }, { status: 500 }); }
          leadId = lead?.id ?? null;
          // Default status to opt_in (text) since enum may not include it yet
          if (leadId) await (supabaseAdmin as any).from("leads").update({ status: "opt_in" }).eq("id", leadId);
        } else {
          const { data: intake, error: intakeError } = await supabaseAdmin
            .from("onboarding_responses")
            .insert({ org_id: connection.org_id, responses: answers, submitted_at: new Date().toISOString() })
            .select("id")
            .maybeSingle();
          if (intakeError) { console.error("[typeform] intake insert", intakeError); return Response.json({ error: "Request could not be processed" }, { status: 500 }); }
          intakeId = intake?.id ?? null;
        }

        await supabaseAdmin.from("raw_payloads").insert({
          org_id: connection.org_id,
          connector_id: "typeform",
          connection_id: connection.id,
          resource: "form_response",
          external_id: formResponse.token ?? formResponse.response_id ?? null,
          payload,
          processed_at: new Date().toISOString(),
        });
        const eventType = isApplication ? "lead.application_submitted" : "onboarding.submitted";
        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: eventType,
          subject_type: isApplication ? "lead" : "onboarding_response",
          subject_id: leadId ?? intakeId,
          payload: { answers, application_data, source: "typeform" },
        });

        await dispatchEvent(connection.org_id, eventType, {
          answers, application_data, source: "typeform",
          lead_id: leadId,
          response_id: formResponse.token ?? formResponse.response_id ?? null,
          submitted_at: new Date().toISOString(),
        });

        return Response.json({ ok: true, lead_id: leadId, intake_id: intakeId });
      },
    },
  },
});
