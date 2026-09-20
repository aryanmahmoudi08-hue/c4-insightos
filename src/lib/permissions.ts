/**
 * Access-control catalogue.
 * Every sidebar surface is a "resource". For each we describe exactly what
 * "View" lets a rep see and what "Edit" lets them change, so access can be
 * granted deliberately instead of guessed at.
 */

export type ResourceDef = {
  key: string;
  label: string;
  group: string;
  /** What View grants. */
  view: string;
  /** What Edit grants on top of View. */
  edit: string;
  /** Flag surfaces that expose company-wide money or personnel data. */
  sensitive?: boolean;
};

export const RESOURCE_GROUPS = [
  "Main",
  "Sales",
  "Team",
  "Marketing",
  "Mentees",
  "Payments",
  "Reporting",
  "System",
] as const;

export const RESOURCES: ResourceDef[] = [
  {
    key: "home",
    label: "Home",
    group: "Main",
    view: "Personal, role-aware daily feed — today's numbers, focus items and alerts for your own role.",
    edit: "No separate edit actions of its own — a computed summary of data logged elsewhere.",
  },
  {
    key: "dashboard",
    label: "Main Hub",
    group: "Main",
    sensitive: true,
    view: "Company KPIs, cash collected, funnel, weekly digest and sparkline trends for the selected date range.",
    edit: "Rearrange tiles and save custom dashboard widgets / metric definitions.",
  },
  {
    key: "leads",
    label: "Legacy Leads",
    group: "Sales",
    view: "Legacy lead table with application answers, stage, priority, pre-call video status and full activity timeline.",
    edit: "Change legacy lead status / stage / priority, toggle pre-call video watched, add notes, and run lead AI insights.",
  },
  {
    key: "eod_reports",
    label: "EOD Reports",
    group: "Sales",
    view: "The one-question-at-a-time EOD flow for DM Setter, Dialer and Closer.",
    edit: "Submit a daily EOD report for any of the three roles.",
  },
  {
    key: "dm_setter",
    label: "DM Setter dashboard",
    group: "Sales",
    view: "Setter activity: conversations, qualified convos, sets, show rate — plus the 5% payout tile.",
    edit: "Log and correct daily setter activity rows.",
  },
  {
    key: "inbound_dialer",
    label: "Inbound Dialer dashboard",
    group: "Sales",
    view: "Dial volume, connects, sets and the 5% payout tile.",
    edit: "Log and correct daily dialer activity rows.",
  },
  {
    key: "closer",
    label: "Closer dashboard",
    group: "Sales",
    view: "Calls, show rate, close rate, cash collected and the 10% payout tile.",
    edit: "Log call outcomes, cash collected, objections and key moments.",
  },
  {
    key: "team",
    label: "Team Members",
    group: "Team",
    sensitive: true,
    view: "Roster of setters, dialers and closers with their active status.",
    edit: "Add / deactivate members, change their role, and open per-person permission overrides.",
  },
  {
    key: "team_calendar",
    label: "Team Calendars",
    group: "Team",
    view: "Combined Google Calendar view of every connected rep's booked sales calls, plus confirmation status.",
    edit: "Connect/disconnect a rep's calendar and change a booking's confirmation status.",
  },
  {
    key: "hiring",
    label: "Hiring",
    group: "Team",
    sensitive: true,
    view: "Applicant pipeline with AI fit scores and interview stages.",
    edit: "Move applicants between stages, score them, and record notes.",
  },
  {
    key: "content_calendar",
    label: "Content Calendar",
    group: "Marketing",
    view: "The month calendar of scheduled posts with full script, hook, CTA and posting instructions.",
    edit: "Reschedule posts, edit posting instructions, and mark pieces as posted.",
  },
  {
    key: "content",
    label: "Content Intelligence",
    group: "Marketing",
    view: "Pipeline board and content table with per-post metrics and retention analysis.",
    edit: "Move pieces through Draft → Ready to Post, schedule them, and run AI content coaching.",
  },
  {
    key: "sequences",
    label: "Story Sequences",
    group: "Marketing",
    view: "Weekly story sequence templates and their slide plans.",
    edit: "Create, rewrite and schedule story sequences.",
  },
  {
    key: "copy",
    label: "Client DNA",
    group: "Marketing",
    view: "C4's client profile, positioning, and offer/ticket configuration.",
    edit: "Edit client DNA and extract voice fingerprints.",
  },
  {
    key: "vsl",
    label: "VSL Analytics",
    group: "Marketing",
    view: "Wistia metrics, retention KPIs, transcript timeline and drop-off analysis.",
    edit: "Import metrics, edit scripts / transcripts and run bottleneck analysis.",
  },
  {
    key: "webinar_analytics",
    label: "Webinar Analytics",
    group: "Marketing",
    view: "Acquisition, attendance and revenue metrics for every webinar.",
    edit: "Import/link acquisition spend and webinar-provider metrics.",
  },
  {
    key: "attribution",
    label: "Attribution",
    group: "Marketing",
    sensitive: true,
    view: "First-touch content → lead → call → cash joins, so you can see which post produced revenue.",
    edit: "Adjust attribution mapping and save attribution segments.",
  },
  {
    key: "traffic",
    label: "Traffic",
    group: "Marketing",
    view: "Traffic source performance and volume trends.",
    edit: "Add, rename or deactivate traffic sources.",
  },
  {
    key: "outreach",
    label: "Messaging (Email & SMS)",
    group: "Marketing",
    view: "Recipient lists and the send queue with delivery status.",
    edit: "Create lists, compose, schedule and queue email / SMS blasts.",
  },
  {
    key: "onboarding",
    label: "Mentee Onboarding",
    group: "Mentees",
    view: "Intake responses with bottleneck / double-down signals and the aggregate insight panel.",
    edit: "Send intake links and run AI intake analysis.",
  },
  {
    key: "fulfillment",
    label: "Mentee Results",
    group: "Mentees",
    view: "Logged mentee wins, screenshots and magnitude.",
    edit: "Add, edit and delete wins (these also feed Client DNA proof memory).",
  },
  {
    key: "payments",
    label: "Payments",
    group: "Payments",
    sensitive: true,
    view: "Master payment ledger — every payment with processor, payment type (deposit / installment / PIF / renewal), cash collected vs. contract value, real catalog-linked payment-plan structure, and ticket tier, company-wide — plus the full mentee roster, renewal pipeline, health/at-risk tracking, and retention analytics (formerly the separate Mentees & Renewals page).",
    edit: "Manually log processor, payment type, and failure reason on individual payment records; edit mentee records, financial terms at intake, renewal stage and notes.",
  },
  {
    key: "weekly_report",
    label: "Weekly Report",
    group: "Reporting",
    sensitive: true,
    view: "Cash, calls, funnel, content, rep performance, client health and hiring pipeline for the past 7 days, reused from the same numbers each module already computes.",
    edit: "Send the report to your connected Discord/Slack/n8n channel.",
  },
  {
    key: "events",
    label: "Event Bus",
    group: "System",
    sensitive: true,
    view: "Raw event stream and webhook delivery log.",
    edit: "Replay events and manage webhook subscriptions.",
  },
];

/** Route path → resource key — the one place that decides what a URL is
 * "gated as," reused by both the sidebar's nav filtering and the real
 * route-level access gate (RouteAccessGate in resource-gate.tsx), so the
 * two can never drift into showing a nav item for a page the route gate
 * then blocks (or vice versa). A path with no entry here (e.g. /settings,
 * /permissions, /login) is intentionally NOT resource-gated — either a
 * personal-account page every signed-in user needs regardless of role, or
 * already hard-gated its own way. `/content` deliberately maps to
 * "content" even for its Traffic/Attribution/Content-Signals section
 * anchors below, since those are the same page/component — see the
 * override list. */
export const PATH_TO_RESOURCE: Record<string, string> = {
  "/home": "home",
  "/dashboard": "dashboard",
  "/leads": "leads",
  "/eod-reports": "eod_reports",
  "/dm-setter": "dm_setter",
  "/inbound-dialer": "inbound_dialer",
  "/closer": "closer",
  "/team": "team",
  "/team-calendar": "team_calendar",
  "/hiring": "hiring",
  "/content-calendar": "content_calendar",
  "/content": "content",
  "/sequences": "sequences",
  "/copy": "copy",
  "/vsl": "vsl",
  "/webinar-analytics": "webinar_analytics",
  "/attribution": "attribution",
  "/traffic": "traffic",
  "/outreach": "outreach",
  "/onboarding": "onboarding",
  "/fulfillment": "fulfillment",
  "/payments": "payments",
  "/weekly-report": "weekly_report",
  "/events": "events",
};

export const ROLES = [
  "admin",
  "sales_manager",
  "growth_ops",
  "setter",
  "inbound_dialer",
  "closer",
  "viewer",
] as const;
export type ManagedRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<ManagedRole, string> = {
  admin: "Admin",
  sales_manager: "Sales manager",
  growth_ops: "Growth ops",
  setter: "DM setter",
  inbound_dialer: "Dialer",
  closer: "Closer",
  viewer: "Viewer",
};

export const ROLE_BLURBS: Record<ManagedRole, string> = {
  admin: "Full operator access — money, personnel and integrations.",
  sales_manager: "Runs the sales floor: leads, reps, team, hiring.",
  growth_ops:
    "Full operator access, same as owner — content, personnel, payments, hiring, reporting and the event bus, plus the only role (besides the owner) trusted to manually correct EOD reports, rep dashboards, and payment records when automation misses.",
  setter: "Own DM pipeline and lead notes only.",
  inbound_dialer: "Own inbound call queue, callbacks and lead notes only.",
  closer: "Own calls, cash logging, payment context and booked-lead context only.",
  viewer: "Read-only observer — no edits anywhere.",
};

/** The manual-backfill resource set — lets someone correct or fill in a KPI
 * card's underlying row when an automated log/import fails. Deliberately
 * exclusive to growth_ops/owner (per explicit instruction: "only I should be
 * able to access the edit feature — not even the admin") — admin's normal
 * full-access grant below carves these back out to read-only. Narrowed from
 * an earlier, wider list: admin regained edit rights on Mentee
 * Onboarding/Results, so only the rep-activity-logging and payment-record
 * surfaces stay admin-exclusive-to-growth-ops. */
const GROWTH_OPS_BACKFILL_RESOURCES = [
  "eod_reports",
  "dm_setter",
  "inbound_dialer",
  "closer",
  "payments",
];

/** What a non-manager rep (setter/inbound_dialer/closer) — and, read-only,
 * a plain viewer — can already reach today (mirrors app-sidebar.tsx's own
 * RESTRICTED_ALLOW route set, the thing that actually gates their nav).
 * Kept as one shared list so the two never drift apart again: a rep sees
 * their own dashboard for logging, everyone's rep dashboards + Team/Team
 * Calendars for context, and Home/Onboarding/Fulfillment as reference. VSL
 * Analytics and Content Calendar were removed from rep visibility — those
 * are marketing-reference surfaces now scoped to managers/growth ops only. */
const REP_VISIBLE_RESOURCES = [
  "home",
  "dashboard",
  "leads",
  "team",
  "team_calendar",
  "dm_setter",
  "inbound_dialer",
  "closer",
  "eod_reports",
  "onboarding",
  "fulfillment",
];

/** Sales manager's real, narrowed view — runs the sales floor (reps, leads,
 * hiring, team) plus enough money/marketing-performance visibility to do the
 * job, but no longer touches Content/Copy/Sequences/Attribution/Traffic/
 * Messaging at all (that's growth ops' exclusive marketing domain now). */
const SALES_MANAGER_VISIBLE = [
  "home",
  "dashboard",
  "leads",
  "eod_reports",
  "dm_setter",
  "inbound_dialer",
  "closer",
  "team",
  "team_calendar",
  "hiring",
  "vsl",
  "webinar_analytics",
  "onboarding",
  "fulfillment",
  "payments",
  "weekly_report",
];

/** Of what sales manager can see, what they can actually change — narrower
 * than view: they run people and pipeline (reps, leads, team, hiring,
 * mentee onboarding/results), but no longer edit Main Hub, Payments, VSL,
 * Webinar Analytics or Weekly Report — those stay read-only reference for
 * them even though they're visible. */
const SALES_MANAGER_EDITABLE = [
  "leads",
  "eod_reports",
  "dm_setter",
  "inbound_dialer",
  "closer",
  "team",
  "team_calendar",
  "hiring",
  "onboarding",
  "fulfillment",
];

/** Sensible starting point when no explicit row exists yet. */
export function defaultPerm(
  role: string,
  resource: string,
): { can_view: boolean; can_edit: boolean } {
  switch (role) {
    case "owner":
      // The account holder — always full access, no carve-out (unlike
      // admin below). "Owners always keep full access" is an existing,
      // literal promise made in the Access Control UI's own copy.
      return { can_view: true, can_edit: true };
    case "admin":
      // Full access everywhere EXCEPT the backfill resource set, which is
      // deliberately exclusive to growth_ops/owner — admin can still view
      // these (running the business), just not log/correct data through
      // them.
      return {
        can_view: true,
        can_edit: !GROWTH_OPS_BACKFILL_RESOURCES.includes(resource),
      };
    case "growth_ops":
      // Full operator access, same as owner — the only role (besides
      // owner) trusted with the backfill resource set above, and now also
      // trusted with everything else: content, personnel, hiring, payments,
      // weekly report and the event bus. Nothing is carved out for this
      // role — it is a second full-access seat, deliberately.
      return { can_view: true, can_edit: true };
    case "sales_manager":
      return {
        can_view: SALES_MANAGER_VISIBLE.includes(resource),
        can_edit: SALES_MANAGER_EDITABLE.includes(resource),
      };
    case "setter":
      return {
        can_view: REP_VISIBLE_RESOURCES.includes(resource),
        can_edit: ["leads", "dm_setter", "eod_reports"].includes(resource),
      };
    case "inbound_dialer":
      return {
        can_view: REP_VISIBLE_RESOURCES.includes(resource),
        can_edit: ["leads", "inbound_dialer", "eod_reports"].includes(resource),
      };
    case "closer":
      // Closer sees everything a rep sees, plus Payments (so they can see
      // real cash-collected context on their own deals), and can edit Team
      // Calendars (so they can manage their own booked-call confirmations)
      // on top of their usual own-dashboard/leads/EOD editing.
      return {
        can_view: REP_VISIBLE_RESOURCES.includes(resource) || resource === "payments",
        can_edit: ["leads", "closer", "eod_reports", "team_calendar"].includes(resource),
      };
    default: // viewer — same reach as a rep, but read-only everywhere.
      return { can_view: REP_VISIBLE_RESOURCES.includes(resource), can_edit: false };
  }
}

export const PRESETS = [
  { key: "full", label: "Full access", apply: () => ({ can_view: true, can_edit: true }) },
  { key: "view", label: "View only", apply: () => ({ can_view: true, can_edit: false }) },
  { key: "none", label: "No access", apply: () => ({ can_view: false, can_edit: false }) },
] as const;
