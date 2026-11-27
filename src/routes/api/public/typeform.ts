import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dispatchEvent } from "@/lib/dispatch.server";
import { classifyLead, type ClassificationRule } from "@/lib/lead-classification";
import { hiddenAttribution, indexTypeformAnswers, resolveSlot } from "@/lib/typeform-answers";
import { contentIdForTag } from "@/lib/attribution.server";
import { syncPartialStage, upsertApplicationLead } from "@/lib/typeform-ingest.server";

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
        // Typeform marks a delivery from a Partial Submit Point as
        // form_response_partial; a finished form is form_response. Every
        // delivery used to be treated as a submitted application.
        const isPartial = payload.event_type === "form_response_partial";
        const responseToken: string | null =
          typeof formResponse.token === "string" ? formResponse.token : null;

        // Indexing lives in src/lib/typeform-answers.ts so the matching rules
        // are unit-tested against the real payload that broke — a webhook route
        // is not somewhere this logic can be exercised.
        const { answers, answersByTitle, typedEmail, typedPhone } =
          indexTypeformAnswers(formResponse);
        // UTMs ride in `form_response.hidden`, which this handler never read
        // — so an ad-sourced lead arrived with no attribution at all and
        // displayed as "Unknown / Unattributed".
        const attribution = hiddenAttribution(formResponse);
        // utm_content links the lead to a content piece when it matches that
        // piece's tracking id; unmatched, it is still kept raw below.
        const contentId = await contentIdForTag(
          supabaseAdmin,
          connection.org_id,
          attribution.contentTag,
        );

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
        let tierKey: string | null = null;
        let dmOwner: { via: "link" | "claim"; setterName: string | null } | null = null;
        if (isApplication) {
          // One lead per response across its partial and completed
          // deliveries — see typeform-ingest.server.ts.
          let outcome;
          try {
            outcome = await upsertApplicationLead(supabaseAdmin, {
              orgId: connection.org_id,
              token: responseToken,
              isPartial,
              full_name,
              email,
              phone,
              handle,
              application_data,
              qualification_notes: pick("candidate_fit") || null,
              attribution: {
                source_platform: attribution.sourcePlatform,
                source_campaign: attribution.sourceCampaign,
                source_medium: attribution.sourceMedium,
                source_content_tag: attribution.contentTag,
                source_content_id: contentId,
              },
            });
          } catch (err) {
            console.error("[typeform] lead write", err);
            return Response.json({ error: "Could not save application" }, { status: 500 });
          }

          await supabaseAdmin.from("raw_payloads").insert({
            org_id: connection.org_id,
            connector_id: "typeform",
            connection_id: connection.id,
            resource: isPartial ? "form_response_partial" : "form_response",
            external_id: responseToken ?? formResponse.response_id ?? null,
            payload,
            processed_at: new Date().toISOString(),
          });

          // A late partial, or a completion Typeform retried: the lead is
          // already right and the applicant already announced.
          if (outcome.kind === "ignored") {
            return Response.json({ ok: true, lead_id: outcome.leadId, ignored: outcome.reason });
          }
          leadId = outcome.leadId;
          await syncPartialStage(supabaseAdmin, connection.org_id, leadId, isPartial);

          // A DM setter's lead (their tracked link, or a claim they logged)
          // is theirs: stamped here, on partials too, so dialers skip it.
          const { applyDmOwnership } = await import("@/lib/dm-ownership.server");
          dmOwner = await applyDmOwnership(connection.org_id, leadId, {
            full_name,
            email,
            phone,
            handle,
            sourceMedium: attribution.sourceMedium,
            contentTag: attribution.contentTag,
          });

          // A partial is stored and filterable, and that is all: no
          // application_submitted event, no tier, no applicant post.
          if (isPartial) {
            return Response.json({ ok: true, lead_id: leadId, partial: true });
          }

          // Default status to opt_in (text) since enum may not include it yet
          await (supabaseAdmin as any).from("leads").update({ status: "opt_in" }).eq("id", leadId);

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
                tierKey = result.tierKey;
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
          // An onboarding intake is only meaningful once submitted.
          if (isPartial) return Response.json({ ok: true, partial: true, ignored: "intake" });
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

        // Applications stored their payload above, before any early return.
        if (!isApplication) {
          await supabaseAdmin.from("raw_payloads").insert({
            org_id: connection.org_id,
            connector_id: "typeform",
            connection_id: connection.id,
            resource: "form_response",
            external_id: responseToken ?? formResponse.response_id ?? null,
            payload,
            processed_at: new Date().toISOString(),
          });
        }
        const eventType = isApplication ? "lead.application_submitted" : "onboarding.submitted";
        await supabaseAdmin.from("events").insert({
          org_id: connection.org_id,
          event_type: eventType,
          subject_type: isApplication ? "lead" : "onboarding_response",
          subject_id: leadId ?? intakeId,
          payload: { answers, application_data, source: "typeform" },
        });

        // The tier's display label ("Mid Ticket"), not its key — the Discord
        // message is read by a person deciding who to call first.
        let tierLabel: string | null = null;
        if (tierKey) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: tier } = await (supabaseAdmin as any)
            .from("offer_tiers")
            .select("label")
            .eq("org_id", connection.org_id)
            .eq("key", tierKey)
            .maybeSingle();
          tierLabel = (tier?.label as string | undefined) ?? null;
        }

        await dispatchEvent(connection.org_id, eventType, {
          // The lead's own resolved fields, so a formatter never has to dig
          // them back out of raw answers. JSON subscribers still get
          // `answers` below, unchanged.
          lead: {
            id: leadId,
            full_name,
            email,
            phone,
            ticket_tier: tierKey,
            ticket_tier_label: tierLabel,
            source_platform: attribution.sourcePlatform,
            source_campaign: attribution.sourceCampaign,
            source_medium: attribution.sourceMedium,
            source_content_tag: attribution.contentTag,
            dm_owned_via: dmOwner?.via ?? null,
            dm_setter_name: dmOwner?.setterName ?? null,
          },
          form_title:
            typeof formResponse.definition?.title === "string"
              ? formResponse.definition.title
              : null,
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
