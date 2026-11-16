import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function orgOf(supabase: unknown, userId: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("No workspace — access not yet approved");
  return data.org_id as string;
}

/** Starts Google's consent flow for the calendar Calendly writes to. Same
 *  state-nonce pattern as Meta (meta-oauth.functions.ts). */
export const startGoogleCalendarOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { generateOAuthState, oauthStateExpiry } = await import("./oauth");
    const { buildGoogleAuthorizeUrl, googleCalendarRedirectUri } =
      await import("./google-calendar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const clientId = process.env["GOOGLE_CLIENT_ID"];
    if (!clientId || !process.env["GOOGLE_CLIENT_SECRET"]) {
      throw new Error(
        "Google Calendar is not configured on this deployment — GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set first.",
      );
    }
    const orgId = await orgOf(supabase, userId);
    const request = getRequest();
    const origin = request ? new URL(request.url).origin : "";
    if (!origin) throw new Error("Could not resolve this app's origin for the redirect URI.");
    const redirectUri = googleCalendarRedirectUri(origin);
    const state = generateOAuthState();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any).from("connector_oauth_states").insert({
      org_id: orgId,
      connector_id: "google_calendar",
      state,
      redirect_uri: redirectUri,
      created_by: userId,
      expires_at: oauthStateExpiry(),
    });
    if (error) throw new Error(error.message);
    return { authorizeUrl: buildGoogleAuthorizeUrl({ clientId, redirectUri, state }) };
  });

export const googleCalendarStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const orgId = await orgOf(supabase, userId);
    const { googleConnection, googleConfigured } = await import("./google-calendar.server");
    return { ...(await googleConnection(orgId)), configured: googleConfigured() };
  });
