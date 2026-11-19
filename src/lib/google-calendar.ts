/**
 * Google Calendar: "is the lead's invite accepted?", and colouring each
 * call's event by its confirmation status.
 *
 * Calendly writes each booking to the host's Google Calendar and invites the
 * lead. Google records the lead's answer on that event as the attendee's
 * `responseStatus` (needsAction / accepted / tentative / declined). With one
 * OAuth sign-in on that Google account, AscendOS reads it and treats
 * "accepted" as the call being confirmed.
 *
 * Calendly's API does not expose the Google event id, so a call is matched
 * to its event by start time (to the minute) and the lead's email among the
 * attendees. Pure helpers here; the network calls are in
 * google-calendar.server.ts.
 */

/** Read-write on events (not calendars or settings): AscendOS reads RSVPs
 *  and colours each call's event by its confirmation status. A workspace
 *  connected before colours shipped holds only the read-only scope until
 *  it reconnects; colouring is skipped for it (see canColourEvents). */
import { deriveOverallStatus } from "./call-confirmations";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

/**
 * A call's status as the Calls on Calendar view shows it: cancelled or
 * rescheduled first, then a confirmation (ticked in AscendOS, or the lead
 * accepting the invite), otherwise awaiting → overdue → at risk as the call
 * gets closer, from the workspace's confirmation policy.
 */
export function callEventStatus(
  call: {
    scheduled_for: string;
    cancelled?: boolean | null;
    status?: string | null;
    overall_status?: string | null;
    google_rsvp_status?: string | null;
  },
  policy: { overdueAfterHours: number; atRiskAfterHours: number },
  now: Date,
): keyof typeof STATUS_EVENT_COLOR {
  if (call.cancelled || call.status === "cancelled" || call.overall_status === "cancelled")
    return "cancelled";
  if (call.status === "rescheduled" || call.overall_status === "rescheduled") return "rescheduled";
  if (call.overall_status === "confirmed" || call.google_rsvp_status === "accepted")
    return "confirmed";
  return deriveOverallStatus("awaiting", call.scheduled_for, policy, now);
}

/** True when the granted scope string allows editing events. */
export function canColourEvents(grantedScope: string | null | undefined): boolean {
  return (grantedScope ?? "")
    .split(/\s+/)
    .some(
      (s) =>
        s === "https://www.googleapis.com/auth/calendar.events" ||
        s === "https://www.googleapis.com/auth/calendar",
    );
}

/**
 * Google's event colour ids, chosen to match the Calls on Calendar legend:
 * confirmed green (Basil), overdue red (Tomato), at risk orange
 * (Tangerine), rescheduled blue (Blueberry), awaiting and cancelled grey
 * (Graphite).
 */
export const STATUS_EVENT_COLOR: Record<
  "awaiting" | "confirmed" | "overdue" | "at_risk" | "cancelled" | "rescheduled",
  string
> = {
  confirmed: "10",
  awaiting: "8",
  overdue: "11",
  at_risk: "6",
  cancelled: "8",
  rescheduled: "9",
};

export function googleCalendarRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/oauth/google-calendar`;
}

export function buildGoogleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  // Offline + consent: Google only returns a refresh token on a fresh
  // consent, and without one the connection dies after an hour.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type GoogleEvent = {
  id?: string;
  status?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; responseStatus?: string; self?: boolean }>;
};

export type RsvpStatus = "accepted" | "declined" | "tentative" | "needsAction";

/**
 * The lead's response on the event for a call: the event starting in the
 * same minute as the call, with the lead among its attendees. Null when no
 * such event is found (not on this calendar, or the lead isn't invited).
 */
export function rsvpFor(
  events: GoogleEvent[],
  call: { scheduled_for: string; lead_email: string },
): { eventId: string | null; status: RsvpStatus } | null {
  const minute = (iso: string) => Math.floor(new Date(iso).getTime() / 60000);
  const target = minute(call.scheduled_for);
  const email = call.lead_email.trim().toLowerCase();
  for (const e of events) {
    if (e.status === "cancelled" || !e.start?.dateTime) continue;
    if (minute(e.start.dateTime) !== target) continue;
    const a = (e.attendees ?? []).find((x) => (x.email ?? "").trim().toLowerCase() === email);
    if (!a) continue;
    const s = a.responseStatus;
    const status: RsvpStatus =
      s === "accepted" || s === "declined" || s === "tentative" ? s : "needsAction";
    return { eventId: e.id ?? null, status };
  }
  return null;
}
