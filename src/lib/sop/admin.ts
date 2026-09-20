import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeAdmin from "@/assets/sop/home-admin.png";
import homeAdminScroll from "@/assets/sop/home-admin-scroll.png";
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
import contentCommandCenter from "@/assets/sop/content-command-center.png";
import webinarAnalytics from "@/assets/sop/webinar-analytics.png";
import weeklyReport from "@/assets/sop/weekly-report.png";
import onboarding from "@/assets/sop/onboarding.png";
import fulfillment from "@/assets/sop/fulfillment.png";
import events from "@/assets/sop/events.png";
import settings from "@/assets/sop/settings.png";
import accessControl from "@/assets/sop/access-control-admin.png";
import logDayDialog from "@/assets/sop/log-day-dialog.png";

export const adminSop: SopDoc = {
  key: "admin",
  roleTitle: "Admin",
  tagline: "Full operator access — money, personnel and integrations.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "You run the whole operating system — every page in this app is visible to you, and you can edit almost all of it. Your two exclusive responsibilities no other role has: Access Control (deciding what every other role can see and change) and the Event Bus (the raw system/webhook layer). There's also one thing you deliberately CANNOT edit — explained in its own section below — and understanding why is part of running this well.",
        },
        {
          type: "callout",
          tone: "info",
          title: "The one thing that's different about your access",
          text: 'You can VIEW everything, including EOD Reports, the three rep dashboards, and Payments — but you cannot EDIT (log/correct data) on those specifically. That capability is deliberately reserved for Growth Ops (and the account owner) alone, so there is exactly one accountable person for manual data corrections on rep payouts instead of several. This was a direct decision, not an oversight — see "What you can\'t edit, on purpose" below.',
        },
      ],
    },
    {
      id: "shell",
      title: "The app shell — how to move around",
      blocks: [
        {
          type: "paragraph",
          text: "The thin icon rail on the far left is every category in the app. Click one and a panel slides out with the pages inside it.",
        },
        {
          type: "screenshot",
          src: sidebarExpanded,
          alt: "Sidebar expanded showing the Sales category panel",
          caption: "Click a rail icon to open its panel, then click a page to go there.",
        },
        {
          type: "paragraph",
          text: "You see every category, every page — nothing is hidden from your navigation. The rail order: Home, Main, Sales, Rep Dash, Team (Team Members, Team Calendars, Hiring), Mentees, Payments, Content, Analytics, then in the utility footer: Client DNA, System (Event Bus + Settings + Access Control), Help.",
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
            "Search box / ⌘K — see below.",
            "Bell: notifications. Sun/moon: theme. Gear: Settings.",
            "Every page's date-range row (Today / Yesterday / 7d / 30d / MTD / All / Custom) controls every number on that page.",
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
          type: "list",
          items: [
            'Type any lead, client, or content title — real matches from your actual data appear under "Results."',
            "Type a metric name (roughly 150 real ones are indexed, across every page) to jump straight to it.",
            '"Quick actions" jumps straight into logging flows.',
            'Type nothing and scroll "Go to" for every page in the app — you\'ll see the complete list, since nothing is hidden from you.',
          ],
        },
      ],
    },
    {
      id: "home-and-main",
      title: "Home & Main Hub",
      blocks: [
        {
          type: "screenshot",
          src: homeAdmin,
          alt: "Home page for an Admin role",
          caption: "Your Home view — business health, attention required, team & hiring.",
        },
        {
          type: "screenshot",
          src: homeAdminScroll,
          alt: "Home page scrolled further",
          caption: "Scroll for renewals at risk and more context.",
        },
        {
          type: "screenshot",
          src: mainHub,
          alt: "Main Hub executive dashboard",
          caption:
            "Main Hub — the complete executive view, including Ad Spend/ROAS and portfolio tiers.",
        },
        {
          type: "paragraph",
          text: "\"Not tracked\" cards (MRR, Ad Spend/ROAS when unconnected) are honest empty states for data this workspace's schema doesn't have wired yet — never a fake zero. If you want one of these connected, that's a real data-integration project, not a settings toggle.",
        },
      ],
    },
    {
      id: "reps",
      title: "Reps, Leads, and EOD — viewing (not editing)",
      blocks: [
        {
          type: "paragraph",
          text: "Rep Dash gives you all three rep dashboards with the exact same view every rep sees, and Sales → Legacy Leads / EOD Reports show the same full pipeline and logging history. You have full view access here, and full edit access on Legacy Leads specifically (status, stage, priority, notes, AI insights) — logging activity itself (Log Day/Log Call/EOD submission) is the one thing carved out, see below.",
        },
        {
          type: "screenshot",
          src: leads,
          alt: "Legacy Leads table",
          caption: "Legacy Leads — you have full edit access here.",
        },
      ],
    },
    {
      id: "cant-edit",
      title: "What you can't edit, on purpose",
      blocks: [
        {
          type: "screenshot",
          src: logDayDialog,
          alt: "Log Day dialog, disabled for admin",
          caption:
            "If you open a rep dashboard, the Log Day / Log Call button is visibly disabled for you — this is intentional, not a bug.",
        },
        {
          type: "table",
          headers: ["Page", "What you can't do"],
          rows: [
            ["EOD Reports", "Submit a report on a rep's behalf."],
            [
              "DM Setter / Inbound Dialer / Closer dashboards",
              "Log Day / Log Call — the button is visibly disabled.",
            ],
            [
              "Payments",
              "Manually log processor, payment type, or failure reason; edit mentee financial terms.",
            ],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "If a rep genuinely needs a manual correction on one of these, route it to Growth Ops (or the owner) — that's not a limitation of the software, it's a deliberate accountability decision made when this permission system was built. You can see everything on these pages to verify the data is right; you just don't write to it directly. Mentee Onboarding and Mentee Results are NOT on this list — you have full edit access there, covered below.",
        },
      ],
    },
    {
      id: "team",
      title: "Team — full personnel management",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members is fully yours: add reps, deactivate them, change roles, manage individual access overrides.",
        },
        {
          type: "screenshot",
          src: teamRoster,
          alt: "Team roster tab",
          caption: "Roster — add/deactivate reps and change roles here.",
        },
        {
          type: "screenshot",
          src: teamPerformance,
          alt: "Team performance tab",
          caption: "Performance — leaderboards and Rep KPI Targets.",
        },
        {
          type: "screenshot",
          src: teamAccess,
          alt: "Team access tab",
          caption:
            "Access — approve pending requests, or open a person's individual override dialog.",
        },
        {
          type: "screenshot",
          src: teamCalendar,
          alt: "Team Calendars page",
          caption: "Team Calendars — connect each rep's real Google Calendar ID here.",
        },
      ],
    },
    {
      id: "hiring",
      title: "Hiring — full pipeline management",
      blocks: [
        {
          type: "screenshot",
          src: hiring,
          alt: "Hiring pipeline overview",
          caption: "Applicant totals and AI fit scores, split by Closer/Setter/Dialer track.",
        },
        {
          type: "screenshot",
          src: hiringKanban,
          alt: "Hiring kanban board",
          caption: "Drag a card between stage columns to move an applicant forward.",
        },
      ],
    },
    {
      id: "mentees",
      title: "Onboarding & Mentee Results — full edit access",
      blocks: [
        {
          type: "screenshot",
          src: onboarding,
          alt: "Mentee Onboarding page",
          caption: "Send intake links and run AI intake analysis — same as Growth Ops.",
        },
        {
          type: "screenshot",
          src: fulfillment,
          alt: "Mentee Results page",
          caption: "Add, edit, or delete a logged win — these also feed Client DNA's proof memory.",
        },
      ],
    },
    {
      id: "payments",
      title: "Payments — full view, edit on structure not on logging",
      blocks: [
        {
          type: "screenshot",
          src: payments,
          alt: "Payments page",
          caption: "The full ledger and stat row.",
        },
        {
          type: "screenshot",
          src: paymentsOps,
          alt: "Payment Notifications and Recovery Queue",
          caption: "Live payment notifications and the single Recovery Queue.",
        },
        {
          type: "paragraph",
          text: 'You can view every number here in full detail. Manual record-level corrections (processor, payment type, failure reason) are the one action reserved for Growth Ops on this page — see "What you can\'t edit" above.',
        },
      ],
    },
    {
      id: "content-and-analytics",
      title: "Content & Analytics — full edit access",
      blocks: [
        {
          type: "screenshot",
          src: contentCommandCenter,
          alt: "Content Command Center",
          caption: "Full edit access — same as Growth Ops.",
        },
        {
          type: "screenshot",
          src: webinarAnalytics,
          alt: "Webinar Analytics page",
          caption: "Full edit access — import metrics, link acquisition spend.",
        },
        {
          type: "screenshot",
          src: weeklyReport,
          alt: "Weekly Report page",
          caption: "Weekly Report — you can send this to your connected Discord/Slack/n8n channel.",
        },
      ],
    },
    {
      id: "system",
      title: "System — Event Bus & Settings",
      blocks: [
        {
          type: "screenshot",
          src: events,
          alt: "Event Bus page",
          caption:
            "The raw event stream and webhook delivery log — replaying events and managing webhook subscriptions is admin-exclusive.",
        },
        {
          type: "screenshot",
          src: settings,
          alt: "Settings page",
          caption:
            "Appearance, workspace details, and the Content Engine's real tunable thresholds.",
        },
        {
          type: "list",
          items: [
            "Appearance — dark/light theme, applies to your own session only.",
            "Workspace — your workspace name, your signed-in identity, your role, and the default reporting date range.",
            "Content Engine & Alerts — real numeric thresholds the Content Signals engine uses (minimum sample size before showing a performance verdict, baseline window, minimum signal weight, weekly reel target, etc.). Changes here apply the moment you save — know what you're changing before you change it.",
          ],
        },
      ],
    },
    {
      id: "access-control",
      title: "Access Control — your exclusive responsibility",
      blocks: [
        {
          type: "paragraph",
          text: "System → Access Control is the single source of truth for what every role can see and change in this entire application. This is real, enforced access — not a suggestion. Changing a toggle here actually hides the page from that role's sidebar and blocks direct navigation to it.",
        },
        {
          type: "screenshot",
          src: accessControl,
          alt: "Access Control page with Admin role selected",
          caption: "Pick a role tab, then toggle View/Edit per page. Save changes to make it real.",
        },
        {
          type: "steps",
          items: [
            "Pick a role tab across the top (Admin, Sales manager, Growth ops, DM setter, Dialer, Closer, Viewer).",
            "Each page below shows exactly what View grants and what Edit grants on top of it — read both before toggling.",
            'Use "Full access" / "View only" / "No access" at the top to bulk-set every page for that role in one click, or toggle individual pages.',
            'Click "Save changes" — nothing takes effect until you do. "Revert to original" discards anything unsaved and goes back to what\'s actually live.',
            "You cannot switch roles while you have unsaved changes — save or revert first. This is intentional, so you never accidentally lose an edit.",
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "Sensitive pages (marked with a lock icon — Main Hub, Team, Hiring, Attribution, Payments, Weekly Report, Event Bus) are the ones most likely to expose money or personnel data. Think twice before granting View there to a rep-level role.",
        },
        {
          type: "paragraph",
          text: 'For a specific PERSON rather than a whole role, open Team → Access and click "Access" next to their name — this opens a per-person override dialog with the exact same View/Edit toggles, Save/Revert, and a "Reset to role defaults" button. A person-level override always beats their role\'s default.',
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
            "Open Home, then Main Hub — scan the top-line numbers.",
            "Check Payments Recovery Queue for anything overdue or failed.",
            "Check Team → Access for pending access requests.",
          ],
        },
        {
          type: "heading",
          level: 3,
          text: "Weekly / as-needed",
        },
        {
          type: "steps",
          items: [
            "Review Access Control after any role change or new hire — confirm the new person's access matches their actual job.",
            "Review Hiring pipeline.",
            "Check Event Bus for any failed webhook deliveries.",
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
              q: "I toggled a permission off but the person still sees the page.",
              a: "Did you click \"Save changes\"? Toggling alone only stages a draft — nothing is real until it's saved. Also check whether that person has a person-level override in Team → Access that's beating the role default.",
            },
            {
              q: "Why can't I log a call/day even as admin?",
              a: "That's intentional — see \"What you can't edit, on purpose\" above. Route the correction to Growth Ops.",
            },
            {
              q: 'A metric card reads "Not tracked" — how do I fix that?',
              a: "It means the underlying data source (e.g. ad spend, MRR) isn't connected in this workspace's schema yet. That's a real data-integration project, not a settings change.",
            },
          ],
        },
      ],
    },
  ],
};
