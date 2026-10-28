import {
  Activity,
  BadgeCheck,
  Brain,
  CalendarDays,
  ClipboardCheck,
  DollarSign,
  FileText,
  GitBranch,
  HelpCircle,
  Home,
  LayoutDashboard,
  MessageSquare,
  PhoneCall,
  PhoneIncoming,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import type { ComponentType } from "react";

type IconType = ComponentType<{ className?: string }>;

export type PageIdentity = {
  /** The module this page belongs to — the hero's eyebrow. */
  eyebrow: string;
  icon: IconType;
};

/**
 * Which module a route belongs to, and the mark that stands for it.
 *
 * Every page's hero takes its title and subtitle straight from the TopBar
 * the route already renders — real copy, written once — so all this adds is
 * the module name and the icon. Both are copied from the sidebar's own
 * taxonomy in `app-sidebar.tsx` (category name, and that nav entry's icon),
 * so a page's hero says the same thing its nav entry does.
 *
 * Keyed by pathname. `page-identity.test.ts` asserts this covers every
 * authenticated route on disk, so adding a route without filing it here is
 * a failing test rather than a page that silently renders no hero.
 */
export const PAGE_IDENTITY: Record<string, PageIdentity> = {
  "/home": { eyebrow: "Overview", icon: Home },
  "/dashboard": { eyebrow: "Overview", icon: LayoutDashboard },

  "/leads": { eyebrow: "Sales Tracking", icon: Users },
  "/eod-reports": { eyebrow: "Sales Tracking", icon: ClipboardCheck },

  "/dm-setter": { eyebrow: "Rep Efficiency", icon: MessageSquare },
  "/inbound-dialer": { eyebrow: "Rep Efficiency", icon: PhoneIncoming },
  "/closer": { eyebrow: "Rep Efficiency", icon: PhoneCall },

  "/team": { eyebrow: "Team", icon: Users },
  "/team-calendar": { eyebrow: "Team", icon: CalendarDays },
  "/hiring": { eyebrow: "Team", icon: UserPlus },

  "/onboarding": { eyebrow: "Mentees", icon: Brain },
  "/fulfillment": { eyebrow: "Mentees", icon: BadgeCheck },

  "/payments": { eyebrow: "Payments", icon: DollarSign },

  "/content": { eyebrow: "Content", icon: Video },
  "/content-calendar": { eyebrow: "Content", icon: CalendarDays },
  // Traffic and Attribution are reachable as sections inside Content Command
  // Center rather than as their own nav entries, but their standalone routes
  // still exist and still need an identity — filed under the module that
  // embeds them, not invented as a category of their own.
  "/traffic": { eyebrow: "Content", icon: TrendingUp },
  "/attribution": { eyebrow: "Content", icon: GitBranch },
  "/sequences": { eyebrow: "Content", icon: Send },

  "/copy": { eyebrow: "Client DNA", icon: Sparkles },

  "/vsl": { eyebrow: "Analytics", icon: Video },
  "/webinar-analytics": { eyebrow: "Analytics", icon: CalendarDays },
  "/weekly-report": { eyebrow: "Analytics", icon: FileText },

  "/events": { eyebrow: "System", icon: Activity },
  "/settings": { eyebrow: "System", icon: Settings },
  "/permissions": { eyebrow: "System", icon: ShieldCheck },

  "/help": { eyebrow: "Help", icon: HelpCircle },
};

/**
 * Identity for a pathname, or null when there is none.
 *
 * Null rather than a generic fallback on purpose: a hero captioned "Overview"
 * with a default icon on a page nobody filed is worse than no hero, because
 * it looks deliberate. The test keeps the map complete instead.
 */
export function pageIdentityFor(pathname: string): PageIdentity | null {
  return PAGE_IDENTITY[pathname] ?? null;
}
