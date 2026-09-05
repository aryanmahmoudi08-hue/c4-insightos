import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({ component: RootRedirect });

/** "/" itself has no content of its own — it just sends visitors to the
 * right place: signed-in users go straight into the app, everyone else
 * lands on the public /welcome page. */
function RootRedirect() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    nav({ to: user ? "/dashboard" : "/welcome", replace: true });
  }, [loading, user, nav]);

  return (
    <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
