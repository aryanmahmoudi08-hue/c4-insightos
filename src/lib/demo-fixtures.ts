/**
 * Deterministic Demo / Preview Data fixtures for the two features that
 * participate in the isolated demo-data system: the Attribution Command
 * Center and Calls on Calendar (see `use-demo-mode.tsx`). Every other page
 * always queries real data regardless of this flag.
 *
 * These fixtures are shaped EXACTLY like the real Supabase rows their
 * consuming pages already query — `buildDemoAttributionDataset()`'s output
 * is fed through the same `buildAttributionPathsForModel` canonical engine
 * real data uses (never a second engine), and `buildDemoCalendarDataset()`'s
 * confirmation rows are read by the same pure derivation functions in
 * `call-confirmations.ts` real data uses. Nothing here ever touches
 * Supabase — nothing to isolate from production because nothing is written
 * anywhere; it's pure in-memory fixture data, generated fresh from `Date.now()`
 * each time so "today"/"this week" always renders correctly, structured
 * identically on every call (deterministic composition, not random).
 */

import type { AcquisitionSource } from "./acquisition-source";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// ---------------------------------------------------------------------------
// Attribution Command Center fixtures
// ---------------------------------------------------------------------------

export type DemoAttributionDataset = {
  leadRows: Array<{
    id: string;
    created_at: string;
    source_content_id: string | null;
    first_touch_content_id: string | null;
    traffic_source_id: string | null;
  }>;
  callRows: Array<{
    id: string;
    lead_id: string;
    created_at: string;
    closed: boolean;
    source_content_id: string | null;
    contract_value_cents: number;
    cash_collected_cents: number;
    setter_id: string;
    closer_id: string | null;
    showed: boolean;
  }>;
  touchRows: Array<{ id: string; lead_id: string; content_id: string; touched_at: string }>;
  contentRows: Array<{ id: string; title: string; platform: string; source_platform: string }>;
  trafficRows: Array<{ id: string; category: string }>;
  repNameById: Record<string, string>;
};

export const DEMO_SETTERS = [
  { id: "demo-setter-aria", name: "Aria Chen (Demo)" },
  { id: "demo-setter-marcus", name: "Marcus Webb (Demo)" },
];
export const DEMO_CLOSERS = [
  { id: "demo-closer-jordan", name: "Jordan Blake (Demo)" },
  { id: "demo-closer-sam", name: "Sam Rivera (Demo)" },
  { id: "demo-closer-casey", name: "Casey Nguyen (Demo)" },
];

export const DEMO_CONTENT = [
  {
    id: "demo-c1",
    title: "5 Signs You Need a Coach (Reel)",
    platform: "reel",
    source_platform: "Instagram",
  },
  {
    id: "demo-c2",
    title: "Client Win Tuesday (Story)",
    platform: "story_sequence",
    source_platform: "Instagram",
  },
  {
    id: "demo-c3",
    title: "POV: You Fixed Your Offer (TikTok)",
    platform: "tiktok",
    source_platform: "TikTok",
  },
  {
    id: "demo-c4",
    title: "Why Your Funnel Leaks (Long-form)",
    platform: "youtube",
    source_platform: "YouTube",
  },
  {
    id: "demo-c5",
    title: "60 Seconds on Pricing (Short)",
    platform: "youtube_short",
    source_platform: "YouTube",
  },
  {
    id: "demo-c6",
    title: "Why I Stopped Chasing Leads (Post)",
    platform: "post",
    source_platform: "LinkedIn",
  },
  {
    id: "demo-c7",
    title: "Free Training Signup (Ad)",
    platform: "ad_creative",
    source_platform: "Meta",
  },
  { id: "demo-c8", title: "Weekly Insight (Email)", platform: "email", source_platform: "Email" },
];

export const DEMO_TRAFFIC = [
  { id: "demo-t-organic", category: "organic" },
  { id: "demo-t-paid", category: "paid" },
  { id: "demo-t-referral", category: "referral" },
  { id: "demo-t-direct", category: "direct" },
];

export function buildDemoAttributionDataset(): DemoAttributionDataset {
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * DAY_MS).toISOString();

  const repNameById: Record<string, string> = {};
  for (const s of DEMO_SETTERS) repNameById[s.id] = s.name;
  for (const c of DEMO_CLOSERS) repNameById[c.id] = c.name;

  const leadRows: DemoAttributionDataset["leadRows"] = [];
  const callRows: DemoAttributionDataset["callRows"] = [];
  const touchRows: DemoAttributionDataset["touchRows"] = [];
  let touchSeq = 0;
  const addTouches = (leadId: string, seq: Array<{ content: string; daysAgo: number }>) => {
    for (const t of seq) {
      touchRows.push({
        id: `demo-touch-${touchSeq++}`,
        lead_id: leadId,
        content_id: t.content,
        touched_at: daysAgo(t.daysAgo),
      });
    }
  };

  // Each row deliberately varies lead.source_content_id (lead-source model)
  // vs call.source_content_id (booking-source model) vs the touch sequence's
  // first/last entries (first/last-touch models) so the 5 models produce
  // meaningfully different results, not the same data five times.
  const scenarios: Array<{
    lead: string;
    leadCreated: number;
    leadSourceContent: string | null;
    trafficSource: string | null;
    touches: Array<{ content: string; daysAgo: number }>;
    callSourceContent: string | null;
    closed: boolean;
    showed: boolean;
    setter: string;
    closer: string | null;
    contractCents: number;
    cashCents: number;
    callDaysAgo: number;
  }> = [
    // A — rich divergent journey: lead-source and booking-source disagree,
    // 2 assisting touches before the last (assisted_touch has real content).
    {
      lead: "demo-lead-1",
      leadCreated: 11,
      leadSourceContent: "demo-c1",
      trafficSource: "demo-t-organic",
      touches: [
        { content: "demo-c1", daysAgo: 10 },
        { content: "demo-c2", daysAgo: 8 },
        { content: "demo-c4", daysAgo: 3 },
      ],
      callSourceContent: "demo-c1",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[0].id,
      closer: DEMO_CLOSERS[0].id,
      contractCents: 1_200_000,
      cashCents: 1_200_000,
      callDaysAgo: 2,
    },
    // B — TikTok gets lead-source credit, Meta ad retarget gets booking-
    // source credit: a direct demonstration of why these models must never
    // be conflated.
    {
      lead: "demo-lead-2",
      leadCreated: 13,
      leadSourceContent: "demo-c3",
      trafficSource: "demo-t-paid",
      touches: [
        { content: "demo-c3", daysAgo: 12 },
        { content: "demo-c7", daysAgo: 5 },
      ],
      callSourceContent: "demo-c7",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[1].id,
      closer: DEMO_CLOSERS[1].id,
      contractCents: 800_000,
      cashCents: 800_000,
      callDaysAgo: 4,
    },
    // C — 4-touch journey, 3 assisting touches, first/last/lead/booking all
    // different content pieces — the richest single branch for the Sankey.
    {
      lead: "demo-lead-3",
      leadCreated: 22,
      leadSourceContent: "demo-c4",
      trafficSource: "demo-t-organic",
      touches: [
        { content: "demo-c4", daysAgo: 20 },
        { content: "demo-c5", daysAgo: 15 },
        { content: "demo-c6", daysAgo: 9 },
        { content: "demo-c1", daysAgo: 2 },
      ],
      callSourceContent: "demo-c1",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[0].id,
      closer: DEMO_CLOSERS[2].id,
      contractCents: 1_500_000,
      cashCents: 1_500_000,
      callDaysAgo: 1,
    },
    // D — single-touch, every model agrees: a clean, high-confidence,
    // low-ambiguity conversion (contrast to A/B/C above).
    {
      lead: "demo-lead-4",
      leadCreated: 7,
      leadSourceContent: "demo-c6",
      trafficSource: "demo-t-organic",
      touches: [{ content: "demo-c6", daysAgo: 6 }],
      callSourceContent: "demo-c6",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[1].id,
      closer: DEMO_CLOSERS[0].id,
      contractCents: 950_000,
      cashCents: 950_000,
      callDaysAgo: 3,
    },
    // E — fully unattributed: real referral lead with no trackable content
    // at all. Every model honestly produces no path for this call.
    {
      lead: "demo-lead-5",
      leadCreated: 9,
      leadSourceContent: null,
      trafficSource: "demo-t-referral",
      touches: [],
      callSourceContent: null,
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[0].id,
      closer: DEMO_CLOSERS[1].id,
      contractCents: 1_000_000,
      cashCents: 1_000_000,
      callDaysAgo: 2,
    },
    // F — payment plan: cash collected so far is less than the full
    // contract (a real, honest "outstanding balance" case — no fabricated
    // refund field, since `calls` has none for real data either).
    {
      lead: "demo-lead-6",
      leadCreated: 6,
      leadSourceContent: "demo-c8",
      trafficSource: "demo-t-organic",
      touches: [{ content: "demo-c8", daysAgo: 4 }],
      callSourceContent: "demo-c8",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[1].id,
      closer: DEMO_CLOSERS[2].id,
      contractCents: 2_000_000,
      cashCents: 500_000,
      callDaysAgo: 3,
    },
    // G — booked and showed, but did not close (never enters closedRows or
    // any attribution path — real ground-truth funnel volume only).
    {
      lead: "demo-lead-7",
      leadCreated: 8,
      leadSourceContent: "demo-c2",
      trafficSource: "demo-t-organic",
      touches: [
        { content: "demo-c2", daysAgo: 7 },
        { content: "demo-c3", daysAgo: 1 },
      ],
      callSourceContent: "demo-c3",
      closed: false,
      showed: true,
      setter: DEMO_SETTERS[0].id,
      closer: DEMO_CLOSERS[0].id,
      contractCents: 0,
      cashCents: 0,
      callDaysAgo: 1,
    },
    // H — small-sample Meta Ads close.
    {
      lead: "demo-lead-8",
      leadCreated: 4,
      leadSourceContent: "demo-c7",
      trafficSource: "demo-t-paid",
      touches: [{ content: "demo-c7", daysAgo: 2 }],
      callSourceContent: "demo-c7",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[1].id,
      closer: DEMO_CLOSERS[1].id,
      contractCents: 700_000,
      cashCents: 700_000,
      callDaysAgo: 1,
    },
    // I — YouTube short first touch, YouTube long-form booking source.
    {
      lead: "demo-lead-9",
      leadCreated: 16,
      leadSourceContent: "demo-c5",
      trafficSource: "demo-t-organic",
      touches: [
        { content: "demo-c5", daysAgo: 14 },
        { content: "demo-c4", daysAgo: 6 },
      ],
      callSourceContent: "demo-c4",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[0].id,
      closer: DEMO_CLOSERS[2].id,
      contractCents: 1_100_000,
      cashCents: 1_100_000,
      callDaysAgo: 5,
    },
    // J — closed but nothing collected yet (deal in motion / broken first
    // payment) — cash-aggregation functions already exclude cash<=0 rows,
    // so this honestly contributes zero attributed cash without any special
    // handling, exactly like real data would.
    {
      lead: "demo-lead-10",
      leadCreated: 27,
      leadSourceContent: "demo-c1",
      trafficSource: "demo-t-direct",
      touches: [{ content: "demo-c1", daysAgo: 25 }],
      callSourceContent: "demo-c1",
      closed: true,
      showed: true,
      setter: DEMO_SETTERS[1].id,
      closer: DEMO_CLOSERS[0].id,
      contractCents: 900_000,
      cashCents: 0,
      callDaysAgo: 10,
    },
    // K/L/M — no-show and disqualified-style ground-truth volume, no calls
    // at all for two of them (leads that never booked), to make Total Leads
    // meaningfully exceed Booked Calls.
    {
      lead: "demo-lead-11",
      leadCreated: 5,
      leadSourceContent: "demo-c3",
      trafficSource: "demo-t-organic",
      touches: [{ content: "demo-c3", daysAgo: 4 }],
      callSourceContent: null,
      closed: false,
      showed: false,
      setter: DEMO_SETTERS[0].id,
      closer: null,
      contractCents: 0,
      cashCents: 0,
      callDaysAgo: 0,
    },
  ];

  for (const s of scenarios) {
    leadRows.push({
      id: s.lead,
      created_at: daysAgo(s.leadCreated),
      source_content_id: s.leadSourceContent,
      first_touch_content_id: s.touches[0]?.content ?? null,
      traffic_source_id: s.trafficSource,
    });
    addTouches(s.lead, s.touches);
    if (s.callDaysAgo >= 0 && (s.closed || s.showed || s.callSourceContent)) {
      callRows.push({
        id: `${s.lead}-call`,
        lead_id: s.lead,
        created_at: daysAgo(s.callDaysAgo),
        closed: s.closed,
        source_content_id: s.callSourceContent,
        contract_value_cents: s.contractCents,
        cash_collected_cents: s.cashCents,
        setter_id: s.setter,
        closer_id: s.closer,
        showed: s.showed,
      });
    }
  }

  // A few extra bare leads (no call at all) so Total Leads > Booked Calls.
  for (let i = 0; i < 4; i++) {
    leadRows.push({
      id: `demo-lead-extra-${i}`,
      created_at: daysAgo(3 + i),
      source_content_id: null,
      first_touch_content_id: null,
      traffic_source_id: DEMO_TRAFFIC[i % DEMO_TRAFFIC.length].id,
    });
  }

  return {
    leadRows,
    callRows,
    touchRows,
    contentRows: DEMO_CONTENT,
    trafficRows: DEMO_TRAFFIC,
    repNameById,
  };
}

// ---------------------------------------------------------------------------
// Calls on Calendar fixtures
// ---------------------------------------------------------------------------

export type DemoCall = {
  id: string;
  lead_id: string;
  setter_id: string | null;
  closer_id: string | null;
  scheduled_for: string;
  status: string;
  showed: boolean | null;
  offer_made: boolean | null;
  closed: boolean | null;
  cash_collected_cents: number | null;
  contract_value_cents: number | null;
  duration_seconds: number | null;
  cancelled: boolean | null;
  meeting_link: string | null;
  recording_url: string | null;
  calendly_cancel_url: string | null;
  calendly_reschedule_url: string | null;
};

export type DemoLead = {
  id: string;
  full_name: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  intent_score: number | null;
  priority: string | null;
  source_platform: string | null;
  qualification_notes: string | null;
  precall_video_watched: boolean | null;
  application_data: Record<string, string> | null;
};

export type DemoConfirmation = {
  call_id: string;
  night_before_scheduled_at: string | null;
  night_before_sent_at: string | null;
  morning_scheduled_at: string | null;
  morning_sent_at: string | null;
  morning_reason_for_change: string | null;
  morning_goal_1: string | null;
  morning_goal_2: string | null;
  morning_goal_3: string | null;
  morning_response_notes: string | null;
  morning_responded_at: string | null;
  one_hour_scheduled_at: string | null;
  one_hour_sent_at: string | null;
  thirty_min_scheduled_at: string | null;
  thirty_min_sent_at: string | null;
  thirty_min_confirmed: boolean;
  thirty_min_confirmed_at: string | null;
  ten_min_scheduled_at: string | null;
  ten_min_sent_at: string | null;
  overall_status: "awaiting" | "confirmed" | "overdue" | "at_risk" | "cancelled" | "rescheduled";
  confirmed_at: string | null;
  cancelled_reason: string | null;
  rescheduled_reason: string | null;
};

export type DemoCalendarDataset = {
  calls: DemoCall[];
  leadById: Map<string, DemoLead>;
  repNameById: Record<string, string>;
  confirmationByCallId: Map<string, DemoConfirmation>;
  policy: {
    overdue_after_hours: number;
    at_risk_after_hours: number;
    auto_cancel_enabled: boolean;
    auto_cancel_minutes_before: number;
  };
};

const DEMO_LEAD_NAMES: Array<{
  name: string;
  source: AcquisitionSource;
  quality: "high" | "good" | "standard" | "low";
}> = [
  { name: "Priya Anand (Demo)", source: "Meta Ads", quality: "high" },
  { name: "Devon Marsh (Demo)", source: "TikTok", quality: "good" },
  { name: "Elena Cruz (Demo)", source: "Instagram", quality: "high" },
  { name: "Marcus Webb (Demo)", source: "YouTube", quality: "standard" },
  { name: "Sofia Ricci (Demo)", source: "LinkedIn", quality: "good" },
  { name: "Owen Dalton (Demo)", source: "Google", quality: "standard" },
  { name: "Nina Kowalski (Demo)", source: "Email", quality: "low" },
  { name: "Tariq Osei (Demo)", source: "Referral / Partner", quality: "high" },
  { name: "Grace Lindqvist (Demo)", source: "Direct / Organic", quality: "standard" },
  { name: "Jamal Whitfield (Demo)", source: "Other", quality: "good" },
];

/** Real `leads.priority`/`intent_score`/`status` combinations that
 * `deriveLeadQuality` (lead-quality.ts) actually resolves into each label —
 * never a fabricated score. */
function qualityFields(q: "high" | "good" | "standard" | "low") {
  if (q === "high") return { intent_score: 92, priority: "urgent", status: "qualified" };
  if (q === "good") return { intent_score: 65, priority: "high", status: "qualified" };
  if (q === "standard") return { intent_score: 45, priority: "normal", status: "qualified" };
  return { intent_score: 15, priority: "low", status: "dm_received" };
}

// Realistic application-form answers for the "goal"/"focus"/"time"/"income"
// APPLICATION_FIELD_LABELS keys (application-fields.ts) — fictional demo
// content only, cycled across bookings so the drawer's Lead Form Responses
// section shows real variation, not one repeated answer everywhere.
const DEMO_APPLICATION_GOALS = [
  "Reach $30K/month",
  "Replace my 9-5 income in 6 months",
  "Scale past $50K/month without burning out",
  "Finally launch my own program",
  "Double my close rate on sales calls",
];
const DEMO_APPLICATION_FOCUS = [
  "Consistent lead flow",
  "Closing higher-ticket clients",
  "Building a repeatable offer",
  "Getting off the content treadmill",
  "Systemizing fulfillment so it doesn't rely on me",
];
const DEMO_APPLICATION_TIME = ["10 hrs/week", "15-20 hrs/week", "Full-time", "5 hrs/week"];
const DEMO_APPLICATION_INCOME = ["$0-2K/month", "$2K-8K/month", "$8K-15K/month", "$15K+/month"];

export function buildDemoCalendarDataset(): DemoCalendarDataset {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const at = (dayOffset: number, hour: number, minute = 0) =>
    new Date(startOfToday.getTime() + dayOffset * DAY_MS + hour * HOUR_MS + minute * 60_000);

  const setters = [DEMO_SETTERS[0].id, DEMO_SETTERS[1].id];
  const closers = [DEMO_CLOSERS[0].id, DEMO_CLOSERS[1].id, DEMO_CLOSERS[2].id];
  const repNameById: Record<string, string> = {};
  for (const s of DEMO_SETTERS) repNameById[s.id] = s.name;
  for (const c of DEMO_CLOSERS) repNameById[c.id] = c.name;

  const calls: DemoCall[] = [];
  const leadById = new Map<string, DemoLead>();
  const confirmationByCallId = new Map<string, DemoConfirmation>();

  const emptyConfirmation = (callId: string): DemoConfirmation => ({
    call_id: callId,
    night_before_scheduled_at: null,
    night_before_sent_at: null,
    morning_scheduled_at: null,
    morning_sent_at: null,
    morning_reason_for_change: null,
    morning_goal_1: null,
    morning_goal_2: null,
    morning_goal_3: null,
    morning_response_notes: null,
    morning_responded_at: null,
    one_hour_scheduled_at: null,
    one_hour_sent_at: null,
    thirty_min_scheduled_at: null,
    thirty_min_sent_at: null,
    thirty_min_confirmed: false,
    thirty_min_confirmed_at: null,
    ten_min_scheduled_at: null,
    ten_min_sent_at: null,
    overall_status: "awaiting",
    confirmed_at: null,
    cancelled_reason: null,
    rescheduled_reason: null,
  });

  // Each entry: [dayOffset, hour, minute, leadIndex, closerIndex, setterIndex,
  // scenario]. dayOffset 0 = today (Day view), spread across -1..+6 for Week
  // view. Every touchpoint state described in the spec gets at least one
  // real example.
  type Scenario =
    | "fully_confirmed"
    | "awaiting_morning"
    | "awaiting_one_hour"
    | "awaiting_thirty_min"
    | "awaiting_ten_min"
    | "overdue"
    | "at_risk"
    | "video_not_watched"
    | "cancelled"
    | "rescheduled"
    | "showed"
    | "no_show";

  const bookings: Array<{
    day: number;
    hour: number;
    minute: number;
    leadIdx: number;
    closerIdx: number;
    setterIdx: number;
    scenario: Scenario;
  }> = [
    {
      day: 0,
      hour: 9,
      minute: 0,
      leadIdx: 0,
      closerIdx: 0,
      setterIdx: 0,
      scenario: "fully_confirmed",
    },
    {
      day: 0,
      hour: 10,
      minute: 30,
      leadIdx: 1,
      closerIdx: 1,
      setterIdx: 1,
      scenario: "awaiting_morning",
    },
    { day: 0, hour: 12, minute: 0, leadIdx: 2, closerIdx: 2, setterIdx: 0, scenario: "at_risk" },
    {
      day: 0,
      hour: 13,
      minute: 30,
      leadIdx: 3,
      closerIdx: 0,
      setterIdx: 1,
      scenario: "awaiting_one_hour",
    },
    {
      day: 0,
      hour: 15,
      minute: 0,
      leadIdx: 4,
      closerIdx: 1,
      setterIdx: 0,
      scenario: "awaiting_thirty_min",
    },
    {
      day: 0,
      hour: 16,
      minute: 0,
      leadIdx: 5,
      closerIdx: 2,
      setterIdx: 1,
      scenario: "video_not_watched",
    },
    { day: 0, hour: 8, minute: 0, leadIdx: 6, closerIdx: 0, setterIdx: 0, scenario: "overdue" },
    { day: 0, hour: 11, minute: 0, leadIdx: 7, closerIdx: 1, setterIdx: 1, scenario: "cancelled" },
    { day: -1, hour: 14, minute: 0, leadIdx: 8, closerIdx: 2, setterIdx: 0, scenario: "showed" },
    { day: -1, hour: 10, minute: 0, leadIdx: 9, closerIdx: 0, setterIdx: 1, scenario: "no_show" },
    {
      day: 1,
      hour: 9,
      minute: 30,
      leadIdx: 0,
      closerIdx: 1,
      setterIdx: 0,
      scenario: "awaiting_ten_min",
    },
    {
      day: 1,
      hour: 14,
      minute: 0,
      leadIdx: 2,
      closerIdx: 2,
      setterIdx: 1,
      scenario: "rescheduled",
    },
    {
      day: 2,
      hour: 11,
      minute: 0,
      leadIdx: 4,
      closerIdx: 0,
      setterIdx: 0,
      scenario: "fully_confirmed",
    },
    {
      day: 3,
      hour: 15,
      minute: 30,
      leadIdx: 6,
      closerIdx: 1,
      setterIdx: 1,
      scenario: "awaiting_morning",
    },
    { day: 5, hour: 10, minute: 0, leadIdx: 8, closerIdx: 2, setterIdx: 0, scenario: "at_risk" },
  ];

  bookings.forEach((b, i) => {
    const leadInfo = DEMO_LEAD_NAMES[b.leadIdx];
    const leadId = `demo-cal-lead-${b.leadIdx}-${i}`;
    const callId = `demo-cal-call-${i}`;
    const scheduledFor = at(b.day, b.hour, b.minute);
    const qf = qualityFields(leadInfo.quality);
    const watched = b.scenario !== "video_not_watched" && leadInfo.quality !== "low";

    // Form Responses (Priority 6/54) — realistic on roughly half the demo
    // bookings, honestly absent on the rest, so the drawer's "Not
    // connected" fallback is also visible in demo mode, not hidden.
    const applicationData =
      i % 2 === 0
        ? {
            goal: DEMO_APPLICATION_GOALS[i % DEMO_APPLICATION_GOALS.length],
            focus: DEMO_APPLICATION_FOCUS[i % DEMO_APPLICATION_FOCUS.length],
            time: DEMO_APPLICATION_TIME[i % DEMO_APPLICATION_TIME.length],
            income: DEMO_APPLICATION_INCOME[i % DEMO_APPLICATION_INCOME.length],
          }
        : null;

    leadById.set(leadId, {
      id: leadId,
      full_name: leadInfo.name,
      handle: `@${leadInfo.name.split(" ")[0].toLowerCase()}`,
      email: `${leadInfo.name.split(" ")[0].toLowerCase()}@demo.example`,
      phone: null,
      status: qf.status,
      intent_score: qf.intent_score,
      priority: qf.priority,
      source_platform: leadInfo.source,
      qualification_notes: "Demo lead — qualified via discovery call script.",
      precall_video_watched: watched,
      application_data: applicationData,
    });

    const confirmation = emptyConfirmation(callId);
    let cancelled = false;
    let showed: boolean | null = null;
    const nowIso = now.toISOString();

    switch (b.scenario) {
      case "fully_confirmed":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.morning_goal_1 = "Get clarity on the 90-day roadmap";
        confirmation.morning_goal_2 = "Understand pricing options";
        confirmation.morning_goal_3 = "Decide if this is the right time";
        confirmation.morning_responded_at = new Date(
          scheduledFor.getTime() - 5 * HOUR_MS,
        ).toISOString();
        confirmation.one_hour_sent_at = new Date(scheduledFor.getTime() - HOUR_MS).toISOString();
        confirmation.thirty_min_sent_at = new Date(
          scheduledFor.getTime() - 30 * 60_000,
        ).toISOString();
        confirmation.thirty_min_confirmed = true;
        confirmation.thirty_min_confirmed_at = new Date(
          scheduledFor.getTime() - 28 * 60_000,
        ).toISOString();
        confirmation.ten_min_sent_at = new Date(scheduledFor.getTime() - 10 * 60_000).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = confirmation.thirty_min_confirmed_at;
        break;
      case "awaiting_morning":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.overall_status = "awaiting";
        break;
      case "awaiting_one_hour":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.morning_reason_for_change = "";
        confirmation.morning_goal_1 = "Fix inconsistent lead flow";
        confirmation.morning_goal_2 = "Build a repeatable offer";
        confirmation.morning_goal_3 = "Hire the right first hire";
        confirmation.morning_responded_at = new Date(
          scheduledFor.getTime() - 5 * HOUR_MS,
        ).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = confirmation.morning_responded_at;
        break;
      case "awaiting_thirty_min":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.morning_goal_1 = "Validate the new offer price";
        confirmation.morning_responded_at = new Date(
          scheduledFor.getTime() - 5 * HOUR_MS,
        ).toISOString();
        confirmation.one_hour_sent_at = new Date(scheduledFor.getTime() - HOUR_MS).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = confirmation.morning_responded_at;
        break;
      case "awaiting_ten_min":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.morning_responded_at = new Date(
          scheduledFor.getTime() - 5 * HOUR_MS,
        ).toISOString();
        confirmation.one_hour_sent_at = new Date(scheduledFor.getTime() - HOUR_MS).toISOString();
        confirmation.thirty_min_sent_at = new Date(
          scheduledFor.getTime() - 30 * 60_000,
        ).toISOString();
        confirmation.thirty_min_confirmed = true;
        confirmation.thirty_min_confirmed_at = new Date(
          scheduledFor.getTime() - 28 * 60_000,
        ).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = confirmation.thirty_min_confirmed_at;
        break;
      case "overdue":
        confirmation.overall_status = "overdue";
        break;
      case "at_risk":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.overall_status = "at_risk";
        break;
      case "video_not_watched":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.overall_status = "awaiting";
        break;
      case "cancelled":
        cancelled = true;
        confirmation.overall_status = "cancelled";
        confirmation.cancelled_reason = "Cancelled — confirmation not received";
        break;
      case "rescheduled":
        confirmation.overall_status = "rescheduled";
        break;
      case "showed":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.morning_sent_at = new Date(scheduledFor.getTime() - 6 * HOUR_MS).toISOString();
        confirmation.morning_responded_at = new Date(
          scheduledFor.getTime() - 5 * HOUR_MS,
        ).toISOString();
        confirmation.one_hour_sent_at = new Date(scheduledFor.getTime() - HOUR_MS).toISOString();
        confirmation.thirty_min_sent_at = new Date(
          scheduledFor.getTime() - 30 * 60_000,
        ).toISOString();
        confirmation.thirty_min_confirmed = true;
        confirmation.ten_min_sent_at = new Date(scheduledFor.getTime() - 10 * 60_000).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = nowIso;
        showed = true;
        break;
      case "no_show":
        confirmation.night_before_sent_at = new Date(
          scheduledFor.getTime() - 20 * HOUR_MS,
        ).toISOString();
        confirmation.overall_status = "confirmed";
        confirmation.confirmed_at = nowIso;
        showed = false;
        break;
    }

    confirmationByCallId.set(callId, confirmation);
    calls.push({
      id: callId,
      lead_id: leadId,
      setter_id: setters[b.setterIdx],
      closer_id: closers[b.closerIdx],
      scheduled_for: scheduledFor.toISOString(),
      status: cancelled ? "cancelled" : "booked",
      showed,
      offer_made: showed ? true : null,
      closed: null,
      cash_collected_cents: null,
      contract_value_cents: null,
      duration_seconds: i % 3 === 0 ? 2700 : null, // a few real 45-min calls; rest use the honest 30-min default
      cancelled,
      meeting_link: cancelled ? null : `https://meet.demo.example/${callId}`,
      recording_url: null,
      // Calendly links (Priority 6/47) — present on most bookings to show
      // the connected-state UI; honestly absent on the rest (i % 3 === 0)
      // so the drawer's "Calendly links not connected" fallback is also
      // demonstrated, not hidden behind every demo call having one.
      calendly_cancel_url:
        !cancelled && i % 3 !== 0 ? `https://calendly.com/cancellations/demo-${callId}` : null,
      calendly_reschedule_url:
        !cancelled && i % 3 !== 0 ? `https://calendly.com/reschedulings/demo-${callId}` : null,
    });
  });

  return {
    calls,
    leadById,
    repNameById,
    confirmationByCallId,
    policy: {
      overdue_after_hours: 24,
      at_risk_after_hours: 4,
      auto_cancel_enabled: false,
      auto_cancel_minutes_before: 30,
    },
  };
}

// ---------------------------------------------------------------------------
// Core "populated business" fixtures — Main Hub, DM Setter, Inbound Dialer,
// Closer, Mentees (Master Plan Priority 5).
//
// Procedurally generated over a deterministic ~8-week window (indexed off
// `Date.now()` and array position — never `Math.random()`) rather than the
// Attribution dataset's individually hand-authored scenarios above: these
// pages need dashboard-scale volume (dozens of leads/calls/clients across
// weeks) to read as a populated business, not a handful of scripted
// journeys. Every downstream number (closes, cash, disqualifications,
// setter/dialer/closer performance, mentee LTV) falls out of aggregating
// these same rows — nothing here is a separately invented summary number.
//
// Reuses DEMO_SETTERS/DEMO_CLOSERS/DEMO_CONTENT from the Attribution
// section above (same people, same content) so the whole app tells one
// consistent demo story, not a different cast per page.
// ---------------------------------------------------------------------------

export const DEMO_DIALERS = [
  { id: "demo-dialer-priya", name: "Priya Anand (Demo)" },
  { id: "demo-dialer-leo", name: "Leo Martins (Demo)" },
];

export type DemoTeamMember = { id: string; name: string; role: string };
/** team_members-shaped roster — backs the id -> name/role resolution every
 * consuming page's real query does via a `team_members` select. */
export const DEMO_TEAM_MEMBERS: DemoTeamMember[] = [
  ...DEMO_SETTERS.map((s) => ({ ...s, role: "dm_setter" })),
  ...DEMO_DIALERS.map((d) => ({ ...d, role: "inbound_dialer" })),
  ...DEMO_CLOSERS.map((c) => ({ ...c, role: "closer" })),
];

// Real ACQUISITION_SOURCES values (acquisition-source.ts) — the exact
// standardized taxonomy, not an ad hoc list, so demo leads exercise the
// same categories real/Attribution data does.
const DEMO_SOURCE_PLATFORMS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Google",
  "Email",
  "Referral / Partner",
  "Direct / Organic",
];

// Weighted so the funnel reads like a real high-ticket coaching pipeline —
// mostly early/mid-stage, a believable minority closed or disqualified —
// not a flat 1-in-10 for every `lead_status` enum value.
const LEAD_STATUS_CYCLE = [
  "dm_received",
  "dm_received",
  "qualified",
  "qualified",
  "qualified",
  "pre_call_assets_sent",
  "call_booked",
  "call_booked",
  "showed",
  "showed",
  "closed",
  "closed",
  "disqualified",
  "follow_up",
  "follow_up",
  "no_show",
  "ghosted",
] as const;
const CALL_STATUSES = new Set([
  "call_booked",
  "showed",
  "closed",
  "disqualified",
  "follow_up",
  "no_show",
]);

const DEMO_LEAD_FIRST_NAMES = [
  "Avery",
  "Blake",
  "Carmen",
  "Derek",
  "Elise",
  "Felix",
  "Grace",
  "Hassan",
  "Isla",
  "Jasper",
  "Kira",
  "Liam",
  "Maya",
  "Noel",
  "Priyanka",
  "Quinn",
  "Reid",
  "Sara",
  "Theo",
  "Uma",
  "Victor",
  "Wren",
  "Xander",
  "Yara",
];
const DEMO_LEAD_LAST_NAMES = [
  "Sanders",
  "Okoye",
  "Delgado",
  "Fontaine",
  "Whitmore",
  "Basu",
  "Larkin",
  "Torres",
  "Vance",
  "Ekwueme",
  "Callahan",
  "Reyes",
];
const CONTRACT_TIERS_CENTS = [600_000, 900_000, 1_200_000, 1_800_000, 2_500_000];

const DEMO_WINDOW_DAYS = 56;
const DEMO_LEAD_COUNT = 64;

export interface DemoCoreLead {
  id: string;
  full_name: string;
  email: string;
  handle: string;
  status: string;
  assigned_setter_id: string;
  source_platform: string;
  source_connector: string;
  source_campaign: string;
  source_content_id: string;
  ticket_tier: "high" | "low";
  created_at: string;
  intent_score: number;
}

export interface DemoCoreCall {
  id: string;
  lead_id: string;
  setter_id: string;
  closer_id: string;
  closer_name: string;
  lead_email: string;
  status: string;
  showed: boolean;
  offer_made: boolean;
  closed: boolean;
  disposition: string | null;
  contract_value_cents: number;
  cash_collected_cents: number;
  deposit_cents: number;
  payment_plan: boolean;
  scheduled_for: string;
  created_at: string;
  duration_seconds: number | null;
  talk_seconds: number | null;
  source_platform: string;
  source_campaign: string;
}

export interface DemoCoreSetterActivity {
  team_member_name: string;
  role: "dm_setter" | "inbound_dialer";
  activity_date: string;
  leads_contacted: number;
  qualified_convos: number;
  sets: number;
  calls_on_calendar: number;
  live_calls: number;
  closes: number;
  cash_collected_cents: number;
  total_revenue_cents: number;
  dials: number;
  connections: number;
  inbound_dms_sent: number | null;
  outbound_dms_sent: number | null;
  replies: number | null;
  followups_sent: number | null;
  links_sent: number;
}

export interface DemoCoreClient {
  id: string;
  lead_id: string | null;
  full_name: string;
  email: string;
  offer_name: string;
  start_date: string;
  contract_value_cents: number;
  invested_to_date_cents: number;
  payment_plan: boolean;
  installments_remaining: number;
  installment_amount_cents: number;
  status: string;
  renewal_date: string;
  renewal_conv_started: boolean;
  renewal_stage: string | null;
  health_score: number;
  notes: string | null;
}

export interface DemoCorePayment {
  id: string;
  client_id: string;
  amount_cents: number;
  status: string;
  collected_at: string;
  currency: string;
}

export interface DemoCoreContentMetric {
  content_id: string;
  captured_at: string;
  views: number;
  leads_generated: number;
  calls_booked: number;
  closes: number;
  cash_collected_cents: number;
}

export interface DemoCoreDataset {
  leads: DemoCoreLead[];
  calls: DemoCoreCall[];
  setterActivity: DemoCoreSetterActivity[];
  clients: DemoCoreClient[];
  payments: DemoCorePayment[];
  contentMetrics: DemoCoreContentMetric[];
  teamMembers: DemoTeamMember[];
}

let _demoCoreCache: { at: number; data: DemoCoreDataset } | null = null;

/**
 * The full ~8-week demo universe. Callers slice/filter these arrays by
 * their own date-range bounds exactly the way the real `else` branch
 * filters Supabase rows with `.gte()/.lte()` — this function itself is not
 * date-range aware, matching how the Attribution/Calendar builders above
 * work. Cached for a few seconds so the many pages/queries that call this
 * within the same interaction (Main Hub alone calls it twice, for curr/prev
 * periods) build the exact same object graph rather than independently
 * regenerating slightly-differently-timestamped rows.
 */
export function buildDemoCoreDataset(): DemoCoreDataset {
  const now = Date.now();
  if (_demoCoreCache && now - _demoCoreCache.at < 5000) return _demoCoreCache.data;

  const reps = [
    ...DEMO_SETTERS.map((s) => ({ ...s, role: "dm_setter" as const })),
    ...DEMO_DIALERS.map((d) => ({ ...d, role: "inbound_dialer" as const })),
  ];

  const leads: DemoCoreLead[] = [];
  const calls: DemoCoreCall[] = [];

  for (let i = 0; i < DEMO_LEAD_COUNT; i++) {
    const dayOffset = (i * (DEMO_WINDOW_DAYS / DEMO_LEAD_COUNT)) % DEMO_WINDOW_DAYS;
    const createdAt = new Date(now - dayOffset * DAY_MS - (i % 24) * HOUR_MS);
    const rep = reps[i % reps.length];
    const status = LEAD_STATUS_CYCLE[i % LEAD_STATUS_CYCLE.length];
    const source = DEMO_SOURCE_PLATFORMS[i % DEMO_SOURCE_PLATFORMS.length];
    const content = DEMO_CONTENT[i % DEMO_CONTENT.length];
    const first = DEMO_LEAD_FIRST_NAMES[i % DEMO_LEAD_FIRST_NAMES.length];
    const last = DEMO_LEAD_LAST_NAMES[i % DEMO_LEAD_LAST_NAMES.length];
    const leadId = `demo-core-lead-${i}`;
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@demo.example.com`;
    const quarter = Math.ceil((createdAt.getMonth() + 1) / 3);
    const campaign = `Q${quarter} ${source} Push`;

    leads.push({
      id: leadId,
      full_name: `${first} ${last} (Demo)`,
      email,
      handle: `@${first.toLowerCase()}${last.toLowerCase()}${i}`,
      status,
      assigned_setter_id: rep.id,
      source_platform: source,
      // Priority 7 — `source_connector` is real production's integration-
      // provenance field ("typeform", "ingest_api"; see
      // routes/api/public/typeform.ts), never an acquisition channel — kept
      // distinct here from `source_platform` (the real channel evidence)
      // rather than reusing the same value for both, which would blur
      // exactly the Acquisition-Source-vs-Platform distinction this
      // priority exists to clean up.
      source_connector: i % 4 === 0 ? "manual" : "typeform",
      source_campaign: campaign,
      source_content_id: content.id,
      ticket_tier: i % 3 === 0 ? "high" : "low",
      created_at: createdAt.toISOString(),
      intent_score: 20 + (i % 8) * 10,
    });

    if (!CALL_STATUSES.has(status)) continue;
    const closer = DEMO_CLOSERS[i % DEMO_CLOSERS.length];
    const scheduledFor = new Date(createdAt.getTime() + (1 + (i % 5)) * DAY_MS);
    const showed =
      status === "showed" ||
      status === "closed" ||
      status === "disqualified" ||
      status === "follow_up";
    const closed = status === "closed";
    const offerMade = closed || status === "disqualified" || (showed && i % 2 === 0);
    const contractCents = closed ? CONTRACT_TIERS_CENTS[i % CONTRACT_TIERS_CENTS.length] : 0;
    const paymentPlan = closed && i % 2 === 0;
    const cashCents = closed ? (paymentPlan ? Math.round(contractCents * 0.35) : contractCents) : 0;
    const depositCents = closed && paymentPlan ? Math.round(contractCents * 0.15) : 0;
    const disposition = closed
      ? "closed"
      : status === "disqualified"
        ? "unqualified"
        : status === "no_show"
          ? null
          : status === "follow_up"
            ? "follow_up"
            : null;

    calls.push({
      id: `demo-core-call-${i}`,
      lead_id: leadId,
      setter_id: rep.id,
      closer_id: closer.id,
      closer_name: closer.name,
      lead_email: email,
      status,
      showed,
      offer_made: offerMade,
      closed,
      disposition,
      contract_value_cents: contractCents,
      cash_collected_cents: cashCents,
      deposit_cents: depositCents,
      payment_plan: paymentPlan,
      scheduled_for: scheduledFor.toISOString(),
      created_at: scheduledFor.toISOString(),
      duration_seconds: showed ? 1500 + (i % 6) * 300 : null,
      talk_seconds: showed ? 900 + (i % 6) * 200 : null,
      source_platform: source,
      source_campaign: campaign,
    });
  }

  // Daily setter_activity rollups — real aggregates of the leads/calls
  // above per rep per day, not independently invented numbers, so a rep's
  // "Log day" history and their real leads/calls always agree.
  const setterActivity: DemoCoreSetterActivity[] = [];
  for (const rep of reps) {
    for (let d = 0; d < DEMO_WINDOW_DAYS; d++) {
      const dayStart = new Date(now - d * DAY_MS);
      const dayKey = dayStart.toISOString().slice(0, 10);
      const dayLeads = leads.filter(
        (l) => l.assigned_setter_id === rep.id && l.created_at.slice(0, 10) === dayKey,
      );
      const dayCalls = calls.filter(
        (c) => c.setter_id === rep.id && c.scheduled_for.slice(0, 10) === dayKey,
      );
      if (dayLeads.length === 0 && dayCalls.length === 0) continue;
      const isSetter = rep.role === "dm_setter";
      setterActivity.push({
        team_member_name: rep.name,
        role: rep.role,
        activity_date: dayKey,
        leads_contacted: dayLeads.length,
        qualified_convos: dayLeads.filter(
          (l) => l.status !== "dm_received" && l.status !== "ghosted",
        ).length,
        sets: dayCalls.length,
        calls_on_calendar: dayCalls.length,
        live_calls: dayCalls.filter((c) => c.showed).length,
        closes: dayCalls.filter((c) => c.closed).length,
        cash_collected_cents: dayCalls.reduce((s, c) => s + c.cash_collected_cents, 0),
        total_revenue_cents: dayCalls.reduce((s, c) => s + c.contract_value_cents, 0),
        dials: isSetter ? 0 : dayLeads.length * 3,
        connections: isSetter ? 0 : dayLeads.length,
        inbound_dms_sent: isSetter ? dayLeads.length * 2 : null,
        outbound_dms_sent: isSetter ? dayLeads.length * 5 : null,
        replies: isSetter ? dayLeads.length : null,
        followups_sent: isSetter ? dayCalls.length : null,
        links_sent: isSetter ? dayCalls.length : 0,
      });
    }
  }

  // Mentees — one client per closed call, with a believable spread of
  // renewal timing/health so Mentees & Renewals has upcoming, overdue, and
  // healthy examples to show, not just a flat "all active" list.
  const clients: DemoCoreClient[] = [];
  const payments: DemoCorePayment[] = [];
  const closedCalls = calls.filter((c) => c.closed);
  closedCalls.forEach((call, idx) => {
    const lead = leads.find((l) => l.id === call.lead_id)!;
    const clientId = `demo-core-client-${idx}`;
    const startDate = new Date(call.scheduled_for);
    // Spread renewal dates from "overdue by 2 weeks" through "in 5 months" —
    // renewal_stage/health mirror the real distinctions Mentees renders.
    const renewalOffsetDays = -14 + idx * 23;
    const renewalDate = new Date(now + renewalOffsetDays * DAY_MS);
    const atRisk = idx % 5 === 0;
    const churned = idx % 9 === 0;
    const installments = call.payment_plan ? 3 : 0;
    const installmentAmount = installments > 0 ? Math.round(call.contract_value_cents * 0.2) : 0;

    clients.push({
      id: clientId,
      lead_id: lead.id,
      full_name: lead.full_name,
      email: lead.email,
      offer_name: lead.ticket_tier === "high" ? "Flagship Coaching (Demo)" : "Core Program (Demo)",
      start_date: startDate.toISOString().slice(0, 10),
      contract_value_cents: call.contract_value_cents,
      invested_to_date_cents: call.cash_collected_cents,
      payment_plan: call.payment_plan,
      installments_remaining: call.payment_plan ? Math.max(0, installments - (idx % 4)) : 0,
      installment_amount_cents: installmentAmount,
      status: churned ? "churned" : atRisk ? "at_risk" : "active",
      renewal_date: renewalDate.toISOString().slice(0, 10),
      renewal_conv_started: renewalOffsetDays < 30 && !churned,
      renewal_stage: churned
        ? null
        : renewalOffsetDays < 0
          ? "overdue"
          : renewalOffsetDays < 30
            ? "in_progress"
            : null,
      health_score: churned ? 20 : atRisk ? 55 : 85 + (idx % 10),
      notes: null,
    });

    payments.push({
      id: `demo-core-payment-${idx}-0`,
      client_id: clientId,
      amount_cents: call.deposit_cents > 0 ? call.deposit_cents : call.cash_collected_cents,
      status: "paid",
      collected_at: startDate.toISOString(),
      currency: "USD",
    });
    // Payment-plan clients get their remaining installments spread monthly
    // after the deposit — some already paid, some still upcoming/overdue,
    // matching what installments_remaining above claims.
    if (call.payment_plan) {
      for (let n = 1; n <= installments; n++) {
        const dueDate = new Date(startDate.getTime() + n * 30 * DAY_MS);
        const isPast = dueDate.getTime() < now;
        payments.push({
          id: `demo-core-payment-${idx}-${n}`,
          client_id: clientId,
          amount_cents: installmentAmount,
          status: isPast ? "paid" : "pending",
          collected_at: dueDate.toISOString(),
          currency: "USD",
        });
      }
    }
  });

  // Content performance — daily rows per DEMO_CONTENT piece, volumes tied
  // to how many demo leads/calls actually cite that content_id so
  // "leads_generated"/"calls_booked" on Content Command Center agree with
  // the same leads/calls counted everywhere else.
  const contentMetrics: DemoCoreContentMetric[] = [];
  for (const piece of DEMO_CONTENT) {
    const pieceLeads = leads.filter((l) => l.source_content_id === piece.id);
    const pieceCalls = calls.filter((c) => pieceLeads.some((l) => l.id === c.lead_id));
    for (let d = 0; d < DEMO_WINDOW_DAYS; d += 4) {
      const day = new Date(now - d * DAY_MS);
      const dayKey = day.toISOString().slice(0, 10);
      const windowLeads = pieceLeads.filter((l) => {
        const diff = (day.getTime() - new Date(l.created_at).getTime()) / DAY_MS;
        return diff >= 0 && diff < 4;
      });
      const windowCalls = pieceCalls.filter((c) => windowLeads.some((l) => l.id === c.lead_id));
      contentMetrics.push({
        content_id: piece.id,
        captured_at: `${dayKey}T12:00:00.000Z`,
        views: 800 + (d % 20) * 65 + windowLeads.length * 40,
        leads_generated: windowLeads.length,
        calls_booked: windowCalls.length,
        closes: windowCalls.filter((c) => c.closed).length,
        cash_collected_cents: windowCalls.reduce((s, c) => s + c.cash_collected_cents, 0),
      });
    }
  }

  const data: DemoCoreDataset = {
    leads,
    calls,
    setterActivity,
    clients,
    payments,
    contentMetrics,
    teamMembers: DEMO_TEAM_MEMBERS,
  };
  _demoCoreCache = { at: now, data };
  return data;
}
