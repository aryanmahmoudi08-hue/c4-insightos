import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Video, GitBranch, MessageSquare, PhoneCall, Users, BadgeCheck,
  TrendingUp, Sparkles, Plug, Settings, LogOut, Bell, Search, Brain, Activity, PhoneIncoming,
  ChevronDown, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import c4Logo from "@/assets/c4-logo.png";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; soon?: boolean };

const TOP_NAV: NavItem[] = [
  { to: "/dashboard", label: "Executive", icon: LayoutDashboard },
  { to: "/content", label: "Content Intel", icon: Video },
  { to: "/attribution", label: "Attribution", icon: GitBranch },
];

const SALES_TEAM: NavItem[] = [
  { to: "/team", label: "Team Members", icon: Users },
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", icon: PhoneCall },
];

const BOTTOM_NAV: NavItem[] = [
  { to: "/clients", label: "Clients", icon: BadgeCheck },
  { to: "/onboarding", label: "Onboarding", icon: Brain },
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
  { to: "/insights", label: "AI Insights", icon: Sparkles },
  { to: "/events", label: "Event Bus", icon: Activity },
  { to: "/connectors", label: "Connectors", icon: Plug },
];

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  const salesActive = SALES_TEAM.some(it => loc.pathname.startsWith(it.to));
  const [salesOpen, setSalesOpen] = useState(salesActive);

  const renderItem = (it: NavItem, nested = false) => {
    const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
    const Icon = it.icon;
    return (
      <Link
        key={it.to}
        to={it.to}
        className={cn(
          "group flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors",
          nested ? "pl-8 pr-2.5" : "px-2.5",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{it.label}</span>
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
        <img src={c4Logo} alt="C4 Consulting" className="h-9 w-9 object-contain" />
        <div className="min-w-0">
          <div className="eyebrow truncate">C4 · Insight</div>
          <div className="display-serif truncate text-base text-sidebar-foreground">InsightOS</div>
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/80">{org?.organizations?.name ?? "Workspace"}</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {TOP_NAV.map(it => renderItem(it))}

        <button
          type="button"
          onClick={() => setSalesOpen(o => !o)}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
            salesActive
              ? "text-sidebar-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left truncate">Sales Tracking</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", salesOpen && "rotate-180")} />
        </button>
        {salesOpen && (
          <div className="space-y-0.5">
            {SALES_TEAM.map(it => renderItem(it, true))}
          </div>
        )}

        {BOTTOM_NAV.map(it => renderItem(it))}
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
    <div className="sticky top-0 z-20 border-b border-border bg-background/70 px-6 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">— {subtitle ? "Dossier" : "Overview"}</div>
          <h1 className="display-serif text-2xl md:text-[28px] leading-none mt-1">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs text-muted-foreground">{subtitle}</p>}
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
      <div className="rule-gold mt-4 -mx-6" />
    </div>
  );
}
