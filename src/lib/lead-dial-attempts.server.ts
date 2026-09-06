import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureLifecycleEvent } from "./lifecycle-events";

/**
 * Manual fallback for orgs/leads where the Twilio voice webhook doesn't
 * reliably record a first-attempt event. Writes through the same
 * lead_response_events pipeline real dials use (idempotent — re-marking a
 * lead already attempted is a no-op via the shared idempotency key), so
 * Available-to-Dial filtering never has to know the difference.
 */
export async function markLeadDialedManually(input: {
  orgId: string;
  leadId: string;
  repId: string;
}) {
  return captureLifecycleEvent(supabaseAdmin, {
    orgId: input.orgId,
    leadId: input.leadId,
    eventType: "first_attempt",
    eventAt: new Date().toISOString(),
    idempotencyKey: `manual:${input.leadId}:first_attempt`,
    repId: input.repId,
    payload: { source: "manual_mark_dialed" },
  });
}
