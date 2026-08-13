/**
 * Canned data for Dev Bypass mode (see `enableDevBypass` in `use-auth.tsx`).
 * The bypass user was never issued a real Supabase session, so any direct-from-browser
 * `supabase.from(...)` call against DEV_BYPASS_ORG_ID comes back RLS-empty. The main
 * dashboard hub and its Traffic/Rep/Client bands special-case `devBypass` and render this
 * instead of an all-zero shell. Dev-only — never imported outside a devBypass branch.
 */

import type { MechanismKey } from "@/lib/content-mechanisms";

export const DEV_BYPASS_ORG_ID = "aaaaaaaa-0000-4000-8000-000000000001";

export const DEV_BYPASS_ORG = {
  org_id: DEV_BYPASS_ORG_ID,
  role: "admin",
  organizations: { id: DEV_BYPASS_ORG_ID, name: "Dev Workspace (Mock)", slug: "dev-bypass" },
};

const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : null);

type Period = {
  cash: number; paymentsCash: number; callsCash: number; setterCash: number;
  newLeads: number; totalCalls: number; showed: number; offers: number; closed: number;
  contractValue: number; views: number; contentLeads: number;
};

const MOCK_CURR: Period = {
  cash: 4_250_000, paymentsCash: 3_000_000, callsCash: 1_250_000, setterCash: 0,
  newLeads: 46, totalCalls: 24, showed: 18, offers: 14, closed: 8,
  contractValue: 9_600_000, views: 184_000, contentLeads: 22,
};

const MOCK_PREV: Period = {
  cash: 3_650_000, paymentsCash: 2_600_000, callsCash: 1_050_000, setterCash: 0,
  newLeads: 39, totalCalls: 20, showed: 15, offers: 11, closed: 6,
  contractValue: 7_800_000, views: 151_000, contentLeads: 18,
};

/** Smooth upward-trending series with light noise, seeded so it doesn't jitter between renders. */
function mockSeries(from: string, to: string, targetCash: number, targetLeads: number, targetViews: number) {
  const days = Math.max(1, Math.min(60, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400e3) + 1));
  const fromTime = new Date(from).getTime();
  let seed = 42;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(fromTime + i * 86400e3).toISOString().slice(5, 10);
    const trend = (i + 1) / days;
    const wobble = 0.6 + rand() * 0.8;
    const calls = Math.round((targetLeads / days) * 0.5 * wobble);
    const showed = Math.round(calls * 0.75);
    const offers = Math.round(showed * 0.8);
    const closed = Math.round(offers * (0.4 + rand() * 0.3));
    return {
      d,
      cash: Math.round((targetCash / days) * trend * wobble),
      leads: Math.round((targetLeads / days) * wobble),
      views: Math.round((targetViews / days) * wobble),
      calls, showed, offers, closed,
      contractValue: Math.round(closed * 1_200_000 * wobble),
    };
  });
}

const MOCK_FUNNEL = [
  { stage: "Views", value: MOCK_CURR.views, conv: null as string | null },
  { stage: "Leads", value: MOCK_CURR.newLeads, conv: pct(MOCK_CURR.newLeads, MOCK_CURR.views) },
  { stage: "Booked", value: MOCK_CURR.totalCalls, conv: pct(MOCK_CURR.totalCalls, MOCK_CURR.newLeads) },
  { stage: "Showed", value: MOCK_CURR.showed, conv: pct(MOCK_CURR.showed, MOCK_CURR.totalCalls) },
  { stage: "Offers", value: MOCK_CURR.offers, conv: pct(MOCK_CURR.offers, MOCK_CURR.showed) },
  { stage: "Closed", value: MOCK_CURR.closed, conv: pct(MOCK_CURR.closed, MOCK_CURR.offers) },
];

const MOCK_CLOSERS = [
  { name: "Jordan Blake", calls: 9, closes: 4, cash: 2_100_000 },
  { name: "Sam Rivera", calls: 7, closes: 3, cash: 1_450_000 },
  { name: "Casey Nguyen", calls: 5, closes: 1, cash: 520_000 },
];

const MOCK_SETTERS = [
  { name: "Taylor Brooks", sets: 14, closes: 5, cash: 1_850_000 },
  { name: "Morgan Lee", sets: 11, closes: 3, cash: 980_000 },
  { name: "Alex Kim", sets: 8, closes: 2, cash: 610_000 },
];

const MOCK_ALERTS = [
  { id: "mock-alert-1", severity: "warning", title: "Show rate dipped below 70% this week", created_at: new Date().toISOString() },
  { id: "mock-alert-2", severity: "info", title: "3 leads have gone 5+ days without a follow-up", created_at: new Date(Date.now() - 86400e3).toISOString() },
];

const MOCK_INSIGHTS = [
  {
    id: "mock-insight-1", module: "content", confidence: 0.82, created_at: new Date().toISOString(),
    title: "Authority-hook reels are outperforming lifestyle content 2:1",
    body: "Reels tagged with an authority hook + social-proof CTA are converting to qualified calls at roughly 2x the rate of lifestyle-angle posts over this range.",
  },
  {
    id: "mock-insight-2", module: "sales", confidence: 0.71, created_at: new Date(Date.now() - 3600e3).toISOString(),
    title: "Price objection is the top reason for no-close on shown calls",
    body: "Price is logged as the primary objection on the largest share of shown-but-not-closed calls this period — consider a pre-call ROI asset.",
  },
];

const MOCK_CONTENT_ATTRIBUTION = [
  { content_id: "mock-content-1", cash_collected_cents: 850_000, leads_generated: 12, closes: 3, views: 42_000, content_pieces: { title: "The $50K Month Breakdown", platform: "Reel" } },
  { content_id: "mock-content-2", cash_collected_cents: 610_000, leads_generated: 9, closes: 2, views: 31_500, content_pieces: { title: "Why Most Coaches Undercharge", platform: "YouTube Short" } },
  { content_id: "mock-content-3", cash_collected_cents: 340_000, leads_generated: 7, closes: 1, views: 18_200, content_pieces: { title: "Client Win: 0 to $20K in 90 Days", platform: "Story Sequence" } },
];

export function mockDashboardStats(from: string, to: string) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthCash = Math.round((MOCK_CURR.cash / 14) * dayOfMonth);
  const dailyPace = dayOfMonth > 0 ? monthCash / dayOfMonth : 0;

  return {
    curr: MOCK_CURR,
    prev: MOCK_PREV,
    series: mockSeries(from, to, MOCK_CURR.cash, MOCK_CURR.newLeads, MOCK_CURR.views),
    closers: MOCK_CLOSERS,
    setters: MOCK_SETTERS,
    funnel: MOCK_FUNNEL,
    alerts: MOCK_ALERTS,
    insights: MOCK_INSIGHTS,
    contentAttribution: MOCK_CONTENT_ATTRIBUTION,
    pace: { monthCash, projection: dailyPace * daysInMonth, dayOfMonth, daysInMonth, dailyPace },
  };
}

/**
 * `contentDemandFn` is `requireSupabaseAuth`-gated, so it 401s under Dev Bypass and the
 * Conversion Mechanism / Variation cards on Generate > Content never get a `pct` to render.
 * This mirrors `DemandResult` from `content-signals.server.ts` (not imported directly —
 * that file pulls in `supabaseAdmin` and other server-only code that can't ship to the client).
 */
export function mockContentDemand(): {
  mix: Record<MechanismKey, number>;
  insufficientData: boolean;
  totalWeight: number;
  minTotalWeight: number;
  weights: Record<MechanismKey, number>;
  drivers: { source: string; detail: string; mechanism: MechanismKey; weight: number }[];
  counts: { faq: number; setter_calls: number; intakes: number; reels: number };
} {
  return {
    mix: { educational: 35, credibility: 30, authoritative: 15, relatability: 20 },
    insufficientData: false,
    totalWeight: 160,
    minTotalWeight: 15,
    weights: { educational: 42, credibility: 36, authoritative: 18, relatability: 24 },
    drivers: [
      { source: "FAQ clicks", detail: "\"Does this actually work?\" · 38 clicks", mechanism: "credibility", weight: 76 },
      { source: "Setting call", detail: "Jordan Blake · 2026-08-04 · \"I've tried this before\"", mechanism: "educational", weight: 12 },
      { source: "Onboarding intake", detail: "Decision moment: \"saw the exact system breakdown\"", mechanism: "educational", weight: 9 },
    ],
    counts: { faq: 6, setter_calls: 14, intakes: 9, reels: 21 },
  };
}

/** Mirrors WeeklyCheck from content-signals.server.ts (not imported directly,
 * same server-only-code reason as mockContentDemand above). */
export function mockWeeklyContentCheck(): {
  per: Record<string, { count: number; dms: number; calls: number; cash: number; views: number; withMetrics: number }>;
  reels: number;
  missing: MechanismKey[];
  untracked: number;
  best: MechanismKey | null;
  worst: MechanismKey | null;
  worstDiagnosis: { label: string; detail: string; verdictsSampled: number } | null;
  total: number;
} {
  const zero = { count: 0, dms: 0, calls: 0, cash: 0, views: 0, withMetrics: 0 };
  return {
    per: {
      educational: { count: 2, dms: 4, calls: 1, cash: 0, views: 3400, withMetrics: 2 },
      credibility: { count: 3, dms: 11, calls: 3, cash: 250000, views: 5200, withMetrics: 3 },
      authoritative: { count: 1, dms: 2, calls: 0, cash: 0, views: 1100, withMetrics: 1 },
      relatability: { count: 0, dms: 0, calls: 0, cash: 0, views: 0, withMetrics: 0 },
      untagged: zero,
    },
    reels: 5,
    missing: ["relatability"],
    untracked: 1,
    best: "credibility",
    worst: "authoritative",
    worstDiagnosis: { label: "Not enough data", detail: "[MOCK] Not enough data to compare this mechanism's reel posts yet — 1 posted, need at least 6 with metrics logged to compare against its own baseline.", verdictsSampled: 1 },
    total: 6,
  };
}

export function mockHubMetrics() {
  return {
    dials: 640, connections: 148, contacted: 210, qualified: 76, linksSent: 54,
    visits: 3_200, plays: 2_100, viewers: 1_780, engagement: 61.4,
    apps: 46, leads: 46, completion: 0.78, quality: 3.9, precallWatched: 28,
    booked: 24, showed: 18, closed: 8,
    wins: 32, financialWins: 9, winCash: 1_450_000, avgEnergy: 7.2,
    activeClients: 14, avgHealth: 78,
    dialSpark: [64, 71, 58, 82, 90, 77, 95],
    visitSpark: [280, 310, 295, 340, 402, 388, 420],
    playSpark: [180, 205, 190, 230, 268, 250, 290],
    appSpark: [4, 6, 5, 7, 9, 6, 9],
  };
}

/* ------------------------------------------------------------------ *
 * Phase 3 — module-level mock data for ContentOS, CopyOS, Sales
 * Tracking, Rep Efficiency and Client DNA visualizers under Dev Bypass.
 * ------------------------------------------------------------------ */

const MOCK_HOOKS = [
  { title: "The $50K Month Breakdown", platform: "reel", mechanism: "educational" as MechanismKey, variation: "value", views: 84_200, retention: 61, leads: 22, cash: 1_240_000 },
  { title: "Why Most Coaches Undercharge", platform: "youtube_short" as const, mechanism: "authoritative" as MechanismKey, variation: "industry_leader", views: 52_800, retention: 48, leads: 14, cash: 610_000 },
  { title: "Client Win: 0 to $20K in 90 Days", platform: "story_sequence" as const, mechanism: "credibility" as MechanismKey, variation: "case_study", views: 31_500, retention: 71, leads: 18, cash: 980_000 },
  { title: "POV: Meeting Your Mentor After a Year", platform: "reel" as const, mechanism: "authoritative" as MechanismKey, variation: "attention_lifestyle", views: 44_100, retention: 39, leads: 6, cash: 0 },
  { title: "How I Went From Broke to $40K/mo", platform: "reel" as const, mechanism: "relatability" as MechanismKey, variation: "storytelling", views: 67_900, retention: 58, leads: 19, cash: 720_000 },
  { title: "The Exact DM Script That Books Calls", platform: "carousel" as const, mechanism: "educational" as MechanismKey, variation: "problem_solution", views: 28_300, retention: 55, leads: 11, cash: 340_000 },
];

export function mockContentPieces() {
  const now = Date.now();
  return MOCK_HOOKS.map((h, i) => ({
    id: `mock-piece-${i}`,
    title: h.title,
    platform: h.platform,
    hook: h.title,
    angle: "proof" as const,
    posted_at: new Date(now - (i + 1) * 2 * 86400e3).toISOString(),
    url: null,
    funnel_stage: "tof",
    body: `${h.title} — mock transcript for dev bypass preview.`,
    pipeline_status: i < 4 ? "posted" : i === 4 ? "ready_to_post" : "in_review",
    mechanism: h.mechanism,
    variation: h.variation,
    content_metrics: [{
      views: h.views, likes: Math.round(h.views * 0.04), leads_generated: h.leads,
      closes: Math.round(h.leads * 0.25), cash_collected_cents: h.cash, hook_retention_pct: h.retention,
    }],
  }));
}

export function mockContentFunnel() {
  return { views: 308_800, leads: 90, calls: 34, closes: 12, cash: 3_890_000 };
}

/** mechanism (row) x variation-slot (col: "Var 1" / "Var 2") avg views, for the ContentOS heatmap. */
export function mockVariationHeatmap() {
  return {
    rows: ["Educational", "Credibility", "Authoritative", "Relatability"],
    cols: ["Var 1", "Var 2"],
    data: [
      [56_400, 28_300],
      [31_500, 19_800],
      [44_100, 22_600],
      [67_900, 24_200],
    ],
  };
}

const MOCK_LEAD_NAMES = [
  "Jordan Ellis", "Sam Whitfield", "Casey Nguyen", "Morgan Blake", "Taylor Reyes",
  "Alex Kim", "Riley Sanders", "Drew Callahan", "Jamie Ortiz", "Avery Chen",
  "Peyton Marsh", "Quinn Fischer",
];

/** Real vocab, matching leads.tsx's STATUS_OPTIONS / PIPELINE_STAGES / PRIORITY_OPTIONS. */
export function mockLeads() {
  const statuses = ["opt_in", "call_booked", "rescheduling", "follow_up_short", "deposit", "closed", "lt_closed", "no_show", "no_close", "disqualified"];
  const stages = ["cold", "warm", "hot", "diamond", ""];
  const priorities = ["diamond", "high", "normal", "normal", "low"];
  const now = Date.now();
  return MOCK_LEAD_NAMES.map((name, i) => ({
    id: `mock-lead-${i}`,
    full_name: name,
    email: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    handle: `@${name.split(" ")[0].toLowerCase()}`,
    phone: null,
    status: statuses[i % statuses.length],
    pipeline_stage: stages[i % stages.length],
    priority: priorities[i % priorities.length],
    precall_video_watched: i % 2 === 0,
    intent_score: 60 + (i % 4) * 10,
    engagement_score: 50 + (i % 5) * 8,
    estimated_close_probability: 20 + (i % 6) * 12,
    source_connector: ["instagram", "youtube", "referral"][i % 3],
    first_touch_content_id: null,
    qualification_notes: null,
    application_data: {},
    notes: null,
    created_at: new Date(now - i * 18 * 3600e3).toISOString(),
  }));
}

const MOCK_CLOSER_SCORECARD = [
  { name: "Jordan Blake", booked: 22, showed: 17, offers: 15, closes: 9, cash: 4_850_000 },
  { name: "Sam Rivera", booked: 18, showed: 13, offers: 11, closes: 6, cash: 3_120_000 },
  { name: "Casey Nguyen", booked: 14, showed: 9, offers: 7, closes: 3, cash: 1_450_000 },
  { name: "Morgan Lee", booked: 11, showed: 8, offers: 6, closes: 4, cash: 1_980_000 },
];

/**
 * Raw per-call rows shaped exactly like closer.tsx's `calls` query — from these, the route's
 * own real aggregation logic (scorecard, KPI totals, objection stats, activity heatmap) derives
 * correctly, rather than mocking every downstream memo separately.
 */
export function mockCalls() {
  const rows: Array<Record<string, unknown>> = [];
  const now = Date.now();
  const objectionPool = ["Price too high", "Need to talk to spouse", "Tried something similar before", "Not enough time", "Not sure it'll work for me"];
  let id = 0;
  for (const c of MOCK_CLOSER_SCORECARD) {
    for (let i = 0; i < c.booked; i++) {
      const showedRow = i < c.showed;
      const offerRow = showedRow && i < c.offers;
      const closedRow = offerRow && i < c.closes;
      const dayOffset = i % 12;
      rows.push({
        id: `mock-call-${id++}`,
        scheduled_for: new Date(now - dayOffset * 86400e3 - (i % 5) * 3600e3).toISOString(),
        status: closedRow ? "closed" : showedRow ? "completed" : "scheduled",
        showed: showedRow,
        offer_made: offerRow,
        closed: closedRow,
        contract_value_cents: closedRow ? 1_200_000 : 0,
        cash_collected_cents: closedRow ? Math.round(c.cash / c.closes) : 0,
        deposit_cents: offerRow && !closedRow ? 50_000 : 0,
        call_summary: null,
        recording_url: null,
        closer_name: c.name,
        lead_email: null,
        time_to_close_seconds: closedRow ? 2400 + (i % 4) * 300 : null,
        key_moment: null,
        leads: null,
      });
    }
  }
  return rows;
}

export function mockCallObjectionStats() {
  return mockObjections();
}

/** Matches closer.tsx's `scorecard` useMemo shape exactly. */
export function mockCloserScorecard() {
  return MOCK_CLOSER_SCORECARD.map(c => ({
    name: c.name,
    booked: c.booked,
    showed: c.showed,
    closes: c.closes,
    showRate: c.booked ? (c.showed / c.booked) * 100 : 0,
    closeRate: c.showed ? (c.closes / c.showed) * 100 : 0,
    offerToClose: c.offers ? (c.closes / c.offers) * 100 : 0,
    cash: c.cash,
    avgDeal: c.closes ? c.cash / c.closes : 0,
  })).sort((a, b) => b.cash - a.cash);
}

/** closer (row) x weekday (col) call-volume heatmap, for the Rep Efficiency activity grid. */
export function mockRepActivityHeatmap() {
  return {
    rows: MOCK_CLOSER_SCORECARD.map(c => c.name),
    cols: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    data: [
      [5, 6, 4, 7, 5, 2, 0],
      [4, 5, 5, 4, 6, 1, 0],
      [3, 4, 2, 3, 4, 1, 0],
      [2, 3, 3, 2, 3, 0, 0],
    ],
  };
}

export function mockObjections() {
  return [
    { objection: "Price too high", count: 14, resolved_pct: 62 },
    { objection: "Need to talk to spouse", count: 9, resolved_pct: 44 },
    { objection: "Tried something similar before", count: 7, resolved_pct: 71 },
    { objection: "Not enough time", count: 6, resolved_pct: 38 },
    { objection: "Not sure it'll work for me", count: 5, resolved_pct: 55 },
  ];
}

/**
 * Client DNA tab — a full `copy_clients` row, shaped exactly like the real table
 * (see `_authenticated.copy.tsx`'s `ClientsTab`), so the real edit form and the
 * Phase 3 positioning/parameter visualizers both render populated, not empty.
 */
export function mockClientDNA() {
  return {
    id: "mock-client-1",
    display_name: "Dev Workspace Client",
    niche: "High-ticket coaching for gym owners",
    bio: "Ex-collegiate athlete turned 7-figure gym consultant. Known for blunt, no-fluff systems talk and heavy proof-first content.",
    location: "Austin, TX",
    age: 34,
    avatar_url: null,
    instagram_handle: "@devworkspaceclient",
    instagram_followers: 84_000,
    tiktok_handle: "@devworkspaceclient",
    tiktok_followers: 41_000,
    youtube_handle: "DevWorkspaceClient",
    youtube_subscribers: 12_500,
    business_stage: "Scaling · $40K/mo",
    monthly_revenue_cents: 4_000_000,
    offer_price_cents: 500_000,
    content_pillars: "Systems over hustle, proof over promises, owner operator lifestyle",
    goals: "Hit $75K/mo, hire a second closer, cut personal call load in half",
    dream_outcome: "A fully delegated $150K/mo coaching business run 10 hrs/week",
    proof_assets: "37 client case studies, $2.1M in verified client results, Stripe dashboard screenshots",
    sacred_cows: "\"Hustle 24/7\" culture, hiding prices, fake urgency",
    competitors: "Generic fitness-business gurus with no real operating experience",
    voice_transcripts: "Mock transcript excerpt for dev bypass preview — short, blunt sentences, leads with a number, closes with a direct CTA.",
    notes: "Dev bypass mock client — safe to edit, never persisted (no real Supabase session).",
    offer_details: { promise: "Double net profit in 90 days", mechanism: "The Operator System", price: "$5,000", objections: ["I've tried other coaches", "Not sure I have time"] },
    avatar_research: { dreams: "Freedom from the gym floor", fears: "Being seen as a fraud", suspicions: "That coaching is just upsells", past_failures: "Burned $12K on a generic mastermind", enemies: "Hustle-culture influencers" },
    voice_fingerprint: { tone: "direct", sentence_length: "short", signature_moves: ["leads with a number", "names the objection before the reader does"] },
  };
}

/* ------------------------------------------------------------------ *
 * Phase 4 — AI-generation mocks for Dev Bypass. Every requireSupabaseAuth
 * -gated AI call 401s under dev bypass (no real session), so each UI call
 * site short-circuits to one of these instead of hitting the server fn.
 * Shapes are copied exactly from each real server fn's return type.
 * ------------------------------------------------------------------ */

const AI_DELAY_MS = 550;
/** Small realistic "thinking" delay so the loading state is visibly exercised, not skipped. */
export function withMockDelay<T>(value: T, ms = AI_DELAY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export function mockContentCoaching() {
  return {
    summary: "Strong hook, but the payoff lands too late — most of the drop-off happens before the proof shows up.",
    strengths: ["Pattern-interrupt opener holds attention past the 3s mark", "Concrete number in the first line builds instant credibility"],
    improvements: ["Cut the 6-second setup and open directly on the result", "Add on-screen text restating the hook at the 5s mark to recapture skimmers", "Tighten the CTA — it's currently two competing asks"],
    next_hook_ideas: ["\"I made $18K from one story sequence — here's the exact one\"", "\"Nobody tells you this about high-ticket DMs...\"", "\"3 seconds of this cost me $40K to learn\""],
  };
}

export function mockContentClassification() {
  return {
    hook: "I made $18K last week from a single story sequence.",
    angle: "proof",
    funnel_stage: "MOF",
    rationale: "Opens on a specific, verifiable result (proof angle) and teaches the mechanism mid-video, positioning it as consideration-stage content.",
  };
}

export function mockContentSystemInsight(demand: ReturnType<typeof mockContentDemand>) {
  return {
    insight: `[MOCK — Dev Bypass, no live AI key]

## Root cause chain
Cash is inconsistent because posting is inconsistent, and posting is inconsistent because performance isn't tracked closely enough to know what to repeat. Connect a real LOVABLE_API_KEY to get a live read.

## Recommended mix this week
| Mechanism | % of posts | Reels | Why |
|---|---|---|---|
| Educational | 35% | 2 | Highest FAQ-click volume this window |
| Credibility | 30% | 2 | Case studies converting best to booked calls |
| Authoritative | 15% | 1 | Underused relative to demand |
| Relatability | 20% | 1 | Steady DM driver |

## Double down (green)
- "The $50K Month Breakdown" — 84K views, 61% retention, $12.4K attributed cash
- Case-study format converting to calls at 2x the account average

## Bottlenecks (red)
- Authoritative content underposted relative to demand signal — add 1 more this week
- Hook retention below 40% on 2 of the last 5 posts — open on the result, not the setup

## Missing tracking
Setter-call objection logging is thin this window — log more to sharpen the demand signal.

## This week's 5-7 reels
1. Educational — value reveal — "the exact system" — pre-handles "I've tried this before"
2. Educational — problem/solution — narrow niche pain — pre-handles "not sure it'll work for me"
3. Credibility — case study — replicable proof — pre-handles "does this actually work"
4. Credibility — testimonial — client screen recording — pre-handles "is this real"
5. Authoritative — industry leader POV — pre-handles "why you over a competitor"`,
    demand,
  };
}

export function mockGeneratedCopy(copyType: string) {
  return { output: `[MOCK — Dev Bypass, no live AI key] Generated ${copyType.replace(/_/g, " ")}.

HOOK: You don't have a traffic problem. You have a "nobody trusts me yet" problem.

BODY: Most people chasing more leads are actually one trust signal away from the calls they already have converting. Here's the exact system that fixed this for a client in 14 days — no extra spend, no new content style, just closing the trust gap between the DM and the deposit.

WHY THIS WORKS:
- Opens on a reframe that pattern-interrupts the reader's assumption
- Names the real bottleneck (trust, not volume) before offering the fix
- Ends on a low-friction, curiosity-driven CTA

Connect a real LOVABLE_API_KEY to replace this with a live generation.` };
}

export function mockCopyReview() {
  return {
    score: 78,
    big_domino: "The reader has to believe their bottleneck is trust, not traffic — everything else follows from that one belief.",
    strengths: ["Hook pattern-interrupts the reader's default assumption", "Proof is specific (14 days, named mechanism) not vague"],
    weaknesses: ["CTA is soft — doesn't name the next concrete step", "Middle section restates the hook instead of building on it"],
    line_edits: [
      { line: "You don't have a traffic problem.", fix: "Keep — strong reframe opener, don't touch it." },
      { line: "Here's the exact system that fixed this", fix: "Name the system or give it a label — \"exact system\" is doing no work on its own." },
    ],
    rewrite_suggestion: "[MOCK] Tighten the CTA to a single, named next step (e.g. \"DM me SYSTEM\") and cut the restated middle paragraph.",
  };
}

export function mockAngles() {
  return {
    angles: [
      { trigger: "fears", hook: "What if the reason you're not closing has nothing to do with your offer?", big_domino: "The prospect fears the problem is unfixable, not that the price is too high." },
      { trigger: "past_failures", hook: "I burned $12K on a mastermind that taught me nothing. Here's what actually worked.", big_domino: "Positions this offer as different from every past disappointment." },
      { trigger: "dreams", hook: "This is what a fully delegated $150K/mo coaching business actually looks like week to week.", big_domino: "Makes the dream outcome feel concrete and reachable, not theoretical." },
      { trigger: "enemies", hook: "Generic business coaches will never tell you this.", big_domino: "Names a shared enemy, building in-group trust before the pitch." },
    ],
  };
}

export function mockVoiceFingerprint() {
  return {
    avg_sentence_length: "short (8-14 words)",
    opening_patterns: ["Leads with a specific number", "Opens on a reframe or contrarian statement"],
    transition_phrases: ["Here's the thing —", "Which means —", "So here's what actually happened"],
    overused_words: ["literally", "exact", "system"],
    never_uses: ["corporate jargon", "hedging language (\"maybe\", \"kind of\")"],
    emotional_temperature: "direct and high-energy, never apologetic",
    common_analogies: ["gym/training metaphors", "operator vs. hustler framing"],
    closing_patterns: ["Ends on a single named next step", "Closes with a blunt one-liner, not a recap"],
  };
}

export function mockDailyWinsInsight() {
  return {
    insight: `## Momentum snapshot
[MOCK — Dev Bypass] Energy and consistency are trending up this window, with wins compounding week over week rather than stalling.

## Double down (green)
- Students logging financial wins are also the ones hitting their stated needle-mover 4+ days in a row — the accountability loop is working.
- Morning check-ins correlate with higher energy scores across the cohort.

## Bottlenecks (red)
- 3 students have repeated the same blocker for 3+ consecutive days without escalation.
- Energy scores under 5 cluster on Mondays — worth a lighter Monday check-in format.

## Save-call radar
Sam R. — blocker "no time to post" repeated 4 days running. Open the call with: "What's actually eating the time you'd spend posting?"`,
  };
}

export function mockLoomGrade() {
  return {
    score: 7.8, recommendedStage: "interview_worthy",
    summary: "[MOCK] Clear speech, solid energy, cites specific past results. Some rambling in the middle third — trim for a follow-up.",
    reasoning: "Clarity high | energy high | specificity of results high | minor rambling mid-video",
    stated_role: "closer" as string | null,
  };
}

export function mockCalendarStatus() {
  return { ok: true, error: null as string | null };
}

export function mockFaqVideos() {
  return [
    { id: "mock-faq-1", title: "\"Is this a scam?\"", question: "How do I know this actually works and isn't a scam?", video_url: "https://example.com/faq/trust", wistia_video_id: null, mechanism: "credibility", clicks: 340, plays: 288, avg_watch_pct: 71, active: true, notes: null },
    { id: "mock-faq-2", title: "\"How is this different?\"", question: "What makes this different from every other coach?", video_url: "https://example.com/faq/different", wistia_video_id: null, mechanism: "authoritative", clicks: 210, plays: 165, avg_watch_pct: 58, active: true, notes: null },
    { id: "mock-faq-3", title: "\"Will this work for me?\"", question: "I'm not like your other clients — will this actually work for my situation?", video_url: "https://example.com/faq/relatable", wistia_video_id: null, mechanism: "relatability", clicks: 175, plays: 140, avg_watch_pct: 64, active: true, notes: null },
    { id: "mock-faq-4", title: "\"What's the actual process?\"", question: "What does the day-to-day process actually look like?", video_url: "https://example.com/faq/process", wistia_video_id: null, mechanism: "educational", clicks: 96, plays: 80, avg_watch_pct: 52, active: true, notes: null },
  ];
}

export function mockPreCloseSummary() {
  return {
    summary: "[MOCK — Dev Bypass] The conversation started from a story-sequence DM after the prospect saw a case study post. Their stated pain was inconsistent lead flow despite posting daily. The main objection was price relative to a past bad experience with a generic coach, which the setter pre-handled by naming the difference up front. Intent shifted noticeably after a proof screenshot was shared mid-conversation. They committed after the call once the payment plan option was offered.",
    raw: { call_count: 2, message_count: 14, generated_at: new Date(0).toISOString() },
  };
}

export function mockLeadInsights() {
  return {
    bottlenecks: [
      { title: "Follow-up gap on warm leads", body: "[MOCK] Several leads go 3+ days without a follow-up after the first qualifying DM.", recommendation: "Set a 24h follow-up SLA for qualified leads." },
      { title: "Pre-call video watch rate is low", body: "[MOCK] Under half of booked leads watch the pre-call video before their call.", recommendation: "Send the video link a second time 2 hours before the call." },
    ],
    double_down: [
      { title: "Diamond-tagged leads close at 2x rate", body: "[MOCK] Leads flagged diamond priority convert noticeably better than average.", recommendation: "Tighten the diamond-tagging criteria and route them to your top closer." },
    ],
    priority_leads: [
      { name: "Jordan Ellis", reason: "[MOCK] High intent score + watched pre-call video + diamond priority" },
      { name: "Casey Nguyen", reason: "[MOCK] Re-engaged after 5 days silent, asked about pricing directly" },
    ],
    sampleSize: 12,
  };
}

export function mockVslInsights() {
  return {
    headline: "[MOCK] Strong opening retention, but a sharp drop-off right before the offer reveal.",
    bottlenecks: [
      { title: "Drop-off before the price reveal", body: "Roughly a third of viewers exit in the 60 seconds before price is shown.", recommendation: "Move a proof stack earlier to sustain intent through the price reveal." },
    ],
    double_down: [
      { title: "Hook retention above account average", body: "First 15 seconds hold significantly better than your other VSLs.", recommendation: "Reuse this exact opening structure on the next VSL." },
    ],
    drop_off_moments: [
      { timestamp: "2:14", why: "Transition into mechanism explanation runs long without a pattern interrupt." },
    ],
    snapshotCount: 4,
  };
}

export function mockTranscriptLines() {
  return [
    { t: 0, text: "[MOCK transcript — Dev Bypass, no live AI key]" },
    { t: 4, text: "This is a placeholder transcript line so the UI has something to render." },
    { t: 9, text: "Connect a real LOVABLE_API_KEY to transcribe real audio." },
  ];
}

export function mockGlobalAiInsights() {
  return {
    bottlenecks: [
      { title: "Show rate below target", body: "[MOCK] Show rate is running under 70% this window, capping how much of your booked pipeline ever gets seen.", module: "closer", recommendation: "Add a day-before + hour-before reminder sequence.", confidence: 0.8 },
      { title: "Hook retention trending down", body: "[MOCK] Average hook retention has slipped over the last two weeks.", module: "content", recommendation: "Audit the last 5 posts' first 3 seconds against your top performer.", confidence: 0.7 },
    ],
    double_down: [
      { title: "Top closer carrying a disproportionate share", body: "[MOCK] One closer accounts for the majority of cash collected this window.", module: "closer", recommendation: "Have your top closer record their call openers for the rest of the team.", confidence: 0.75 },
    ],
  };
}

export function mockIntakeInsights() {
  return {
    bottlenecks: [
      { title: "Price hesitation shows up repeatedly", body: "[MOCK] Multiple intakes mention weighing the price against past bad experiences.", recommendation: "Add a payment-plan callout earlier in the sales sequence." },
    ],
    double_down: [
      { title: "Proof content is the top-cited reason for joining", body: "[MOCK] Case-study style content is the most-mentioned first touchpoint across intakes.", recommendation: "Increase case-study post frequency." },
    ],
    sampleSize: 9,
  };
}

/** One placeholder body per slide, matching the requested count exactly — for story-sequence AI generation. */
export function mockStorySequenceSlides(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `[MOCK — Dev Bypass] Slide ${i + 1} body copy would appear here. Connect a real LOVABLE_API_KEY to generate this slide for real.`);
}

/** Matches clients.tsx's ClientRow shape — populates the roster so its pre-close-summary AI action is reachable under Dev Bypass. */
export function mockClients() {
  const now = Date.now();
  return [
    {
      id: "mock-client-1", full_name: "Jordan Ellis", email: "jordan.ellis@example.com", phone: null,
      offer_name: "Operator System", start_date: new Date(now - 40 * 86400e3).toISOString().slice(0, 10),
      contract_value_cents: 500_000, invested_to_date_cents: 250_000,
      expected_next_payment_cents: 125_000, expected_next_payment_date: new Date(now + 14 * 86400e3).toISOString().slice(0, 10),
      payment_plan: true, installments_remaining: 2, installment_amount_cents: 125_000,
      status: "active", health_score: 82,
      renewal_date: new Date(now + 21 * 86400e3).toISOString().slice(0, 10), renewal_conv_started: false, renewal_stage: "not_started",
      notes: null, pre_close_summary: null,
    },
    {
      id: "mock-client-2", full_name: "Casey Nguyen", email: "casey.nguyen@example.com", phone: null,
      offer_name: "Operator System", start_date: new Date(now - 120 * 86400e3).toISOString().slice(0, 10),
      contract_value_cents: 500_000, invested_to_date_cents: 500_000,
      expected_next_payment_cents: 0, expected_next_payment_date: null,
      payment_plan: false, installments_remaining: 0, installment_amount_cents: 0,
      status: "active", health_score: 91,
      renewal_date: new Date(now + 9 * 86400e3).toISOString().slice(0, 10), renewal_conv_started: true, renewal_stage: "conversation",
      notes: null, pre_close_summary: "Strong fit from the start — converted off a case-study post, minimal objections.",
    },
    {
      id: "mock-client-3", full_name: "Morgan Blake", email: "morgan.blake@example.com", phone: null,
      offer_name: "Starter Track", start_date: new Date(now - 260 * 86400e3).toISOString().slice(0, 10),
      contract_value_cents: 250_000, invested_to_date_cents: 250_000,
      expected_next_payment_cents: 0, expected_next_payment_date: null,
      payment_plan: false, installments_remaining: 0, installment_amount_cents: 0,
      status: "at_risk", health_score: 38,
      renewal_date: new Date(now - 5 * 86400e3).toISOString().slice(0, 10), renewal_conv_started: false, renewal_stage: "not_started",
      notes: "Low engagement last 3 weeks.", pre_close_summary: null,
    },
  ];
}

/** kind matches vsl.tsx's VslKind union: "main" | "webinar" | "post_booking". */
export function mockVsls() {
  return [
    { id: "mock-vsl-1", name: "Main Offer VSL", wistia_video_id: "mockwistia1", sheet_url: null, kind: "main", transcript_json: null, script: "[MOCK] Opening hook... mechanism reveal... proof stack... offer... close." },
    { id: "mock-vsl-2", name: "Webinar Replay", wistia_video_id: "mockwistia2", sheet_url: null, kind: "webinar", transcript_json: null, script: null },
  ];
}

export function mockVslSnapshots(vslId: string) {
  const now = Date.now();
  return Array.from({ length: 6 }, (_, i) => ({
    id: `mock-snap-${vslId}-${i}`,
    vsl_id: vslId,
    captured_at: new Date(now - (5 - i) * 86400e3).toISOString(),
    total_plays: 800 + i * 120,
    unique_viewers: 600 + i * 90,
    play_rate: 42 + i * 1.5,
    avg_percent_watched: 38 + i * 2,
    page_loads: 1400 + i * 150,
    engagement_json: null,
  }));
}

/** Matches the `ai_insights` table row shape rendered by insights.tsx. */
export function mockAiInsightRows() {
  const g = mockGlobalAiInsights();
  const now = new Date().toISOString();
  const rows = (arr: typeof g.bottlenecks, kind: "bottleneck" | "double_down") =>
    arr.map((i, idx) => ({
      id: `mock-insight-${kind}-${idx}`, org_id: DEV_BYPASS_ORG_ID, created_at: now,
      module: `${kind}:${i.module}`, title: i.title, body: i.body,
      recommendation: i.recommendation, confidence: i.confidence,
      source_refs: null, generated_by: "mock", dismissed: false, saved: false,
    }));
  return [...rows(g.bottlenecks, "bottleneck"), ...rows(g.double_down, "double_down")];
}
