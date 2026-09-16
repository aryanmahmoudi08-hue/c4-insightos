import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { disableDevBypass } from "@/hooks/use-auth";
import ascendOsWhite from "@/assets/ascendos-stacked-white.png";
import ascendOsBlack from "@/assets/ascendos-stacked-black.png";

/**
 * Rendered by `_authenticated.tsx` in place of the app shell whenever a
 * request reaches the authed layout with a valid Supabase session but no
 * approved `memberships` row for that user — i.e. an account exists, but
 * no admin has approved it into a workspace yet. Signup (and Google OAuth)
 * no longer auto-provisions a membership (see
 * 20260910090000_close_self_service_workspace_provisioning.sql), so this is
 * the expected landing state for anyone who isn't yet authorized, not an
 * error page. It never renders `<Outlet/>`, so no authenticated route or
 * its data ever mounts for this user.
 */
export function AccessRequired({ email }: { email?: string | null }) {
  const signOut = async () => {
    disableDevBypass();
    await supabase.auth.signOut();
    window.location.href = "/welcome";
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Priority 9 — sized up in step with the sidebar/login placements. */}
        <Link to="/welcome" className="flex items-center justify-center gap-2">
          <img
            src={ascendOsWhite}
            alt="AscendOS"
            className="theme-logo-dark h-14 w-auto shrink-0 object-contain"
          />
          <img
            src={ascendOsBlack}
            alt="AscendOS"
            className="theme-logo-light h-14 w-auto shrink-0 object-contain"
          />
        </Link>
        <div className="flex flex-col items-center gap-3">
          <ShieldAlert className="h-8 w-8 text-amber-500" />
          <h1 className="text-2xl font-semibold">Access Required</h1>
          <p className="text-sm text-muted-foreground">
            Your account does not currently have access to AscendOS.
            {email ? (
              <>
                {" "}
                Signed in as <span className="font-medium text-foreground">{email}</span>.
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link to="/request-access">Request access</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Already requested? An admin needs to approve your membership before you can sign in.
        </p>
      </div>
    </div>
  );
}
