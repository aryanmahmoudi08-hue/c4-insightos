import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureWorkspaceForUser } from "./workspace.server";
import {
  isBoardPipelineName,
  sortStages,
  stageForLeadStatus,
  type BoardCall,
  type BoardLead,
  type BoardStage,
} from "./crm-board";

async function boardWorkspace(userId: string) {
  const workspace = await ensureWorkspaceForUser(userId);
  if (!workspace) throw new Error("No workspace — access not yet approved");
  return { orgId: workspace.org_id as string, role: workspace.role as string };
}

/**
 * Move a lead to a stage, by hand.
 *
 * A drag always wins over whatever the Closer's form last set: the person
 * looking at the board can see things the form cannot, and a card that snaps
 * back after being dragged reads as broken. The override is written to
 * `crm_activities` so the board's history says who moved it and from where,
 * rather than the stage silently differing from the call's lead status.
 */
export async function moveLeadToStageForUser(
  userId: string,
  input: { leadId: string; stageId: string },
) {
  const { orgId } = await boardWorkspace(userId);
  // Generated Supabase types do not yet carry `crm_stage_id` or the crm_*
  // tables this file reads; same cast crm-foundation.server.ts uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: stage, error: stageError } = await db
    .from("crm_pipeline_stages")
    .select("id, name, pipeline_id, org_id")
    .eq("id", input.stageId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage) throw new Error("That stage does not belong to this workspace");

  const { data: lead, error: leadError } = await db
    .from("leads")
    .select("id, full_name, crm_stage_id")
    .eq("id", input.leadId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("That lead does not belong to this workspace");
  if (lead.crm_stage_id === stage.id) return { moved: false as const };

  let fromName: string | null = null;
  if (lead.crm_stage_id) {
    const { data: from } = await db
      .from("crm_pipeline_stages")
      .select("name")
      .eq("id", lead.crm_stage_id)
      .maybeSingle();
    fromName = (from?.name as string) ?? null;
  }

  const { error: updateError } = await db
    .from("leads")
    .update({ crm_stage_id: stage.id, updated_at: new Date().toISOString() })
    .eq("id", lead.id)
    .eq("org_id", orgId);
  if (updateError) throw new Error(updateError.message);

  const { data: activity } = await db
    .from("crm_activities")
    .insert({
      org_id: orgId,
      actor_user_id: userId,
      activity_type: "pipeline_stage_changed",
      source_type: "crm",
      title: `Moved to ${stage.name}`,
      body: fromName ? `From ${fromName} to ${stage.name}, by hand on the board.` : null,
      payload: { lead_id: lead.id, from_stage: fromName, to_stage: stage.name, manual: true },
    })
    .select("id")
    .maybeSingle();

  if (activity?.id) {
    await db.from("crm_activity_targets").insert({
      org_id: orgId,
      activity_id: activity.id,
      entity_type: "legacy_lead",
      entity_id: lead.id,
    });
  }

  return { moved: true as const, stageName: stage.name as string };
}

/**
 * Move a lead because a Closer recorded a Lead Status, not because anyone
 * dragged it. Returns the stage it landed in, or null when the status has no
 * mapping — an unmapped status leaves the card alone rather than guessing.
 *
 * Exported for the Closer post-call path to call after the call row is
 * written; safe to call with a null lead id, which is what the free-text EOD
 * flow produces.
 */
export async function syncLeadStageFromLeadStatus(params: {
  orgId: string;
  leadId: string | null | undefined;
  leadStatus: string | null | undefined;
  actorUserId?: string | null;
}): Promise<{ stageId: string; stageName: string } | null> {
  if (!params.leadId || !params.leadStatus) return null;
  // Generated Supabase types do not yet carry `crm_stage_id` or the crm_*
  // tables this file reads; same cast crm-foundation.server.ts uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: mappings } = await db
    .from("crm_legacy_stage_mappings")
    .select("legacy_value, pipeline_stage_id")
    .eq("org_id", params.orgId)
    .eq("legacy_entity_type", "lead_status");

  const stageId = stageForLeadStatus(params.leadStatus, mappings ?? []);
  if (!stageId) return null;

  const { data: stage } = await db
    .from("crm_pipeline_stages")
    .select("id, name")
    .eq("id", stageId)
    .eq("org_id", params.orgId)
    .maybeSingle();
  if (!stage) return null;

  const { error } = await db
    .from("leads")
    .update({ crm_stage_id: stage.id, updated_at: new Date().toISOString() })
    .eq("id", params.leadId)
    .eq("org_id", params.orgId);
  if (error) throw new Error(error.message);

  const { data: activity } = await db
    .from("crm_activities")
    .insert({
      org_id: params.orgId,
      actor_user_id: params.actorUserId ?? null,
      activity_type: "pipeline_stage_changed",
      source_type: "crm",
      title: `Moved to ${stage.name}`,
      body: `Lead Status "${params.leadStatus}" on the post-call form put this lead in ${stage.name}.`,
      payload: {
        lead_id: params.leadId,
        to_stage: stage.name,
        lead_status: params.leadStatus,
        manual: false,
      },
    })
    .select("id")
    .maybeSingle();

  if (activity?.id) {
    await db.from("crm_activity_targets").insert({
      org_id: params.orgId,
      activity_id: activity.id,
      entity_type: "legacy_lead",
      entity_id: params.leadId,
    });
  }

  return { stageId: stage.id as string, stageName: stage.name as string };
}

/**
 * Move the lead behind a call to whatever its Lead Status maps to.
 *
 * Takes a call id rather than the status itself so both write paths — the
 * Closer's Log Call form and the EOD flow — get identical behaviour without
 * either having to know the mapping, and so the status that moves the card is
 * read back from the row that was actually saved rather than from form state.
 *
 * Deliberately forgiving: a call with no lead, no status, or an unmapped
 * status is a no-op. Submitting a post-call form must never fail because the
 * board could not place a card.
 */
export async function syncLeadStageFromCallForUser(userId: string, input: { callId: string }) {
  const { orgId } = await boardWorkspace(userId);
  // Generated Supabase types do not yet carry `crm_stage_id` or the crm_*
  // tables this file reads; same cast crm-foundation.server.ts uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: call } = await db
    .from("calls")
    .select("id, lead_id, eod_lead_status")
    .eq("id", input.callId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!call?.lead_id || !call.eod_lead_status) return { moved: false as const };

  const result = await syncLeadStageFromLeadStatus({
    orgId,
    leadId: call.lead_id,
    leadStatus: call.eod_lead_status,
    actorUserId: userId,
  });
  return result ? { moved: true as const, stageName: result.stageName } : { moved: false as const };
}

/**
 * A Calendly booking puts its lead in Sales → Booked.
 *
 * Nothing placed booked leads on the board: the board reads
 * `leads.crm_stage_id`, and bookings only ever wrote `calls`, so a lead with
 * a call on the calendar sat in Applications (or nowhere) and Booked read 0.
 *
 * The one thing a booking does not do is pull a lead backwards out of a
 * Sales outcome. A client at Deposit or Closed who books an onboarding call,
 * or a lead already marked No Close, DQ or Bad Fit, stays where the closer
 * put them. Everything else — unplaced, any Applications stage, a cancelled
 * call, or an earlier Sales stage such as No Show or Follow Up — moves,
 * because a fresh booking is real evidence of where the lead is now.
 *
 * Best-effort: placing a card must never fail the booking it follows.
 */
export async function syncLeadStageForBooking(orgId: string, leadId: string | null | undefined) {
  if (!leadId) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;

  const { data: sales } = await db
    .from("crm_pipelines")
    .select("id")
    .eq("org_id", orgId)
    .ilike("name", "sales")
    .maybeSingle();
  if (!sales) return null;
  const { data: booked } = await db
    .from("crm_pipeline_stages")
    .select("id, pipeline_id")
    .eq("org_id", orgId)
    .eq("pipeline_id", sales.id)
    .eq("name", "Booked")
    .maybeSingle();
  if (!booked) return null;

  const { data: lead } = await db
    .from("leads")
    .select("id, crm_stage_id")
    .eq("org_id", orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead || lead.crm_stage_id === booked.id) return null;

  if (lead.crm_stage_id) {
    const { data: current } = await db
      .from("crm_pipeline_stages")
      .select("pipeline_id, board_segment, is_closed_won, is_closed_lost")
      .eq("id", lead.crm_stage_id)
      .maybeSingle();
    const pastBooked =
      current?.pipeline_id === booked.pipeline_id &&
      (current.board_segment === "partial" ||
        current.board_segment === "closed_out" ||
        current.is_closed_won ||
        current.is_closed_lost);
    if (pastBooked) return null;
  }

  const { error } = await db
    .from("leads")
    .update({ crm_stage_id: booked.id, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);

  const { data: activity } = await db
    .from("crm_activities")
    .insert({
      org_id: orgId,
      actor_user_id: null,
      activity_type: "pipeline_stage_changed",
      source_type: "crm",
      title: "Moved to Booked",
      body: "A call was booked through Calendly.",
      payload: { lead_id: leadId, to_stage: "Booked", source: "calendly", manual: false },
    })
    .select("id")
    .maybeSingle();
  if (activity?.id) {
    await db.from("crm_activity_targets").insert({
      org_id: orgId,
      activity_id: activity.id,
      entity_type: "legacy_lead",
      entity_id: leadId,
    });
  }
  return { stageId: booked.id as string };
}
