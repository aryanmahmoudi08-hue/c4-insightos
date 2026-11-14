/**
 * Events fired by something a person did inside AscendOS: ticking the
 * confirmation touchpoint, submitting a closer's post-call form, submitting a
 * setter's EOD. Each is best-effort and never throws — the action it follows
 * has already been saved.
 */
import { TOUCHPOINT_LABELS, type Touchpoint } from "./call-confirmations";
import { db, fireOnce, leadSummary, loadNotificationSettings, memberName } from "./notify.server";

/** The fields every call-shaped event carries. */
export async function callPayload(orgId: string, callId: string) {
  const { data: call } = await db
    .from("calls")
    .select(
      "id, lead_id, lead_email, scheduled_for, closer_id, closer_name, setter_id, meeting_link, status, cancelled",
    )
    .eq("org_id", orgId)
    .eq("id", callId)
    .maybeSingle();
  if (!call) return null;
  const [lead, setterName, closerFromId] = await Promise.all([
    leadSummary(orgId, { leadId: call.lead_id, email: call.lead_email }),
    memberName(orgId, call.setter_id),
    call.closer_name ? Promise.resolve(null) : memberName(orgId, call.closer_id),
  ]);
  return {
    call,
    payload: {
      call_id: call.id,
      lead_id: lead.id,
      lead,
      lead_email: call.lead_email ?? lead.email,
      scheduled_for: call.scheduled_for,
      closer_name: call.closer_name ?? closerFromId,
      setter_name: setterName,
      meeting_link: call.meeting_link,
    } as Record<string, unknown>,
  };
}

/**
 * A touchpoint was ticked. If it is the one the workspace treats as
 * "confirmed", fire call.confirmed — once per call per booking time, so
 * unticking and re-ticking does not ping the channel twice.
 */
export async function notifyTouchpointMarked(
  orgId: string,
  callId: string,
  touchpoint: Touchpoint,
) {
  try {
    const settings = await loadNotificationSettings(orgId);
    if (settings.confirmTouchpoint !== touchpoint) return;
    const built = await callPayload(orgId, callId);
    if (!built) return;
    const key = `${callId}:${built.call.scheduled_for ?? ""}`;
    await fireOnce(
      orgId,
      "call.confirmed",
      key,
      { type: "call", id: callId },
      {
        ...built.payload,
        touchpoint,
        touchpoint_label: TOUCHPOINT_LABELS[touchpoint],
        time_zone: settings.timeZone || null,
      },
    );
  } catch (err) {
    console.error("notifyTouchpointMarked:", err);
  }
}

/** A closer submitted the post-call form: every answer, in readable form. */
export async function notifyCloserPostCall(orgId: string, callId: string) {
  try {
    const { data: call } = await db
      .from("calls")
      .select(
        "id, lead_id, lead_email, closer_name, eod_lead_status, offer_made, cash_collected_cents, contract_value_cents, original_currency, payment_plan, call_summary, recording_url, requested_followup_at, followup_amount_pitched_cents, followup_reason, followup_reason_other, followup_notes",
      )
      .eq("org_id", orgId)
      .eq("id", callId)
      .maybeSingle();
    if (!call) return;
    const [{ data: objections }, lead, settings] = await Promise.all([
      db.from("call_objections").select("objection").eq("org_id", orgId).eq("call_id", callId),
      leadSummary(orgId, { leadId: call.lead_id, email: call.lead_email }),
      loadNotificationSettings(orgId),
    ]);
    await fireOnce(
      orgId,
      "closer.post_call_submitted",
      callId,
      { type: "call", id: callId },
      {
        call_id: call.id,
        lead_id: lead.id,
        lead,
        lead_email: call.lead_email,
        closer_name: call.closer_name,
        lead_status: call.eod_lead_status,
        offer_made: call.offer_made,
        cash_collected_cents: call.cash_collected_cents,
        contract_value_cents: call.contract_value_cents,
        currency: call.original_currency,
        payment_plan: call.payment_plan,
        objections: ((objections ?? []) as Array<{ objection: string }>).map((o) => o.objection),
        call_summary: call.call_summary,
        recording_url: call.recording_url,
        requested_followup_at: call.requested_followup_at,
        followup_amount_pitched_cents: call.followup_amount_pitched_cents,
        followup_reason: call.followup_reason_other || call.followup_reason,
        followup_notes: call.followup_notes,
        time_zone: settings.timeZone || null,
      },
    );
  } catch (err) {
    console.error("notifyCloserPostCall:", err);
  }
}

/** A setter or dialer submitted their EOD. */
export async function notifySetterEod(orgId: string, activityId: string) {
  try {
    const { data: row } = await db
      .from("setter_activity")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", activityId)
      .maybeSingle();
    if (!row) return;
    const { org_id: _org, user_id: _user, ...fields } = row as Record<string, unknown>;
    await fireOnce(
      orgId,
      "setter.eod_submitted",
      activityId,
      { type: "setter_activity", id: activityId },
      fields,
    );
  } catch (err) {
    console.error("notifySetterEod:", err);
  }
}
