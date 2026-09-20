import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeGrowthOps from "@/assets/sop/home-growth-ops.png";
import mainHub from "@/assets/sop/main-hub.png";
import contentCommandCenter from "@/assets/sop/content-command-center.png";
import contentMid from "@/assets/sop/content-command-center-mid.png";
import contentCalendar from "@/assets/sop/content-calendar.png";
import sequences from "@/assets/sop/sequences.png";
import clientDna from "@/assets/sop/client-dna.png";
import vsl from "@/assets/sop/vsl-analytics.png";
import webinarAnalytics from "@/assets/sop/webinar-analytics.png";
import payments from "@/assets/sop/payments.png";
import paymentsOps from "@/assets/sop/payments-operations.png";
import onboarding from "@/assets/sop/onboarding.png";
import fulfillment from "@/assets/sop/fulfillment.png";
import eodPicker from "@/assets/sop/eod-reports-picker.png";
import logDayDialog from "@/assets/sop/log-day-dialog.png";
import logCallDialog from "@/assets/sop/log-call-dialog.png";
import teamRoster from "@/assets/sop/team-roster-tab.png";
import hiring from "@/assets/sop/hiring.png";
import hiringKanban from "@/assets/sop/hiring-kanban.png";
import weeklyReport from "@/assets/sop/weekly-report.png";
import events from "@/assets/sop/events.png";

export const growthOpsSop: SopDoc = {
  key: "growth_ops",
  roleTitle: "Growth Operator",
  tagline: "Full operator access, same as the owner — plus the exclusive backfill seat.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "You have full operator access to this entire application — every page, view and edit, the same reach as the account owner. On top of that, you carry a second, distinct responsibility this software gives to no other role, not even admin: you are the only person (besides the owner) who can manually correct or backfill a rep's activity log or a payment record when an automated flow genuinely fails. That combination — full visibility everywhere, plus sole backfill authority on the most sensitive data-entry surfaces — makes you the single most trusted seat in the workspace after the owner. Treat it accordingly.",
        },
        {
          type: "callout",
          tone: "warning",
          title: "Read this before anything else",
          text: "Not even the admin has edit access to EOD Reports, the three rep dashboards, or Payments in this workspace. That access was deliberately taken away from every other role (including admin) and given exclusively to you and the owner, specifically so there is exactly one accountable person for manual data corrections on the numbers that drive rep payouts. Use it to fix real problems — a rep's phone died mid-shift, an import silently failed, a payment record has the wrong processor — never to quietly adjust a number to make a report look better.",
        },
      ],
    },
    {
      id: "shell",
      title: "The app shell — how to move around",
      blocks: [
        {
          type: "paragraph",
          text: "The thin icon rail on the far left is every category in the app. Click one and a panel slides out with the pages inside it. Unlike every other role in this workspace, nothing in your rail is hidden or grayed out.",
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
            ["Home", "Your personal daily feed", "View + edit"],
            ["Main", "Main Hub", "View + edit"],
            ["Sales", "Legacy Leads, EOD Reports", "View + edit (EOD is backfill-exclusive)"],
            ["Rep Dash", "DM Setter, Inbound Dialer, Closer", "View + edit (backfill-exclusive)"],
            [
              "Team",
              "Team Members, Team Calendars, Hiring",
              "View + edit — full personnel management",
            ],
            ["Mentees", "Onboarding, Mentee Results", "View + edit"],
            ["Payments", "Master payment ledger", "View + edit (backfill-exclusive)"],
            ["Content", "Content Command Center, Content Calendar", "View + edit"],
            ["Analytics", "VSL, Webinar Analytics, Weekly Report", "View + edit"],
            ["Client DNA", "Offer/positioning reference", "View + edit"],
            ["System", "Event Bus, Settings", "View + edit"],
            ["Access Control", "Role/permission management", "Not visible — owner/admin only"],
            ["Help", "This document", "Always visible"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Access Control is the one page you genuinely cannot open — it's gated to the owner and admin specifically, separate from the rest of the permission system, so no role can grant itself more access. Everything else in this table is real, full access.",
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
            "Search box / ⌘K — see the next section.",
            "Bell: notifications. Sun/moon: theme. Gear: Settings.",
            "Every page's date-range row (Today / Yesterday / 7d / 30d / MTD / All / Custom) controls every number below it.",
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
            'Type a lead/client name or a content piece title — real matches appear under "Results."',
            'Type a metric name ("ROAS", "ad spend", "engagement rate") to jump straight to the page it lives on.',
            '"Quick actions" jumps straight into Log Day / Log Call — useful when you\'re backfilling for a rep.',
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
          src: homeGrowthOps,
          alt: "Home page for a Growth Operator role",
          caption: "Your Home view.",
        },
        {
          type: "screenshot",
          src: mainHub,
          alt: "Main Hub executive dashboard",
          caption:
            "Main Hub — you can view the full executive picture, including Ad Spend, ROAS, and the acquisition-source breakdowns that are your direct responsibility.",
        },
        {
          type: "paragraph",
          text: 'Pay particular attention to Ad Cash Collected, Ad Total Revenue, Ad Spend, and ROAS on Main Hub — these are computed from real traffic-source attribution, the exact data your content/traffic work feeds. If they read "Not tracked," it means the underlying acquisition_spend/traffic_source records aren\'t connected yet for that range — a real gap in your data pipeline worth chasing down, not a UI bug.',
        },
      ],
    },
    {
      id: "backfill",
      title: "Manual backfill — your exclusive responsibility",
      blocks: [
        {
          type: "paragraph",
          text: "Every KPI card in this entire application is computed from real rows a rep or a system logged. Occasionally that pipeline breaks — a rep's phone dies mid-shift and they never get to log, a payment processor webhook silently fails to fire, someone fat-fingers a submission. When that happens, the underlying data is genuinely missing or wrong, and every downstream number (Main Hub, Weekly Report, that rep's own payout) is wrong until someone fixes the real record. That someone is you.",
        },
        {
          type: "heading",
          level: 3,
          text: "Where this shows up",
        },
        {
          type: "table",
          headers: ["Page", "What you can fix"],
          rows: [
            ["EOD Reports", "Submit a day's log on a rep's behalf using the guided flow."],
            [
              "DM Setter / Inbound Dialer / Closer dashboards",
              "Open Log Day / Log Call and submit under the rep's real name.",
            ],
            [
              "Payments",
              "Correct processor, payment type, or failure reason on an individual payment; edit mentee financial terms and renewal stage.",
            ],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Mentee Onboarding and Mentee Results used to be part of this exclusive backfill set too — admin can now edit those as well, so they're no longer unique to you (though you still have full edit access there, covered in its own section below).",
        },
        {
          type: "screenshot",
          src: eodPicker,
          alt: "EOD Reports role picker",
          caption: "EOD Reports — the guided flow, if you're backfilling a full day for a rep.",
        },
        {
          type: "screenshot",
          src: logDayDialog,
          alt: "Log Day dialog",
          caption:
            "The DM Setter / Inbound Dialer Log Day form — identical to what the rep themselves sees.",
        },
        {
          type: "screenshot",
          src: logCallDialog,
          alt: "Log a sales call dialog",
          caption: "The Closer's Log Call form.",
        },
        {
          type: "callout",
          tone: "danger",
          text: "Always select the REAL rep's name in the Name/Closer name field, never your own — that field is what ties the entry to their payout and to every leaderboard/report they appear in. Logging under your own name to \"help out\" quietly corrupts that rep's real numbers.",
        },
        {
          type: "screenshot",
          src: paymentsOps,
          alt: "Payment Notifications and Recovery Queue",
          caption:
            "Payments' Recovery Queue — one canonical place to correct a failed/at-risk payment record.",
        },
        {
          type: "callout",
          tone: "tip",
          text: "Before backfilling anything, confirm the real event actually happened (ask the rep, check a call recording, check the payment processor directly) — you're the trusted human check on the automated pipeline, so verify before you write.",
        },
      ],
    },
    {
      id: "team-and-hiring",
      title: "Team & Hiring — full personnel management",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members and Team → Hiring are now fully yours to manage, same as admin: add or deactivate a rep, change their role, open their per-person access override, and move applicants through the hiring pipeline.",
        },
        {
          type: "screenshot",
          src: teamRoster,
          alt: "Team roster tab",
          caption: "Team Members — add/deactivate reps and change roles here.",
        },
        {
          type: "screenshot",
          src: hiring,
          alt: "Hiring pipeline overview",
          caption: "Hiring — applicant totals and AI fit scores, split by track.",
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
      title: "Onboarding & Mentee Results",
      blocks: [
        {
          type: "screenshot",
          src: onboarding,
          alt: "Mentee Onboarding page",
          caption:
            "Intake responses and insight signals — feeds your Content Signals work directly.",
        },
        {
          type: "screenshot",
          src: fulfillment,
          alt: "Mentee Results page",
          caption:
            "Logged mentee wins — these feed straight into Client DNA's proof memory, which feeds your content.",
        },
        {
          type: "callout",
          tone: "info",
          text: "This is the closest loop in the whole app: a mentee's real win, logged here, becomes real proof content you can pull straight into Client DNA and turn into a post. Check this page regularly, not just when backfilling.",
        },
      ],
    },
    {
      id: "payments-view",
      title: "Payments — full page reference",
      blocks: [
        {
          type: "screenshot",
          src: payments,
          alt: "Payments page",
          caption: "The full payment ledger and stat row — you have full edit access here.",
        },
        {
          type: "paragraph",
          text: "See the Payments deep-dive in this same document's tables above for what each stat card means. As Growth Operator this is one of your backfill-editable pages, so know it well.",
        },
      ],
    },
    {
      id: "content",
      title: "Content — your core, full-edit workspace",
      blocks: [
        {
          type: "paragraph",
          text: "Content → Content Command Center is where you'll spend most of your time. Full edit access: move pieces through the pipeline, schedule them, run AI content coaching.",
        },
        {
          type: "screenshot",
          src: contentCommandCenter,
          alt: "Content Command Center top",
          caption: "Total views, reach, engagement — the executive summary of content performance.",
        },
        {
          type: "screenshot",
          src: contentMid,
          alt: "Content Command Center scrolled to Attribution and Traffic sections",
          caption:
            "Scroll down (or use the Traffic / Attribution / Content Signals sub-items under Content in your sidebar) to jump straight to these embedded sections.",
        },
        {
          type: "list",
          items: [
            "Traffic and Attribution used to be their own standalone pages — they're now embedded sections inside this same page, reachable via the sub-items under Content in your sidebar (each one deep-links and auto-scrolls to that exact section).",
            "Attribution shows the real content → lead → call → cash join, so you can see which specific post actually produced revenue — this is the single best tool you have for deciding what to make more of.",
            "Content Signals (also embedded here) surfaces the recommended content mix and root-cause diagnosis when something's underperforming.",
          ],
        },
        {
          type: "screenshot",
          src: contentCalendar,
          alt: "Content Calendar page",
          caption: "Content Calendar — full script, hook, CTA, and posting instructions per piece.",
        },
        {
          type: "screenshot",
          src: sequences,
          alt: "Story Sequences page",
          caption: "Story Sequences — weekly templates and slide plans, fully editable.",
        },
        {
          type: "screenshot",
          src: clientDna,
          alt: "Client DNA page",
          caption:
            "Client DNA — the offer/positioning reference every piece of content and copy should trace back to.",
        },
      ],
    },
    {
      id: "analytics",
      title: "Analytics — VSL, Webinar & Weekly Report",
      blocks: [
        {
          type: "screenshot",
          src: vsl,
          alt: "VSL Analytics page",
          caption:
            "VSL Analytics — import metrics, edit scripts/transcripts, run bottleneck analysis.",
        },
        {
          type: "screenshot",
          src: webinarAnalytics,
          alt: "Webinar Analytics page",
          caption:
            "Webinar Analytics — Ad Spend, Ad Total Revenue, and ROAS live here too, per webinar.",
        },
        {
          type: "paragraph",
          text: "Webinar Analytics' Cash Collected and Ad Cash Collected cards intentionally read \"Not tracked\" — this workspace's data model doesn't yet link a webinar lead to the specific closed-call cash they generated. That's an honest gap, not a bug; Revenue and Ad Spend/ROAS above them are real and fully computed.",
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
      title: "System — Event Bus",
      blocks: [
        {
          type: "screenshot",
          src: events,
          alt: "Event Bus page",
          caption: "Event Bus — the raw event stream and webhook delivery log.",
        },
        {
          type: "paragraph",
          text: "Replaying an event or managing a webhook subscription here affects real system integrations — know what you're doing before you touch it, same caution as any other production system.",
        },
      ],
    },
    {
      id: "what-you-cant-see",
      title: "The one page you can't see, and why",
      blocks: [
        {
          type: "paragraph",
          text: "Access Control is the single exception to your otherwise full access. It's gated to the owner and admin specifically — separate from the rest of the permission system — so that no role, including one with full access everywhere else, can grant itself more. If you need a permission changed, ask an admin.",
        },
      ],
    },
    {
      id: "checklist",
      title: "Your daily checklist",
      blocks: [
        {
          type: "steps",
          items: [
            "Open Home, then Main Hub — check the ad/attribution numbers specifically.",
            "Check Content Command Center's pipeline — anything stuck in Draft too long?",
            "Check Attribution — what actually produced cash this week, and is that reflected in what's scheduled next?",
            "Check Payments Recovery Queue and Mentee Results for anything that needs a manual correction.",
            "Only touch backfill pages when you've verified the real event — never guess.",
            "Weekly: check Team → Access for pending access requests, and skim Hiring's pipeline.",
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
              q: "A rep asks me to log their day because they're slammed — is that okay?",
              a: "Yes — that's exactly what this access is for. Log it under their real name, with real numbers they give you, not estimates.",
            },
            {
              q: "Can I manage Team Members and Hiring myself now?",
              a: "Yes — full edit access, same as admin. That changed from an earlier, more restricted version of this role; if you remember Team Members/Hiring being hidden from you, that's no longer the case.",
            },
            {
              q: "Why does admin not have EOD/rep-dashboard/payments backfill access?",
              a: "It's deliberately restricted to growth ops and the owner only, so there's exactly one accountable person for manual data corrections instead of several people who might each assume someone else already fixed it.",
            },
            {
              q: "Why can't I open Access Control if I have full access everywhere else?",
              a: "It's gated separately, to the owner and admin only — a deliberate exception so no role can expand its own permissions.",
            },
          ],
        },
      ],
    },
  ],
};
