import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AccessRequired } from "@/components/access-required";
import { DateRangeProvider } from "@/hooks/use-date-range";
import { DisplayCurrencyProvider } from "@/hooks/use-display-currency";
import { DisplayTimezoneProvider } from "@/hooks/use-display-timezone";
import { DemoModeProvider } from "@/hooks/use-demo-mode";
import { SidebarCollapsedProvider, useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { LiveTicker } from "@/components/live-ticker";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({ component: AuthedLayout });

function AuthedLayout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/welcome" });
  }, [loading, user, nav]);

  // Server-side access gate: a valid Supabase session alone is not enough
  // to reach the app shell — the user also needs an approved `memberships`
  // row (see ensureWorkspaceForUser, which no longer auto-creates one).
  // `useCurrentOrg()` is only `enabled` once `user` exists, so this never
  // fires for a signed-out visitor; devBypass always resolves to the fixed
  // DEV_BYPASS_ORG and is unaffected.
  const orgQuery = useCurrentOrg();

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (orgQuery.isPending) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  if (orgQuery.isError || !orgQuery.data?.org_id) {
    return <AccessRequired email={user.email} />;
  }

  return (
    <DateRangeProvider>
      <DisplayCurrencyProvider>
        <DisplayTimezoneProvider>
          <DemoModeProvider>
            <SidebarCollapsedProvider>
              {/* Systemic prefers-reduced-motion gate (B5) — every `motion.*` component
                under here (sidebar's sliding indicator, command palette entrance,
                BentoGrid, future page work) automatically respects it without each
                one needing its own useReducedMotion() check. */}
              <MotionConfig reducedMotion="user">
                <AuthedShell />
              </MotionConfig>
            </SidebarCollapsedProvider>
          </DemoModeProvider>
        </DisplayTimezoneProvider>
      </DisplayCurrencyProvider>
    </DateRangeProvider>
  );
}

function AuthedShell() {
  const { collapsed } = useSidebarCollapsed();
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <CommandPalette />
      <main
        className={cn(
          "relative min-h-screen overflow-x-clip transition-[margin] duration-200",
          collapsed ? "ml-0 md:ml-14" : "ml-0 md:ml-60",
        )}
      >
        <LiveTicker />
        <Outlet />
      </main>
    </div>
  );
}
