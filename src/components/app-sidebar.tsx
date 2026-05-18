import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Video, GitBranch, MessageSquare, PhoneCall, Users, BadgeCheck,
  TrendingUp, Sparkles, Plug, Settings, LogOut, Bell, Search, Brain, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; soon?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Executive", icon: LayoutDashboard },
  { to: "/content", label: "Content Intel", icon: Video },
  { to: "/attribution", label: "Attribution", icon: GitBranch },
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/closer", label: "Closer", icon: PhoneCall },
  { to: "/clients", label: "Clients", icon: BadgeCheck },
  { to: "/onboarding", label: "Onboarding", icon: Brain },
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
  { to: "/team", label: "Team", icon: Users },
  { to: "/insights", label: "AI Insights", icon: Sparkles },
  { to: "/events", label: "Event Bus", icon: Activity },
  { to: "/connectors", label: "Connectors", icon: Plug },
];

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
        <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent font-mono text-sm font-bold text-primary-foreground">C4</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-sidebar-foreground">InsightOS</div>
          <div className="truncate text-[11px] text-muted-foreground">{org?.organizations?.name ?? "Workspace"}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV.map((it) => {
          const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{it.label}</span>
              {it.soon && <span className="rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">soon</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/80"
          onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}

export function TopBar({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input placeholder="Search leads, content, clients…"
            className="h-8 w-72 rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Bell className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8"><Settings className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
