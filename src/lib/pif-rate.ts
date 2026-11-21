/**
 * PIF rate: of the deals a closer closed, the share paid in full on the
 * call rather than on a payment plan or with a deposit.
 *
 * Built only from what the closer recorded on the call, never inferred from
 * amounts:
 *   - a close is a call marked closed (Closed or Deposit on the post-call form)
 *   - it is paid in full when the closer did NOT tick "Payment plan" and the
 *     call is not a deposit (no "Deposit" status, no deposit amount)
 *
 * The "Payment plan" question only exists on calls logged since
 * PAYMENT_PLAN_RECORDED_SINCE (metric dictionary SALE-0394). Before that
 * every call stored payment_plan = false whatever really happened, so an
 * older close would read as paid in full. Those closes are left out of both
 * sides of the rate and counted separately, so the card can say so, rather
 * than inflating the rate with guesses.
 */

/** The day the closer form started recording "Payment plan" (3d0807a). */
export const PAYMENT_PLAN_RECORDED_SINCE = "2026-09-23T00:00:00Z";

export type PifCall = {
  closed: boolean | null;
  payment_plan: boolean | null;
  eod_lead_status?: string | null;
  deposit_cents?: number | null;
  /** When the call was logged; decides whether payment_plan was asked. */
  created_at?: string | null;
};

const isClose = (c: PifCall) => c.closed === true;

/** Closed with "Payment plan" recorded, i.e. logged since the question existed. */
export function hasPlanAnswer(c: PifCall): boolean {
  if (!c.created_at) return false;
  return new Date(c.created_at).getTime() >= new Date(PAYMENT_PLAN_RECORDED_SINCE).getTime();
}

export function isPifClose(c: PifCall): boolean {
  return (
    isClose(c) &&
    c.payment_plan !== true &&
    c.eod_lead_status !== "Deposit" &&
    !((c.deposit_cents ?? 0) > 0)
  );
}

export type PifRate = {
  /** Closes paid in full. */
  pif: number;
  /** Closes the rate is out of (those with a recorded payment-plan answer). */
  closes: number;
  /** Closes left out: logged before the payment-plan question existed. */
  unrecorded: number;
  /** 0–100, or null when there is no close to measure. */
  pct: number | null;
};

export function pifRate(calls: readonly PifCall[]): PifRate {
  let pif = 0;
  let closes = 0;
  let unrecorded = 0;
  for (const c of calls) {
    if (!isClose(c)) continue;
    if (!hasPlanAnswer(c)) {
      unrecorded += 1;
      continue;
    }
    closes += 1;
    if (isPifClose(c)) pif += 1;
  }
  return { pif, closes, unrecorded, pct: closes ? (pif / closes) * 100 : null };
}
