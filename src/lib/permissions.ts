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
  "Overview",
  "Sales",
  "Reps",
  "ContentOS",
  "CopyOS",
  "Fulfillment",
  "Ops",
] as const;

export const RESOURCES: ResourceDef[] = [
  {
    key: "dashboard", label: "Main Hub", group: "Overview", sensitive: true,
    view: "Company KPIs, cash collected, funnel, weekly digest and sparkline trends for the selected date range.",
    edit: "Rearrange tiles and save custom dashboard widgets / metric definitions.",
  },
  {
    key: "leads", label: "Leads CRM", group: "Sales",
    view: "Lead table with application answers, stage, priority, pre-call video status and full activity timeline.",
    edit: "Change lead status / stage / priority, toggle pre-call video watched, add notes, and run lead AI insights.",
  },
  {
    key: "outreach", label: "Messaging (Email & SMS)", group: "Sales",
    view: "Recipient lists and the send queue with delivery status.",
    edit: "Create lists, compose, schedule and queue email / SMS blasts.",
  },
  {
    key: "team", label: "Team Members", group: "Sales", sensitive: true,
    view: "Roster of setters, dialers and closers with their active status.",
    edit: "Add / deactivate members, change their role, and open per-person permission overrides.",
  },
  {
    key: "hiring", label: "Hiring", group: "Sales", sensitive: true,
    view: "Applicant pipeline with AI fit scores and interview stages.",
    edit: "Move applicants between stages, score them, and record notes.",
  },
  {
    key: "attribution", label: "Attribution", group: "Sales", sensitive: true,
    view: "First-touch content → lead → call → cash joins, so you can see which post produced revenue.",
    edit: "Adjust attribution mapping and save attribution segments.",
  },
  {
    key: "traffic", label: "Traffic", group: "Sales",
    view: "Traffic source performance and volume trends.",
    edit: "Add, rename or deactivate traffic sources.",
  },
  {
    key: "dm_setter", label: "DM Setter dashboard", group: "Reps",
    view: "Setter activity: conversations, qualified convos, sets, show rate — plus the 5% payout tile.",
    edit: "Log and correct daily setter activity rows.",
  },
  {
    key: "inbound_dialer", label: "Inbound Dialer dashboard", group: "Reps",
    view: "Dial volume, connects, sets and the 5% payout tile.",
    edit: "Log and correct daily dialer activity rows.",
  },
  {
    key: "closer", label: "Closer dashboard", group: "Reps",
    view: "Calls, show rate, close rate, cash collected and the 10% payout tile.",
    edit: "Log call outcomes, cash collected, objections and key moments.",
  },
  {
    key: "content_calendar", label: "Content Calendar", group: "ContentOS",
    view: "The month calendar of scheduled posts with full script, hook, CTA and posting instructions.",
    edit: "Reschedule posts, edit posting instructions, and mark pieces as posted.",
  },
  {
    key: "content", label: "Content Intelligence", group: "ContentOS",
    view: "Pipeline board and content table with per-post metrics and retention analysis.",
    edit: "Move pieces through Draft → Ready to Post, schedule them, and run AI content coaching.",
  },
  {
    key: "sequences", label: "Story Sequences", group: "ContentOS",
    view: "Weekly story sequence templates and their slide plans.",
    edit: "Create, rewrite and schedule story sequences.",
  },
  {
    key: "copy", label: "CopyOS", group: "CopyOS",
    view: "Generated copy, angle bank, swipe library and client DNA profiles.",
    edit: "Generate new copy, save swipes and edit client DNA / voice fingerprints.",
  },
  {
    key: "clients", label: "Clients", group: "Fulfillment", sensitive: true,
    view: "Client roster with contract values, payment plans, renewals and health scores.",
    edit: "Edit client records, payments, renewal stage and notes.",
  },
  {
    key: "onboarding", label: "Onboarding", group: "Fulfillment",
    view: "Intake responses with bottleneck / double-down signals and the aggregate insight panel.",
    edit: "Send intake links and run AI intake analysis.",
  },
  {
    key: "fulfillment", label: "Client Results / Wins", group: "Fulfillment",
    view: "Logged student wins, screenshots and magnitude.",
    edit: "Add, edit and delete wins (these also feed CopyOS proof memory).",
  },
  {
    key: "vsl", label: "VSL Analytics", group: "Fulfillment",
    view: "Wistia metrics, retention KPIs, transcript timeline and drop-off analysis.",
    edit: "Import metrics, edit scripts / transcripts and run bottleneck analysis.",
  },
  {
    key: "insights", label: "AI Insights", group: "Ops",
    view: "Saved AI insights across every module.",
    edit: "Generate, save and dismiss insights.",
  },
  {
    key: "events", label: "Event Bus", group: "Ops", sensitive: true,
    view: "Raw event stream and webhook delivery log.",
    edit: "Replay events and manage webhook subscriptions.",
  },
  {
    key: "connectors", label: "Connectors & Channels", group: "Ops", sensitive: true,
    view: "Connected integrations and their sync status.",
    edit: "Connect / disconnect integrations and manage Discord / Slack / n8n routing.",
  },
];

export const ROLES = ["admin", "sales_manager", "growth_ops", "setter", "closer", "viewer"] as const;
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
export function defaultPerm(role: string, resource: string): { can_view: boolean; can_edit: boolean } {
  const def = RESOURCES.find(r => r.key === resource);
  const sensitive = !!def?.sensitive;
  switch (role) {
    case "admin":
      return { can_view: true, can_edit: true };
    case "sales_manager":
      return { can_view: true, can_edit: !["connectors", "events"].includes(resource) };
    case "growth_ops":
      return {
        can_view: !sensitive || resource === "attribution" || resource === "dashboard",
        can_edit: ["content", "content_calendar", "sequences", "copy", "insights", "traffic", "vsl"].includes(resource),
      };
    case "setter":
      return {
        can_view: ["dashboard", "leads", "dm_setter", "content_calendar", "insights"].includes(resource),
        can_edit: ["leads", "dm_setter"].includes(resource),
      };
    case "closer":
      return {
        can_view: ["dashboard", "leads", "closer", "clients", "content_calendar", "insights"].includes(resource),
        can_edit: ["leads", "closer"].includes(resource),
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
