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

const DEMO_SETTERS = [
  { id: "demo-setter-aria", name: "Aria Chen (Demo)" },
  { id: "demo-setter-marcus", name: "Marcus Webb (Demo)" },
];
const DEMO_CLOSERS = [
  { id: "demo-closer-jordan", name: "Jordan Blake (Demo)" },
  { id: "demo-closer-sam", name: "Sam Rivera (Demo)" },
  { id: "demo-closer-casey", name: "Casey Nguyen (Demo)" },
];

const DEMO_CONTENT = [
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

const DEMO_TRAFFIC = [
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
