import { useEffect, useState, useCallback } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  PhoneCall,
  PhoneIncoming,
  CalendarDays,
  UserPlus,
  GitBranch,
  TrendingUp,
  Video,
  BadgeCheck,
  Brain,
  Activity,
  Settings,
  ShieldCheck,
  Wand2,
  Layers,
  Search,
  Trophy,
  Award,
  DollarSign,
} from "lucide-react";
import { SPRING } from "@/lib/motion-tokens";

const OPEN_EVENT = "c4:open-command-palette";

/** Called from anywhere (e.g. the sidebar's "Search…" button) to open the palette without needing shared React state. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const ROUTES: {
  to: string;
  label: string;
  group: string;
  icon: typeof LayoutDashboard;
  search?: Record<string, string>;
}[] = [
  { to: "/dashboard", label: "Main Hub", group: "Go to", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", group: "Go to", icon: Users },
  { to: "/dm-setter", label: "DM Setter", group: "Go to", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", group: "Go to", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", group: "Go to", icon: PhoneCall },
  // Messaging (/outreach) intentionally deferred — see
  // src/deferred-features/outreach-route.tsx.deferred.
  { to: "/team", label: "Team Members", group: "Go to", icon: Users },
  { to: "/team-calendar", label: "Team Calendars", group: "Go to", icon: CalendarDays },
  { to: "/hiring", label: "Hiring", group: "Go to", icon: UserPlus },
  { to: "/content-calendar", label: "Content Calendar", group: "Go to", icon: CalendarDays },
  { to: "/content", label: "Content Command Center", group: "Go to", icon: Video },
  // Attribution/Traffic are no longer standalone pages in the nav — Content
  // Command Center embeds the same components, so these jump there and
  // scroll to that section (same idiom the sidebar's Content sub-items use).
  {
    to: "/content",
    label: "Attribution",
    group: "Go to",
    icon: GitBranch,
    search: { section: "attribution-overview" },
  },
  {
    to: "/content",
    label: "Traffic",
    group: "Go to",
    icon: TrendingUp,
    search: { section: "traffic-overview" },
  },
  { to: "/payments", label: "Payments", group: "Go to", icon: DollarSign },
  { to: "/onboarding", label: "Mentee Onboarding", group: "Go to", icon: Brain },
  { to: "/fulfillment", label: "Mentee Results", group: "Go to", icon: BadgeCheck },
  { to: "/vsl", label: "VSL Analytics", group: "Go to", icon: Video },
  { to: "/events", label: "Event Bus", group: "Go to", icon: Activity },
  { to: "/copy", label: "Client DNA", group: "Go to", icon: Wand2 },
  { to: "/sequences", label: "Story Sequences", group: "Go to", icon: Layers },
  { to: "/settings", label: "Settings", group: "Go to", icon: Settings },
  { to: "/permissions", label: "Access control", group: "Go to", icon: ShieldCheck },
];

/** Real KPI/metric labels, verbatim as they render on each page, mapped to
 * where to jump to find them — lets the palette answer "search up total
 * cash collected" / "search up sets" the same way it answers a page or a
 * lead name, instead of metrics only being reachable by browsing. `page`
 * is shown as the result's sub-label (multiple pages share labels like
 * "Cash Collected", so the page name disambiguates which one this jumps
 * to) — the label itself is never rewritten, so a search for exactly what's
 * on screen always matches. */
const METRICS: { label: string; page: string; to: string; search?: Record<string, string> }[] = [
  // Main Hub — top executive row + Company KPIs + Level 2 Operating Metrics
  { label: "Total Cash Collected", page: "Main Hub", to: "/dashboard" },
  { label: "Total Revenue Generated", page: "Main Hub", to: "/dashboard" },
  { label: "MRR — Low Ticket", page: "Main Hub", to: "/dashboard" },
  { label: "Low Ticket Active", page: "Main Hub", to: "/dashboard" },
  { label: "High Ticket Active", page: "Main Hub", to: "/dashboard" },
  { label: "New Leads", page: "Main Hub", to: "/dashboard" },
  { label: "Total Views", page: "Main Hub", to: "/dashboard" },
  { label: "Month-End Pace", page: "Main Hub", to: "/dashboard" },
  { label: "Active Clients", page: "Main Hub", to: "/dashboard" },
  { label: "Applications Submitted", page: "Main Hub", to: "/dashboard" },
  { label: "App → Booked", page: "Main Hub", to: "/dashboard" },
  { label: "Application Quality", page: "Main Hub", to: "/dashboard" },
  { label: "Close Rate (on show)", page: "Main Hub", to: "/dashboard" },
  { label: "Avg first response time", page: "Main Hub", to: "/dashboard" },
  { label: "Convo-to-link sent rate", page: "Main Hub", to: "/dashboard" },
  { label: "Daily inbound volume pace", page: "Main Hub", to: "/dashboard" },
  { label: "Student Cash Logged", page: "Main Hub", to: "/dashboard" },
  { label: "VSL Page Visits", page: "Main Hub", to: "/dashboard" },
  { label: "VSL Plays", page: "Main Hub", to: "/dashboard" },
  { label: "Unique Viewers", page: "Main Hub", to: "/dashboard" },
  { label: "Play Rate", page: "Main Hub", to: "/dashboard" },
  { label: "Pre-call Vids Watched", page: "Main Hub", to: "/dashboard" },
  { label: "Qualified Convo Rate", page: "Main Hub", to: "/dashboard" },
  { label: "Show Rate", page: "Main Hub", to: "/dashboard" },
  { label: "Daily W Logs", page: "Main Hub", to: "/dashboard" },
  { label: "Financial Wins", page: "Main Hub", to: "/dashboard" },
  { label: "Avg Energy", page: "Main Hub", to: "/dashboard" },
  { label: "Completion Rate", page: "Main Hub", to: "/dashboard" },
  { label: "Engagement Rate", page: "Main Hub", to: "/dashboard" },
  { label: "Client Health", page: "Main Hub", to: "/dashboard" },
  // Closer
  { label: "Cash Collected", page: "Closer", to: "/closer" },
  { label: "Revenue Generated", page: "Closer", to: "/closer" },
  { label: "Cash Collection Rate", page: "Closer", to: "/closer" },
  { label: "Avg Contract Value", page: "Closer", to: "/closer" },
  { label: "Closes", page: "Closer", to: "/closer" },
  { label: "Disqualified Leads", page: "Closer", to: "/closer" },
  { label: "Calls Booked", page: "Closer", to: "/closer" },
  { label: "Showed", page: "Closer", to: "/closer" },
  { label: "Offers Made", page: "Closer", to: "/closer" },
  { label: "Offer Rate", page: "Closer", to: "/closer" },
  { label: "Offer → Close Rate", page: "Closer", to: "/closer" },
  { label: "Close Rate", page: "Closer", to: "/closer" },
  { label: "Avg Cash / Booked", page: "Closer", to: "/closer" },
  { label: "Avg Cash / Showed", page: "Closer", to: "/closer" },
  { label: "Avg Cash / Closed", page: "Closer", to: "/closer" },
  { label: "Avg Cash-Call", page: "Closer", to: "/closer" },
  { label: "Avg Deposit %", page: "Closer", to: "/closer" },
  { label: "Payment Plan Uptake", page: "Closer", to: "/closer" },
  { label: "Payment Success Rate", page: "Closer", to: "/closer" },
  { label: "Failed / Default Rate", page: "Closer", to: "/closer" },
  { label: "Calls Reviewed", page: "Closer", to: "/closer" },
  { label: "Average Call Duration", page: "Closer", to: "/closer" },
  { label: "Average Talk Time", page: "Closer", to: "/closer" },
  // DM Setter
  { label: "Cash Collected", page: "DM Setter", to: "/dm-setter" },
  { label: "Revenue Generated", page: "DM Setter", to: "/dm-setter" },
  { label: "Leads Contacted", page: "DM Setter", to: "/dm-setter" },
  { label: "Qualified Convos", page: "DM Setter", to: "/dm-setter" },
  { label: "Sets", page: "DM Setter", to: "/dm-setter" },
  { label: "Inbound DMs Sent", page: "DM Setter", to: "/dm-setter" },
  { label: "Outbound DMs Sent", page: "DM Setter", to: "/dm-setter" },
  { label: "Calls Booked", page: "DM Setter", to: "/dm-setter" },
  { label: "Close Rate", page: "DM Setter", to: "/dm-setter" },
  { label: "Reply Rate", page: "DM Setter", to: "/dm-setter" },
  { label: "Set Rate", page: "DM Setter", to: "/dm-setter" },
  { label: "Qualified Convo Rate", page: "DM Setter", to: "/dm-setter" },
  // Inbound Dialer
  { label: "Cash Collected", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Revenue Generated", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Dials", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Connections", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Qualified Convos", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Sets", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Pickup Rate", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Qualified Convo Rate", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Average Call Length", page: "Inbound Dialer", to: "/inbound-dialer" },
  { label: "Average Talk Time", page: "Inbound Dialer", to: "/inbound-dialer" },
  // Team
  { label: "Team Members", page: "Team", to: "/team" },
  { label: "Setters", page: "Team", to: "/team" },
  { label: "Dialers", page: "Team", to: "/team" },
  { label: "Closers", page: "Team", to: "/team" },
  { label: "Booked", page: "Team", to: "/team" },
  { label: "Show Rate", page: "Team", to: "/team" },
  { label: "Cash Collected", page: "Team", to: "/team" },
  // Sales / Leads
  { label: "Total Leads", page: "Sales", to: "/leads" },
  { label: "Available to Call", page: "Sales", to: "/leads" },
  { label: "Call Booked", page: "Sales", to: "/leads" },
  { label: "Closed", page: "Sales", to: "/leads" },
  { label: "💎 Diamond Leads", page: "Sales", to: "/leads" },
  // Attribution
  {
    label: "Total Leads",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Booked Calls",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Shows",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Revenue Generated",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Cash Collected",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Attributed Cash",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Unattributed Cash",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Organic Cash",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Paid Cash",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  {
    label: "Referral Cash",
    page: "Attribution",
    to: "/content",
    search: { section: "attribution-overview" },
  },
  // Traffic
  {
    label: "Leads Tracked",
    page: "Traffic",
    to: "/content",
    search: { section: "traffic-overview" },
  },
  {
    label: "Qualified Leads",
    page: "Traffic",
    to: "/content",
    search: { section: "traffic-overview" },
  },
  {
    label: "Bookings → Shows → Closes",
    page: "Traffic",
    to: "/content",
    search: { section: "traffic-overview" },
  },
  {
    label: "Cash Collected",
    page: "Traffic",
    to: "/content",
    search: { section: "traffic-overview" },
  },
  // Content Command Center
  { label: "Total Views", page: "Content Command Center", to: "/content" },
  { label: "Total Reach", page: "Content Command Center", to: "/content" },
  { label: "Engagement Rate", page: "Content Command Center", to: "/content" },
  { label: "Avg Views / Post", page: "Content Command Center", to: "/content" },
  { label: "Followers Gained", page: "Content Command Center", to: "/content" },
  { label: "Cash Attributed", page: "Content Command Center", to: "/content" },
  { label: "Reels Posted", page: "Content Command Center", to: "/content" },
  { label: "Untagged Pieces", page: "Content Command Center", to: "/content" },
  // Payments
  { label: "Total Collected", page: "Payments", to: "/payments" },
  { label: "Total Contracted", page: "Payments", to: "/payments" },
  { label: "Total Outstanding", page: "Payments", to: "/payments" },
  { label: "Failed & At-Risk", page: "Payments", to: "/payments" },
  { label: "Renewal Rate", page: "Payments", to: "/payments" },
  { label: "Renewal Pipeline Value", page: "Payments", to: "/payments" },
  { label: "Churned Value", page: "Payments", to: "/payments" },
  { label: "Avg. Tenure at Renewal Decision", page: "Payments", to: "/payments" },
  // Webinar Analytics
  { label: "Total Leads", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Show-up Rate", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Live at Pitch", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Retention (Pitch ÷ Live)", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Total Revenue", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "ROAS", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "ROAS (Acquisition)", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Visitors", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Registrants", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Live Attendees", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Replay Attendees", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Impressions", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Clicks", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "CTR", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "CPC", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "CPL", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "CPA", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Cost per Paid Lead", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Lead Capture Investment", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Organic Leads", page: "Webinar Analytics", to: "/webinar-analytics" },
  { label: "Paid Leads", page: "Webinar Analytics", to: "/webinar-analytics" },
  // Weekly Report
  { label: "Cash Collected", page: "Weekly Report", to: "/weekly-report" },
  { label: "New Leads", page: "Weekly Report", to: "/weekly-report" },
  { label: "Calls Booked → Closed", page: "Weekly Report", to: "/weekly-report" },
  { label: "Content Mix", page: "Weekly Report", to: "/weekly-report" },
  // Mentee Onboarding
  { label: "Total Intakes", page: "Mentee Onboarding", to: "/onboarding" },
  { label: "Submitted", page: "Mentee Onboarding", to: "/onboarding" },
  { label: "Pending", page: "Mentee Onboarding", to: "/onboarding" },
  { label: "Insight Signals", page: "Mentee Onboarding", to: "/onboarding" },
  // VSL Analytics
  { label: "Total Plays", page: "VSL Analytics", to: "/vsl" },
  { label: "Unique Viewers", page: "VSL Analytics", to: "/vsl" },
  { label: "Play Rate", page: "VSL Analytics", to: "/vsl" },
  { label: "Avg % Watched", page: "VSL Analytics", to: "/vsl" },
  { label: "Page Loads", page: "VSL Analytics", to: "/vsl" },
  // Hiring
  { label: "Total Applicants", page: "Hiring", to: "/hiring" },
  { label: "Avg AI Score", page: "Hiring", to: "/hiring" },
  { label: "Avg Transcript-Quality Score", page: "Hiring", to: "/hiring" },
  // Mentee Results (Fulfillment)
  { label: "Cash Logged", page: "Mentee Results", to: "/fulfillment" },
  { label: "Commitments Kept", page: "Mentee Results", to: "/fulfillment" },
  { label: "Avg Energy", page: "Mentee Results", to: "/fulfillment" },
  // Event Bus
  { label: "Events (Recent)", page: "Event Bus", to: "/events" },
  { label: "Active Subscriptions", page: "Event Bus", to: "/events" },
  { label: "Failed Deliveries", page: "Event Bus", to: "/events" },
  { label: "Sync Streams", page: "Event Bus", to: "/events" },
  // Content Calendar
  { label: "Ready to Post", page: "Content Calendar", to: "/content-calendar" },
  { label: "Scheduled This Month", page: "Content Calendar", to: "/content-calendar" },
  // Home (role-based — variant shown depends on signed-in role)
  { label: "Cash Collected", page: "Home", to: "/home" },
  { label: "Closes", page: "Home", to: "/home" },
  { label: "Active Mentees", page: "Home", to: "/home" },
  { label: "Calls Today", page: "Home", to: "/home" },
  { label: "Hiring — Needs Grading", page: "Home", to: "/home" },
  { label: "Hiring — Interview-Worthy", page: "Home", to: "/home" },
  { label: "Booked", page: "Home", to: "/home" },
  { label: "Showed", page: "Home", to: "/home" },
  { label: "Offers", page: "Home", to: "/home" },
  { label: "Cash", page: "Home", to: "/home" },
  { label: "Leads Generated", page: "Home", to: "/home" },
  { label: "Paid Leads", page: "Home", to: "/home" },
  { label: "Organic Leads", page: "Home", to: "/home" },
  { label: "DMs Sent", page: "Home", to: "/home" },
  { label: "Replies", page: "Home", to: "/home" },
  { label: "Qualified", page: "Home", to: "/home" },
  { label: "Dials", page: "Home", to: "/home" },
  { label: "Connections", page: "Home", to: "/home" },
];

const ACTIONS: {
  to: string;
  search: Record<string, string>;
  label: string;
  icon: typeof LayoutDashboard;
}[] = [
  { to: "/dm-setter", search: { action: "log-day" }, label: "Log Day (DM Setter)", icon: Trophy },
  {
    to: "/inbound-dialer",
    search: { action: "log-day" },
    label: "Log Day (Inbound Dialer)",
    icon: Trophy,
  },
  {
    to: "/inbound-dialer",
    search: { action: "log-callback" },
    label: "Log Follow-up Call (Inbound Dialer)",
    icon: PhoneIncoming,
  },
  { to: "/closer", search: { action: "log-call" }, label: "Log Call", icon: Award },
  {
    to: "/fulfillment",
    search: { action: "log-win" },
    label: "Log Win (Daily W)",
    icon: DollarSign,
  },
];

type SearchResult = {
  id: string;
  label: string;
  sub: string;
  to: string;
  search: Record<string, string>;
};

/**
 * Cmd+K command palette (B6) — the signature "pro tool" moment. Route jump,
 * live search across leads/clients/content, and quick actions for the three
 * most-used logging dialogs (Log Day/Call/Win), which are opened cross-page
 * via a `?action=` search param each dialog's own page checks on mount.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const nav = useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const runSearch = useCallback(
    async (term: string) => {
      if (!orgId || term.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      const q = term.trim();
      try {
        const [leads, clients, content] = await Promise.all([
          supabase
            .from("leads")
            .select("id, full_name, handle, email")
            .eq("org_id", orgId)
            .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%,email.ilike.%${q}%`)
            .limit(5),
          supabase
            .from("clients")
            .select("id, full_name, email")
            .eq("org_id", orgId)
            .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
            .limit(5),
          supabase
            .from("content_pieces")
            .select("id, title")
            .eq("org_id", orgId)
            .ilike("title", `%${q}%`)
            .limit(5),
        ]);
        const out: SearchResult[] = [];
        for (const l of leads.data ?? [])
          out.push({
            id: `lead-${l.id}`,
            label: l.full_name || l.handle || l.email || "Lead",
            sub: "Lead",
            to: "/leads",
            search: { q: l.full_name || l.handle || "" },
          });
        for (const c of clients.data ?? [])
          out.push({
            id: `client-${c.id}`,
            label: c.full_name,
            sub: "Client",
            to: "/payments",
            search: { client: c.id },
          });
        for (const p of content.data ?? [])
          out.push({
            id: `content-${p.id}`,
            label: p.title || "(untitled)",
            sub: "Content",
            to: "/content",
            search: {},
          });
        setResults(out);
      } finally {
        setSearching(false);
      }
    },
    [orgId],
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const go = (to: string, search?: Record<string, string>) => {
    setOpen(false);
    // Section deep-links (Attribution/Traffic → /content?section=...) land on
    // and scroll to a spot on the same page — skip the router's default
    // scroll-to-top reset so the page's own smooth scrollIntoView starts
    // from wherever the user actually is, not from (0,0).
    nav({ to, search: (search ?? {}) as never, resetScroll: !search?.section });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[100] bg-black/50"
            initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
            animate={{ opacity: 1, backdropFilter: "blur(6px)" }}
            exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            className="fixed left-1/2 top-[18vh] z-[101] w-full max-w-xl -translate-x-1/2 px-4"
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={SPRING.gentle}
          >
            <Command className="glass-strong overflow-hidden rounded-xl border shadow-lg" loop>
              <div className="flex items-center gap-2 border-b border-border/70 px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search a metric, lead, client, content, or page…"
                  className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <span className="badge-glass shrink-0 text-3xs normal-case tracking-normal">
                  ESC
                </span>
              </div>
              <Command.List className="max-h-[50vh] overflow-y-auto p-2">
                <Command.Empty className="p-6 text-center text-xs text-muted-foreground">
                  {searching ? "Searching…" : "No matches."}
                </Command.Empty>

                {results.length > 0 && (
                  <Command.Group
                    heading="Results"
                    className="px-2 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-1.5"
                  >
                    {results.map((r) => (
                      <Command.Item
                        key={r.id}
                        value={`${r.label} ${r.sub}`}
                        onSelect={() => go(r.to, r.search)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 aria-selected:bg-accent/15 aria-selected:text-accent cursor-pointer"
                      >
                        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{r.label}</span>
                        <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                          {r.sub}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {query.trim().length >= 2 && (
                  <Command.Group
                    heading="Metrics"
                    className="px-2 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-1.5"
                  >
                    {METRICS.map((m, i) => (
                      <Command.Item
                        key={`${m.to}:${m.page}:${m.label}:${i}`}
                        value={`${m.label} ${m.page}`}
                        onSelect={() => go(m.to, m.search)}
                        className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 aria-selected:bg-accent/15 aria-selected:text-accent cursor-pointer"
                      >
                        <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{m.label}</span>
                        <span className="text-3xs uppercase tracking-wide text-muted-foreground">
                          {m.page}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group
                  heading="Quick actions"
                  className="px-2 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-1.5"
                >
                  {ACTIONS.map((a) => (
                    <Command.Item
                      key={a.label}
                      value={a.label}
                      onSelect={() => go(a.to, a.search)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 aria-selected:bg-accent/15 aria-selected:text-accent cursor-pointer"
                    >
                      <a.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{a.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Go to"
                  className="px-2 pb-1 pt-2 text-3xs font-semibold uppercase tracking-wider text-muted-foreground [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:pb-1.5"
                >
                  {ROUTES.map((r) => (
                    <Command.Item
                      key={`${r.to}:${r.label}`}
                      value={r.label}
                      onSelect={() => go(r.to, r.search)}
                      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-foreground/90 aria-selected:bg-accent/15 aria-selected:text-accent cursor-pointer"
                    >
                      <r.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{r.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
