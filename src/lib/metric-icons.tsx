import {
  Activity,
  BadgeDollarSign,
  CalendarCheck,
  CircleDollarSign,
  Clock,
  Eye,
  Flame,
  Gauge,
  Handshake,
  Link2,
  ListChecks,
  Mail,
  Megaphone,
  MessageCircle,
  Percent,
  PhoneCall,
  Repeat,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  UserCheck,
  UserMinus,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

type IconType = ComponentType<{ className?: string }>;

/**
 * The icon a metric is drawn with, resolved from its label.
 *
 * Every KPI tile in the app carries a tinted icon chip, which is what makes a
 * grid of otherwise-identical cards scannable. Rather than thread an `icon`
 * prop through several hundred call sites, MetricCard falls back to this
 * lookup — so a tile gets a sensible mark for free, and a call site that
 * genuinely wants a different one still wins by passing `icon` explicitly.
 *
 * Exact labels are matched first, then substrings in declaration order, then
 * a neutral default. Order matters in the substring table: "close rate" has
 * to be read as a rate, not as a close.
 */
const EXACT: Record<string, IconType> = {
  Views: Eye,
  "Total Views": Eye,
  Dials: PhoneCall,
  Connections: MessageCircle,
  "Qualified Convos": Users,
  "Leads Contacted": Users,
  Sets: CalendarCheck,
  "Calls Booked": CalendarCheck,
  Showed: UserCheck,
  Closes: Flame,
  "Cash Collected": CircleDollarSign,
  "Revenue Generated": CircleDollarSign,
  "Contract Value": CircleDollarSign,
  "Links Sent": Link2,
  "Inbound DMs Sent": MessageCircle,
  "Outbound DMs Sent": MessageCircle,
  "Follow-ups Sent": MessageCircle,
  "Links Clicked": Link2,
  "Post-booking Page Visits": Eye,
  "Pre-call Video Watches": Video,
  "Average Call Length": Clock,
  "Average Talk Time": Clock,
  Downsells: Target,
  "Offers Made": Sparkles,
  Applications: ListChecks,
  "Rep Efficiency": Gauge,
  "Client Momentum": TrendingUp,
};

/**
 * Checked in order — the first pattern that matches the lower-cased label
 * wins. Each is anchored at a word START and then left open, so a stem
 * covers its own inflections ("lead" reaches leads, "clos" reaches closes /
 * closed / closer) without matching mid-word. The anchor is the whole
 * point: a plain substring table drew a percent sign on every revenue tile,
 * because "generated" contains "rate".
 */
const PATTERNS: [RegExp, IconType][] = [
  [/\broas/, TrendingUp],
  [/\brate/, Percent],
  [/%/, Percent],
  [/\bmrr\b/, Repeat],
  [/\brecurring/, Repeat],
  [/\brenewal/, Repeat],
  [/\brefund/, UserMinus],
  [/\bchurn/, UserMinus],
  [/\bdisqualified/, UserMinus],
  [/\bspend/, Megaphone],
  [/\bads?\b/, Megaphone],
  [/\bcash/, CircleDollarSign],
  [/\brevenue/, CircleDollarSign],
  [/\bdeposit/, Wallet],
  [/\bpayment/, Wallet],
  [/\bticket/, BadgeDollarSign],
  [/\bcontract/, BadgeDollarSign],
  [/\bpric/, BadgeDollarSign],
  [/\$/, CircleDollarSign],
  [/\boffer/, Sparkles],
  [/\bclos/, Flame],
  [/\bwon\b/, Handshake],
  [/\bdeal/, Handshake],
  [/\bbook/, CalendarCheck],
  [/\bset/, CalendarCheck],
  [/\bappointment/, CalendarCheck],
  [/\bshow/, UserCheck],
  [/\battend/, UserCheck],
  [/\bclient/, UserCheck],
  [/\bmentee/, UserCheck],
  [/\bstudent/, UserCheck],
  [/\blead/, Users],
  [/\bapplica/, ListChecks],
  [/\bdms?\b/, MessageCircle],
  [/\bmessage/, MessageCircle],
  [/\bconvo/, MessageCircle],
  [/\breply|\breplies/, MessageCircle],
  [/\bemail/, Mail],
  [/\bsent\b/, Send],
  [/\bdial/, PhoneCall],
  [/\bcall/, PhoneCall],
  [/\bpick-?up/, PhoneCall],
  [/\btalk/, Clock],
  [/\btime/, Clock],
  [/\blength/, Clock],
  [/\blink/, Link2],
  [/\bclick/, Link2],
  [/\bview/, Eye],
  [/\bimpression/, Eye],
  [/\breach/, Eye],
  [/\bvisit/, Eye],
  [/\bwatch/, Video],
  [/\bvsl\b/, Video],
  [/\bvideo|\bvids?\b/, Video],
  [/\bwebinar/, Video],
  [/\bpost/, Sparkles],
  [/\bcontent/, Sparkles],
  [/\btarget/, Target],
  [/\bgoal/, Target],
  [/\bpace\b/, Gauge],
  [/\befficiency/, Gauge],
  [/\bscore/, Gauge],
];

export function metricIconFor(label: string): IconType {
  const exact = EXACT[label];
  if (exact) return exact;
  const needle = label.toLowerCase();
  for (const [pattern, Icon] of PATTERNS) {
    if (pattern.test(needle)) return Icon;
  }
  return Activity;
}
