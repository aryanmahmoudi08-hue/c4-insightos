import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { DateRangeProvider } from "@/hooks/use-date-range";
import { SidebarCollapsedProvider, useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { LiveTicker } from "@/components/live-ticker";
import { CommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

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
      <SidebarCollapsedProvider>
        {/* Systemic prefers-reduced-motion gate (B5) — every `motion.*` component
            under here (sidebar's sliding indicator, command palette entrance,
            BentoGrid, future page work) automatically respects it without each
            one needing its own useReducedMotion() check. */}
        <MotionConfig reducedMotion="user">
          <AuthedShell />
        </MotionConfig>
      </SidebarCollapsedProvider>
    </DateRangeProvider>
  );
}

function AuthedShell() {
  const { collapsed } = useSidebarCollapsed();
  return (
    <div className="min-h-screen">
      <AppSidebar />
      <CommandPalette />
      <main className={cn("min-h-screen transition-[margin] duration-200", collapsed ? "ml-0 md:ml-14" : "ml-0 md:ml-60")}>
        <LiveTicker />
        <Outlet />
      </main>
    </div>
  );
}
