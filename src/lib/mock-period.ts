/**
 * Range-scaling for the demo/mock dashboard figures.
 *
 * The mock period totals are written once, for a 30-day window. Handing that
 * same object back for every range meant the date chips did nothing: Today,
 * 30d and All time all showed $42,500 / 46 leads / 8 closes, so the control
 * looked broken even though it was changing the range correctly.
 *
 * Everything here is deterministic — the same range always produces the same
 * numbers, so a demo doesn't reshuffle under the viewer as they click around,
 * and a screenshot taken twice matches.
 *
 * This scales FIXTURES for demo mode. It is not a model of anything and must
 * never be pointed at a real metric.
 */

export type MockPeriod = {
  cash: number;
  paymentsCash: number;
  callsCash: number;
  setterCash: number;
  newLeads: number;
  totalCalls: number;
  showed: number;
  offers: number;
  closed: number;
  contractValue: number;
  views: number;
  contentLeads: number;
};

/** The window the mock totals are authored for. */
export const MOCK_BASELINE_DAYS = 30;

/** "All time" reaches back to 2000, and scaling a month's cash by 26 years of
 *  days produces a number no one reads as a demo. Long ranges flatten here. */
export const MOCK_MAX_DAYS = 365;

/** Inclusive day count for a YYYY-MM-DD range, clamped to something sane. */
export function rangeDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return MOCK_BASELINE_DAYS;
  const days = Math.round((b - a) / 86_400_000) + 1;
  return Math.min(MOCK_MAX_DAYS, Math.max(1, days));
}

/** Stable 32-bit hash, so a given range always seeds the same wobble. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) || 1;
}

function sequence(seed: number): () => number {
  let s = seed % 233280;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/**
 * Scale a baseline period to a range.
 *
 * The funnel is scaled through its own ratios rather than field by field.
 * Wobbling each count independently lets `showed` land above `totalCalls`,
 * which makes a show rate over 100% — the kind of impossible figure that
 * makes a demo look broken rather than lively.
 */
export function scaleMockPeriod(base: MockPeriod, from: string, to: string): MockPeriod {
  const days = rangeDays(from, to);
  const factor = days / MOCK_BASELINE_DAYS;
  const rand = sequence(seedFrom(`${from}:${to}`));
  // +/-12%, so the numbers don't read as one figure divided by a round number.
  const wobble = () => 0.88 + rand() * 0.24;

  const showRate = base.totalCalls > 0 ? base.showed / base.totalCalls : 0;
  const offerRate = base.showed > 0 ? base.offers / base.showed : 0;
  const closeRate = base.offers > 0 ? base.closed / base.offers : 0;

  const totalCalls = Math.max(0, Math.round(base.totalCalls * factor * wobble()));
  const showed = Math.round(totalCalls * showRate);
  const offers = Math.round(showed * offerRate);
  const closed = Math.round(offers * closeRate);

  const cash = Math.max(0, Math.round(base.cash * factor * wobble()));
  // The three cash sources are a split OF `cash`, so they are apportioned
  // from it rather than scaled on their own — otherwise the parts stop
  // summing to the whole and the Payments breakdown contradicts the headline.
  const splitTotal = base.paymentsCash + base.callsCash + base.setterCash || 1;
  const paymentsCash = Math.round((cash * base.paymentsCash) / splitTotal);
  const callsCash = Math.round((cash * base.callsCash) / splitTotal);

  return {
    cash,
    paymentsCash,
    callsCash,
    setterCash: cash - paymentsCash - callsCash,
    newLeads: Math.max(0, Math.round(base.newLeads * factor * wobble())),
    totalCalls,
    showed,
    offers,
    closed,
    contractValue: Math.max(0, Math.round(base.contractValue * factor * wobble())),
    views: Math.max(0, Math.round(base.views * factor * wobble())),
    contentLeads: Math.max(0, Math.round(base.contentLeads * factor * wobble())),
  };
}
