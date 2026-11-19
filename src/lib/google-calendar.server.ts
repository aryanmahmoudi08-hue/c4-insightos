/**
 * Google Calendar network calls: token exchange and refresh, and listing the
 * connected calendar's events. Tokens live in connector_oauth_tokens, which
 * only the service role can read (see its migration).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GoogleEvent } from "./google-calendar";

// connector_oauth_tokens is not in the generated type snapshot.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function credentials() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function googleConfigured(): boolean {
  return credentials() != null;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || `Google token request failed (${res.status})`,
    );
  }
  return json;
}

/** The Google account's email, from the id_token's payload (not verified:
 *  it came straight from Google's token endpoint over TLS, and is shown only
 *  as a label). */
function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const part = idToken?.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(
      Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof json.email === "string" ? json.email : null;
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(orgId: string, code: string, redirectUri: string) {
  const c = credentials();
  if (!c) throw new Error("Google Calendar is not configured on this deployment.");
  const t = await tokenRequest({
    code,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const { error } = await admin.from("connector_oauth_tokens").upsert(
    {
      org_id: orgId,
      connector_id: "google_calendar",
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      token_type: t.token_type ?? "Bearer",
      expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
      scope: t.scope ?? null,
      external_account_id: emailFromIdToken(t.id_token),
    },
    { onConflict: "org_id,connector_id" },
  );
  if (error) throw new Error(error.message);
}

/** A usable access token, refreshed when within five minutes of expiry.
 *  Null when the workspace hasn't connected Google Calendar. */
export async function googleAccessToken(orgId: string): Promise<string | null> {
  const { data: row } = await admin
    .from("connector_oauth_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("org_id", orgId)
    .eq("connector_id", "google_calendar")
    .maybeSingle();
  if (!row?.access_token) return null;
  const fresh = row.expires_at && new Date(row.expires_at).getTime() - Date.now() > 5 * 60 * 1000;
  if (fresh) return row.access_token as string;
  const c = credentials();
  if (!c || !row.refresh_token) return null;
  const t = await tokenRequest({
    refresh_token: row.refresh_token,
    client_id: c.clientId,
    client_secret: c.clientSecret,
    grant_type: "refresh_token",
  });
  await admin
    .from("connector_oauth_tokens")
    .update({
      access_token: t.access_token,
      expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("org_id", orgId)
    .eq("connector_id", "google_calendar");
  return t.access_token as string;
}

export async function googleConnection(
  orgId: string,
): Promise<{ connected: boolean; account: string | null }> {
  const { data } = await admin
    .from("connector_oauth_tokens")
    .select("external_account_id")
    .eq("org_id", orgId)
    .eq("connector_id", "google_calendar")
    .maybeSingle();
  return { connected: !!data, account: (data?.external_account_id as string | null) ?? null };
}

/** The scope the workspace's Google sign-in actually granted. */
export async function googleGrantedScope(orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("connector_oauth_tokens")
    .select("scope")
    .eq("org_id", orgId)
    .eq("connector_id", "google_calendar")
    .maybeSingle();
  return (data?.scope as string | null) ?? null;
}

/** Set one event's colour on the primary calendar. Only the colour is sent,
 *  and attendees are not notified. */
export async function setGoogleEventColor(
  accessToken: string,
  eventId: string,
  colorId: string,
): Promise<void> {
  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
  );
  url.searchParams.set("sendUpdates", "none");
  const res = await fetch(url, {
    method: "PATCH",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ colorId }),
  });
  if (!res.ok) throw new Error(`Google Calendar colour ${res.status}`);
}

/** The primary calendar's events between two instants, recurring ones
 *  expanded. Paged until done (a few days of calls is one page). */
export async function listGoogleEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleEvent[]> {
  const out: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Google Calendar events ${res.status}`);
    const json = (await res.json()) as { items?: GoogleEvent[]; nextPageToken?: string };
    out.push(...(json.items ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}
