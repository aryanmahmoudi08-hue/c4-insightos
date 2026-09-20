import type { SopDoc } from "@/lib/sop-types";
import sidebarExpanded from "@/assets/sop/sidebar-expanded-sales.png";
import commandPalette from "@/assets/sop/command-palette.png";
import homeDmSetter from "@/assets/sop/home-dm-setter.png";
import dmSetterDashboard from "@/assets/sop/dm-setter-dashboard.png";
import logDayDialog from "@/assets/sop/log-day-dialog.png";
import eodPicker from "@/assets/sop/eod-reports-picker.png";
import eodFlow from "@/assets/sop/eod-flow-dm-setter.png";
import leads from "@/assets/sop/leads.png";
import teamCalendar from "@/assets/sop/team-calendar.png";

export const dmSetterSop: SopDoc = {
  key: "dm_setter",
  roleTitle: "DM Setter",
  tagline: "Own DM pipeline and lead notes only.",
  sections: [
    {
      id: "mission",
      title: "Your job in one sentence",
      blocks: [
        {
          type: "paragraph",
          text: "Every dollar this company makes starts with a stranger becoming a booked call. That's you. Your entire job is to take cold and warm leads in the DMs, build enough trust and curiosity that they book a call, and log every single number honestly — because every dashboard in this company (Main Hub, Weekly Report, your own payout) is built entirely from what you type into this software. If you don't log it, as far as this business is concerned, it didn't happen.",
        },
        {
          type: "callout",
          tone: "info",
          title: 'What "winning" looks like for you',
          text: "High leads-contacted, a high qualified-convo rate off that outreach, and a high set rate off qualified convos. Cash collected on your logs is the scoreboard — everything else (replies, links sent, follow-ups) is the input that produces it.",
        },
        {
          type: "paragraph",
          text: "This document is your complete operating manual. Read it once start to finish before your first shift, then keep it open in a tab for your first two weeks. Every button, every field, every page you can see is covered here — nothing is assumed.",
        },
      ],
    },
    {
      id: "shell",
      title: "The app shell — how to move around",
      blocks: [
        {
          type: "paragraph",
          text: "AscendOS is one page at a time, organized into categories on the left. Every category is an icon in the thin rail on the far left edge of the screen. Click an icon and a panel slides out showing every page inside that category.",
        },
        {
          type: "screenshot",
          src: sidebarExpanded,
          alt: "Sidebar expanded showing the Sales category panel with Legacy Leads and EOD Reports",
          caption:
            'Click any rail icon (here, "Sales") to open its panel. Click a page name to go there.',
        },
        {
          type: "heading",
          level: 3,
          text: "What's in your rail, top to bottom",
        },
        {
          type: "table",
          headers: ["Icon", "What it opens", "Can you see it?"],
          rows: [
            ["Home", "Your personal daily feed — today's numbers and what needs attention", "Yes"],
            ["Main", "Main Hub — company-wide KPIs (read-only for you)", "Yes"],
            ["Sales", "Legacy Leads, EOD Reports", "Yes"],
            [
              "Rep Dash",
              "DM Setter (you), Inbound Dialer, Closer dashboards",
              "Yes — all three, for context",
            ],
            ["Team", "Team Members roster, Team Calendars", "Yes"],
            ["Mentees", "Onboarding intake, Mentee Results", "Yes"],
            ["Payments", "Company payment ledger", "No — hidden from your rail"],
            ["Content", "Content Command Center, Content Calendar", "No"],
            ["Analytics", "VSL Analytics, Webinar Analytics, Weekly Report", "No"],
            ["Client DNA", "Offer/positioning reference", "No"],
            ["System", "Event Bus, Settings", "Settings only"],
            ["Help", "This document", "Yes — always"],
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "This isn't arbitrary — it's set by an admin in Access Control. If something in this document sounds like it should be there but isn't showing in your rail, ask an admin or growth ops to check your access before assuming something's broken.",
        },
        {
          type: "heading",
          level: 3,
          text: "The top bar — same on every page",
        },
        {
          type: "list",
          items: [
            'Far left pill: today\'s date and a live "$ cash today / calls booked" ticker for the whole company — a quick pulse check, not your personal numbers.',
            "Search box (top right, or press ⌘K / Ctrl+K anywhere): the fastest way to find a lead, a client, a piece of content, or jump straight to a metric card. Covered in full in its own section below.",
            "Bell icon: notifications.",
            "Sun/moon icon: switches light and dark mode. Purely visual, your choice.",
            "Gear icon: Settings — theme, your account, sign out.",
            'Every page also has a date-range row right under the title (Today / Yesterday / 7d / 30d / MTD / All / Custom) — this controls what time window every number on that page is calculated over. Get in the habit of checking this first before reading any card; a card reading "$0" is often just because the range is set to "Today" and nothing happened yet today.',
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
          text: "Click the search box at the top right, or just press ⌘K (Mac) / Ctrl+K (Windows) from anywhere in the app. This opens the command palette — the single fastest way to get anywhere or find anyone.",
        },
        {
          type: "screenshot",
          src: commandPalette,
          alt: "Command palette open showing quick actions and page navigation",
          caption: "⌘K / Ctrl+K opens this from any page.",
        },
        {
          type: "steps",
          items: [
            'Type a lead\'s name, email, or phone fragment — real matching leads/clients appear at the top under "Results," click one to jump straight to them.',
            'Type a metric name in plain English — "sets", "cash collected", "outbound dms" — and it shows you exactly which page that number lives on, then takes you there.',
            'Type nothing and just scroll — every page you have access to is listed under "Go to."',
            'Use "Quick actions" to jump straight into Log Day without navigating to your dashboard first.',
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "This is faster than clicking through the sidebar once you know it exists. Use it constantly.",
        },
      ],
    },
    {
      id: "home",
      title: "Home — your daily starting point",
      blocks: [
        {
          type: "paragraph",
          text: 'Home is the first thing you should open every time you log in. It\'s a personal, role-aware summary — not a company-wide dashboard — built specifically to answer "what does my day look like right now."',
        },
        {
          type: "screenshot",
          src: homeDmSetter,
          alt: "Home page for a DM Setter role",
          caption: "Your Home view — what a DM Setter sees on login.",
        },
        {
          type: "list",
          items: [
            "Your today numbers (DMs sent, replies, sets, calls booked) at the very top.",
            "\"Attention Required\" — anything that needs action from you right now, surfaced automatically. This is never fabricated: if it's empty, you're genuinely caught up.",
            "Quick links straight into your logging flow.",
          ],
        },
        {
          type: "callout",
          tone: "tip",
          text: "Home has no edit actions of its own — it's a read-only mirror of data logged elsewhere. If a number on Home looks wrong, the fix is always on the page that actually owns that number (your DM Setter dashboard or EOD Reports), never on Home itself.",
        },
      ],
    },
    {
      id: "leads",
      title: "Legacy Leads — the shared lead table",
      blocks: [
        {
          type: "paragraph",
          text: "Sales → Legacy Leads. This is the master table of every lead in the pipeline, across every rep. You can view it, and you can edit your own leads (status, stage, priority, notes) as they move through your outreach.",
        },
        {
          type: "screenshot",
          src: leads,
          alt: "Legacy Leads table with funnel stages and stats",
          caption: "Every lead, with stage, priority, and full activity history.",
        },
        {
          type: "list",
          items: [
            "Use the funnel breakdown at the top to see where leads are stuck (New / Not Contacted, Qualified, Attempted Contact, Booked, Showed, Closed, No-show, etc.).",
            "Click into any lead to see their full timeline and add notes — do this instead of trying to remember conversation details from memory.",
            "The 💎 Diamond leads badge flags your highest-value leads — check these first every session.",
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
          text: "There's a second way to log the exact same data: Sales → EOD Reports in the sidebar. This is a guided, one-question-at-a-time flow instead of one long form — some people prefer it, especially on a phone between calls.",
        },
        {
          type: "screenshot",
          src: eodPicker,
          alt: "EOD Reports role picker showing DM Setter, Dialer, Closer options",
          caption: "Pick your role card, then answer one question at a time.",
        },
        {
          type: "screenshot",
          src: eodFlow,
          alt: "EOD step-by-step flow, first question",
          caption: "Each screen asks exactly one question with a progress bar at the top.",
        },
        {
          type: "list",
          items: [
            'Click the "DM Setter EOD" card.',
            "Answer each screen, click Next. Use Back if you make a mistake.",
            "The last screen is a full review of everything you entered before it submits — check it carefully, this is your last chance to fix a typo.",
          ],
        },
        {
          type: "callout",
          tone: "info",
          text: "This writes to the exact same place as the Log Day dialog on your dashboard, covered right after this. Use whichever one you like — there's no difference in what it does, only in how it feels to fill out. Just never do both for the same day; that double-counts your activity.",
        },
      ],
    },
    {
      id: "dm-setter-dashboard",
      title: "DM Setter dashboard — your real workspace",
      blocks: [
        {
          type: "paragraph",
          text: "This is the page you'll live in. Go to it via Rep Dash → DM Setter in the sidebar. Everything here is scoped to the date range you have selected at the top.",
        },
        {
          type: "screenshot",
          src: dmSetterDashboard,
          alt: "DM Setter dashboard with primary performance cards",
          caption:
            "The DM Setter dashboard — filters, primary performance cards, and the Log Day button.",
        },
        {
          type: "heading",
          level: 3,
          text: "The three filters above your cards",
        },
        {
          type: "list",
          items: [
            "\"All team members\" — if you're the only setter on the account, leave this alone. If there are multiple setters, use this to look at one person's numbers specifically (including your own, to double-check your logs).",
            '"Platform" — filters everything below to one social platform (Instagram, TikTok, etc.) if that\'s tracked for your leads.',
            '"Lead Capture" — filters by how the lead originally came in.',
          ],
        },
        {
          type: "heading",
          level: 3,
          text: "Reading the cards",
        },
        {
          type: "table",
          headers: ["Card", "What it actually means"],
          rows: [
            [
              "Cash Collected",
              "Real dollars collected on deals traceable back to your booked calls, for the selected range. This is your single most important number.",
            ],
            [
              "Revenue Generated",
              "Total contract value of everything closed from your bookings — bigger than cash collected because not every deal is paid in full upfront.",
            ],
            ["Leads Contacted", "How many leads you personally reached out to."],
            [
              "Qualified Convos",
              "Of those, how many turned into a real back-and-forth with buying intent.",
            ],
            [
              "Sets",
              "Of those qualified convos, how many actually got a call on the calendar. This is the number that determines whether you get paid.",
            ],
            [
              "Inbound / Outbound DMs Sent",
              "Raw volume — how many messages you sent (outbound) vs. received first (inbound).",
            ],
          ],
        },
        {
          type: "callout",
          tone: "warning",
          text: "Every card that reads a plain sentence like \"Log outreach in 'Log day' to start tracking reach\" instead of a number is telling you the truth: nothing has been logged yet for this range. It is never a fake zero — it's an honest empty state. The fix is always the same: log your day.",
        },
        {
          type: "heading",
          level: 3,
          text: "The 5% payout tile",
        },
        {
          type: "paragraph",
          text: "Scroll down and you'll find your payout tile — your commission on the cash collected that traces back to your sets, calculated automatically from the same logged numbers above. You never calculate this yourself and you never need to ask what you're owed — it's live math off your own logged activity. This is one more reason every log has to be accurate: an under-logged day is money you're not credited for, and an over-logged day is a number Payments will eventually catch.",
        },
      ],
    },
    {
      id: "log-day",
      title: "Logging your day — the exact form, field by field",
      blocks: [
        {
          type: "paragraph",
          text: 'Click the "+ Log day" button, top right of your dashboard. Do this once per day, every day you work — even a zero-activity day (log zeros; don\'t just skip it, or the system has no way to know you worked that day at all).',
        },
        {
          type: "screenshot",
          src: logDayDialog,
          alt: "Log day dialog with every field for a DM Setter's daily activity",
          caption: "The full Log Day form. Every field maps to a card on your dashboard.",
        },
        {
          type: "steps",
          items: [
            "Name — select yourself from the team member dropdown. Never log under someone else's name.",
            "Date — defaults to today. Only change this if you're backfilling a day you genuinely missed logging (do this the same week, not weeks later).",
            "Lead source — where most of today's leads came from.",
            "Leads contacted — total number of leads you messaged today, first touch or follow-up.",
            "Links sent — any links you sent (VSL, booking page, etc.).",
            "Inbound DMs sent / Outbound DMs sent — split by who started the conversation.",
            "Replies — how many of your messages actually got a reply.",
            "Follow-ups sent — messages sent to someone you'd already messaged before.",
            "Links clicked — of the links you sent, how many were actually clicked (only log what you can actually verify, e.g. from a link-tracking tool — never guess).",
            "Post-booking page visits / Pre-call video watches — engagement signals after a link was clicked.",
            "Qualified convos — real conversations with genuine buying intent, not just a reply.",
            "Sets — calls actually booked onto the calendar today.",
            "Calls on calendar — running total, not just today's (check with your manager on exactly how this should be counted if you're unsure).",
            "Live calls (showed) — calls that actually happened.",
            "Closes / Downsells — only fill these in if you know the outcome of a call today; otherwise leave at 0 and let the Closer's own log be the source of truth.",
            "Cash collected $ / Total revenue $ — only log this if a deal closed today and you have the real number. Never estimate.",
            "Rate today (1–10) — your own honest self-rating of how the day went. This isn't scored against you — it's a real signal your manager uses to know when to check in.",
            'Objections — comma-separated list of any objections you heard today ("price, timing, spouse").',
            "Notes — anything else worth flagging.",
          ],
        },
        {
          type: "callout",
          tone: "danger",
          text: "Never fabricate a number to make a slow day look better. Every KPI in this company — your own payout included — is computed directly from these fields. A fake number today is a wrong paycheck and a wrong company decision later.",
        },
        {
          type: "callout",
          tone: "tip",
          text: "If you only remember one rule: log zeros on a zero day, never skip the form entirely. A missing day and a zero day look identical to every report in this system unless you actually submit something.",
        },
      ],
    },
    {
      id: "team-and-calendar",
      title: "Team & Team Calendars — context, not editing",
      blocks: [
        {
          type: "paragraph",
          text: "Team → Team Members shows the roster of every setter, dialer and closer with active status — useful for knowing who's actually on the team right now. Team → Team Calendars shows every rep's booked calls in one combined calendar view, so you can see what's already on the books before you book something that clashes.",
        },
        {
          type: "screenshot",
          src: teamCalendar,
          alt: "Team Calendars page showing booked calls and confirmation status",
          caption: "A combined view of every rep's booked calls, with confirmation status.",
        },
        {
          type: "paragraph",
          text: "You can view both pages, but editing (adding members, connecting calendars, changing confirmation status) is a manager/admin action.",
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
            "Open Home — check for anything flagged under Attention Required.",
            "Check Team Calendars — know what's already booked today before you book more.",
            "Work your leads in Legacy Leads / your DM platform.",
            "At end of day: Log Day (dashboard button or EOD Reports flow) — every day, even a zero day.",
            "Before you close the tab: re-check your logged numbers on your dashboard actually moved. If they didn't, your log didn't save — try again.",
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
              q: "I logged my day but my dashboard still shows the old numbers.",
              a: "Refresh the page. If it's still wrong, check the date range selector at the top — you may be looking at a different date window than the one you logged.",
            },
            {
              q: "Can I edit a day I already logged?",
              a: "There's no built-in edit on a submitted log — ask an admin or growth ops to correct it (they have access to backfill/correct these exact records).",
            },
            {
              q: "What's the difference between Sets and Calls on Calendar?",
              a: "Sets is calls YOU booked today. Calls on Calendar is the broader running count. If you're ever unsure which one to fill in, prioritize getting Sets right — it's the number tied to your payout.",
            },
            {
              q: "Why can't I see the Payments page, or VSL/Content Calendar anymore?",
              a: "It's not part of your role's access — Access Control scopes DM Setters to your own pipeline, EOD, and team context only. This is intentional, not a bug.",
            },
          ],
        },
      ],
    },
  ],
};
