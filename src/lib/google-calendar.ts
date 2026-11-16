/**
 * Google Calendar, read-only: "is the lead's invite accepted?"
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

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "openid",
  "email",
];

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
