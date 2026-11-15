/**
 * One lead per Typeform response, across its partial and completed
 * deliveries.
 *
 * Typeform sends `form_response_partial` when someone passes a Partial
 * Submit Point and `form_response` when they finish, both carrying the same
 * `form_response.token`. The handler used to treat every delivery as a new,
 * submitted application: a partial created a lead and was announced as an
 * applicant, and the completion created a second lead and was announced
 * again.
 *
 * Now, per delivery:
 *
 *   partial    find the response's lead (by token, else an open partial with
 *              the same email) and update it, or create one — marked
 *              application_partial. Never announced, never counted as an
 *              application.
 *   complete   if that response already has a partial lead, finish it (fill
 *              the rest, clear the marker); otherwise create the lead. The
 *              caller announces it — exactly once.
 *
 * And the deliveries that must not do anything:
 *
 *   - a partial arriving after its completion (Typeform does not guarantee
 *     order) cannot turn a submitted application back into a partial;
 *   - a completion Typeform retries cannot create a second lead or announce
 *     the applicant twice.
 *
 * The email fallback only ever matches a lead that is still partial: a
 * person who applied last month and applies again is a new application, not
 * an update to the old one.
 *
 * Takes the client as an argument so it can be tested without a network.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingAttribution, type Attribution } from "./attribution.server";
import { escapeLike } from "./sql-like";

// typeform_response_token / application_partial / source_medium are ahead
// of the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ApplicationInput = {
  orgId: string;
  token: string | null;
  isPartial: boolean;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
  application_data: Record<string, unknown>;
  qualification_notes: string | null;
  attribution: Attribution;
};

export type ApplicationOutcome =
  | { kind: "created" | "updated"; leadId: string; announce: boolean }
  | { kind: "ignored"; leadId: string | null; reason: "late partial" | "duplicate completion" };

type ExistingLead = {
  id: string;
  application_partial: boolean;
  typeform_response_token: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
  source_platform: string | null;
  source_campaign: string | null;
  source_medium: string | null;
  source_content_tag: string | null;
  source_content_id: string | null;
};

const LEAD_COLS =
  "id, application_partial, typeform_response_token, full_name, email, phone, handle, source_platform, source_campaign, source_medium, source_content_tag, source_content_id";

async function findResponseLead(db: Db, input: ApplicationInput): Promise<ExistingLead | null> {
  if (input.token) {
    const { data } = await db
      .from("leads")
      .select(LEAD_COLS)
      .eq("org_id", input.orgId)
      .eq("typeform_response_token", input.token)
      .maybeSingle();
    if (data) return data as ExistingLead;
  }
  const email = input.email?.trim();
  if (email) {
    const { data } = await db
      .from("leads")
      .select(LEAD_COLS)
      .eq("org_id", input.orgId)
      .eq("application_partial", true)
      .ilike("email", escapeLike(email))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ExistingLead;
  }
  return null;
}

export async function upsertApplicationLead(
  db: Db,
  input: ApplicationInput,
  attempt = 0,
): Promise<ApplicationOutcome> {
  const existing = await findResponseLead(db, input);

  if (existing && !existing.application_partial) {
    // Already submitted. Whatever this delivery is, it changes nothing.
    return {
      kind: "ignored",
      leadId: existing.id,
      reason: input.isPartial ? "late partial" : "duplicate completion",
    };
  }

  if (existing) {
    const patch: Record<string, unknown> = {
      // Each delivery carries every answer so far, so the latest is the
      // fullest picture.
      application_data: input.application_data,
      application_partial: input.isPartial,
      typeform_response_token: input.token ?? existing.typeform_response_token,
      // A later delivery may add contact details; it never blanks them.
      full_name: input.full_name ?? existing.full_name,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      handle: input.handle ?? existing.handle,
      ...missingAttribution(existing, input.attribution),
      updated_at: new Date().toISOString(),
    };
    if (input.qualification_notes) patch.qualification_notes = input.qualification_notes;
    const { error } = await db
      .from("leads")
      .update(patch)
      .eq("org_id", input.orgId)
      .eq("id", existing.id);
    if (error) throw new Error(`lead update: ${error.message}`);
    return { kind: "updated", leadId: existing.id, announce: !input.isPartial };
  }

  const { data: created, error } = await db
    .from("leads")
    .insert({
      org_id: input.orgId,
      full_name: input.full_name,
      email: input.email,
      phone: input.phone,
      handle: input.handle,
      status: "dm_received",
      source_connector: "typeform",
      typeform_response_token: input.token,
      application_partial: input.isPartial,
      // Raw, not categorised: normalizeAcquisitionSource maps the platform
      // at read time, and keeping the original means a value it does not
      // recognise stays auditable rather than being flattened on the way in.
      ...input.attribution,
      application_data: input.application_data,
      qualification_notes: input.qualification_notes,
    })
    .select("id")
    .single();
  if (error) {
    // Two deliveries for the same response raced and the other inserted
    // first. Its lead exists now; go round once more and update it.
    if (error.code === "23505" && attempt === 0) return upsertApplicationLead(db, input, 1);
    throw new Error(`lead insert: ${error.message}`);
  }
  return { kind: "created", leadId: created.id as string, announce: !input.isPartial };
}

/**
 * Keep the CRM board in step: a partial lead sits in Applications → Partial
 * Submit; on completion it leaves that stage. Never pulls a lead out of a
 * stage someone moved it to by hand. Best-effort.
 */
export async function syncPartialStage(db: Db, orgId: string, leadId: string, partial: boolean) {
  try {
    const { data: pipeline } = await db
      .from("crm_pipelines")
      .select("id")
      .eq("org_id", orgId)
      .ilike("name", "applications")
      .maybeSingle();
    if (!pipeline) return;
    const { data: stage } = await db
      .from("crm_pipeline_stages")
      .select("id")
      .eq("org_id", orgId)
      .eq("pipeline_id", pipeline.id)
      .eq("name", "Partial Submit")
      .maybeSingle();
    if (!stage) return;
    if (partial) {
      await db
        .from("leads")
        .update({ crm_stage_id: stage.id })
        .eq("org_id", orgId)
        .eq("id", leadId)
        .is("crm_stage_id", null);
    } else {
      await db
        .from("leads")
        .update({ crm_stage_id: null })
        .eq("org_id", orgId)
        .eq("id", leadId)
        .eq("crm_stage_id", stage.id);
    }
  } catch (err) {
    console.error("syncPartialStage:", err);
  }
}
