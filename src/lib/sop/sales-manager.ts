import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeSalesManager from "@/assets/sop/home-sales-manager.png";
import mainHub from "@/assets/sop/main-hub.png";
import leads from "@/assets/sop/leads.png";
import teamRoster from "@/assets/sop/team-roster-tab.png";
import teamAccess from "@/assets/sop/team-access-tab.png";
import teamPerformance from "@/assets/sop/team-performance-tab.png";
import teamCalendar from "@/assets/sop/team-calendar.png";
import hiring from "@/assets/sop/hiring.png";
import hiringKanban from "@/assets/sop/hiring-kanban.png";
import payments from "@/assets/sop/payments.png";
import paymentsOps from "@/assets/sop/payments-operations.png";
import paymentsRenewal from "@/assets/sop/payments-renewal-pipeline.png";
import vsl from "@/assets/sop/vsl-analytics.png";
import webinarAnalytics from "@/assets/sop/webinar-analytics.png";
import weeklyReport from "@/assets/sop/weekly-report.png";
import onboarding from "@/assets/sop/onboarding.png";
import fulfillment from "@/assets/sop/fulfillment.png";
import logDayDialog from "@/assets/sop/log-day-dialog.png";
import logCallDialog from "@/assets/sop/log-call-dialog.png";

export const salesManagerSop: SopDoc = {
  key: "sales_manager",
  roleTitle: "Sales Manager",
  tagline: "Runs the sales floor: leads, reps, team, hiring.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "You own the sales floor end to end — every setter, every dialer, every closer, every lead, and the pipeline they all feed, plus the team roster and hiring pipeline that keeps it staffed. Your edit access is real but scoped tightly to people and pipeline: reps, leads, team, hiring, and mentee onboarding/results. Company money (Main Hub, Payments) and marketing performance (VSL, Webinar Analytics, Weekly Report) are visible to you for context, but editing those — and anything content/marketing-related — belongs to growth ops.",
        },
        {
          type: "callout",
          tone: "info",
          title: "What this document covers",
          text: "Every page in your sidebar, in the order you'll actually use them: your daily view (Home, Main Hub), your reps (Team, Rep Dashboards, EOD, Leads), your hiring pipeline, your mentee onboarding/results, and the money/marketing pages you can see but not edit.",
        },
      ],
    },
    {
      id: "shell",
      title: "The app shell — how to move around",
      blocks: [
        {
          type: "paragraph",
          text: "The thin icon rail on the far left is every category available to you. Click one and a panel slides out with the pages inside it.",
        },
        {
          type: "screenshot",
          src: sidebarExpanded,
          alt: "Sidebar expanded showing the Sales category panel",
          caption: "Click a rail icon to open its panel, then click a page to go there.",
        },
        {
          type: "table",
          headers: ["Category", "Pages inside", "Your access"],
          rows: [
            ["Home", "Your personal daily feed", "View"],
            ["Main", "Main Hub — company-wide KPIs", "View only"],
            ["Sales", "Legacy Leads, EOD Reports", "View + edit"],
            [
              "Rep Dash",
              "DM Setter, Inbound Dialer, Closer",
              "View + edit (you can log on a rep's behalf if needed)",
            ],
            [
              "Team",
              "Team Members, Team Calendars, Hiring",
              "View + edit — add/deactivate reps, manage access, run hiring",
            ],
            ["Mentees", "Onboarding, Mentee Results", "View + edit"],
            ["Payments", "Master payment ledger + renewals", "View only"],
            ["Content", "Content Command Center, Content Calendar", "Not visible"],
            ["Client DNA", "Offer/positioning reference", "Not visible"],
            ["Attribution / Traffic / Messaging", "Marketing-performance pages", "Not visible"],
            ["Analytics", "VSL, Webinar Analytics, Weekly Report", "View only"],
            ["System", "Event Bus, Settings", "Event Bus: not visible. Settings: view."],
            ["Access Control", "Role/permission management", "Not visible — admin-only"],
            ["Help", "This document", "Always visible"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Content, Client DNA, Attribution, Traffic and Messaging are entirely growth ops' domain now — not just no-edit, genuinely hidden from your sidebar. If you need something changed there, route it to growth ops rather than looking for it in your own nav.",
        },
        {
          type: "heading",
          level: 3,
          text: "The top bar — same on every page",
        },
        {
          type: "list",
          items: [
            "Far left: today's date and a live company-wide cash/calls ticker.",
            "Search box / ⌘K (see next section).",
            "Bell: notifications. Sun/moon: theme. Gear: Settings.",
            "Every page's date-range row (Today / Yesterday / 7d / 30d / MTD / All / Custom) controls every number below it — always check it before drawing a conclusion from a card.",
          ],
        },
      ],
    },
    {
      id: "search",
      title: "Search — how to find anything in three seconds",
      blocks: [
        {
          type: "paragraph",
          text: "Press ⌘K (Mac) / Ctrl+K (Windows) from anywhere, or click the search box top right.",
        },
        {
          type: "screenshot",
          src: commandPalette,
          alt: "Command palette open",
          caption: "⌘K / Ctrl+K opens this from any page.",
        },
        {
          type: "steps",
          items: [
            'Type any lead, client, or content title — real matches appear under "Results."',
            'Type a metric name ("close rate", "cash collection rate", "hired") to jump straight to the page it lives on — there are roughly 150 real metric names indexed.',
            "\"Quick actions\" jumps straight into Log Day (DM Setter/Dialer) or Log Call (Closer) without navigating there first — useful if you're logging on a rep's behalf.",
            'Leave it blank and scroll "Go to" for every page you have access to.',
          ],
        },
      ],
    },
    {
      id: "home-and-main",
      title: "Home & Main Hub — your daily and company-wide view",
      blocks: [
        {
          type: "paragraph",
          text: "Home is your personal snapshot — open it first every login. Main Hub is the full company view — every executive KPI, the funnel, content performance, and rep leaderboards in one place. You can view every number here in full detail; you can't rearrange tiles or edit dashboard widgets — that's admin/growth ops territory.",
        },
        {
          type: "screenshot",
          src: homeSalesManager,
          alt: "Home page for a Sales Manager role",
          caption: "Your Home view — team health, attention required, hiring pipeline.",
        },
        {
          type: "screenshot",
          src: mainHub,
          alt: "Main Hub executive dashboard",
          caption: "Main Hub — the full executive view of the business.",
        },
        {
          type: "heading",
          level: 3,
          text: "Reading the top row",
        },
        {
          type: "list",
          items: [
            "Total Cash Collected / Total Revenue Generated — the two headline numbers for the selected range.",
            'Ad Cash Collected / Ad Total Revenue / Ad Spend / ROAS — the portion of cash/revenue specifically traceable to paid ad leads (Meta/Google), and what you spent to get it. These read "Not tracked" until real ad-spend and traffic-source data exists for the range — that\'s an honest empty state, never a fake number.',
            'MRR — Low Ticket / Low & High Ticket Active — recurring-revenue and client-tier tracking (MRR reads "Not tracked" until that field exists in the schema).',
          ],
        },
        {
          type: "paragraph",
          text: "Below the top row: the Cash Collected vs. Revenue Generated chart, Month-End Pace (are you on track to hit the monthly target), Company KPIs (New Leads, Total Views), and further down, Level 2 Operating Metrics and rep leaderboards. Use the Social Platform and Acquisition Source filters at the top right to narrow everything on the page to one channel.",
        },
      ],
    },
    {
      id: "leads",
      title: "Legacy Leads — the master pipeline",
      blocks: [
        {
          type: "paragraph",
          text: "Sales → Legacy Leads is the full lead table across every rep — the single source of truth for pipeline stage, priority, and full activity history.",
        },
        {
          type: "screenshot",
          src: leads,
          alt: "Legacy Leads table",
          caption: "Every lead, every stage, full activity timeline.",
        },
        {
          type: "list",
          items: [
            "Use the funnel breakdown to see where leads are actually getting stuck across the whole team, not just one rep.",
            "You can edit status/stage/priority on any lead, toggle pre-call video watched, add notes, and run the built-in lead AI insights.",
            "💎 Diamond leads are the highest-value leads in the pipeline — worth a personal check-in on these regardless of which rep owns them.",
          ],
        },
      ],
    },
    {
      id: "reps",
      title: "Managing reps — dashboards, EOD, and logging on their behalf",
      blocks: [
        {
          type: "paragraph",
          text: 'Rep Dash gives you all three rep dashboards (DM Setter, Inbound Dialer, Closer) — the same pages your reps use, with the same filters and cards, but with edit access. Use the "All team members" filter to look at one rep\'s numbers specifically for a 1:1, or leave it on "All" for a team view.',
        },
        {
          type: "screenshot",
          src: logDayDialog,
          alt: "Log Day dialog",
          caption:
            "You can open Log Day / Log Call yourself if a rep genuinely can't (phone dead, system down) — always log under the REP's real name, never your own.",
        },
        {
          type: "screenshot",
          src: logCallDialog,
          alt: "Log a sales call dialog",
          caption: "The Closer's Log Call form — same one your closers use.",
        },
        {
          type: "callout",
          tone: "warning",
          text: 'Every log is attributed to whoever\'s name is selected in the "Name"/"Closer name" field, not who\'s logged in. If you log on a rep\'s behalf, always pick their real name — never your own — or their payout and every report tied to them will be wrong.',
        },
        {
          type: "paragraph",
          text: "Sales → EOD Reports is the alternate, guided one-question-at-a-time logging flow for the same three roles — same underlying data as each dashboard's Log Day/Log Call dialog. Good to know exists in case a rep asks which one to use (either is fine, never both for the same entry).",
        },
      ],
    },
    {
      id: "team",
      title: "Team — roster, access, performance, and calendars",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members has four tabs. This is where you actually manage the team, not just watch it.",
        },
        {
          type: "screenshot",
          src: teamRoster,
          alt: "Team roster tab",
          caption: "Roster — every setter, dialer, and closer with active status.",
        },
        {
          type: "list",
          items: [
            "Overview — snapshot numbers for the whole team.",
            "Performance — live leaderboards (top closers, top setters), medal-bordered top 3, plus Rep KPI Targets — set and track individual targets here.",
            "Roster — add a new rep, deactivate one, or change someone's role.",
            "Access — see pending access requests, approve/deny them with a role assigned, and open a specific person's per-user permission overrides.",
          ],
        },
        {
          type: "screenshot",
          src: teamPerformance,
          alt: "Team performance tab with leaderboards",
        },
        {
          type: "screenshot",
          src: teamAccess,
          alt: "Team access tab",
          caption:
            "Approve pending access requests here, or open a person's individual Access dialog.",
        },
        {
          type: "screenshot",
          src: teamCalendar,
          alt: "Team Calendars page",
          caption:
            "Every rep's booked calls in one combined calendar — connect a rep's Google Calendar ID here.",
        },
        {
          type: "callout",
          tone: "tip",
          text: "Team Calendars needs each rep's real Google Calendar ID connected (Google Calendar → Settings → Integrate calendar) and shared publicly or with the team before it shows anything — this is a one-time setup per rep, not automatic.",
        },
      ],
    },
    {
      id: "hiring",
      title: "Hiring — the applicant pipeline",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Hiring is a full AI-scored applicant pipeline, separate tracks for Closer, Setter, and Dialer roles.",
        },
        {
          type: "screenshot",
          src: hiring,
          alt: "Hiring pipeline overview",
          caption: "Applicant totals, AI fit scores, and interview stages.",
        },
        {
          type: "screenshot",
          src: hiringKanban,
          alt: "Hiring kanban board",
          caption: "Drag a card between columns to move an applicant's stage.",
        },
        {
          type: "list",
          items: [
            'Click "Add applicant" to manually add someone, or applicants land here automatically from your intake pipeline.',
            "Drag a card between stage columns (Applied → Needs Grading → Interview Worthy → …) to move someone forward.",
            "Every applicant has an AI fit score and, once they've submitted a video/audio response, a transcript-quality score.",
          ],
        },
      ],
    },
    {
      id: "mentees",
      title: "Mentees — onboarding and results",
      blocks: [
        {
          type: "screenshot",
          src: onboarding,
          alt: "Mentee Onboarding page",
          caption: "Intake responses with bottleneck/double-down signals.",
        },
        {
          type: "screenshot",
          src: fulfillment,
          alt: "Mentee Results page",
          caption:
            "Logged mentee wins, screenshots, and magnitude — these also feed Client DNA's proof memory.",
        },
      ],
    },
    {
      id: "payments",
      title: "Payments — the full financial ledger and renewal pipeline",
      blocks: [
        {
          type: "paragraph",
          text: "Payments → Payments is the single largest page in the app — the master payment ledger plus the full mentee renewal/retention picture. This used to be two separate pages; it's now one, deliberately, so nothing about a client's money is ever split across two views.",
        },
        {
          type: "screenshot",
          src: payments,
          alt: "Payments page — ledger and stat cards",
          caption:
            "Total collected, contracted, outstanding, and failed & at-risk, plus the real payment ledger table.",
        },
        {
          type: "heading",
          level: 3,
          text: "The top stat row",
        },
        {
          type: "table",
          headers: ["Card", "Meaning"],
          rows: [
            ["Total Collected", "Real cash collected in the selected date range."],
            [
              "Total Contracted",
              "Total contract value for clients with at least one payment in this range.",
            ],
            [
              "Total Outstanding",
              "Money still owed, as of right now — not scoped to the date range (it's a live snapshot).",
            ],
            [
              "Failed & At-Risk",
              "Live count of payments that failed or are at risk — also not scoped to the date range, always current.",
            ],
          ],
        },
        {
          type: "screenshot",
          src: paymentsOps,
          alt: "Payment Notifications and Recovery Queue",
          caption: "Payment Notifications (live, computed) and the single Recovery Queue.",
        },
        {
          type: "list",
          items: [
            "Payment Notifications — a live, computed feed (overdue, failed, plans ending soon) built directly from real schedule/recovery records. It is explicitly not a persisted alert log — it recomputes every time you load the page.",
            'Recovery Queue — the ONE place to work failed/at-risk payments. Every action here (Reminder sent, Mark resolved) writes to the same record the "Failed & At-Risk" number above reads from, so the top number and the detail list can never disagree.',
          ],
        },
        {
          type: "screenshot",
          src: paymentsRenewal,
          alt: "Renewal pipeline kanban",
          caption:
            "Renewal Operations — drag a card between columns to update a mentee's renewal stage.",
        },
        {
          type: "list",
          items: [
            "Renewal Operations — a kanban you can drag cards through (Not Started → Outreach Started → Renewal Action/Next Step → Proposal Sent → Renewed) to move a mentee through the renewal process.",
            "Further down: the mentee roster, at-risk clients, LTV-by-offer, and retention analytics tabs — reference/analytical views, not daily-workflow ones.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "You have view-only access here — full detail on every payment, but manually correcting a processor, payment type, or failure reason is growth ops' exclusive job now. If a record looks wrong, flag it to them rather than trying to fix it yourself.",
        },
      ],
    },
    {
      id: "analytics",
      title: "Analytics — VSL, Webinar, and Weekly Report (view only)",
      blocks: [
        {
          type: "screenshot",
          src: vsl,
          alt: "VSL Analytics page",
          caption: "VSL Analytics — retention, drop-off, and transcript timeline.",
        },
        {
          type: "screenshot",
          src: webinarAnalytics,
          alt: "Webinar Analytics page",
          caption: "Webinar Analytics — acquisition, attendance, and revenue per webinar.",
        },
        {
          type: "screenshot",
          src: weeklyReport,
          alt: "Weekly Report page",
          caption:
            "Weekly Report — cash, calls, funnel, content, and hiring for the past 7 days, one page.",
        },
        {
          type: "paragraph",
          text: "All three are view-only for you now — real, full detail, but importing metrics, editing scripts/transcripts, and sending the Weekly Report to Discord/Slack/n8n require edit access you don't have. If the weekly recap needs to go out, route it to growth ops or an admin.",
        },
      ],
    },
    {
      id: "checklist",
      title: "Your daily / weekly checklist",
      blocks: [
        {
          type: "heading",
          level: 3,
          text: "Daily",
        },
        {
          type: "steps",
          items: [
            "Open Home — check Attention Required and hiring flags.",
            "Check Main Hub's top-line cash and pace numbers.",
            "Check the Payments Recovery Queue for anything overdue.",
            "Check Team → Performance for any rep whose numbers dropped off.",
          ],
        },
        {
          type: "heading",
          level: 3,
          text: "Weekly",
        },
        {
          type: "steps",
          items: [
            "Review the Weekly Report (ask growth ops/admin to send it if it hasn't gone out).",
            "Review Hiring pipeline — move stale applicants forward or out.",
            "Review Retention Analytics on Payments for renewal risk.",
          ],
        },
      ],
    },
    {
      id: "faq",
      title: "Common questions",
      blocks: [
        {
          type: "faq",
          items: [
            {
              q: "Why can't I see Access Control?",
              a: "It's admin-only, gated separately from every other page — sales managers run the floor but don't manage role permissions.",
            },
            {
              q: "Can I see the Event Bus?",
              a: "No — it's hidden from your sidebar entirely, along with Content, Client DNA, Attribution, Traffic and Messaging. Those are growth ops' domain now.",
            },
            {
              q: 'A number on Main Hub reads "Not tracked" — is that broken?',
              a: "No — it's an honest label for a metric that genuinely has no connected data source yet (ad spend, MRR). It will populate the moment real data exists; it is never a placeholder for a broken feature.",
            },
            {
              q: "I need a payment record corrected or a content piece changed — who do I ask?",
              a: "Growth ops. Both are outside your edit access by design (Payments is view-only for you; Content isn't visible to you at all).",
            },
          ],
        },
      ],
    },
  ],
};
