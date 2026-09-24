import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isOAuthStateUsable } from "@/lib/oauth";
import { exchangeMetaCodeForToken, exchangeMetaForLongLivedToken } from "@/lib/meta-oauth.server";

/**
 * Meta's OAuth callback. Unauthenticated by nature — the browser arrives here
 * straight from Meta — so the `state` nonce is the only thing proving this
 * response belongs to a request this app made, and it is checked before any
 * token exchange happens.
 */

/** Always land the user back in the UI. Errors are conveyed in the query
 * string rather than rendered here, so a failure can't leave someone staring
 * at raw JSON on a bare callback URL. */
function backToSettings(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

// connector_oauth_states/_tokens are new and not in the generated Supabase
// type snapshot yet — same cast the webinar tables already need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export const Route = createFileRoute("/api/public/oauth/meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        // Meta reports a declined consent screen here rather than by not
        // redirecting, so this is a normal outcome, not an exception.
        const providerError = url.searchParams.get("error");
        if (providerError) {
          const description =
            url.searchParams.get("error_description") ?? "Authorization was cancelled.";
          return backToSettings(origin, { meta: "error", reason: description });
        }

        if (!code || !state) {
          return backToSettings(origin, { meta: "error", reason: "Missing code or state." });
        }

        const { data: stateRow, error: stateError } = await admin
          .from("connector_oauth_states")
          .select("id, org_id, redirect_uri, expires_at, consumed_at")
          .eq("state", state)
          .eq("connector_id", "meta")
          .maybeSingle();
        if (stateError) {
          console.error("[meta-oauth] state lookup", stateError);
          return backToSettings(origin, { meta: "error", reason: "Could not verify the request." });
        }
        // An unknown state means this callback didn't originate here; a
        // consumed or expired one means it's a replay or a stale tab.
        if (!stateRow || !isOAuthStateUsable(stateRow)) {
          return backToSettings(origin, {
            meta: "error",
            reason: "This authorization link is no longer valid — start again from Connections.",
          });
        }

        // Burn the nonce before doing anything expensive, so two concurrent
        // callbacks with the same state can't both proceed.
        const { data: consumed, error: consumeError } = await admin
          .from("connector_oauth_states")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", stateRow.id)
          .is("consumed_at", null)
          .select("id")
          .maybeSingle();
        if (consumeError || !consumed) {
          return backToSettings(origin, {
            meta: "error",
            reason: "This authorization link was already used.",
          });
        }

        const appId = process.env["META_APP_ID"];
        const appSecret = process.env["META_APP_SECRET"];
        if (!appId || !appSecret) {
          return backToSettings(origin, {
            meta: "error",
            reason: "Meta is not configured on this deployment.",
          });
        }

        try {
          const shortLived = await exchangeMetaCodeForToken({
            code,
            appId,
            appSecret,
            // The exact URI the authorize call used — Meta rejects a mismatch,
            // and recomputing it here would let a proxy/host header change
            // silently break the exchange.
            redirectUri: stateRow.redirect_uri,
          });
          const longLived = await exchangeMetaForLongLivedToken({
            shortLivedToken: shortLived.accessToken,
            appId,
            appSecret,
          });

          const { error: tokenError } = await admin.from("connector_oauth_tokens").upsert(
            {
              org_id: stateRow.org_id,
              connector_id: "meta",
              access_token: longLived.accessToken,
              token_type: longLived.tokenType,
              expires_at: longLived.expiresAt,
              scope: "ads_read",
            },
            { onConflict: "org_id,connector_id" },
          );
          if (tokenError) throw new Error(tokenError.message);

          // Mark the connector connected so the Connections panel reflects it.
          // No token material goes into `config` — that column is readable by
          // every org member (see the connector_oauth migration).
          const { data: existing } = await admin
            .from("connector_connections")
            .select("id")
            .eq("org_id", stateRow.org_id)
            .eq("connector_id", "meta")
            .limit(1)
            .maybeSingle();
          if (existing?.id) {
            await supabaseAdmin
              .from("connector_connections")
              .update({ state: "connected", display_name: "Meta Ads" })
              .eq("id", existing.id);
          } else {
            await admin.from("connector_connections").insert({
              org_id: stateRow.org_id,
              connector_id: "meta",
              state: "connected",
              display_name: "Meta Ads",
              config: {},
            });
          }

          return backToSettings(origin, { meta: "connected" });
        } catch (e) {
          console.error("[meta-oauth] exchange", e);
          return backToSettings(origin, {
            meta: "error",
            reason: e instanceof Error ? e.message : "Token exchange failed.",
          });
        }
      },
    },
  },
});
