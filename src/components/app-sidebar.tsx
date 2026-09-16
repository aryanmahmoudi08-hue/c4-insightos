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
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg, disableDevBypass } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { ROLE_LABELS, type ManagedRole } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useRef, useState } from "react";
import ascendOsStackedWhite from "@/assets/ascendos-stacked-white.png";
import ascendOsStackedBlack from "@/assets/ascendos-stacked-black.png";
import ascendOsInlineWhite from "@/assets/ascendos-inline-white.png";
import ascendOsInlineBlack from "@/assets/ascendos-inline-black.png";
import { DateRangePicker } from "@/components/date-range-picker";
import { useDateRange } from "@/hooks/use-date-range";
import { useTheme } from "@/hooks/use-theme";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { useDisplayCurrency } from "@/hooks/use-display-currency";
import { DISPLAY_CURRENCIES } from "@/lib/currency";
import { openCommandPalette } from "@/components/command-palette";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  soon?: boolean;
  search?: Record<string, string>;
};

// Seven primary rail categories (the category selector) — each maps to a
// flat list of existing routes (the actual route selector, rendered in the
// secondary panel). Regrouped from the app's real IA: Rep Dash split out of
// Sales (sales-process/pipeline vs. individual rep execution dashboards are
// a real distinction worth its own top-level category), Client DNA +
// Messaging folded into Content, Traffic + Weekly Report folded into
// Analytics. No route added, removed, or renamed — only which category it's
// filed under changed.
const MAIN_NAV: NavItem[] = [{ to: "/dashboard", label: "Main Hub", icon: LayoutDashboard }];

const SALES_NAV: NavItem[] = [
  { to: "/leads", label: "Legacy Leads", icon: Users },
  { to: "/eod-reports", label: "EOD Reports", icon: ClipboardCheck },
];

const REPDASH_NAV: NavItem[] = [
  { to: "/dm-setter", label: "DM Setter", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", icon: PhoneCall },
];

const TEAM_NAV: NavItem[] = [
  { to: "/team", label: "Team Members", icon: Users },
  { to: "/team-calendar", label: "Team Calendars", icon: CalendarDays },
  { to: "/hiring", label: "Hiring", icon: UserPlus },
];

const MENTEES_NAV: NavItem[] = [
  { to: "/clients", label: "Mentees & Renewals", icon: BadgeCheck },
  { to: "/onboarding", label: "Mentee Onboarding", icon: Brain },
  { to: "/fulfillment", label: "Mentee Results", icon: BadgeCheck },
];

// Messaging (Email & SMS) intentionally deferred — its nav entry was
// removed from here (used to point at /outreach). The route/component are
// preserved, not deleted; see src/deferred-features/outreach-route.tsx.deferred.
const CONTENT_NAV: NavItem[] = [
  { to: "/content-calendar", label: "Content Calendar", icon: CalendarDays },
  { to: "/content", label: "Content Command Center", icon: Video },
  { to: "/content-signals", label: "Content Signals", icon: Radar },
];

// CLIENT DNA — pulled out of Content (it's client profile/offer data, not a
// content-production surface) into its own rail icon, same treatment as
// System: not one of the seven primary categories, so it lives in the
// utility footer instead.
const CLIENT_DNA_NAV: NavItem[] = [{ to: "/copy", label: "Client DNA", icon: Sparkles }];

const ANALYTICS_NAV: NavItem[] = [
  { to: "/attribution", label: "Attribution", icon: GitBranch },
  { to: "/vsl", label: "VSL Analytics", icon: Video },
  { to: "/webinar-analytics", label: "Webinar Analytics", icon: CalendarDays },
  { to: "/traffic", label: "Traffic", icon: TrendingUp },
  { to: "/weekly-report", label: "Weekly Report", icon: FileText },
];

// SYSTEM — deliberately not one of the seven primary categories (admin/
// account routes don't fit any of them), so it lives as its own rail icon
// down in the utility footer instead of the primary category list.
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
  const navigate = useNavigate();
  const { data: org } = useCurrentOrg();
  const { canManage, isAdmin, role } = useRole();
  const { demoMode, setDemoMode } = useDemoMode();
  const { theme, toggle } = useTheme();
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
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
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any -- "offers" isn't in the generated Supabase types yet
            (supabase as any)
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

  // The seven primary rail categories — each a category button in the rail
  // plus the flat item list it reveals in the secondary panel. System is
  // deliberately excluded from this list (see SYSTEM_NAV above) and handled
  // separately as an eighth, visually-secondary rail icon.
  const categories = [
    { key: "main", label: "Main", icon: LayoutDashboard, items: filterByRole(MAIN_NAV) },
    { key: "sales", label: "Sales", icon: Users, items: filterByRole(SALES_NAV) },
    { key: "repdash", label: "Rep Dash", icon: PhoneCall, items: filterByRole(REPDASH_NAV) },
    { key: "team", label: "Team", icon: UserPlus, items: filterByRole(TEAM_NAV) },
    { key: "mentees", label: "Mentees", icon: BadgeCheck, items: filterByRole(MENTEES_NAV) },
    { key: "content", label: "Content", icon: Video, items: filterByRole(CONTENT_NAV) },
    { key: "analytics", label: "Analytics", icon: TrendingUp, items: filterByRole(ANALYTICS_NAV) },
  ].filter((c) => c.items.length > 0);

  // Utility-footer categories — not among the seven primary rail categories,
  // but still real category selectors with their own panel content. Client
  // DNA lives here rather than nested in Content (it's client profile/offer
  // data, not a content-production surface); System lives here because
  // admin/account routes don't fit any of the seven primary categories.
  const extraCategories = [
    {
      key: "clientdna",
      label: "Client DNA",
      icon: Sparkles,
      items: filterByRole(CLIENT_DNA_NAV),
    },
    {
      key: "system",
      label: "System",
      icon: Settings,
      items: filterByRole([
        ...SYSTEM_NAV,
        { to: "/settings", label: "Settings", icon: Settings },
        ...(isAdmin ? [{ to: "/permissions", label: "Access Control", icon: ShieldCheck }] : []),
      ]),
    },
  ].filter((c) => c.items.length > 0);

  // Which category the CURRENT ROUTE belongs to — the panel defaults to
  // this, and it's what the rail highlights unless the user has manually
  // browsed to a different category without navigating yet (see
  // `manualCategory` below).
  const routeCategoryKey =
    categories.find((c) => c.items.some((it) => loc.pathname.startsWith(it.to)))?.key ??
    extraCategories.find((c) => c.items.some((it) => loc.pathname.startsWith(it.to)))?.key ??
    "main";

  // Clicking a rail icon only changes which category's items the panel
  // shows (per the dual-layer spec: rail = category selector, panel = route
  // selector) — it must never itself navigate. That selection is temporary:
  // as soon as real navigation happens (the user clicks an actual route in
  // the panel, or arrives via a link/back-button elsewhere), the rail
  // snaps back to reflecting the real current route on the next render.
  const [manualCategory, setManualCategory] = useState<string | null>(null);
  const activeCategoryKey = manualCategory ?? routeCategoryKey;
  const activeCategory =
    categories.find((c) => c.key === activeCategoryKey) ??
    extraCategories.find((c) => c.key === activeCategoryKey) ??
    categories[0];

  const [mobileOpen, setMobileOpen] = useState(false);

  // Hover/focus-to-expand (desktop only): transient, never persisted. The
  // persisted `collapsed` stays the source of truth for the main-content
  // margin in _authenticated.tsx (so this stays an overlay, not a reflow) —
  // `showExpanded` only controls what THIS component renders/shows.
  //
  // This intentionally does NOT use onMouseEnter/onMouseLeave as the source
  // of truth. Those fire from the browser's own hit-testing, which gets
  // recomputed whenever the DOM under a stationary cursor changes — and a
  // nav click does exactly that (the clicked link's active-state classes
  // update as part of the route change). Measured directly with instrumented
  // event listeners: clicking a nav item produces a REAL mouseleave on this
  // <aside> ~700-800ms later even though the cursor never physically moved,
  // which the old onMouseLeave handler correctly-per-its-own-logic responded
  // to by collapsing — producing the open/close flicker the user reported.
  // A mouseInsideRef guard on blur didn't help because this is a genuine
  // mouseleave, not a blur race.
  //
  // Fix: track the real cursor position on every pointer move and derive
  // `hovered` by testing it against this element's own live bounding rect,
  // independent of which DOM node the browser thinks is currently under the
  // cursor. This is the single source of truth for pointer-driven expand —
  // there is no separate mouseenter/mouseleave state to fight it, and no
  // timer/delay of any kind (it reacts synchronously to real pointer
  // coordinates on every move).
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const checkPointer = (e: PointerEvent) => {
      const el = asideRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside !== hoveredRef.current) {
        hoveredRef.current = inside;
        setHovered(inside);
      }
    };
    document.addEventListener("pointermove", checkPointer, { passive: true });
    return () => document.removeEventListener("pointermove", checkPointer);
  }, []);
  // Keyboard-only Tab navigation (no mouse involved) still needs a way to
  // expand/collapse: focus still drives it, but blur only collapses when the
  // pointer isn't ALSO over the sidebar (checked against the same live-rect
  // truth above), so a click-driven blur never collapses a still-hovered
  // sidebar.
  const expandOnFocus = () => setHovered(true);
  const collapseOnBlurIfPointerOutside = () => {
    if (!hoveredRef.current) setHovered(false);
  };
  const showExpanded = !collapsed || hovered;

  const closeMobile = () => setMobileOpen(false);

  // Real navigation always wins: once the route actually changes, drop any
  // manual category browsing so the rail/panel snap back to reflecting
  // where the user actually is, not wherever they last clicked to look.
  useEffect(() => {
    setManualCategory(null);
  }, [loc.pathname]);

  /** Selecting a rail category navigates straight to that category's first
   *  route (so a single click always lands somewhere real, not just a
   *  panel with nothing selected yet) and switches the panel to that
   *  category's items. Deliberately does NOT touch the persisted
   *  `collapsed` preference — a click only ever happens while hovering
   *  (the panel is already visible via `hovered`), and permanently
   *  un-collapsing here was a real bug: it pinned the sidebar open for
   *  the rest of the session, so a "collapsed by default" preference never
   *  actually collapsed again once you clicked anything. `manualCategory`
   *  is set immediately for instant visual feedback; the route-sync effect
   *  below reconciles it once navigation lands. */
  const selectCategory = (key: string) => {
    setManualCategory(key);
    const target =
      categories.find((c) => c.key === key) ?? extraCategories.find((c) => c.key === key);
    const firstItem = target?.items[0];
    if (firstItem) navigate({ to: firstItem.to });
  };

  /** A route inside the currently-open category panel — always a real
   *  navigation link (this is "the route selector" half of the rail/panel
   *  split). Flat by design: none of the seven categories nest a sub-group
   *  anymore now that Rep Dash is its own top-level category. */
  const renderItem = (it: NavItem) => {
    const searchObj = (loc.search ?? {}) as Record<string, unknown>;
    const matchesSearch = it.search
      ? Object.entries(it.search).every(([k, v]) => String(searchObj[k] ?? "") === v)
      : true;
    const pathActive = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
    const active = pathActive && matchesSearch;
    const Icon = it.icon;
    return (
      <Link
        key={it.to}
        to={it.to}
        search={it.search as never}
        onClick={closeMobile}
        title={it.label}
        className={cn(
          "group relative flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-all",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm ring-1 ring-white/[0.04]"
            : "text-sidebar-foreground/65 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground hover:translate-x-[1px]",
        )}
      >
        {active && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_12px_rgba(255,255,255,0.32)]"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        <Icon className={cn("h-4 w-4 shrink-0 transition-transform", active && "scale-105")} />
        <span className="flex-1 truncate">{it.label}</span>
      </Link>
    );
  };

  /** Rail category button — the category selector half of the split. Never
   *  navigates: it only changes which category's items the panel shows
   *  (`selectCategory`). Tooltip via `title`/`aria-label` stands in for a
   *  rich hover tooltip since text is hidden here by design. */
  const railCategoryBtn = (cat: { key: string; label: string; icon: typeof LayoutDashboard }) => {
    const isSelected = activeCategoryKey === cat.key;
    const Icon = cat.icon;
    return (
      <button
        key={cat.key}
        type="button"
        onClick={() => selectCategory(cat.key)}
        title={cat.label}
        aria-label={cat.label}
        aria-pressed={isSelected}
        className={cn(
          "group relative flex w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 transition-all",
          isSelected
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        {isSelected && (
          <motion.div
            layoutId="sidebar-rail-indicator"
            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-primary shadow-[0_0_10px_rgba(255,255,255,0.32)]"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-transform",
            isSelected && "scale-105",
          )}
        />
        <span className="w-full truncate text-center text-[9px] font-medium leading-none tracking-tight">
          {cat.label}
        </span>
      </button>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="glass fixed top-3 left-3 z-40 md:hidden inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border shadow-md active:scale-95"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 cursor-pointer bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in-0 duration-200"
          onClick={closeMobile}
          aria-hidden
        />
      )}
      <aside
        ref={asideRef}
        onFocusCapture={expandOnFocus}
        onBlurCapture={collapseOnBlurIfPointerOutside}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-sidebar-border bg-[color:var(--sidebar)]/98 backdrop-blur-xl shadow-lg transition-[transform,width] duration-200 motion-reduce:transition-none",
          !showExpanded ? "w-72 md:w-16" : "w-72",
          "md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div
          className={cn(
            "border-b border-sidebar-border transition-[padding] duration-200",
            !showExpanded ? "px-2.5 py-3.5" : "px-4 py-4",
          )}
        >
          {/* Priority 9 — the logo now sits on its own row, above the
              workspace/Dev Workspace control below it (previously side by
              side with the workspace name, which capped how large either
              could get without crowding the other). Bigger on its own row
              reads as real brand presence instead of a small icon glued to
              a text label. */}
          <div
            className={cn(
              "flex items-center",
              !showExpanded ? "justify-center" : "justify-between",
            )}
          >
            {/* Two real theme-specific assets per state (not a CSS invert
                approximation) — .theme-logo-dark shows by default,
                .theme-logo-light shows only under .light (styles.css), so
                the swap is pure CSS/SSR-safe with no theme-detection flash.
                Collapsed (rail-only) uses the stacked mark — its ~1.9:1
                ratio fits the narrow rail's available width in a square
                box. Expanded swaps to the inline wordmark — wide (~3.1:1),
                so it reads as a real horizontal brand lockup on its own row
                instead of the stacked mark stretched taller than it needs
                to be. */}
            <div className="flex min-w-0 items-center gap-2">
              <img
                src={showExpanded ? ascendOsInlineWhite : ascendOsStackedWhite}
                alt="AscendOS"
                className={cn(
                  "theme-logo-dark shrink-0 object-contain transition-[height] duration-200",
                  !showExpanded ? "h-9 w-9" : "h-14 w-auto",
                )}
              />
              <img
                src={showExpanded ? ascendOsInlineBlack : ascendOsStackedBlack}
                alt="AscendOS"
                className={cn(
                  "theme-logo-light shrink-0 object-contain transition-[height] duration-200",
                  !showExpanded ? "h-9 w-9" : "h-14 w-auto",
                )}
              />
            </div>
            <button
              type="button"
              onClick={closeMobile}
              className="md:hidden inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent/60"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {showExpanded && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group mt-2 block w-full min-w-0 cursor-pointer text-left"
                  title="Workspace"
                >
                  <div className="flex items-center gap-1 truncate text-3xs uppercase tracking-wider text-muted-foreground/80">
                    {org?.organizations?.name ?? "Workspace"}
                    <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60 transition-transform group-hover:translate-y-px" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-3xs uppercase tracking-wider text-muted-foreground">
                  {org?.organizations?.name ?? "Workspace"}
                </DropdownMenuLabel>
                {isAdmin && !devBypass && (
                  <>
                    <DropdownMenuSeparator />
                    {/* Dev Workspace — the one place Mock/Demo Data ever
                        turns on (Priority 4). Admin-only, and this control
                        is never rendered at all for anyone else — the
                        production/public app has no path to it. Extends the
                        existing useDemoMode()/DemoModeProvider state (see
                        demo-mode-banner.tsx) rather than a second switch. */}
                    <div className="px-2 py-2">
                      <div className="mb-1.5 flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <FlaskConical className="h-3 w-3" /> Dev Workspace
                      </div>
                      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-1 py-1">
                        <span className="text-xs">
                          <span className="font-medium text-foreground">Mock Data</span>
                          <span className="block text-3xs text-muted-foreground">
                            {demoMode
                              ? "Demo Data Active — fixtures, not real data"
                              : "Off — real data only"}
                          </span>
                        </span>
                        <Switch checked={demoMode} onCheckedChange={setDemoMode} />
                      </label>
                    </div>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* PRIMARY ICON RAIL — the category selector. Constant width,
              always rendered regardless of expand state (this IS the
              collapsed sidebar). Rail buttons never navigate — clicking one
              only changes which category the panel shows (selectCategory).
              System sits below a spacer as an eighth, visually-secondary
              icon alongside the other utility controls (search/theme/sign
              out/pin), since it's not one of the seven primary categories. */}
          <div className="flex w-16 shrink-0 flex-col border-r border-sidebar-border bg-[color:var(--sidebar)]">
            <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
              {categories.map((cat) => railCategoryBtn(cat))}
            </nav>
            <div className="flex flex-col items-center gap-1 border-t border-sidebar-border py-2">
              {extraCategories.map((cat) => railCategoryBtn(cat))}
              <button
                type="button"
                onClick={openCommandPalette}
                title="Search (⌘K)"
                aria-label="Search"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                <Command className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={toggle}
                title={theme === "dark" ? "Light mode" : "Dark mode"}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              >
                {theme === "dark" ? (
                  <Sun className="h-[18px] w-[18px]" />
                ) : (
                  <Moon className="h-[18px] w-[18px]" />
                )}
              </button>
              <button
                type="button"
                onClick={async () => {
                  // Dev Bypass has no real session for supabase.auth.signOut() to
                  // clear — its flag only gets read once, on mount, so it has to
                  // be cleared explicitly here or it just re-authenticates the
                  // very next render. A hard navigation (rather than the router's
                  // client-side nav) forces a fresh mount everywhere, so /welcome
                  // never has a chance to read stale pre-sign-out auth state and
                  // bounce straight back into the app.
                  if (devBypass) disableDevBypass();
                  await supabase.auth.signOut();
                  window.location.href = "/welcome";
                }}
                title="Sign out"
                aria-label="Sign out"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={toggleCollapsed}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-sidebar-foreground/50 transition-all hover:bg-sidebar-accent/50 hover:text-sidebar-foreground/80 md:flex"
              >
                {collapsed ? (
                  <ChevronsRight className="h-4 w-4" />
                ) : (
                  <ChevronsLeft className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* SECONDARY PANEL — the route selector, contextual to whichever
              category is currently selected. Shows ONLY that category's
              items, never the whole tree at once. Always rendered on mobile
              (no icon-only mobile state); on desktop only once showExpanded
              is true (hover or pinned). */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col overflow-y-auto bg-[color:var(--sidebar-accent)]/20",
              !showExpanded && "md:hidden",
            )}
          >
            <nav className="flex-1 space-y-0.5 p-2">
              <div className="px-2.5 pb-2 pt-1 text-3xs font-bold uppercase tracking-[0.16em] text-muted-foreground/50">
                {activeCategory.label}
              </div>
              {activeCategory.items.map((it) => renderItem(it))}
            </nav>
            {identity && (
              <Link
                to="/settings"
                className="mx-2 flex items-center gap-2 rounded-lg border-t border-sidebar-border px-1 py-2.5 text-left hover:bg-sidebar-accent/40"
              >
                <AvatarInitials name={identity.displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-sidebar-foreground">
                    {identity.displayName}
                  </div>
                  <div className="truncate text-3xs text-muted-foreground">
                    {roleLabel}
                    {identity.offerName ? ` · ${identity.offerName}` : ""}
                  </div>
                </div>
              </Link>
            )}
          </div>
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
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <CurrencySelector />
        </div>
      )}
      <div className="rule-gold mt-3 -mx-4 md:-mx-7" />
    </div>
  );
}

/** Global display-currency selector (B — currency architecture). Persistent across
 *  navigation via useDisplayCurrency's localStorage-backed context; USD stays the
 *  canonical stored value everywhere, this only controls presentation. */
export function CurrencySelector() {
  const { currency, setCurrency } = useDisplayCurrency();
  return (
    <Select
      value={currency}
      onValueChange={(v) => setCurrency(v as (typeof DISPLAY_CURRENCIES)[number])}
    >
      <SelectTrigger className="h-8 w-[4.5rem] text-xs" aria-label="Display currency">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DISPLAY_CURRENCIES.map((c) => (
          <SelectItem key={c} value={c} className="text-xs">
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
