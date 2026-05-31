import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { DateRangeProvider } from "@/hooks/use-date-range";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

function AuthedLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [loading, user, nav]);
  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">Loading workspace…</div>;
  }
  return (
    <DateRangeProvider>
      <div className="min-h-screen">
        <AppSidebar />
        <main className="ml-0 md:ml-60 min-h-screen">
          <Outlet />
        </main>
      </div>
    </DateRangeProvider>
  );
}
