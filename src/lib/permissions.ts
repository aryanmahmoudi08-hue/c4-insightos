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
  "Reporting",
  "System",
] as const;

export const RESOURCES: ResourceDef[] = [
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
    key: "clients",
    label: "Mentees & Renewals",
    group: "Mentees",
    sensitive: true,
    view: "Mentee roster with contract values, payment plans, renewals and health scores.",
    edit: "Edit mentee records, payments, renewal stage and notes.",
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

export const ROLES = [
  "admin",
  "sales_manager",
  "growth_ops",
  "setter",
  "closer",
  "viewer",
] as const;
export type ManagedRole = (typeof ROLES)[number];

export const ROLE_LABELS: Record<ManagedRole, string> = {
  admin: "Admin",
  sales_manager: "Sales manager",
  growth_ops: "Growth ops",
  setter: "DM setter",
  closer: "Closer",
  viewer: "Viewer",
};

export const ROLE_BLURBS: Record<ManagedRole, string> = {
  admin: "Full operator access — money, personnel and integrations.",
  sales_manager: "Runs the sales floor: leads, reps, payouts, hiring.",
  growth_ops: "Content, copy and attribution; no personnel or payout editing.",
  setter: "Own DM pipeline and lead notes only.",
  closer: "Own calls, cash logging and booked-lead context only.",
  viewer: "Read-only observer — no edits anywhere.",
};

/** Sensible starting point when no explicit row exists yet. */
export function defaultPerm(
  role: string,
  resource: string,
): { can_view: boolean; can_edit: boolean } {
  const def = RESOURCES.find((r) => r.key === resource);
  const sensitive = !!def?.sensitive;
  switch (role) {
    case "admin":
      return { can_view: true, can_edit: true };
    case "sales_manager":
      return { can_view: true, can_edit: resource !== "events" };
    case "growth_ops":
      return {
        can_view: !sensitive || resource === "attribution" || resource === "dashboard",
        can_edit: ["content", "content_calendar", "sequences", "copy", "traffic", "vsl"].includes(
          resource,
        ),
      };
    case "setter":
      return {
        can_view: ["dashboard", "leads", "dm_setter", "eod_reports", "content_calendar"].includes(
          resource,
        ),
        can_edit: ["leads", "dm_setter", "eod_reports"].includes(resource),
      };
    case "closer":
      return {
        can_view: [
          "dashboard",
          "leads",
          "closer",
          "eod_reports",
          "clients",
          "content_calendar",
        ].includes(resource),
        can_edit: ["leads", "closer", "eod_reports"].includes(resource),
      };
    default: // viewer
      return { can_view: !sensitive, can_edit: false };
  }
}

export const PRESETS = [
  { key: "full", label: "Full access", apply: () => ({ can_view: true, can_edit: true }) },
  { key: "view", label: "View only", apply: () => ({ can_view: true, can_edit: false }) },
  { key: "none", label: "No access", apply: () => ({ can_view: false, can_edit: false }) },
] as const;
