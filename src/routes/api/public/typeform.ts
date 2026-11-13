import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";
import { classifyLead, type ClassificationRule } from "@/lib/lead-classification";
import { hiddenAttribution, indexTypeformAnswers, resolveSlot } from "@/lib/typeform-answers";

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
        if (!connectionId)
          return Response.json({ error: "Missing connection_id" }, { status: 400 });

        // `field_map` and `form_definition` are added by
        // 20261112160000_typeform_field_map and are not in the generated types
        // until those are regenerated against a database that has it — same
        // situation crm_stage_id and eod_lead_status were in.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: connection, error: connectionError } = await (supabaseAdmin as any)
          .from("connector_connections")
          .select("id, org_id, connector_id, config, field_map")
          .eq("id", connectionId)
          .eq("connector_id", "typeform")
          .eq("state", "connected")
          .maybeSingle();
        if (connectionError) {
          console.error("[typeform] connection lookup", connectionError);
          return Response.json({ error: "Lookup failed" }, { status: 500 });
        }
        if (!connection)
          return Response.json({ error: "Unknown Typeform connection" }, { status: 404 });

        const body = await request.text();
        const config = (connection.config ?? {}) as Record<string, unknown>;
        const secret = typeof config.webhookSecret === "string" ? config.webhookSecret : "";
        if (!verifyTypeformSignature(body, secret, request.headers.get("typeform-signature"))) {
          return Response.json({ error: "Invalid Typeform signature" }, { status: 401 });
        }

        const payload = JSON.parse(body);
        const formResponse = payload.form_response ?? {};

        // Indexing lives in src/lib/typeform-answers.ts so the matching rules
        // are unit-tested against the real payload that broke — a webhook route
        // is not somewhere this logic can be exercised.
        const { answers, answersByTitle, typedEmail, typedPhone } =
          indexTypeformAnswers(formResponse);
        // UTMs ride in `form_response.hidden`, which this handler never read
        // — so an ad-sourced lead arrived with no attribution at all and
        // displayed as "Unknown / Unattributed".
        const attribution = hiddenAttribution(formResponse);

        // Keep the latest definition on the connection so the mapping UI can
        // list this form's real questions without a Typeform API call or a
        // token. Refreshed every delivery, not just the first — a question
        // added later has to become mappable. Best-effort: a webhook must not
        // fail because a convenience for the UI could not be written.
        if (formResponse.definition) {
          await supabaseAdmin
            .from("connector_connections")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ form_definition: formResponse.definition } as any)
            .eq("id", connection.id)
            .then(undefined, () => {});
        }

        const pick = (...keys: string[]) => {
          for (const k of keys) {
            if (answers[k]) return answers[k];
          }
          return "";
        };
        // An explicit per-connection mapping wins; otherwise fall back to the
        // ref/id/title matching, so a connection nobody has mapped behaves
        // exactly as it did before.
        const fieldMap = (connection.field_map ?? {}) as Record<string, string>;
        const slot = (key: string, ...fallbacks: string[]) =>
          resolveSlot(key, fieldMap, answers, fallbacks);

        const application_data = {
          experience: slot("experience"),
          work_school: slot("work_school", "work", "school"),
          focus: slot("focus"),
          goal: slot("goal"),
          candidate_fit: slot("candidate_fit", "fit"),
          serious_status: slot("serious_status", "serious"),
          time: slot("time"),
          income: slot("income"),
          capital: slot("capital"),
          credit: slot("credit"),
          commitment: slot("commitment"),
          // Every raw field ref -> answer, alongside the narrowed fields
          // above — preserves the original Typeform response on the lead
          // itself so a ticket-tier classification can be audited later,
          // not just inferred from the (lossy) narrowed shape.
          raw_answers: answers,
          // Every hidden field as delivered. Only utm_source and utm_campaign
          // have a column on `leads`; the rest would otherwise be dropped.
          hidden: attribution.hidden,
          // Keyed by the question as a human reads it, which is what survives
          // a form rebuild — `raw_answers` is keyed by ref and goes stale.
          answers_by_title: answersByTitle,
        };
        const full_name =
          [pick("first_name"), pick("last_name")].filter(Boolean).join(" ").trim() ||
          pick("name", "full_name") ||
          null;
        // Type first, name second: a question typed `email` is an email
        // whatever it is called, and the names only ever worked by convention.
        const email = typedEmail || pick("email", "email_address") || null;
        const phone = typedPhone || pick("phone", "phone_number", "mobile") || null;
        const handle = pick("handle", "instagram", "ig") || null;
        // `raw_answers` and `answers_by_title` are objects, so they are
        // truthy even when empty — which made the check below always true.
        // Harmless while every delivery was a completed response; not harmless
        // once this form starts sending partials, where a lead row with no
        // name, email, phone or answer on it is just litter.
        const { raw_answers: _raw, answers_by_title: _byTitle, ...narrowed } = application_data;
        const carriesAnything =
          Object.values(narrowed).some(Boolean) || Boolean(email || phone || full_name || handle);
        // `config` above is already the typed view of connection.config.
        const isApplication = carriesAnything || config.kind === "application";

        let leadId: string | null = null;
        let intakeId: string | null = null;
        if (isApplication) {
          const { data: lead, error: leadErr } = await supabaseAdmin
            .from("leads")
            .insert({
              org_id: connection.org_id,
              full_name,
              email,
              phone,
              handle,
              status: "dm_received" as any,
              source_connector: "typeform",
              // Raw, not categorised: normalizeAcquisitionSource maps this to
              // one of the standard sources at read time, and keeping the
              // original means a value it does not recognise stays auditable
              // rather than being flattened into "Other" on the way in.
              source_platform: attribution.sourcePlatform,
              source_campaign: attribution.sourceCampaign,
              application_data,
              qualification_notes: pick("candidate_fit"),
            } as any)
            .select("id")
            .maybeSingle();
          if (leadErr) {
            console.error("[typeform] lead insert", leadErr);
            return Response.json({ error: "Could not save application" }, { status: 500 });
          }
          leadId = lead?.id ?? null;
          // Default status to opt_in (text) since enum may not include it yet
          if (leadId)
            await (supabaseAdmin as any)
              .from("leads")
              .update({ status: "opt_in" })
              .eq("id", leadId);

          // Ticket-tier classification (Client DNA source of truth). Never
          // guessed: if no active rule's field is present/parseable, the
          // lead simply stays unclassified — the same as if this block
          // didn't run at all.
          if (leadId) {
            const { data: rules, error: rulesError } = await (supabaseAdmin as any)
              .from("lead_classification_rules")
              .select(
                "id, priority, typeform_field_key, operator, threshold_cents, tier_key, is_active",
              )
              .eq("org_id", connection.org_id)
              .eq("is_active", true);
            if (rulesError) {
              console.error("[typeform] classification rules lookup", rulesError);
            } else if (rules && rules.length > 0) {
              // Same mapping the application slots resolve through — a rule
              // keyed `capital` has to find the question the client mapped to
              // Capital, not a question that happens to be titled "Capital".
              const result = classifyLead(answers, rules as ClassificationRule[], fieldMap);
              if (result.tierKey) {
                await (supabaseAdmin as any)
                  .from("leads")
                  .update({
                    ticket_tier: result.tierKey,
                    ticket_tier_raw_value: result.rawValue,
                    ticket_tier_rule_id: result.ruleId,
                    ticket_tier_classified_at: new Date().toISOString(),
                  })
                  .eq("id", leadId);
              }
            }
          }
        } else {
          const { data: intake, error: intakeError } = await supabaseAdmin
            .from("onboarding_responses")
            .insert({
              org_id: connection.org_id,
              responses: answers,
              submitted_at: new Date().toISOString(),
            })
            .select("id")
            .maybeSingle();
          if (intakeError) {
            console.error("[typeform] intake insert", intakeError);
            return Response.json({ error: "Request could not be processed" }, { status: 500 });
          }
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
          answers,
          application_data,
          source: "typeform",
          lead_id: leadId,
          response_id: formResponse.token ?? formResponse.response_id ?? null,
          submitted_at: new Date().toISOString(),
        });

        return Response.json({ ok: true, lead_id: leadId, intake_id: intakeId });
      },
    },
  },
});
