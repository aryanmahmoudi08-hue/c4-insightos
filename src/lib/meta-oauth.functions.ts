import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Starts Meta's authorization-code flow. Returns a URL for the browser to
 * visit — the caller navigates, Meta redirects back to the callback route.
 *
 * The CSRF nonce is minted and persisted here, server-side, so the callback
 * can prove the response belongs to a request this app actually made.
 */
export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { generateOAuthState, oauthStateExpiry, buildMetaAuthorizeUrl, metaRedirectUri } =
      await import("./oauth");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const appId = process.env["META_APP_ID"];
    if (!appId) {
      throw new Error(
        "Meta is not configured on this deployment — META_APP_ID and META_APP_SECRET must be set before connecting.",
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    const orgId = membership?.org_id as string | undefined;
    if (!orgId) throw new Error("No workspace — access not yet approved");

    const request = getRequest();
    const origin = request ? new URL(request.url).origin : "";
    if (!origin) throw new Error("Could not resolve this app's origin for the redirect URI.");
    const redirectUri = metaRedirectUri(origin);

    const state = generateOAuthState();
    // Written with the service-role client: connector_oauth_states is
    // deliberately unreadable by `authenticated` (see its migration).
    // Not in the generated type snapshot yet — same cast used elsewhere.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insertError } = await (supabaseAdmin as any)
      .from("connector_oauth_states")
      .insert({
        org_id: orgId,
        connector_id: "meta",
        state,
        redirect_uri: redirectUri,
        created_by: userId,
        expires_at: oauthStateExpiry(),
      });
    if (insertError) throw new Error(insertError.message);

    return { authorizeUrl: buildMetaAuthorizeUrl({ appId, redirectUri, state }) };
  });
