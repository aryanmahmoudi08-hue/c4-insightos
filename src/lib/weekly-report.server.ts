import { clientAtRiskReason } from "@/lib/client-risk";
import {
  deriveCap,
  deriveWorking,
  type FunnelStage,
  type Derivation,
} from "@/lib/funnel-derivation";
import { pctDelta, priorPeriod } from "@/lib/trend";
import {
  computeDemand,
  computeWeeklyContentCheck,
  type DemandResult,
  type WeeklyCheck,
} from "@/lib/content-signals.server";
import { fetchWorkspaceSettings, type WorkspaceSettings } from "@/lib/workspace-settings.functions";
import { collectFxPairs, sumNormalizedCents, type HistoricalFxRateMap } from "@/lib/currency";
import { getHistoricalFxRate } from "@/lib/fx.server";

type Sb = { from: (t: string) => any };

/** Throws on a failed query instead of silently rendering "no data" — same
 * discipline as content-signals.server.ts's unwrap(). A weekly report that
 * quietly shows zeros because a query failed is worse than no report. */
function unwrap<T>(
  result: { data: T | null; error: { message: string } | null },
  label: string,
): T {
  if (result.error) throw new Error(`${label} query failed: ${result.error.message}`);
  return (result.data ?? []) as T;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export type RepRow = { name: string; sets: number; closes: number; cashCents: number };

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  cash: { curr: number; prev: number; deltaPct?: number };
  calls: {
    booked: number;
    showed: number;
    closes: number;
    /** Null when the week had no denominator for the rate. */
    showRate: number | null;
    closeRate: number | null;
  };
  newLeads: number;
  repPerformance: { closers: RepRow[]; setters: RepRow[] };
  /** Deterministic arithmetic, same functions the rep dashboards' click-to-
   * explain panels use — never a second, divergent formula for "what's
   * capping growth." */
  funnelHealth: { cap: Derivation; working: Derivation };
  /** Reused directly from content-signals.server.ts — the exact same
   * recommended-mix computation Content Command Center's Content Signals
   * section shows, not a re-derived version. */
  contentMix: DemandResult;
  weeklyContentCheck: WeeklyCheck;
  clientHealth: { atRiskCount: number; renewalStageBreakdown: Record<string, number> };
  hiringPipeline: { stageBreakdown: Record<string, number>; newApplicantsThisWeek: number };
  trends: string[];
};

/** Every distinct non-USD (currency, date) pair across both sources, fetched once and reused for
 * every USD-cents field normalized below (cash + revenue/contract on both calls and
 * setter_activity) — one FX round-trip per window, not one per field. */
async function fetchFxRatesForWindow(
  calls: { original_currency?: string | null; scheduled_for?: string | null }[],
  setters: { original_currency?: string | null; activity_date?: string | null }[],
): Promise<HistoricalFxRateMap> {
  const dedupe = new Map<string, { currency: string; date: string }>();
  for (const p of [
    ...collectFxPairs(
      calls,
      (c) => c.original_currency,
      (c) => c.scheduled_for?.slice(0, 10),
    ),
    ...collectFxPairs(
      setters,
      (r) => r.original_currency,
      (r) => r.activity_date,
    ),
  ]) {
    dedupe.set(`${p.currency}|${p.date}`, p);
  }
  const pairs = Array.from(dedupe.values());
  if (pairs.length === 0) return {};
  const entries = await Promise.all(
    pairs.map(async (p) => {
      const info = await getHistoricalFxRate(p.currency, p.date);
      return [`${p.currency}|${p.date}`, info] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function fetchCoreWindow(sb: Sb, orgId: string, from: string, to: string) {
  const fromISO = `${from}T00:00:00`;
  const toISO = `${to}T23:59:59`;
  const [pays, leads, calls, setters] = await Promise.all([
    sb
      .from("payments")
      .select("amount_cents")
      .eq("org_id", orgId)
      .gte("collected_at", fromISO)
      .lte("collected_at", toISO),
    sb
      .from("leads")
      .select("id")
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    sb
      .from("calls")
      .select(
        "showed, closed, closer_name, cash_collected_cents, contract_value_cents, original_currency, scheduled_for",
      )
      .eq("org_id", orgId)
      .gte("created_at", fromISO)
      .lte("created_at", toISO),
    sb
      .from("setter_activity")
      .select(
        "team_member_name, calls_on_calendar, live_calls, sets, closes, cash_collected_cents, total_revenue_cents, original_currency, activity_date",
      )
      .eq("org_id", orgId)
      .gte("activity_date", from)
      .lte("activity_date", to),
  ]);
  const payList = unwrap<{ amount_cents: number | null }[]>(pays, "Payments");
  const leadList = unwrap<{ id: string }[]>(leads, "Leads");
  const callList = unwrap<
    {
      showed: boolean;
      closed: boolean;
      closer_name: string | null;
      cash_collected_cents: number | null;
      contract_value_cents: number | null;
      original_currency: string | null;
      scheduled_for: string | null;
    }[]
  >(calls, "Calls");
  const setterList = unwrap<
    {
      team_member_name: string | null;
      calls_on_calendar: number | null;
      live_calls: number | null;
      sets: number | null;
      closes: number | null;
      cash_collected_cents: number | null;
      total_revenue_cents: number | null;
      original_currency: string | null;
      activity_date: string | null;
    }[]
  >(setters, "Setter activity");

  // Remediation (metric-dictionary audit, carried into the Weekly Report final
  // pass): calls/setter_activity money columns store whatever amount was
  // typed in, tagged with a real original_currency but never converted (see
  // 20260912090000_eod_original_currency.sql) — unlike payments, which
  // normalizes at capture time. Summing raw cents across mixed-currency rows
  // silently treats e.g. 500 CAD as 500 USD, exactly the bug already fixed on
  // the Closer/DM Setter/Inbound Dialer dashboards (_authenticated.closer.tsx)
  // — reusing that same real fix here rather than leaving the org's weekly
  // digest as the one place it was missed.
  const fxRates = await fetchFxRatesForWindow(callList, setterList);
  const callCashSum = sumNormalizedCents(
    callList,
    (c) => c.cash_collected_cents,
    (c) => c.original_currency,
    (c) => c.scheduled_for?.slice(0, 10),
    fxRates,
  );
  const setCashSum = sumNormalizedCents(
    setterList,
    (a) => a.cash_collected_cents,
    (a) => a.original_currency,
    (a) => a.activity_date,
    fxRates,
  );
  const fxIncomplete = !callCashSum.isComplete || !setCashSum.isComplete;

  const cashPay = payList.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const cashCall = callCashSum.usdCents;
  const cashSet = setCashSum.usdCents;
  const cash = Math.max(cashPay, cashCall + cashSet);
  const booked = Math.max(
    callList.length,
    setterList.reduce((s, a) => s + (a.calls_on_calendar ?? 0), 0),
  );
  const showed = Math.max(
    callList.filter((c) => c.showed).length,
    setterList.reduce((s, a) => s + (a.live_calls ?? 0), 0),
  );
  const closes = Math.max(
    callList.filter((c) => c.closed).length,
    setterList.reduce((s, a) => s + (a.closes ?? 0), 0),
  );

  // Per-rep breakdown needs the same USD normalization as the headline totals
  // above — a rep whose rows mix currencies would otherwise show an inflated/
  // deflated leaderboard number even though the org-wide total is correct.
  const usdCentsFor = (cents: number | null, currency: string | null, date: string | null) => {
    const c = cents ?? 0;
    if (!c) return 0;
    const cur = (currency || "USD").toUpperCase();
    if (cur === "USD") return c;
    const info = date ? fxRates[`${cur}|${date}`] : null;
    if (info && Number.isFinite(info.rate) && info.rate > 0) return Math.round(c / info.rate);
    return 0; // excluded, same as sumNormalizedCents' excludedCents — never guessed as USD
  };

  const closerMap = new Map<string, RepRow>();
  for (const c of callList) {
    if (!c.closer_name) continue;
    const row = closerMap.get(c.closer_name) ?? {
      name: c.closer_name,
      sets: 0,
      closes: 0,
      cashCents: 0,
    };
    if (c.closed) row.closes += 1;
    row.cashCents += usdCentsFor(
      c.cash_collected_cents,
      c.original_currency,
      c.scheduled_for?.slice(0, 10) ?? null,
    );
    closerMap.set(c.closer_name, row);
  }
  const setterMap = new Map<string, RepRow>();
  for (const a of setterList) {
    if (!a.team_member_name) continue;
    const row = setterMap.get(a.team_member_name) ?? {
      name: a.team_member_name,
      sets: 0,
      closes: 0,
      cashCents: 0,
    };
    row.sets += a.sets ?? 0;
    row.closes += a.closes ?? 0;
    row.cashCents += usdCentsFor(a.cash_collected_cents, a.original_currency, a.activity_date);
    setterMap.set(a.team_member_name, row);
  }

  return {
    cash,
    fxIncomplete,
    newLeads: leadList.length,
    booked,
    showed,
    closes,
    closers: Array.from(closerMap.values()).sort((a, b) => b.cashCents - a.cashCents),
    setters: Array.from(setterMap.values()).sort((a, b) => b.cashCents - a.cashCents),
  };
}

const RENEWAL_STAGES = [
  "not_started",
  "conversation_started",
  "offer_sent",
  "renewed",
  "lost",
] as const;
const HIRING_STAGES = [
  "applied",
  "needs_grading",
  "interview_worthy",
  "trial_call",
  "offer_sent",
  "hired",
  "rejected",
] as const;

export async function buildWeeklyReport(
  sb: Sb,
  orgId: string,
  settings: WorkspaceSettings,
): Promise<WeeklyReport> {
  const now = new Date();
  const weekEnd = isoDate(now);
  const weekStart = isoDate(new Date(now.getTime() - 7 * 86400e3));
  const prior = priorPeriod(weekStart, weekEnd);

  const [curr, prev, atRiskClients, applicants, demand, weeklyCheck] = await Promise.all([
    fetchCoreWindow(sb, orgId, weekStart, weekEnd),
    fetchCoreWindow(sb, orgId, prior.from, prior.to),
    sb
      .from("clients")
      .select("id, renewal_date, renewal_conv_started, renewal_stage, status")
      .eq("org_id", orgId)
      .eq("status", "active"),
    // `hiring_applicants`, not `applicants` — the latter has never existed in
    // any migration. This threw "Could not find the table 'public.applicants'"
    // and, because the query sits inside the same Promise.all as everything
    // else, took the entire weekly report down with it rather than degrading
    // the hiring section alone. The Hiring page has always used the real name
    // (_authenticated.hiring.tsx:289).
    sb.from("hiring_applicants").select("id, stage, applied_at").eq("org_id", orgId),
    computeDemand(sb, orgId, { from: weekStart, to: weekEnd }, settings.content_engine),
    computeWeeklyContentCheck(sb, orgId, settings.content_engine),
  ]);

  const clientRows = unwrap<
    {
      id: string;
      renewal_date: string | null;
      renewal_conv_started: boolean | null;
      renewal_stage: string | null;
      status: string;
    }[]
  >(atRiskClients, "Clients");
  const applicantRows = unwrap<{ id: string; stage: string; applied_at: string }[]>(
    applicants,
    "Applicants",
  );

  const atRiskCount = clientRows.filter(
    (c) => clientAtRiskReason(c, settings.clients.renewalAtRiskDays, now) !== null,
  ).length;
  const renewalStageBreakdown: Record<string, number> = Object.fromEntries(
    RENEWAL_STAGES.map((s) => [s, 0]),
  );
  for (const c of clientRows) {
    const stage = (c.renewal_stage ?? "not_started") as (typeof RENEWAL_STAGES)[number];
    renewalStageBreakdown[stage] = (renewalStageBreakdown[stage] ?? 0) + 1;
  }

  const hiringStageBreakdown: Record<string, number> = Object.fromEntries(
    HIRING_STAGES.map((s) => [s, 0]),
  );
  for (const a of applicantRows)
    hiringStageBreakdown[a.stage] = (hiringStageBreakdown[a.stage] ?? 0) + 1;
  const newApplicantsThisWeek = applicantRows.filter(
    (a) => a.applied_at >= `${weekStart}T00:00:00` && a.applied_at <= `${weekEnd}T23:59:59`,
  ).length;

  const currStages: FunnelStage[] = [
    { key: "booked", label: "Calls on Calendar", value: curr.booked, spectrum: "mid" },
    { key: "showed", label: "Showed", value: curr.showed, spectrum: "mid" },
    { key: "closes", label: "Closes", value: curr.closes, spectrum: "hot" },
  ];
  const prevStages: FunnelStage[] = [
    { key: "booked", label: "Calls on Calendar", value: prev.booked, spectrum: "mid" },
    { key: "showed", label: "Showed", value: prev.showed, spectrum: "mid" },
    { key: "closes", label: "Closes", value: prev.closes, spectrum: "hot" },
  ];
  const minCapSample = settings.funnel_instrument.minCapSample;
  const funnelHealth = {
    cap: deriveCap(currStages, 2, minCapSample),
    working: deriveWorking(currStages, prevStages, minCapSample),
  };

  const cashDeltaPct = pctDelta(curr.cash, prev.cash);
  // Null, not 0, with no denominator — the report is read by people, and
  // "0% showed" for a week with no booked calls reads as a collapse rather
  // than an empty week. The show-rate alert below is already gated on
  // `curr.booked > 5`, so it is unaffected.
  const showRate = curr.booked > 0 ? (curr.showed / curr.booked) * 100 : null;
  const closeRate = curr.showed > 0 ? (curr.closes / curr.showed) * 100 : null;

  const trends: string[] = [];
  if (cashDeltaPct !== undefined && cashDeltaPct < -10)
    trends.push(`Cash down ${Math.abs(cashDeltaPct).toFixed(0)}% WoW`);
  if (cashDeltaPct !== undefined && cashDeltaPct > 10)
    trends.push(`Cash up ${cashDeltaPct.toFixed(0)}% WoW`);
  const showRateThreshold = settings.alerts.showRateAlertPct;
  // `curr.booked > 5` already implies a non-null showRate; stated explicitly
  // so the guard survives any future change to how the rate is derived.
  if (showRate !== null && curr.booked > 5 && showRate < showRateThreshold)
    trends.push(
      `Show rate slipped to ${showRate.toFixed(0)}% (below your ${showRateThreshold}% threshold)`,
    );
  if (atRiskCount > 0)
    trends.push(`${atRiskCount} active client${atRiskCount === 1 ? "" : "s"} flagged at risk`);
  if (demand.insufficientData)
    trends.push(
      "Content demand signal is thin this week — log more FAQ clicks, setter calls, or intakes to sharpen the mix",
    );
  if (weeklyCheck.missing.length > 0)
    trends.push(
      `${weeklyCheck.missing.length} content mechanism${weeklyCheck.missing.length === 1 ? "" : "s"} not posted this week`,
    );
  // Same disclosure convention as the Closer/DM Setter/Inbound Dialer
  // dashboards' "· FX incomplete" tag — a row whose currency/date had no
  // resolvable historical rate is excluded from the cash totals above,
  // never silently treated as USD or zero. Surface that honestly rather
  // than let the digest imply full coverage it doesn't have.
  if (curr.fxIncomplete || prev.fxIncomplete)
    trends.push(
      "Some non-USD cash/revenue rows couldn't be converted for this window — totals exclude them rather than guessing (FX incomplete)",
    );

  return {
    weekStart,
    weekEnd,
    cash: { curr: curr.cash, prev: prev.cash, deltaPct: cashDeltaPct },
    calls: { booked: curr.booked, showed: curr.showed, closes: curr.closes, showRate, closeRate },
    newLeads: curr.newLeads,
    repPerformance: { closers: curr.closers, setters: curr.setters },
    funnelHealth,
    contentMix: demand,
    weeklyContentCheck: weeklyCheck,
    clientHealth: { atRiskCount, renewalStageBreakdown },
    hiringPipeline: { stageBreakdown: hiringStageBreakdown, newApplicantsThisWeek },
    trends,
  };
}

export async function sendWeeklyReportToDiscord(sb: Sb, orgId: string, report: WeeklyReport) {
  const { dispatchEvent } = await import("@/lib/dispatch.server");
  // "digest.weekly" (not "report.weekly") — matches the event type + category
  // webhook-channels.tsx's "Weekly digest" category already anticipated
  // (CATEGORIES: {v:"digest", label:"Weekly digest"}), which nothing
  // previously dispatched under. Renamed to close that gap rather than
  // adding a second, competing naming convention for the same concept.
  await dispatchEvent(orgId, "digest.weekly", {
    ...report,
    category: "digest",
  } as unknown as Record<string, unknown>);
}

export { fetchWorkspaceSettings };
