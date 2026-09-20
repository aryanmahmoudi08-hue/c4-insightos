import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeDialer from "@/assets/sop/home-inbound-dialer.png";
import dialerDashboard from "@/assets/sop/inbound-dialer-dashboard.png";
import eodPicker from "@/assets/sop/eod-reports-picker.png";
import eodFlow from "@/assets/sop/eod-flow-dialer.png";
import leads from "@/assets/sop/leads.png";
import teamCalendar from "@/assets/sop/team-calendar.png";

export const inboundDialerSop: SopDoc = {
  key: "inbound_dialer",
  roleTitle: "Inbound Dialer",
  tagline: "Own inbound call queue, callbacks and lead notes only.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "A lead raised their hand — they filled out a form, watched a VSL, or requested a call. Your job is to reach them fast, qualify them, and get a real call on the closer's calendar before they go cold. Speed and volume are your edge: the faster you dial after a lead comes in, the higher your connect and set rate. Every number you log feeds this company's real numbers — Main Hub, Weekly Report, and your own payout are all built from what you type in here.",
        },
        {
          type: "callout",
          tone: "info",
          title: 'What "winning" looks like for you',
          text: "High dial volume, a strong connect rate off those dials, and a high set rate off qualified conversations. Cash collected on calls you set is the scoreboard.",
        },
        {
          type: "paragraph",
          text: "This is your full operating manual for the software. Read it once completely, then keep it open for your first two weeks.",
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
          caption:
            'Click a rail icon (here, "Sales") to open its panel, then click a page to go there.',
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
              "DM Setter, Inbound Dialer (you), Closer dashboards",
              "Yes — all three, for context",
            ],
            ["Team", "Team Members roster, Team Calendars", "Yes"],
            ["Mentees", "Onboarding intake, Mentee Results", "Yes"],
            ["Payments", "Company payment ledger", "No"],
            ["Content", "Content Command Center, Content Calendar", "No"],
            ["Analytics", "VSL Analytics, Webinar Analytics, Weekly Report", "No"],
            ["System", "Event Bus, Settings", "Settings only"],
            ["Help", "This document", "Yes — always"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "Access is set by an admin in Access Control per role. If a page you expect isn't in your rail, that's a deliberate setting — ask an admin rather than assuming it's a bug.",
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
            "Search box / ⌘K: jump to any lead, client, page, or metric — see the Search section below.",
            "Bell: notifications. Sun/moon: light/dark theme. Gear: Settings.",
            "Every page has a date-range row under its title (Today / Yesterday / 7d / 30d / MTD / All / Custom) — this is what every number on the page is calculated over. Always check this before trusting a number.",
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
          text: "Press ⌘K (Mac) or Ctrl+K (Windows) from anywhere, or click the search box top right.",
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
            'Type a metric name ("dials", "connections", "cash collected") to jump straight to the page it lives on.',
            'Leave it blank and scroll "Go to" for every page you can reach.',
            '"Quick actions" includes jumping straight into your daily log.',
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
          text: "Open Home first every login. It's your personal snapshot, not the company-wide view.",
        },
        {
          type: "screenshot",
          src: homeDialer,
          alt: "Home page for an Inbound Dialer role",
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
          text: "Sales → Legacy Leads — the master lead table across every rep. You can view all leads and edit your own as they move through your queue.",
        },
        {
          type: "screenshot",
          src: leads,
          alt: "Legacy Leads table",
          caption: "Every lead, with stage, priority, and full activity history.",
        },
        {
          type: "list",
          items: [
            "The funnel breakdown at the top shows where leads are stuck across every stage.",
            "Click into a lead to see their full history and add notes — never rely on memory for a lead's context.",
            "💎 Diamond leads are your highest-value leads — dial these first.",
          ],
        },
      ],
    },
    {
      id: "eod-reports",
      title: "EOD Reports — the other way to log (one question at a time)",
      blocks: [
        {
          type: "paragraph",
          text: "Sales → EOD Reports is a second path to the exact same data — a guided, one-question-at-a-time flow, good for logging between calls on your phone.",
        },
        {
          type: "screenshot",
          src: eodPicker,
          alt: "EOD Reports role picker",
          caption: 'Pick the "Dialer EOD" card.',
        },
        {
          type: "screenshot",
          src: eodFlow,
          alt: "Dialer EOD step-by-step flow",
          caption:
            "One question per screen, with a progress bar and a full review before it submits.",
        },
        {
          type: "callout",
          tone: "info",
          text: "This writes to the same place as your dashboard's Log Day dialog, covered right after this. Use either one — never both for the same day, or you'll double-count your activity.",
        },
      ],
    },
    {
      id: "dialer-dashboard",
      title: "Inbound Dialer dashboard — your real workspace",
      blocks: [
        {
          type: "paragraph",
          text: "Rep Dash → Inbound Dialer. This is where you spend your day.",
        },
        {
          type: "screenshot",
          src: dialerDashboard,
          alt: "Inbound Dialer dashboard",
          caption: "Filters, primary performance cards, and the Log Day button.",
        },
        {
          type: "table",
          headers: ["Card", "What it actually means"],
          rows: [
            [
              "Cash Collected",
              "Real dollars collected on deals traceable back to calls you set, for the selected range.",
            ],
            ["Revenue Generated", "Total contract value from your bookings."],
            ["Dials", "Total call attempts you made."],
            ["Connections", "Of those dials, how many actually connected to a real person."],
            ["Qualified Convos", "Connections that turned into a real qualifying conversation."],
            [
              "Sets",
              "Qualified convos that turned into an actual booked call. This drives your payout.",
            ],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "A card reading a plain sentence instead of a number (\"Log your dial count in 'Log day' to start tracking reach\") is an honest empty state, not a bug — log your day and it populates.",
        },
        {
          type: "paragraph",
          text: "Scroll down for your 5% payout tile — your commission on cash collected traceable to your sets, computed live off your own logged numbers. You never calculate this by hand.",
        },
      ],
    },
    {
      id: "log-day",
      title: "Logging your day",
      blocks: [
        {
          type: "paragraph",
          text: 'Click "+ Log day" top right of your dashboard. Do this every day you work, including a zero-activity day (log zeros, don\'t skip it).',
        },
        {
          type: "steps",
          items: [
            "Name — select yourself. Never log under someone else's name.",
            "Date — defaults to today; only backfill a genuinely missed day, and do it the same week.",
            "Dials — total call attempts today.",
            "Connections — how many of those actually connected.",
            "Qualified convos — real conversations with buying intent.",
            "Sets — calls actually booked today.",
            "Calls on calendar — running total.",
            "Live calls (showed) — calls that actually happened.",
            "Closes / Downsells — only fill in if you know today's outcome; otherwise leave at 0 and let the Closer's own log be the source of truth.",
            "Cash collected $ / Total revenue $ — only log real numbers, never estimates.",
            "Rate today (1–10) — your honest self-rating; used by your manager to know when to check in, not to punish you.",
            "Objections — comma-separated objections you heard today.",
            "Notes — anything else worth flagging.",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          text: "Never inflate a number to make a slow day look better. Your payout and every company report is computed directly from this form.",
        },
      ],
    },
    {
      id: "team-and-calendar",
      title: "Team & Team Calendars — context, not editing",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members shows the active roster. Team → Team Calendars shows every rep's booked calls in one combined view — check this before booking a call to avoid clashes.",
        },
        {
          type: "screenshot",
          src: teamCalendar,
          alt: "Team Calendars page",
          caption: "A combined view of every rep's booked calls with confirmation status.",
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
            "Check Team Calendars before booking more calls.",
            "Work the queue — dial fast, dial often, log everything as you go if you can.",
            "At end of day: Log Day, every day, even zero days.",
            "Confirm your dashboard numbers actually moved after logging.",
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
              q: "What's the difference between Connections and Qualified Convos?",
              a: "Connections is anyone who actually picked up. Qualified Convos is the subset of those where the conversation had real buying intent — not every connection qualifies.",
            },
            {
              q: "I logged my day but the dashboard didn't change.",
              a: "Refresh the page, and double-check the date range selector matches the day you logged.",
            },
            {
              q: "Can I fix a day I already logged?",
              a: "Ask an admin or growth ops — they have edit access to correct or backfill activity records.",
            },
            {
              q: "Why can't I see Payments, VSL Analytics, or the Content Calendar anymore?",
              a: "It's intentionally outside your role's access in Access Control, not a bug.",
            },
          ],
        },
      ],
    },
  ],
};
