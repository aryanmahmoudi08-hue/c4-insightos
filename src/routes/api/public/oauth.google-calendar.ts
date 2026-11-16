import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isOAuthStateUsable } from "@/lib/oauth";
import { exchangeGoogleCode } from "@/lib/google-calendar.server";

/**
 * Google's OAuth callback for Google Calendar. Unauthenticated by nature, so
 * the single-use state nonce is the only proof the response belongs to a
 * request this app made (same flow as oauth.meta.ts).
 */
function backToSettings(origin: string, params: Record<string, string>) {
  const url = new URL("/settings", origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

export const Route = createFileRoute("/api/public/oauth/google-calendar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const providerError = url.searchParams.get("error");
        if (providerError)
          return backToSettings(origin, { google: "error", reason: providerError });
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (!code || !state)
          return backToSettings(origin, { google: "error", reason: "Missing code or state." });

        const { data: stateRow } = await admin
          .from("connector_oauth_states")
          .select("id, org_id, redirect_uri, expires_at, consumed_at")
          .eq("state", state)
          .eq("connector_id", "google_calendar")
          .maybeSingle();
        if (!stateRow || !isOAuthStateUsable(stateRow)) {
          return backToSettings(origin, {
            google: "error",
            reason: "This authorization link is no longer valid — start again from Settings.",
          });
        }
        const { data: consumed } = await admin
          .from("connector_oauth_states")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", stateRow.id)
          .is("consumed_at", null)
          .select("id")
          .maybeSingle();
        if (!consumed) {
          return backToSettings(origin, {
            google: "error",
            reason: "This authorization link was already used.",
          });
        }

        try {
          await exchangeGoogleCode(stateRow.org_id, code, stateRow.redirect_uri);
          return backToSettings(origin, { google: "connected" });
        } catch (err) {
          console.error("[google-calendar-oauth]", err);
          return backToSettings(origin, {
            google: "error",
            reason: "Google sign-in failed — try again.",
          });
        }
      },
    },
  },
});
