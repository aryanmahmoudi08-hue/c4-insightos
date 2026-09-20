import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeCloser from "@/assets/sop/home-closer.png";
import closerDashboard from "@/assets/sop/closer-dashboard.png";
import logCallDialog from "@/assets/sop/log-call-dialog.png";
import eodPicker from "@/assets/sop/eod-reports-picker.png";
import eodFlow from "@/assets/sop/eod-flow-closer.png";
import leads from "@/assets/sop/leads.png";
import teamPerformance from "@/assets/sop/team-performance-tab.png";
import teamCalendar from "@/assets/sop/team-calendar.png";
import payments from "@/assets/sop/payments.png";

export const closerSop: SopDoc = {
  key: "closer",
  roleTitle: "Closer",
  tagline: "Own calls, cash logging, payment context and booked-lead context only.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "A setter or dialer did the work of getting a real, qualified prospect onto your calendar. Your job is to run that call, diagnose the real problem, present the offer, and close — then log the outcome accurately, every single time, whether it's a close, a no-show, or a follow-up. Cash Collected is the number that matters most in this entire company, and it flows directly from what you log after every call.",
        },
        {
          type: "callout",
          tone: "info",
          title: 'What "winning" looks like for you',
          text: "High show rate on booked calls, a high close rate on calls that show, and — above everything — cash collected. Revenue generated (total contract value) matters too, but cash in hand is the real scoreboard.",
        },
        {
          type: "paragraph",
          text: "This is your complete operating manual for the software — every page, every field, every button you'll touch. Read it fully once, then keep it open for your first two weeks.",
        },
      ],
    },
    {
      id: "shell",
      title: "The app shell — how to move around",
      blocks: [
        {
          type: "paragraph",
          text: "The thin icon rail on the far left is every category available to you. Click an icon and a panel slides out with the pages inside it.",
        },
        {
          type: "screenshot",
          src: sidebarExpanded,
          alt: "Sidebar expanded showing the Sales category panel",
          caption: "Click a rail icon to open its panel, then click a page to go there.",
        },
        {
          type: "table",
          headers: ["Icon", "What it opens", "Can you see it?"],
          rows: [
            ["Home", "Your personal daily feed", "Yes"],
            ["Main", "Main Hub — company-wide KPIs (read-only)", "Yes"],
            ["Sales", "Legacy Leads, EOD Reports", "Yes"],
            [
              "Rep Dash",
              "DM Setter, Inbound Dialer, Closer (you) dashboards",
              "Yes — all three, for context",
            ],
            ["Team", "Team Members roster, Team Calendars", "Yes"],
            ["Mentees", "Onboarding intake, Mentee Results", "Yes"],
            ["Payments", "Company payment ledger", "Yes — view only"],
            ["Content", "Content Command Center, Content Calendar", "No"],
            ["Analytics", "VSL Analytics, Webinar Analytics, Weekly Report", "No"],
            ["System", "Event Bus, Settings", "Settings only"],
            ["Help", "This document", "Yes — always"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "You're the only rep-level role with any Payments access, and the only rep-level role that can edit Team Calendars — both covered in their own sections below.",
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
            "Search box / ⌘K: jump to any lead, client, page, or metric.",
            "Bell: notifications. Sun/moon: theme. Gear: Settings.",
            "Every page's date-range row (Today / Yesterday / 7d / 30d / MTD / All / Custom) controls what every number on that page is calculated over — always check it before trusting a number.",
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
            'Type a lead\'s name, email, or phone — real matches appear under "Results."',
            'Type a metric name ("cash collected", "close rate") to jump straight to it.',
            'Leave it blank and scroll "Go to" for every page you have access to.',
            '"Quick actions" includes jumping straight into Log Call.',
          ],
        },
      ],
    },
    {
      id: "home",
      title: "Home — your daily starting point",
      blocks: [
        {
          type: "paragraph",
          text: "Open Home first every login — it's your personal snapshot, not the company-wide view.",
        },
        {
          type: "screenshot",
          src: homeCloser,
          alt: "Home page for a Closer role",
          caption: "Your Home view.",
        },
        {
          type: "callout",
          tone: "tip",
          text: "Home has no edit actions of its own. If a number looks wrong, fix it on the page that owns it (your dashboard or EOD Reports), never on Home.",
        },
      ],
    },
    {
      id: "leads",
      title: "Legacy Leads — the shared lead table",
      blocks: [
        {
          type: "paragraph",
          text: "Sales → Legacy Leads — the master lead table. You can view every lead and edit your own booked leads as they move through the pipeline.",
        },
        {
          type: "screenshot",
          src: leads,
          alt: "Legacy Leads table",
          caption: "Every lead, with stage, priority, and full activity history.",
        },
        {
          type: "paragraph",
          text: "Click into a lead before your call to review their full history and any notes the setter/dialer left — never walk into a call cold if the context is sitting right there.",
        },
      ],
    },
    {
      id: "eod-reports",
      title: "EOD Reports — the other way to log (one question at a time)",
      blocks: [
        {
          type: "paragraph",
          text: "Sales → EOD Reports is a second path to logging a call — a guided, one-question-at-a-time flow. Good for a quick log between back-to-back calls.",
        },
        {
          type: "screenshot",
          src: eodPicker,
          alt: "EOD Reports role picker",
          caption: 'Pick the "Closer Post-Call" card.',
        },
        {
          type: "screenshot",
          src: eodFlow,
          alt: "Closer EOD step-by-step flow, first question",
          caption: "One question per screen — the first is always picking your name.",
        },
        {
          type: "callout",
          tone: "info",
          text: 'This writes to the same real calls table as the Log Call dialog on your dashboard, covered right after this. One question on this flow is literally "IGNORE" — pick that if you genuinely want this specific call excluded from the record (e.g. a test call), and nothing gets written. Use either logging path, never both for the same call.',
        },
      ],
    },
    {
      id: "closer-dashboard",
      title: "Closer dashboard — your real workspace",
      blocks: [
        {
          type: "paragraph",
          text: "Rep Dash → Closer. This is where you spend your day between calls.",
        },
        {
          type: "screenshot",
          src: closerDashboard,
          alt: "Closer dashboard with primary performance cards",
          caption: "Filters, primary performance cards, and the Log Call button.",
        },
        {
          type: "table",
          headers: ["Card", "What it actually means"],
          rows: [
            [
              "Cash Collected",
              "Real dollars actually collected — the single most important number on this page.",
            ],
            [
              "Revenue Generated",
              "Total contract value from your closes — bigger than cash collected on payment plans.",
            ],
            [
              "Cash Collection Rate",
              "Cash collected ÷ revenue generated — how much of what you sell actually gets paid up front.",
            ],
            ["Avg Contract Value", "Revenue generated ÷ number of closes."],
            ["Closes", "Total deals closed."],
            ["Show Rate", "Booked calls that actually showed."],
            ["Close Rate", "Of calls that showed, how many closed."],
          ],
        },
        {
          type: "paragraph",
          text: "Scroll further and you'll find your Post-call disposition mix, objection breakdown, and your 10% payout tile — your commission on cash collected, computed live off your own logged calls. You never calculate this by hand.",
        },
        {
          type: "callout",
          tone: "warning",
          text: "A card reading a plain sentence instead of a number is an honest empty state — it means nothing has been logged in this date range yet, not that the feature is broken.",
        },
      ],
    },
    {
      id: "log-call",
      title: "Logging a call — the exact form, field by field",
      blocks: [
        {
          type: "paragraph",
          text: 'Click "+ Log call" top right of your dashboard, right after every single call you take — closed, no-show, or follow-up. Do not batch these at the end of the day; log the moment the call ends, while the details are fresh.',
        },
        {
          type: "screenshot",
          src: logCallDialog,
          alt: "Log a sales call dialog with every field",
          caption: "The full Log a Sales Call form.",
        },
        {
          type: "steps",
          items: [
            "Closer name — select yourself. Never log under someone else's name.",
            "Date of call — defaults to right now.",
            "Lead — pick the actual lead this call was with if they're in the system (this is what links the call back to their real record and attribution). Lead email fills automatically or type it in.",
            "Lead status — where this lead sits after the call (e.g. Closed Won).",
            "Disposition — why the call ended the way it did.",
            'Showed / Offer made / Cancelled / Recovers a prior no-show — check the boxes that genuinely apply. "Recovers a prior no-show" matters: it links this call back to an earlier no-show so the company\'s real recovery rate is accurate.',
            "Cash collected $ / Deposit $ / Total revenue $ — only log real numbers you're certain of. This is the most important field on the page.",
            "Time-to-close (min on call) / Call length (min) / Rep talk time (min) — log these if you know them; they're genuinely used to study what's working, not to police you.",
            'Key moment — what actually unlocked the close (or what killed the deal). This is real data your manager and growth ops use to improve scripts — write something specific, not "good rapport."',
            "Objections (comma-separated) — every objection you heard, even ones you overcame.",
            "Where in the call / Objection category — helps categorize when and what kind of objection came up.",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          text: "Never log a fake cash-collected number to hit a target, and never skip logging a call because it didn't close. A no-show or a lost call is just as important to log accurately as a win — it's how the company knows what's actually happening on the phones.",
        },
      ],
    },
    {
      id: "team",
      title: "Team — leaderboard, roster, and calendars",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members has three tabs worth knowing. Performance shows the live leaderboard — top closers and top setters, ranked by whatever metric you pick, top 3 rows medal-bordered gold/silver/bronze.",
        },
        {
          type: "screenshot",
          src: teamPerformance,
          alt: "Team performance tab showing leaderboards",
          caption: "The Performance tab — real-time leaderboards.",
        },
        {
          type: "screenshot",
          src: teamCalendar,
          alt: "Team Calendars page",
          caption: "Team Calendars — every rep's booked calls in one combined view.",
        },
        {
          type: "paragraph",
          text: "Team Calendars shows every rep's booked calls in one place — check it before your day starts so you know exactly what's coming.",
        },
        {
          type: "callout",
          tone: "tip",
          text: "Unlike DM Setter and Dialer, you can also edit here — reschedule confirmation status on a booking, or connect/disconnect a calendar. Use this to keep your own booked calls accurate when a prospect confirms, reschedules, or cancels outside of Google Calendar's own sync.",
        },
      ],
    },
    {
      id: "payments",
      title: "Payments — view only, for context on your own deals",
      blocks: [
        {
          type: "paragraph",
          text: "Payments → Payments is now visible to you (view only) — the master ledger of every payment company-wide, with processor, payment type, and cash collected vs. contract value.",
        },
        {
          type: "screenshot",
          src: payments,
          alt: "Payments ledger page",
          caption: "The Payments ledger — filter or search to find one of your own clients.",
        },
        {
          type: "paragraph",
          text: "Use this to confirm a deal you closed actually shows the cash-collected amount you logged, or to check where a client's payment plan stands before a renewal or follow-up call. You cannot log, edit, or correct anything here — that's growth ops' exclusive job. If a number looks wrong, flag it to them rather than trying to fix it yourself.",
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
            "Open Home — check Attention Required.",
            "Check Team Calendars for today's booked calls.",
            "Before each call: open the lead in Legacy Leads, review notes and history.",
            "Immediately after each call: Log Call (dashboard button or EOD Reports flow) — every call, every outcome.",
            "End of day: confirm your dashboard's Cash Collected / Closes actually reflect what happened today.",
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
              q: "I logged a call but my numbers didn't move.",
              a: "Refresh the page, and check the date range selector — you may be viewing a different window than the call date.",
            },
            {
              q: "What's the difference between Cash Collected and Revenue Generated?",
              a: "Cash Collected is money actually in hand right now. Revenue Generated is the full contract value, including anything on a payment plan not yet collected. They're deliberately different numbers — never confuse them.",
            },
            {
              q: "Can I fix a call I logged wrong?",
              a: "Ask an admin or growth ops — they have edit access to correct call records.",
            },
            {
              q: "Can I edit a payment record I see in Payments?",
              a: "No — you have view-only access there. Log/correction access to payment records is exclusive to growth ops. Flag anything that looks wrong to them.",
            },
            {
              q: "Why can't I see VSL Analytics or the Content Calendar anymore?",
              a: "Intentionally outside your role's access in Access Control — not a bug.",
            },
          ],
        },
      ],
    },
  ],
};
