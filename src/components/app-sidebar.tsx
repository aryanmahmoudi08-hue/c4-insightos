import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  Video,
  GitBranch,
  MessageSquare,
  PhoneCall,
  Users,
  BadgeCheck,
  TrendingUp,
  Sparkles,
  Settings,
  LogOut,
  Bell,
  Search,
  Brain,
  Activity,
  PhoneIncoming,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  UserPlus,
  Menu,
  X,
  CalendarDays,
  ShieldCheck,
  Sun,
  Moon,
  Radar,
  Command,
  FileText,
  ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { ROLE_LABELS, type ManagedRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
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

// CORE — top-level workspace entry points.
const MAIN_NAV: NavItem[] = [{ to: "/dashboard", label: "Main Hub", icon: LayoutDashboard }];

// Reps sub-group inside Sales
const REPS_NAV: NavItem[] = [
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", icon: PhoneCall },
];

// SALES — collapsible dropdown: Legacy Leads + EOD Reports + Reps sub-dropdown.
const SALES_NAV: NavItem[] = [
  { to: "/leads", label: "Legacy Leads", icon: Users },
  { to: "/eod-reports", label: "EOD Reports", icon: ClipboardCheck },
];

// TEAM — flat section: roster/people/hiring, not revenue-pipeline tools.
const TEAM_NAV: NavItem[] = [
  { to: "/team", label: "Team Members", icon: Users },
  { to: "/team-calendar", label: "Team Calendars", icon: CalendarDays },
  { to: "/hiring", label: "Hiring", icon: UserPlus },
];

// Client DNA is the only retained CopyOS surface; copy creation remains external.
const COPY_OS_NAV: NavItem[] = [{ to: "/copy", label: "Client DNA", icon: Users }];

// MARKETING — content, attribution, analytics, and retained Client DNA.
const MARKETING_CONTENT_NAV: NavItem[] = [
  { to: "/content-calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/content", label: "Content Command Center", icon: Video },
  { to: "/content-signals", label: "Content Signals", icon: Radar },
];
const ANALYTICS_NAV: NavItem[] = [
  { to: "/vsl", label: "VSL Analytics", icon: Video },
  { to: "/webinar-analytics", label: "Webinar Analytics", icon: CalendarDays },
  { to: "/attribution", label: "Attribution", icon: GitBranch },
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
];
const MESSAGING_NAV: NavItem[] = [
  { to: "/outreach", label: "Messaging (Email & SMS)", icon: MessageSquare },
];

// CLIENTS — flat section: fulfillment/retention, not sales pipeline.
const CLIENTS_NAV: NavItem[] = [
  { to: "/clients", label: "Mentees & Renewals", icon: BadgeCheck },
  { to: "/onboarding", label: "Mentee Onboarding", icon: Brain },
  { to: "/fulfillment", label: "Mentee Results", icon: BadgeCheck },
];

// REPORTING — flat section: cross-cutting digests, not an operational tool.
const REPORTING_NAV: NavItem[] = [{ to: "/weekly-report", label: "Weekly Report", icon: FileText }];

// SYSTEM — retained internal event/audit surface; external connectors are managed outside InsightOS.
const SYSTEM_NAV: NavItem[] = [{ to: "/events", label: "Event Bus", icon: Activity }];

// Routes a non-manager (setter/closer) is allowed to see.
const RESTRICTED_ALLOW = new Set([
  "/dashboard",
  "/leads",
  "/team",
  "/team-calendar",
  "/dm-setter",
  "/inbound-dialer",
  "/closer",
  "/eod-reports",
  "/clients",
  "/onboarding",
  "/fulfillment",
  "/vsl",
  "/content-calendar",
  "/settings",
]);

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  const { canManage, isAdmin, role } = useRole();
  const { theme, toggle } = useTheme();
  const { collapsed, setCollapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const { user, devBypass } = useAuth();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;

  // Sidebar footer identity (spec: full name, role, and the workspace's
  // active offer). Dev bypass has no real Supabase session, so it gets an
  // honest local placeholder rather than a broken query — same convention
  // as every other interactive/identity surface in this app.
  const { data: identity } = useQuery({
    queryKey: ["sidebar-identity", user?.id, orgId, devBypass],
    enabled: !!user,
    queryFn: async () => {
      if (devBypass) return { displayName: "Dev User", offerName: null as string | null };
      const [{ data: profile }, { data: offer }] = await Promise.all([
        supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle(),
        orgId
          ? (supabase as any)
              .from("offers")
              .select("name")
              .eq("org_id", orgId)
              .eq("is_active", true)
              .order("created_at")
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return {
        displayName: profile?.display_name ?? user!.email?.split("@")[0] ?? "Account",
        offerName: (offer as { name?: string } | null)?.name ?? null,
      };
    },
  });
  const roleLabel = role
    ? (ROLE_LABELS[role as ManagedRole] ??
      role
        .split("_")
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" "))
    : "Member";
  const filterByRole = (items: NavItem[]) =>
    canManage ? items : items.filter((it) => RESTRICTED_ALLOW.has(it.to));

  const mainItems = filterByRole(MAIN_NAV);
  const repsItems = filterByRole(REPS_NAV);
  const salesItems = filterByRole(SALES_NAV);
  const teamItems = filterByRole(TEAM_NAV);
  const marketingContentItems = filterByRole(MARKETING_CONTENT_NAV);
  const analyticsItems = filterByRole(ANALYTICS_NAV);
  const messagingItems = filterByRole(MESSAGING_NAV);
  const copyItems = filterByRole(COPY_OS_NAV);
  const clientsItems = filterByRole(CLIENTS_NAV);
  const reportingItems = filterByRole(REPORTING_NAV);
  const systemItems = filterByRole(SYSTEM_NAV);

  const repsActive = repsItems.some((it) => loc.pathname.startsWith(it.to));
  const salesActive = repsActive || salesItems.some((it) => loc.pathname.startsWith(it.to));
  const copyActive = loc.pathname.startsWith("/copy") || loc.pathname.startsWith("/outreach");
  const clientsActive = clientsItems.some((it) => loc.pathname.startsWith(it.to));
  const contentActive = marketingContentItems.some((it) => loc.pathname.startsWith(it.to));
  const analyticsActive = analyticsItems.some((it) => loc.pathname.startsWith(it.to));
  const teamActive = teamItems.some((it) => loc.pathname.startsWith(it.to));
  const systemActive =
    systemItems.some((it) => loc.pathname.startsWith(it.to)) ||
    ["/settings", "/permissions"].some((path) => loc.pathname.startsWith(path));

  const [salesOpen, setSalesOpen] = useState(salesActive);
  const [repsOpen, setRepsOpen] = useState(repsActive);
  const [clientsOpen, setClientsOpen] = useState(clientsActive);
  const [contentOpen, setContentOpen] = useState(contentActive);
  const [analyticsOpen, setAnalyticsOpen] = useState(analyticsActive);
  const [teamOpen, setTeamOpen] = useState(teamActive);
  const [copyOpen, setCopyOpen] = useState(copyActive);
  const [systemOpen, setSystemOpen] = useState(systemActive);

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
    const pl = collapsed
      ? "px-2.5 justify-center"
      : depth === 0
        ? "px-2.5"
        : depth === 1
          ? "pl-8 pr-2.5"
          : "pl-14 pr-2.5";
    return (
      <Link
        key={`${it.to}-${it.label}`}
        to={it.to}
        search={it.search as never}
        onClick={closeMobile}
        title={collapsed ? it.label : undefined}
        className={cn(
          "group relative flex min-h-9 items-center gap-2.5 rounded-lg py-1.5 transition-all",
          nested ? "text-xs" : "text-sm",
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
        <Icon
          className={cn(
            "shrink-0 transition-transform",
            depth >= 2 && !collapsed ? "h-3.5 w-3.5" : "h-4 w-4",
            active && "scale-105",
          )}
        />
        {!collapsed && <span className="flex-1 truncate">{it.label}</span>}
      </Link>
    );
  };

  const sectionBtn = (
    label: string,
    Icon: typeof LayoutDashboard,
    open: boolean,
    isActive: boolean,
    onClick: (next: boolean) => void,
    depth = 0,
  ) => (
    <button
      type="button"
      onClick={() => onClick(!open)}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex min-h-9 w-full items-center gap-2.5 rounded-lg py-2 text-sm transition-all",
        collapsed ? "px-2.5 justify-center" : depth === 0 ? "px-2.5" : "pl-8 pr-2.5 py-1.5",
        isActive
          ? "bg-sidebar-accent/30 text-sidebar-foreground"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left truncate">{label}</span>
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-90")}
          />
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
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in-0 duration-200"
          onClick={closeMobile}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-[color:var(--sidebar)]/98 backdrop-blur-xl shadow-lg transition-[transform,width] duration-200",
          collapsed ? "w-60 md:w-14" : "w-60",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-sidebar-border py-3.5",
            collapsed ? "px-2.5 justify-center" : "px-4",
          )}
        >
          {/* Source PNG is white-on-transparent — invisible on light mode's
              near-white sidebar. .theme-logo (styles.css) inverts it under
              .light so it stays a real second theme, not just an inversion
              elsewhere with one asset silently breaking. */}
          <img
            src={c4Logo}
            alt="C4 Consulting"
            className="theme-logo h-9 w-9 shrink-0 object-contain"
          />
          {!collapsed && (
            <button type="button" className="group min-w-0 flex-1 text-left" title="Workspace">
              <div className="eyebrow truncate">C4 · Insight</div>
              <div className="display-serif truncate text-base text-sidebar-foreground">
                InsightOS
              </div>
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
        <nav className="flex flex-1 flex-col overflow-y-auto p-2 space-y-0.5">
          <div className="px-2.5 pb-1 pt-1 text-3xs font-bold uppercase tracking-[0.16em] text-muted-foreground/50">
            {!collapsed && "Core"}
          </div>
          {mainItems.map((it) => renderItem(it))}

          <div className="mt-3 border-t border-sidebar-border/60 px-2.5 pb-1 pt-3 text-3xs font-bold uppercase tracking-[0.16em] text-muted-foreground/50">
            {!collapsed && "Sales & Clients"}
          </div>
          {salesItems.length > 0 && (
            <>
              {sectionBtn("Sales", Users, salesOpen, salesActive, (next) =>
                expandSection(setSalesOpen, next),
              )}
              {salesOpen && !collapsed && (
                <div className="space-y-0.5">
                  {salesItems.map((it) => renderItem(it, true, 1))}
                  {repsItems.length > 0 && (
                    <>
                      {sectionBtn(
                        "Reps",
                        Users,
                        repsOpen,
                        repsActive,
                        (next) => expandSection(setRepsOpen, next),
                        1,
                      )}
                      {repsOpen && (
                        <div className="space-y-0.5">
                          {repsItems.map((it) => renderItem(it, true, 2))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          {clientsItems.length > 0 && (
            <>
              {sectionBtn("Mentees", Users, clientsOpen, clientsActive, (next) =>
                expandSection(setClientsOpen, next),
              )}
              {clientsOpen && !collapsed && (
                <div className="space-y-0.5">
                  {clientsItems.map((it) => renderItem(it, true, 1))}
                </div>
              )}
            </>
          )}
          {teamItems.length > 0 && (
            <>
              {sectionBtn("Team", Users, teamOpen, teamActive, (next) =>
                expandSection(setTeamOpen, next),
              )}
              {teamOpen && !collapsed && (
                <div className="space-y-0.5">{teamItems.map((it) => renderItem(it, true, 1))}</div>
              )}
            </>
          )}

          <div className="mt-3 border-t border-sidebar-border/60 px-2.5 pb-1 pt-3 text-3xs font-bold uppercase tracking-[0.16em] text-muted-foreground/50">
            {!collapsed && "Marketing"}
          </div>
          {marketingContentItems.length > 0 && (
            <>
              {sectionBtn("Content", Video, contentOpen, contentActive, (next) =>
                expandSection(setContentOpen, next),
              )}
              {contentOpen && !collapsed && (
                <div className="space-y-0.5">
                  {marketingContentItems.map((it) => renderItem(it, true, 1))}
                </div>
              )}
            </>
          )}
          {analyticsItems.length > 0 && (
            <>
              {sectionBtn(
                "Analytics & Attribution",
                TrendingUp,
                analyticsOpen,
                analyticsActive,
                (next) => expandSection(setAnalyticsOpen, next),
              )}
              {analyticsOpen && !collapsed && (
                <div className="space-y-0.5">
                  {analyticsItems.map((it) => renderItem(it, true, 1))}
                </div>
              )}
            </>
          )}
          {copyItems.length > 0 && (
            <>
              {sectionBtn("Client DNA", Users, copyOpen, copyActive, (next) =>
                expandSection(setCopyOpen, next),
              )}
              {copyOpen && !collapsed && (
                <div className="space-y-0.5">
                  {copyItems.map((it) => renderItem(it, true, 1))}
                  {messagingItems.map((it) => renderItem(it, true, 1))}
                </div>
              )}
            </>
          )}

          <div className="mt-3 border-t border-sidebar-border/60 px-2.5 pb-1 pt-3 text-3xs font-bold uppercase tracking-[0.16em] text-muted-foreground/50">
            {!collapsed && "Reporting"}
          </div>
          {reportingItems.map((it) => renderItem(it))}

          <div className="mt-auto pt-3">
            {sectionBtn("System", Settings, systemOpen, systemActive, (next) =>
              expandSection(setSystemOpen, next),
            )}
            {systemOpen && !collapsed && (
              <div className="space-y-0.5">
                {systemItems.map((it) => renderItem(it, true, 1))}
                {renderItem({ to: "/settings", label: "Settings", icon: Settings }, true, 1)}
                {isAdmin &&
                  renderItem(
                    { to: "/permissions", label: "Access Control", icon: ShieldCheck },
                    true,
                    1,
                  )}
              </div>
            )}
          </div>
        </nav>
        {identity && (
          <Link
            to="/settings"
            className={cn(
              "mx-2 flex items-center gap-2 rounded-lg border-t border-sidebar-border py-2.5 text-left hover:bg-sidebar-accent/40",
              collapsed ? "justify-center px-0" : "px-1",
            )}
            title={collapsed ? `${identity.displayName} · ${roleLabel}` : undefined}
          >
            <AvatarInitials name={identity.displayName} size="sm" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-sidebar-foreground">
                  {identity.displayName}
                </div>
                <div className="truncate text-3xs text-muted-foreground">
                  {roleLabel}
                  {identity.offerName ? ` · ${identity.offerName}` : ""}
                </div>
              </div>
            )}
          </Link>
        )}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          <button
            type="button"
            onClick={openCommandPalette}
            title={collapsed ? "Search (⌘K)" : undefined}
            className={cn(
              "flex min-h-9 w-full items-center gap-2 rounded-lg py-1.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 transition-all",
              collapsed ? "justify-center px-2.5" : "px-2.5",
            )}
          >
            <Command className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Search…</span>}
            {!collapsed && (
              <span className="badge-glass text-3xs normal-case tracking-normal">⌘K</span>
            )}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
              collapsed ? "justify-center px-0" : "justify-start gap-2",
            )}
            onClick={toggle}
            title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && (theme === "dark" ? "Light mode" : "Dark mode")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive",
              collapsed ? "justify-center px-0" : "justify-start gap-2",
            )}
            onClick={async () => {
              await supabase.auth.signOut();
              nav({ to: "/login" });
            }}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign out"}
          </Button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "hidden md:flex w-full items-center gap-2 rounded-md py-1.5 text-2xs text-sidebar-foreground/50 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80 transition-all",
              collapsed ? "justify-center px-0" : "justify-start px-2.5",
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <ChevronsLeft className="h-3.5 w-3.5" /> Collapse
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

export function TopBar({
  title,
  subtitle,
  showDateRange = false,
}: {
  title: string;
  subtitle?: string;
  showDateRange?: boolean;
}) {
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
          {subtitle && (
            <p className="mt-1.5 text-xs text-muted-foreground hidden sm:block">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground transition-colors" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search clients, leads, content…"
              className="h-8 w-72 rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none transition-all hover:border-ring/30 focus:border-ring focus:ring-1 focus:ring-ring focus:bg-input/70"
            />
          </form>
          <Button variant="ghost" size="icon" className="relative h-8 w-8 hidden sm:inline-flex">
            <Bell className="h-4 w-4" />
          </Button>
          <ThemeToggle />
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 hidden sm:inline-flex">
            <Link to="/settings" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Link>
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
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
