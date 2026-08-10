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
  weights: Record<MechanismKey, number>;
  drivers: { source: string; detail: string; mechanism: MechanismKey; weight: number }[];
  counts: { faq: number; setter_calls: number; intakes: number; reels: number };
} {
  return {
    mix: { educational: 35, credibility: 30, authoritative: 15, relatability: 20 },
    weights: { educational: 42, credibility: 36, authoritative: 18, relatability: 24 },
    drivers: [
      { source: "FAQ clicks", detail: "\"Does this actually work?\" · 38 clicks", mechanism: "credibility", weight: 76 },
      { source: "Setting call", detail: "Jordan Blake · 2026-08-04 · \"I've tried this before\"", mechanism: "educational", weight: 12 },
      { source: "Onboarding intake", detail: "Decision moment: \"saw the exact system breakdown\"", mechanism: "educational", weight: 9 },
    ],
    counts: { faq: 6, setter_calls: 14, intakes: 9, reels: 21 },
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
