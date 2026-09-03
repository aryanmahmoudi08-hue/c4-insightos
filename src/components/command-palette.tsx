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
  Radar,
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

const ROUTES: { to: string; label: string; group: string; icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", label: "Main Hub", group: "Go to", icon: LayoutDashboard },
  { to: "/leads", label: "Leads", group: "Go to", icon: Users },
  { to: "/dm-setter", label: "DM Setter", group: "Go to", icon: MessageSquare },
  { to: "/inbound-dialer", label: "Inbound Dialer", group: "Go to", icon: PhoneIncoming },
  { to: "/closer", label: "Closer", group: "Go to", icon: PhoneCall },
  { to: "/outreach", label: "Messaging", group: "Go to", icon: MessageSquare },
  { to: "/team", label: "Team Members", group: "Go to", icon: Users },
  { to: "/team-calendar", label: "Team Calendars", group: "Go to", icon: CalendarDays },
  { to: "/hiring", label: "Hiring", group: "Go to", icon: UserPlus },
  { to: "/attribution", label: "Attribution", group: "Go to", icon: GitBranch },
  { to: "/traffic", label: "Traffic", group: "Go to", icon: TrendingUp },
  { to: "/content-calendar", label: "Content Calendar", group: "Go to", icon: CalendarDays },
  { to: "/content", label: "Content Intelligence", group: "Go to", icon: Video },
  { to: "/content-signals", label: "Content Signals", group: "Go to", icon: Radar },
  { to: "/clients", label: "Mentees & Renewals", group: "Go to", icon: BadgeCheck },
  { to: "/onboarding", label: "Mentee Onboarding", group: "Go to", icon: Brain },
  { to: "/fulfillment", label: "Mentee Results", group: "Go to", icon: BadgeCheck },
  { to: "/vsl", label: "VSL Analytics", group: "Go to", icon: Video },
  { to: "/events", label: "Event Bus", group: "Go to", icon: Activity },
  { to: "/copy", label: "Client DNA", group: "Go to", icon: Wand2 },
  { to: "/sequences", label: "Story Sequences", group: "Go to", icon: Layers },
  { to: "/settings", label: "Settings", group: "Go to", icon: Settings },
  { to: "/permissions", label: "Access control", group: "Go to", icon: ShieldCheck },
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
            to: "/clients",
            search: { q: c.full_name },
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
    nav({ to, search: (search ?? {}) as never });
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
            <Command
              className="glass-strong overflow-hidden rounded-xl border shadow-lg"
              shouldFilter={query.trim().length < 2}
              loop
            >
              <div className="flex items-center gap-2 border-b border-border/70 px-3.5">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Command.Input
                  autoFocus
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Jump to a page, search leads/clients/content, or log something…"
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
                        value={`result-${r.id}-${r.label}`}
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
                      key={r.to}
                      value={r.label}
                      onSelect={() => go(r.to)}
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
