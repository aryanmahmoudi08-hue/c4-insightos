/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic tables are outside the generated client snapshot */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureLifecycleEvent } from "@/lib/lifecycle-events";
import { lifecycleEventsFromTwilioVoice } from "@/lib/crm-lifecycle-ingestion";
import { validateTwilioSignature } from "@/lib/twilio-signature";

const SUPPORTED_EVENTS = new Set(["sms", "voice", "voice-status", "recording"]);
const TWIML_HEADERS = { "content-type": "text/xml; charset=utf-8" };
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

function twiml(status = 200) {
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status,
    headers: TWIML_HEADERS,
  });
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function payloadFrom(form: FormData) {
  const payload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") payload[key] = value;
  }
  return payload;
}

function callbackUrl(request: Request) {
  const incoming = new URL(request.url);
  const configuredBase = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
  if (!configuredBase) return null;
  return `${configuredBase}${incoming.pathname}${incoming.search}`;
}

function externalEventId(event: string, payload: Record<string, string>) {
  const objectId = payload.RecordingSid ?? payload.MessageSid ?? payload.CallSid;
  const state =
    payload.RecordingStatus ?? payload.MessageStatus ?? payload.CallStatus ?? "received";
  return objectId ? `${event}:${objectId}:${state}` : null;
}

async function findAccount(toAddress: string | undefined) {
  if (!toAddress) return null;
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("crm_communication_accounts")
    .select("id, org_id, channel, address_value")
    .eq("provider", "twilio")
    .eq("address_value", toAddress)
    .eq("connection_status", "connected")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function recordExternalEvent(input: {
  orgId: string;
  event: string;
  eventId: string;
  payload: Record<string, string>;
}) {
  const db = supabaseAdmin as any;
  const { data: existing, error: existingError } = await db
    .from("crm_external_events")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("provider", "twilio")
    .eq("external_event_id", input.eventId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return { id: existing.id, duplicate: true };

  const { data, error } = await db
    .from("crm_external_events")
    .insert({
      org_id: input.orgId,
      provider: "twilio",
      external_event_id: input.eventId,
      event_type: input.event,
      processing_status: "received",
      payload: input.payload,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { id: null, duplicate: true };
    throw new Error(error.message);
  }
  return { id: data.id, duplicate: false };
}

async function resolveContactContext(orgId: string, phone: string | undefined) {
  const db = supabaseAdmin as any;
  if (!phone) return { contactId: null, legacyLeadId: null };
  const [contact, lead] = await Promise.all([
    db
      .from("crm_contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("primary_phone", phone)
      .maybeSingle(),
    db.from("leads").select("id").eq("org_id", orgId).eq("phone", phone).maybeSingle(),
  ]);
  if (contact.error) throw new Error(contact.error.message);
  if (lead.error) throw new Error(lead.error.message);
  return { contactId: contact.data?.id ?? null, legacyLeadId: lead.data?.id ?? null };
}

async function appendActivity(input: {
  orgId: string;
  type: string;
  title: string;
  sourceId: string;
  contactId?: string | null;
  legacyLeadId?: string | null;
  payload: Record<string, string>;
}) {
  const db = supabaseAdmin as any;
  const { data: activity, error } = await db
    .from("crm_activities")
    .insert({
      org_id: input.orgId,
      activity_type: input.type,
      source_type: "twilio",
      source_id: input.sourceId,
      title: input.title,
      payload: input.payload,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const targets = [
    input.contactId
      ? {
          org_id: input.orgId,
          activity_id: activity.id,
          entity_type: "contact",
          entity_id: input.contactId,
        }
      : null,
    input.legacyLeadId
      ? {
          org_id: input.orgId,
          activity_id: activity.id,
          entity_type: "legacy_lead",
          entity_id: input.legacyLeadId,
        }
      : null,
  ].filter(Boolean);
  if (targets.length) {
    const { error: targetError } = await db.from("crm_activity_targets").insert(targets);
    if (targetError) throw new Error(targetError.message);
  }
}

async function handleSms(account: { id: string; org_id: string }, payload: Record<string, string>) {
  const db = supabaseAdmin as any;
  const context = await resolveContactContext(account.org_id, payload.From);
  const externalThreadId = `sms:${payload.From ?? "unknown"}:${payload.To ?? "unknown"}`;
  const { data: existingThread, error: threadLookupError } = await db
    .from("crm_communication_threads")
    .select("id")
    .eq("account_id", account.id)
    .eq("external_thread_id", externalThreadId)
    .maybeSingle();
  if (threadLookupError) throw new Error(threadLookupError.message);

  let threadId = existingThread?.id as string | undefined;
  if (!threadId) {
    const { data: createdThread, error: threadError } = await db
      .from("crm_communication_threads")
      .insert({
        org_id: account.org_id,
        account_id: account.id,
        channel: "sms",
        external_thread_id: externalThreadId,
        contact_id: context.contactId,
        legacy_lead_id: context.legacyLeadId,
        status: "open",
        unread_count: 1,
        last_message_at: new Date().toISOString(),
        metadata: { from: payload.From, to: payload.To },
      })
      .select("id")
      .single();
    if (threadError) throw new Error(threadError.message);
    threadId = createdThread.id;
  } else {
    const { error: updateError } = await db
      .from("crm_communication_threads")
      .update({ unread_count: 1, last_message_at: new Date().toISOString() })
      .eq("id", threadId);
    if (updateError) throw new Error(updateError.message);
  }

  const { data: message, error: messageError } = await db
    .from("crm_communication_messages")
    .insert({
      org_id: account.org_id,
      thread_id: threadId,
      account_id: account.id,
      provider: "twilio",
      external_message_id: payload.MessageSid,
      direction: "inbound",
      status: "received",
      from_address: payload.From ?? null,
      to_addresses: payload.To ? [payload.To] : [],
      body_text: payload.Body ?? null,
      received_at: new Date().toISOString(),
      metadata: payload,
    })
    .select("id")
    .single();
  if (messageError && messageError.code !== "23505") throw new Error(messageError.message);
  if (!message) return;

  await appendActivity({
    orgId: account.org_id,
    type: "sms_received",
    title: "SMS received",
    sourceId: message.id,
    contactId: context.contactId,
    legacyLeadId: context.legacyLeadId,
    payload,
  });
}

async function handleVoice(
  account: { id: string; org_id: string },
  payload: Record<string, string>,
) {
  const db = supabaseAdmin as any;
  const context = await resolveContactContext(account.org_id, payload.From);
  const callStatus = (payload.CallStatus ?? "initiated").replace(/-/g, "_");
  const normalizedStatus = [
    "queued",
    "initiated",
    "ringing",
    "answered",
    "completed",
    "busy",
    "failed",
    "no_answer",
    "canceled",
  ].includes(callStatus)
    ? callStatus
    : "initiated";
  const { data: call, error } = await db
    .from("crm_call_sessions")
    .upsert(
      {
        org_id: account.org_id,
        account_id: account.id,
        contact_id: context.contactId,
        legacy_lead_id: context.legacyLeadId,
        provider: "twilio",
        external_call_id: payload.CallSid,
        direction:
          payload.Direction === "outbound-api" || payload.Direction === "outbound-dial"
            ? "outbound"
            : "inbound",
        status: normalizedStatus,
        from_address: payload.From ?? null,
        to_address: payload.To ?? null,
        started_at: payload.Timestamp
          ? new Date(payload.Timestamp).toISOString()
          : new Date().toISOString(),
        completed_at: normalizedStatus === "completed" ? new Date().toISOString() : null,
        duration_seconds: payload.CallDuration ? Number(payload.CallDuration) : null,
        metadata: payload,
      },
      { onConflict: "provider,external_call_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await appendActivity({
    orgId: account.org_id,
    type: `call_${normalizedStatus}`,
    title: `Call ${normalizedStatus.replaceAll("_", " ")}`,
    sourceId: call.id,
    contactId: context.contactId,
    legacyLeadId: context.legacyLeadId,
    payload,
  });

  const providerEventId = externalEventId("voice", payload);
  const lifecycleEvents = providerEventId
    ? lifecycleEventsFromTwilioVoice({
        orgId: account.org_id,
        leadId: context.legacyLeadId,
        providerEventId,
        callSid: payload.CallSid ?? null,
        callStatus: normalizedStatus,
        occurredAt: payload.Timestamp ?? null,
      })
    : [];
  for (const lifecycleEvent of lifecycleEvents) {
    await captureLifecycleEvent(supabaseAdmin, lifecycleEvent);
  }
}

async function handleRecording(
  account: { id: string; org_id: string },
  payload: Record<string, string>,
) {
  const db = supabaseAdmin as any;
  const { data: callSession, error: callError } = await db
    .from("crm_call_sessions")
    .select("id, contact_id, legacy_lead_id")
    .eq("provider", "twilio")
    .eq("external_call_id", payload.CallSid)
    .eq("org_id", account.org_id)
    .maybeSingle();
  if (callError) throw new Error(callError.message);

  const status =
    payload.RecordingStatus === "completed"
      ? "available"
      : payload.RecordingStatus === "absent"
        ? "absent"
        : payload.RecordingStatus === "failed"
          ? "failed"
          : "processing";
  const { data: recording, error } = await db
    .from("crm_call_recordings")
    .upsert(
      {
        org_id: account.org_id,
        call_session_id: callSession?.id ?? null,
        provider: "twilio",
        external_recording_id: payload.RecordingSid,
        status,
        recording_url: payload.RecordingUrl ?? null,
        duration_seconds: payload.RecordingDuration ? Number(payload.RecordingDuration) : null,
        metadata: payload,
      },
      { onConflict: "provider,external_recording_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await appendActivity({
    orgId: account.org_id,
    type: "call_recording_available",
    title: `Call recording ${status}`,
    sourceId: recording.id,
    contactId: callSession?.contact_id ?? null,
    legacyLeadId: callSession?.legacy_lead_id ?? null,
    payload,
  });
}

export const Route = createFileRoute("/api/public/twilio/$event")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const event = params.event;
        if (!event || !SUPPORTED_EVENTS.has(event))
          return json({ error: "Unsupported Twilio event" }, 404);
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const configuredUrl = callbackUrl(request);
        if (!authToken || !configuredUrl)
          return json({ error: "Twilio webhook is not configured" }, 503);

        const form = await request.formData();
        const payload = payloadFrom(form);
        const signature = request.headers.get("x-twilio-signature") ?? "";
        if (
          !signature ||
          !(await validateTwilioSignature(authToken, signature, configuredUrl, payload))
        )
          return json({ error: "Invalid Twilio signature" }, 401);

        const eventId = externalEventId(event, payload);
        if (!eventId)
          return json({ error: "Twilio callback has no external event identifier" }, 400);
        try {
          const account = await findAccount(payload.To);
          // The number may exist in Twilio before the CRM account is connected.
          // Ack safely rather than retrying an intentionally unconfigured recipient.
          if (!account) return twiml();
          const externalEvent = await recordExternalEvent({
            orgId: account.org_id,
            event,
            eventId,
            payload,
          });
          if (externalEvent.duplicate) return twiml();

          if (event === "sms") await handleSms(account, payload);
          else if (event === "recording") await handleRecording(account, payload);
          else await handleVoice(account, payload);

          await (supabaseAdmin as any)
            .from("crm_external_events")
            .update({ processing_status: "processed", processed_at: new Date().toISOString() })
            .eq("id", externalEvent.id);
          return twiml();
        } catch (error) {
          console.error("[twilio-webhook] processing error", error);
          return json({ error: "Twilio callback could not be processed" }, 500);
        }
      },
    },
  },
});
