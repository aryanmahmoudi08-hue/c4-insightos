import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Video, GitBranch, MessageSquare, PhoneCall, Users, BadgeCheck,
  TrendingUp, Sparkles, Settings, LogOut, Bell, Search, Brain, Activity, PhoneIncoming,
  ChevronDown, Briefcase, UserPlus, Menu, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import c4Logo from "@/assets/c4-logo.png";
import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/hooks/use-date-range";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; soon?: boolean };

const TOP_NAV: NavItem[] = [
  { to: "/dashboard", label: "Main Hub", icon: LayoutDashboard },
];

const MID_NAV: NavItem[] = [
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/content", label: "Content Tracker", icon: Video },
  { to: "/attribution", label: "Attribution", icon: GitBranch },
];

const SALES_TEAM: NavItem[] = [
  { to: "/team", label: "Team Members", icon: Users },
  { to: "/hiring", label: "Hiring", icon: UserPlus },
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", icon: PhoneCall },
];

const FULFILLMENT_NAV: NavItem[] = [
  { to: "/clients", label: "Clients", icon: BadgeCheck },
  { to: "/onboarding", label: "Onboarding", icon: Brain },
  { to: "/fulfillment", label: "Client Results", icon: BadgeCheck },
];

const BOTTOM_NAV: NavItem[] = [
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
  { to: "/insights", label: "AI Insights", icon: Sparkles },
  { to: "/events", label: "Event Bus", icon: Activity },
];

// Routes a non-manager (setter/closer) is allowed to see. Anything outside this
// list is hidden from the sidebar for those roles.
const RESTRICTED_ALLOW = new Set([
  "/dashboard", "/team", "/dm-setter", "/inbound-dialer", "/closer",
  "/clients", "/onboarding", "/fulfillment",
]);

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  const { canManage } = useRole();
  const filterByRole = (items: NavItem[]) =>
    canManage ? items : items.filter(it => RESTRICTED_ALLOW.has(it.to));
  const salesItems = filterByRole(SALES_TEAM);
  const midItems = filterByRole(MID_NAV);
  const fulfillmentItems = filterByRole(FULFILLMENT_NAV);
  const bottomItems = filterByRole(BOTTOM_NAV);
  const salesActive = salesItems.some(it => loc.pathname.startsWith(it.to));
  const [salesOpen, setSalesOpen] = useState(salesActive);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  const renderItem = (it: NavItem, nested = false) => {
    const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
    const Icon = it.icon;
    return (
      <Link
        key={it.to}
        to={it.to}
        onClick={closeMobile}
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
    <>
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-40 md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/90 backdrop-blur"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
      {/* Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-sidebar-border">
          <img src={c4Logo} alt="C4 Consulting" className="h-9 w-9 object-contain" />
          <div className="min-w-0 flex-1">
            <div className="eyebrow truncate">C4 · Insight</div>
            <div className="display-serif truncate text-base text-sidebar-foreground">InsightOS</div>
            <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground/80">{org?.organizations?.name ?? "Workspace"}</div>
          </div>
          <button
            type="button"
            onClick={closeMobile}
            className="md:hidden inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {TOP_NAV.map(it => renderItem(it))}

          {salesItems.length > 0 && (
            <>
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
                  {salesItems.map(it => renderItem(it, true))}
                </div>
              )}
            </>
          )}

          {midItems.map(it => renderItem(it))}
          {fulfillmentItems.length > 0 && (
            <>
              <div className="pt-2 pb-1 px-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">Fulfillment</div>
              {fulfillmentItems.map(it => renderItem(it))}
            </>
          )}
          {bottomItems.length > 0 && (
            <>
              <div className="pt-2 pb-1 px-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">Ops</div>
              {bottomItems.map(it => renderItem(it))}
            </>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-2">
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/80"
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </aside>
    </>
  );
}

export function TopBar({ title, subtitle, showDateRange = false }: { title: string; subtitle?: string; showDateRange?: boolean }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { range, setRange } = useDateRange();
  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    nav({ to: "/clients", search: { q: term } as never });
  };
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/70 px-4 md:px-6 py-4 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 pl-10 md:pl-0">
          <div className="eyebrow">— {subtitle ? "Dossier" : "Overview"}</div>
          <h1 className="display-serif text-xl md:text-[28px] leading-none mt-1 truncate">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs text-muted-foreground hidden sm:block">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, leads, content…"
              className="h-8 w-72 rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring" />
          </form>
          <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex"><Bell className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex"><Settings className="h-4 w-4" /></Button>
        </div>
      </div>
      {showDateRange && (
        <div className="mt-3">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      )}
      <div className="rule-gold mt-4 -mx-4 md:-mx-6" />
    </div>
  );
}
