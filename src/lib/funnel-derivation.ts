import type { SpectrumPosition } from "@/lib/spectrum";

/**
 * Deterministic "what's capping it" / "what's working" derivations for a
 * FunnelInstrument's detail panel. No AI call anywhere in this module —
 * every sentence is a string template over real arithmetic on real rows,
 * gated by sample size the same way content-performance.ts's
 * classifyPerformance() gates on sampleSize < minSample. When the gate
 * isn't met, callers get an explicit "not enough data" sentence, never a
 * plausible-sounding guess.
 */

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  spectrum: SpectrumPosition;
}

export interface Derivation {
  status: "ok" | "insufficient_data";
  sentence: string;
}

/**
 * "What's capping it" for stage `index` in `stages`. Needs two stages before
 * it (P = immediate predecessor, PP = the one before that): the drop-off
 * feeding into P (`lost = PP.value - P.value`) times N's own conversion rate
 * from P (`rate = N.value / P.value`) estimates the upside — framed
 * explicitly as an upper bound ("up to ≈X, if they'd converted at Y"), never
 * a bare forecast, since it assumes the lost population converts at the same
 * rate as the population that already made it through P (usually optimistic
 * — the reason they dropped is itself a lower-intent signal).
 */
export function deriveCap(stages: FunnelStage[], index: number, minSample: number): Derivation {
  const N = stages[index];
  if (!N) return { status: "insufficient_data", sentence: "Not enough data to identify a constraint yet." };
  if (index < 2) {
    return {
      status: "insufficient_data",
      sentence: `Not enough upstream funnel stages to identify a constraint for ${N.label.toLowerCase()} yet.`,
    };
  }
  const P = stages[index - 1];
  const PP = stages[index - 2];
  if (PP.value < minSample) {
    return {
      status: "insufficient_data",
      sentence: `Not enough data to identify a constraint yet — log ${Math.max(1, minSample - PP.value)} more ${PP.label.toLowerCase()} to unlock this.`,
    };
  }
  const lost = Math.max(0, PP.value - P.value);
  const rate = P.value > 0 ? N.value / P.value : 0;
  const estimate = lost * rate;
  const ratePct = rate * 100;
  const sentence = lost === 0
    ? `${N.label} aren't currently capped by ${P.label.toLowerCase()} — every ${PP.label.toLowerCase()} made it through to ${P.label.toLowerCase()} this period.`
    : `${N.label} are limited by ${P.label.toLowerCase()} rate: ${P.value} of ${PP.value} ${PP.label.toLowerCase()} became ${P.label.toLowerCase()}; the ${lost} lost ${PP.label.toLowerCase()}→${P.label.toLowerCase()} are worth up to ≈${estimate.toFixed(1)} ${N.label.toLowerCase()}, if they'd converted at your current ${ratePct.toFixed(1)}% ${N.label.toLowerCase()} rate.`;
  return { status: "ok", sentence };
}

/**
 * "What's working" for a whole funnel: the single adjacent-stage conversion
 * rate with the largest positive period-over-period delta (reuses the same
 * prior-period infra as every other trend on these pages — src/lib/trend.ts),
 * gated on both periods clearing `minSample` and the delta clearing
 * `minDeltaPts` (a real, computed, currently-happening improvement, not
 * sub-noise movement dressed up as a finding).
 */
export function deriveWorking(current: FunnelStage[], prior: FunnelStage[], minSample: number, minDeltaPts = 2): Derivation {
  let best: { to: string; currPct: number; prevPct: number; currNum: number; currDen: number; delta: number } | null = null;
  for (let i = 1; i < current.length; i++) {
    const P = current[i - 1];
    const N = current[i];
    const pP = prior[i - 1];
    const pN = prior[i];
    if (!P || !N || !pP || !pN) continue;
    if (P.value < minSample || pP.value < minSample) continue;
    const currPct = P.value > 0 ? (N.value / P.value) * 100 : 0;
    const prevPct = pP.value > 0 ? (pN.value / pP.value) * 100 : 0;
    const delta = currPct - prevPct;
    if (delta < minDeltaPts) continue;
    if (!best || delta > best.delta) {
      best = { to: N.label, currPct, prevPct, currNum: N.value, currDen: P.value, delta };
    }
  }
  if (!best) return { status: "insufficient_data", sentence: "No clear positive mover yet." };
  return {
    status: "ok",
    sentence: `${best.to} rate is your strongest mover this period: ${best.prevPct.toFixed(1)}% → ${best.currPct.toFixed(1)}% (${best.currNum} of ${best.currDen} ${best.to.toLowerCase()}).`,
  };
}

/** Money-block capping: what Cash Collected could be at the current average deal size vs. what it actually is. */
export function deriveMoneyCap(closes: number, avgCashPerCloseCents: number, actualCashCents: number, minSample: number, fmtMoney: (cents: number) => string): Derivation {
  if (closes < minSample) {
    return { status: "insufficient_data", sentence: `Not enough data to identify a constraint yet — log ${Math.max(1, minSample - closes)} more closed calls to unlock this.` };
  }
  const predicted = closes * avgCashPerCloseCents;
  const gap = predicted - actualCashCents;
  if (gap <= 0) {
    return { status: "ok", sentence: `Cash Collected is tracking at or above what your ${closes} closes predict at your average deal size (${fmtMoney(avgCashPerCloseCents)}/close).` };
  }
  return {
    status: "ok",
    sentence: `Cash Collected could be up to ${fmtMoney(predicted)} (${closes} closes × your average ${fmtMoney(avgCashPerCloseCents)}/close) — you've collected ${fmtMoney(actualCashCents)} so far, a gap of up to ${fmtMoney(gap)}, if every close carried your current average deal size.`,
  };
}

/** Money-block "what's working": average deal size moving up period-over-period. */
export function deriveMoneyWorking(currAvgCents: number, prevAvgCents: number, currCloses: number, prevCloses: number, minSample: number, fmtMoney: (cents: number) => string): Derivation {
  if (currCloses < minSample || prevCloses < minSample) return { status: "insufficient_data", sentence: "No clear positive mover yet." };
  if (currAvgCents <= prevAvgCents) return { status: "insufficient_data", sentence: "No clear positive mover yet." };
  return { status: "ok", sentence: `Average cash per close is your strongest mover this period: ${fmtMoney(prevAvgCents)} → ${fmtMoney(currAvgCents)}.` };
}
