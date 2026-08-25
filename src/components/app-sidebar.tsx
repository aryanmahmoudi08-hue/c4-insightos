import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  LayoutDashboard, Video, GitBranch, MessageSquare, PhoneCall, Users, BadgeCheck,
  TrendingUp, Sparkles, Settings, LogOut, Bell, Search, Brain, Activity, PhoneIncoming,
  ChevronDown, ChevronsLeft, ChevronsRight, Briefcase, UserPlus, Menu, X, Wand2, BookOpen, Layers, CalendarDays,
  ShieldCheck, Plug, Sun, Moon, Radar, Command, FileText, ClipboardCheck,
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
import { useTheme } from "@/hooks/use-theme";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { openCommandPalette } from "@/components/command-palette";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
  search?: Record<string, string>;
};

// MAIN — bare top items, no section header (unchanged shape from before the
// 7-section reorg; Sentinel/AI Insights joins Main Hub here since both are
// workspace-wide entry points, not tied to a single function).
const MAIN_NAV: NavItem[] = [
  { to: "/dashboard", label: "Main Hub", icon: LayoutDashboard },
  { to: "/insights", label: "C4 Sentinel", icon: Sparkles },
];

// Reps sub-group inside Sales
const REPS_NAV: NavItem[] = [
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", icon: PhoneCall },
];

// SALES — collapsible dropdown: Leads + EOD Reports + Reps sub-dropdown.
const SALES_NAV: NavItem[] = [
  { to: "/sales", label: "Sales CRM", icon: Briefcase },
  { to: "/leads", label: "Legacy Leads", icon: Users },
  { to: "/eod-reports", label: "EOD Reports", icon: ClipboardCheck },
];

// TEAM — flat section: roster/people/hiring, not revenue-pipeline tools.
const TEAM_NAV: NavItem[] = [
  { to: "/team", label: "Team Members", icon: Users },
  { to: "/team-calendar", label: "Team Calendars", icon: CalendarDays },
  { to: "/hiring", label: "Hiring", icon: UserPlus },
];

// Generate sub-dropdown inside CopyOS (nested inside Marketing)
const COPY_GENERATE_NAV: NavItem[] = [
  { to: "/copy", label: "Content", icon: Video, search: { tab: "generate", cat: "content" } },
  { to: "/copy", label: "Long-form", icon: BookOpen, search: { tab: "generate", cat: "long" } },
  { to: "/copy", label: "Email / SMS", icon: MessageSquare, search: { tab: "generate", cat: "email" } },
  { to: "/sequences", label: "Story Sequences", icon: Layers },
];

// CopyOS sub-dropdown inside Marketing (excluding the nested Generate)
const COPY_OS_NAV: NavItem[] = [
  { to: "/copy", label: "Review", icon: BadgeCheck, search: { tab: "review" } },
  { to: "/copy", label: "Angle Bank", icon: Sparkles, search: { tab: "angles" } },
  { to: "/copy", label: "Swipe Library", icon: Activity, search: { tab: "swipes" } },
  { to: "/copy", label: "Client DNA", icon: Users, search: { tab: "clients" } },
];

// MARKETING — collapsible dropdown: the client-facing content engine, the
// CopyOS generation suite, and every channel/attribution tool. ReachOS lands
// here later per its own project's explicit instruction.
const MARKETING_CONTENT_NAV: NavItem[] = [
  { to: "/content-calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/content", label: "Content Intelligence", icon: Video },
  { to: "/content-signals", label: "Content Signals", icon: Radar },
];
const MARKETING_CHANNELS_NAV: NavItem[] = [
  { to: "/vsl", label: "VSL Analytics", icon: Video },
  { to: "/attribution", label: "Attribution", icon: GitBranch },
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
  { to: "/outreach", label: "Messaging (Email & SMS)", icon: MessageSquare },
];

// CLIENTS — flat section: fulfillment/retention, not sales pipeline.
const CLIENTS_NAV: NavItem[] = [
  { to: "/clients", label: "Clients", icon: BadgeCheck },
  { to: "/onboarding", label: "Onboarding", icon: Brain },
  { to: "/fulfillment", label: "Client Results", icon: BadgeCheck },
];

// REPORTING — flat section: cross-cutting digests, not an operational tool.
const REPORTING_NAV: NavItem[] = [
  { to: "/weekly-report", label: "Weekly Report", icon: FileText },
];

// SYSTEM — flat section: webhook/event plumbing + admin-only integrations,
// alongside the existing always-visible Settings/Access control.
const SYSTEM_NAV: NavItem[] = [
  { to: "/events", label: "Event Bus", icon: Activity },
];

// Routes a non-manager (setter/closer) is allowed to see.
const RESTRICTED_ALLOW = new Set([
  "/dashboard", "/sales", "/leads", "/team", "/team-calendar", "/dm-setter", "/inbound-dialer", "/closer",
  "/eod-reports", "/clients", "/onboarding", "/fulfillment", "/vsl", "/content-calendar", "/settings",
]);

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  const { canManage, isAdmin } = useRole();
  const { theme, toggle } = useTheme();
  const { collapsed, setCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const filterByRole = (items: NavItem[]) =>
    canManage ? items : items.filter(it => RESTRICTED_ALLOW.has(it.to));

  const mainItems = filterByRole(MAIN_NAV);
  const repsItems = filterByRole(REPS_NAV);
  const salesItems = filterByRole(SALES_NAV);
  const teamItems = filterByRole(TEAM_NAV);
  const marketingContentItems = filterByRole(MARKETING_CONTENT_NAV);
  const marketingChannelsItems = filterByRole(MARKETING_CHANNELS_NAV);
  const copyItems = filterByRole(COPY_OS_NAV);
  const copyGenItems = filterByRole(COPY_GENERATE_NAV);
  const clientsItems = filterByRole(CLIENTS_NAV);
  const reportingItems = filterByRole(REPORTING_NAV);
  const systemItems = filterByRole(SYSTEM_NAV);

  const repsActive = repsItems.some(it => loc.pathname.startsWith(it.to));
  const salesActive = repsActive || salesItems.some(it => loc.pathname.startsWith(it.to));
  const copyActive = loc.pathname.startsWith("/copy");
  const generateActive = loc.pathname.startsWith("/copy");

  const [salesOpen, setSalesOpen] = useState(salesActive);
  const [repsOpen, setRepsOpen] = useState(repsActive);
  const [copyOpen, setCopyOpen] = useState(copyActive);
  const [genOpen, setGenOpen] = useState(generateActive);

  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  /** Expanding a section while the rail is collapsed un-collapses it first — collapsed
   *  mode trades hierarchy depth for space, so opening a section restores the depth. */
  const expandSection = (setter: (v: boolean) => void, next: boolean) => {
    if (collapsed && next) setCollapsed(false);
    setter(next);
  };

  const renderItem = (it: NavItem, nested = false, depth = 0) => {
    const searchObj = (loc.search ?? {}) as Record<string, unknown>;
    const matchesSearch = it.search
      ? Object.entries(it.search).every(([k, v]) => String(searchObj[k] ?? "") === v)
      : true;
    const pathActive = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
    const active = pathActive && matchesSearch;
    const Icon = it.icon;
    const pl = collapsed ? "px-2.5 justify-center" : depth === 0 ? "px-2.5" : depth === 1 ? "pl-8 pr-2.5" : "pl-14 pr-2.5";
    return (
      <Link
        key={`${it.to}-${it.label}`}
        to={it.to}
        search={it.search as never}
        onClick={closeMobile}
        title={collapsed ? it.label : undefined}
        className={cn(
          "group relative flex min-h-9 items-center gap-2.5 rounded-lg py-1.5 text-sm transition-all",
          pl,
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-white/[0.04]"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground hover:translate-x-[1px]",
          nested && depth >= 2 && "py-1",
        )}
      >
        {active && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_rgba(255,255,255,0.32)]"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        <Icon className={cn("shrink-0 transition-transform", depth >= 2 && !collapsed ? "h-3.5 w-3.5" : "h-4 w-4", active && "scale-105")} />
        {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
      </Link>
    );
  };

  const sectionBtn = (label: string, Icon: typeof LayoutDashboard, open: boolean, isActive: boolean, onClick: (next: boolean) => void, depth = 0) => (
    <button
      type="button"
      onClick={() => onClick(!open)}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex min-h-9 w-full items-center gap-2.5 rounded-lg py-2 text-sm transition-all",
        collapsed ? "px-2.5 justify-center" : depth === 0 ? "px-2.5" : "pl-8 pr-2.5 py-1.5",
        isActive ? "bg-sidebar-accent/30 text-sidebar-foreground" : "text-sidebar-foreground/65 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        </>
      )}
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="glass fixed top-3 left-3 z-40 md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md border shadow-md active:scale-95"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in-0 duration-200" onClick={closeMobile} aria-hidden />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-[color:var(--sidebar)]/98 backdrop-blur-xl shadow-lg transition-[transform,width] duration-200",
          collapsed ? "w-60 md:w-14" : "w-60",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-sidebar-border py-3.5", collapsed ? "px-2.5 justify-center" : "px-4")}>
          {/* Source PNG is white-on-transparent — invisible on light mode's
              near-white sidebar. .theme-logo (styles.css) inverts it under
              .light so it stays a real second theme, not just an inversion
              elsewhere with one asset silently breaking. */}
          <img src={c4Logo} alt="C4 Consulting" className="theme-logo h-9 w-9 shrink-0 object-contain" />
          {!collapsed && (
            <button type="button" className="group min-w-0 flex-1 text-left" title="Workspace">
              <div className="eyebrow truncate">C4 · Insight</div>
              <div className="display-serif truncate text-base text-sidebar-foreground">InsightOS</div>
              <div className="flex items-center gap-1 truncate text-3xs uppercase tracking-wider text-muted-foreground/80">
                {org?.organizations?.name ?? "Workspace"}
                <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60 transition-transform group-hover:translate-y-px" />
              </div>
            </button>
          )}
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
          {/* MAIN — bare, no section header (Main Hub + AI Insights/Sentinel) */}
          {mainItems.map(it => renderItem(it))}

          {/* SALES — Leads + EOD Reports + Reps sub-dropdown */}
          {(salesItems.length > 0 || repsItems.length > 0) && (
            <>
              {sectionBtn("Sales", Briefcase, salesOpen, salesActive, (next) => expandSection(setSalesOpen, next))}
              {salesOpen && !collapsed && (
                <div className="space-y-0.5">
                  {/* Sales CRM is the primary operating surface; Legacy Leads stays available below for a safe transition. */}
                  {salesItems.filter(it => it.to === "/sales").map(it => renderItem(it, true, 1))}
                  {/* Reps sub-dropdown */}
                  {repsItems.length > 0 && (
                    <>
                      {sectionBtn("Reps", Users, repsOpen, repsActive, (next) => expandSection(setRepsOpen, next), 1)}
                      {repsOpen && !collapsed && (
                        <div className="space-y-0.5">
                          {repsItems.map(it => renderItem(it, true, 2))}
                        </div>
                      )}
                    </>
                  )}
                  {/* Everything else */}
                  {salesItems.filter(it => it.to !== "/sales").map(it => renderItem(it, true, 1))}
                </div>
              )}
            </>
          )}

          {/* TEAM — roster/calendar/hiring */}
          {teamItems.length > 0 && (
            <>
              <div className={cn("mt-2 border-t border-sidebar-border/60 pt-3 pb-1 text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/50", collapsed ? "px-0 text-center" : "px-2.5")}>{collapsed ? "—" : "Team"}</div>
              {teamItems.map(it => renderItem(it))}
            </>
          )}

          {/* MARKETING — flat header, same pattern as Team/Clients/Reporting/
              System (a bordered, non-interactive label, not a collapsible
              button) so it reads as a co-equal top-level section instead of
              looking like it belongs to whichever section happens to sit
              above it. CopyOS stays its own nested sub-dropdown *within*
              this flat section — same relationship Reps has to Sales. */}
          {(marketingContentItems.length > 0 || copyItems.length > 0 || marketingChannelsItems.length > 0) && (
            <>
              <div className={cn("mt-2 border-t border-sidebar-border/60 pt-3 pb-1 text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/50", collapsed ? "px-0 text-center" : "px-2.5")}>{collapsed ? "—" : "Marketing"}</div>
              {marketingContentItems.map(it => renderItem(it))}
              {copyItems.length > 0 && (
                <>
                  {sectionBtn("CopyOS", Sparkles, copyOpen, copyActive, (next) => expandSection(setCopyOpen, next))}
                  {copyOpen && !collapsed && (
                    <div className="space-y-0.5">
                      {copyGenItems.length > 0 && (
                        <>
                          {sectionBtn("Generate", Wand2, genOpen, generateActive && !copyItems.some(it => {
                            const sObj = (loc.search ?? {}) as Record<string, unknown>;
                            return it.search ? Object.entries(it.search).every(([k, v]) => String(sObj[k] ?? "") === v) : false;
                          }), (next) => expandSection(setGenOpen, next), 1)}
                          {genOpen && (
                            <div className="space-y-0.5">
                              {copyGenItems.map(it => renderItem(it, true, 2))}
                            </div>
                          )}
                        </>
                      )}
                      {copyItems.map(it => renderItem(it, true, 1))}
                    </div>
                  )}
                </>
              )}
              {marketingChannelsItems.map(it => renderItem(it))}
            </>
          )}

          {/* CLIENTS — fulfillment/retention */}
          {clientsItems.length > 0 && (
            <>
              <div className={cn("mt-2 border-t border-sidebar-border/60 pt-3 pb-1 text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/50", collapsed ? "px-0 text-center" : "px-2.5")}>{collapsed ? "—" : "Clients"}</div>
              {clientsItems.map(it => renderItem(it))}
            </>
          )}

          {/* REPORTING — cross-cutting digests */}
          {reportingItems.length > 0 && (
            <>
              <div className={cn("mt-2 border-t border-sidebar-border/60 pt-3 pb-1 text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/50", collapsed ? "px-0 text-center" : "px-2.5")}>{collapsed ? "—" : "Reporting"}</div>
              {reportingItems.map(it => renderItem(it))}
            </>
          )}

          {/* SYSTEM — event/webhook plumbing + admin-only integrations + always-visible settings */}
          <div className={cn("mt-2 border-t border-sidebar-border/60 pt-3 pb-1 text-3xs font-bold uppercase tracking-[0.14em] text-muted-foreground/50", collapsed ? "px-0 text-center" : "px-2.5")}>{collapsed ? "—" : "System"}</div>
          {systemItems.map(it => renderItem(it))}
          {renderItem({ to: "/settings", label: "Settings", icon: Settings })}
          {isAdmin && renderItem({ to: "/permissions", label: "Access Control", icon: ShieldCheck })}
          {isAdmin && renderItem({ to: "/connectors", label: "Connectors", icon: Plug })}
        </nav>
        <div className="border-t border-sidebar-border p-2 space-y-1">
          <button
            type="button"
            onClick={openCommandPalette}
            title={collapsed ? "Search (⌘K)" : undefined}
            className={cn("flex min-h-9 w-full items-center gap-2 rounded-lg py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 transition-all", collapsed ? "justify-center px-2.5" : "px-2.5")}
          >
            <Command className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Search…</span>}
            {!collapsed && <span className="badge-glass text-3xs normal-case tracking-normal">⌘K</span>}
          </button>
          <Button variant="ghost" size="sm" className={cn("w-full text-sidebar-foreground/80 hover:bg-sidebar-accent/50", collapsed ? "justify-center px-0" : "justify-start gap-2")}
            onClick={toggle} title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}>
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
          </Button>
          <Button variant="ghost" size="sm" className={cn("w-full text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive", collapsed ? "justify-center px-0" : "justify-start gap-2")}
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/login" }); }} title={collapsed ? "Sign out" : undefined}>
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </Button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn("hidden md:flex w-full items-center gap-2 rounded-md py-1.5 text-2xs text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80 transition-all", collapsed ? "justify-center px-0" : "justify-start px-2.5")}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <><ChevronsLeft className="h-3.5 w-3.5" /> Collapse</>}
          </button>
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
    <div className="glass-header sticky top-8 z-20 border-b px-4 md:px-6 py-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 pl-10 md:pl-0">
          <div className="eyebrow">— Overview</div>
          <h1 className="display-serif text-xl md:text-2xl leading-none mt-1 truncate">{title}</h1>
          {subtitle && <p className="mt-1.5 text-xs text-muted-foreground hidden sm:block">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients, leads, content…"
              className="h-8 w-72 rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none transition-all hover:border-ring/30 focus:border-ring focus:ring-1 focus:ring-ring focus:bg-input/70" />
          </form>
          <Button variant="ghost" size="icon" className="relative h-8 w-8 hidden sm:inline-flex">
            <Bell className="h-4 w-4" />
          </Button>
          <ThemeToggle />
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex">
            <Link to="/settings" aria-label="Settings"><Settings className="h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
      {showDateRange && (
        <div className="mt-2.5">
          <DateRangePicker value={range} onChange={setRange} />
        </div>
      )}
      <div className="rule-gold mt-3 -mx-4 md:-mx-7" />
    </div>
  );
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
