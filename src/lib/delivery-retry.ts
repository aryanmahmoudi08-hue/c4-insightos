/**
 * When a failed webhook delivery is worth trying again, and when to stop.
 *
 * Fired events are claimed once so overlapping scheduler ticks cannot
 * double-ping a channel. Before this, the claim was also the end of the
 * story: a Discord 429 or 5xx at that moment lost a "call this lead now"
 * alert for good, visible only as a failed row in webhook_deliveries. The
 * first tick after deploy is exactly when that happens — a day's backlog
 * fires at once and Discord rate-limits a single webhook at roughly 30
 * requests a minute.
 *
 * So a claim now records how delivery went, and the scheduler retries the
 * subscriptions that failed for a reason that might pass, with backoff,
 * a bounded number of times.
 */

export const MAX_DELIVERY_ATTEMPTS = 5;

export type DeliveryResult = { subscriptionId: string; ok: boolean; status: number };

export type DispatchOutcome = {
  /** The subscription lookup itself failed, so nothing was attempted. */
  lookupFailed: boolean;
  deliveries: DeliveryResult[];
};

/**
 * Worth retrying: rate limits, timeouts, server errors, and network failures
 * (status 0). Not worth retrying: other 4xx — a deleted webhook (404) or a
 * body Discord rejects (400) will fail identically every time, and retrying
 * them only buries the channel's real failures under repeats.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

/** 1, 2, 4, 8 minutes after attempts 1–4. */
export function retryDelayMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, attempts - 1);
}

export type FireStatus = "sent" | "failed" | "dead";

/**
 * What a claim becomes after an attempt.
 *
 *   sent   — nothing left to do (every delivery succeeded, or there were no
 *            matching subscriptions at all)
 *   failed — retry later, to `retrySubscriptionIds` only (null = all of them,
 *            used when the lookup failed and nothing was attempted)
 *   dead   — out of attempts, or the only failures are permanent
 */
export function settleAttempt(
  outcome: DispatchOutcome,
  attempts: number,
): { status: FireStatus; retrySubscriptionIds: string[] | null } {
  if (outcome.lookupFailed) {
    return attempts >= MAX_DELIVERY_ATTEMPTS
      ? { status: "dead", retrySubscriptionIds: [] }
      : { status: "failed", retrySubscriptionIds: null };
  }
  const failed = outcome.deliveries.filter((d) => !d.ok);
  if (!failed.length) return { status: "sent", retrySubscriptionIds: [] };
  const retryable = failed.filter((d) => isRetryableStatus(d.status)).map((d) => d.subscriptionId);
  if (!retryable.length || attempts >= MAX_DELIVERY_ATTEMPTS) {
    return { status: "dead", retrySubscriptionIds: [] };
  }
  return { status: "failed", retrySubscriptionIds: retryable };
}
