/**
 * Which lead a Calendly booking belongs to.
 *
 * Bookings were written to `calls` with an email and nothing else — never a
 * lead_id, and the invitee's name was dropped. So every booking showed on
 * the calendar as "Unknown lead" with no contact, no quality, no source, and
 * none of the call events could name the person. Most bookings come from
 * someone who already applied through Typeform, so the lead usually exists;
 * the booking just was never connected to it.
 *
 * Resolution, in order:
 *   1. the lead this booking is already linked to (a Calendly retry);
 *   2. the lead of the booking it replaced (a reschedule is a new invitee
 *      pointing at the old one);
 *   3. the org's most recent lead with this email, case-insensitive;
 *   4. a new lead built from the invitee.
 *
 * Takes the client as an argument, like the other .server.ts modules, so it
 * can be tested against a real database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { calendlyInviteeToLeadRow, type CalendlyInvitee } from "./calendly";
import { escapeLike } from "./sql-like";
import { attributionFromUtms, fillMissingAttribution } from "./attribution.server";

// leads/calls columns used here are partly ahead of the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export async function resolveBookingLead(
  db: Db,
  orgId: string,
  invitee: CalendlyInvitee,
  rescheduledFrom: string | null | undefined,
): Promise<string | null> {
  const callLead = async (externalId: string) => {
    const { data } = await db
      .from("calls")
      .select("lead_id")
      .eq("org_id", orgId)
      .eq("source_connector", "calendly")
      .eq("external_id", externalId)
      .maybeSingle();
    return (data?.lead_id as string | null | undefined) ?? null;
  };

  if (invitee.uri) {
    const existing = await callLead(invitee.uri);
    if (existing) return existing;
  }
  if (rescheduledFrom) {
    const inherited = await callLead(rescheduledFrom);
    if (inherited) return inherited;
  }

  const email = invitee.email?.trim();
  if (!email) return null;

  const { data: match, error: matchError } = await db
    .from("leads")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", escapeLike(email))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (matchError) throw new Error(`lead lookup: ${matchError.message}`);

  const t = invitee.tracking ?? null;
  const attribution = await attributionFromUtms(db, orgId, {
    source: t?.utm_source,
    campaign: t?.utm_campaign,
    medium: t?.utm_medium,
    content: t?.utm_content,
  });

  if (match?.id) {
    // Someone who applied first already has a source. The booking only
    // fills what is still empty — where they first came from stands.
    await fillMissingAttribution(db, orgId, match.id as string, attribution);
    return match.id as string;
  }

  const { data: created, error: createError } = await db
    .from("leads")
    .insert({
      ...calendlyInviteeToLeadRow(orgId, invitee),
      source_content_id: attribution.source_content_id,
    })
    .select("id")
    .single();
  if (createError) throw new Error(`lead create: ${createError.message}`);
  return (created?.id as string | undefined) ?? null;
}
