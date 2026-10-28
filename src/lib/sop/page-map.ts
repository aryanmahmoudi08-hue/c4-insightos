import { RESOURCES, defaultPerm } from "@/lib/permissions";
import type { SopDoc, SopSection } from "@/lib/sop-types";

/**
 * "Every page, and what it is for you" — one section, generated per role.
 *
 * The access column is NOT written down here. It is computed from
 * `defaultPerm()`, the same function the sidebar and RouteAccessGate call to
 * decide what you can actually reach, so the SOP cannot drift from the app:
 * change the permission matrix and every role's document updates with it. A
 * hand-maintained table would have gone stale the first time a resource
 * moved, and a wrong SOP is worse than none — people stop trusting all of it.
 *
 * What IS written here is the "your job here" column: the one sentence that
 * says what this specific role is supposed to DO on that page, which no
 * amount of permission data can express. Anything without a line falls back
 * to the resource catalogue's own description of the page.
 */

/** SOP doc key -> the `memberships.role` value the permission matrix uses.
 *  They agree except for DM Setter, which is stored as the older "setter". */
const PERMISSION_ROLE: Record<SopDoc["key"], string> = {
  admin: "admin",
  growth_ops: "growth_ops",
  sales_manager: "sales_manager",
  dm_setter: "setter",
  inbound_dialer: "inbound_dialer",
  closer: "closer",
};

type JobMap = Partial<Record<string, string>>;

const JOBS: Record<SopDoc["key"], JobMap> = {
  admin: {
    home: "Your morning read. Cash and leads over seven days, what needs attention, and what is still on today's calendar.",
    dashboard:
      "The company's single source of truth. If a number here disagrees with a rep's own dashboard, this one is right — it reads the same rows with no per-rep filter.",
    leads:
      "Audit only. You are checking that stages and priorities reflect reality, not working the pipeline.",
    eod_reports:
      "Read what the three roles logged yesterday. You deliberately cannot submit on their behalf — an EOD is a rep's own statement.",
    dm_setter: "Check volume and set rate per setter. The logging itself belongs to the setter.",
    inbound_dialer:
      "Check dial volume, connects and speed-to-lead. The logging belongs to the dialer.",
    closer:
      "Check close rate, cash collected and objection patterns. The logging belongs to the closer.",
    team: "Add and deactivate people, set their role, and open per-person permission overrides.",
    team_calendar:
      "Confirmation status across the whole team — who is booked, who is at risk, what was cancelled.",
    hiring: "Run the pipeline: grade applicants, move stages, decide who reaches a trial call.",
    payments:
      "View only, by design. You are watching the ledger and the recovery queue, not logging money — that is growth ops or the owner.",
    copy: "Keep offers, positioning and ticket tiers current. Half the app's classification depends on what is set here.",
    integrations:
      "Every outside system wired into this workspace, what each one brings in, and where to connect or disconnect it.",
    events:
      "Where you go when a connector looks wrong — the raw event stream and ingestion payloads.",
    weekly_report: "The seven-day digest to read before a team meeting, not during one.",
  },
  growth_ops: {
    home: "Lead volume, paid versus organic split, and any content pulling reach without producing leads.",
    dashboard: "Where you check whether the funnel moved, before you decide what to change.",
    eod_reports:
      "You are the one role besides the owner who can correct a submitted EOD. Use it to fix a mis-log, never to rewrite a rep's day.",
    dm_setter: "Backfill and correct setter activity when a day was missed or logged wrong.",
    inbound_dialer:
      "Backfill and correct dialer activity. The same rule applies — repair, don't rewrite.",
    closer: "Backfill and correct call outcomes, including cash figures.",
    content:
      "Your main surface. Performance, audience signals and the content-to-cash picture in one place.",
    traffic: "Where attention is coming from, platform first.",
    attribution:
      "The deep-dive tool for a single lead, booking or revenue outcome — use it to answer 'how did this actually happen'.",
    vsl: "Drop-off and script alignment across the video funnel.",
    webinar_analytics:
      "Acquisition, attendance, sales and revenue for every webinar, paid and organic side by side.",
    copy: "Offers and positioning. Keep this true or the ticket-tier split everywhere else goes wrong.",
    payments:
      "Full access, including logging. You and the owner are the only two roles trusted with it.",
    integrations:
      "Your page. Connect Typeform, Stripe, Calendly, Close, Meta Ads and the rest, and see at a glance which systems are live.",
    events: "Connector health and raw payloads when an integration looks wrong.",
  },
  sales_manager: {
    home: "Team health today, what is unrecovered, and the rest of today's calendar.",
    dashboard: "View only. The company picture for context, not a surface you reshape.",
    leads: "Reassign, reprioritise, and clear anything stuck in a stage it should have left.",
    eod_reports:
      "Read the three roles' logs, and submit on behalf of someone only when they genuinely cannot.",
    dm_setter: "Per-setter volume and set rate. This is where a coaching conversation starts.",
    inbound_dialer: "Dial volume, connects and speed-to-lead breaches.",
    closer: "Close rate, offer rate and objection frequency per closer.",
    team: "Your roster. Add, deactivate and set roles for the people you manage.",
    team_calendar:
      "Confirmation status for the whole team — the page to open before the day starts.",
    hiring: "Grade applicants and move them through to trial calls.",
    payments: "View only. You see the ledger and renewal risk; you do not log money.",
    weekly_report: "The seven-day digest for your team meeting.",
  },
  dm_setter: {
    home: "Your focus for today — your own leads, not a team rollup.",
    dashboard: "View only, and company-wide. Context for where your sets land, not your scorecard.",
    leads:
      "Your working surface. Update stage and priority, mark pre-call video watched, and keep the notes honest.",
    eod_reports: "Where your day gets logged. One question at a time, once per day, by you.",
    dm_setter:
      "Your own numbers — conversations, qualified convos, sets, show rate and the 5% payout tile.",
    inbound_dialer: "View only. Useful for seeing where your sets go next; not yours to log.",
    closer: "View only. Where your sets end up, so you can see which ones actually close.",
    team: "View only — who is on the team and what they do.",
    team_calendar:
      "View only. Which of your sets are confirmed, and which are at risk of not showing.",
  },
  inbound_dialer: {
    home: "Your callbacks and follow-ups first, then your own numbers.",
    dashboard: "View only, and company-wide. Context, not your scorecard.",
    leads: "Your working surface. Keep stage, priority and notes current as you work the list.",
    eod_reports:
      "Where your day gets logged — dials, connects, sets and cash, one question at a time.",
    inbound_dialer: "Your own numbers: dial volume, connects, sets and the 5% payout tile.",
    dm_setter: "View only. Where your leads came from.",
    closer: "View only. Where your sets end up.",
    team_calendar: "View only. Which of your sets are confirmed.",
  },
  closer: {
    home: "Today's calls, anything needing recovery, then your own performance.",
    dashboard: "View only, and company-wide. Context, not your scorecard.",
    leads:
      "Read the application answers and pre-call video status before every call, and write the notes after.",
    eod_reports: "Your post-call log — status, cash collected and recording, one call at a time.",
    closer:
      "Your own numbers: calls, show rate, close rate, cash collected and the 10% payout tile.",
    team_calendar:
      "Your booked calls and their confirmation status — the page to check first thing.",
    payments: "View only. Whether the cash you closed actually landed, and what is overdue.",
    dm_setter: "View only. Who set the call you are about to take.",
    inbound_dialer: "View only. Where an inbound-sourced call came from.",
  },
};

export function pageMapSection(key: SopDoc["key"]): SopSection {
  const role = PERMISSION_ROLE[key];
  const jobs = JOBS[key];
  const rows = RESOURCES.filter((r) => defaultPerm(role, r.key).can_view).map((r) => [
    r.label,
    defaultPerm(role, r.key).can_edit ? "View + edit" : "View only",
    jobs[r.key] ?? r.view,
  ]);

  return {
    id: "page-map",
    title: "Every page, and what it is for you",
    blocks: [
      {
        type: "paragraph",
        text: "Every destination your role can open, what you are allowed to do there, and what the page is actually for in your job. Pages not listed are ones your role cannot reach — they are hidden from your sidebar rather than shown and blocked.",
      },
      {
        type: "callout",
        tone: "info",
        title: "This table is generated, not written",
        text: "The access column is computed from the same permission rules the app enforces, so it can never disagree with what you actually see. If an admin changes your access, this table changes with it.",
      },
      { type: "table", headers: ["Page", "Your access", "What it is for you"], rows },
      {
        type: "callout",
        tone: "tip",
        title: '"View only" is a design decision, not an oversight',
        text: "Where a page is read-only for you, it is because someone else owns that entry. An EOD is the rep's own statement of their day; money is logged by growth ops or the owner. Seeing a number you cannot edit is the system working.",
      },
    ],
  };
}
