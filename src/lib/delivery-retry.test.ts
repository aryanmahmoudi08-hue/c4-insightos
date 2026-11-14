import { describe, expect, it } from "vitest";
import {
  MAX_DELIVERY_ATTEMPTS,
  isRetryableStatus,
  retryDelayMs,
  settleAttempt,
  type DeliveryResult,
} from "./delivery-retry";

const ok = (id: string): DeliveryResult => ({ subscriptionId: id, ok: true, status: 204 });
const fail = (id: string, status: number): DeliveryResult => ({
  subscriptionId: id,
  ok: false,
  status,
});

describe("isRetryableStatus", () => {
  it("retries rate limits, timeouts, server errors and network failures", () => {
    for (const s of [0, 408, 425, 429, 500, 502, 503, 504]) expect(isRetryableStatus(s)).toBe(true);
  });
  it("does not retry a request that will fail the same way every time", () => {
    for (const s of [400, 401, 403, 404, 410, 413]) expect(isRetryableStatus(s)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off 1, 2, 4, 8 minutes", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
  });
});

describe("settleAttempt", () => {
  it("is sent when every delivery succeeded", () => {
    expect(settleAttempt({ lookupFailed: false, deliveries: [ok("a"), ok("b")] }, 1)).toEqual({
      status: "sent",
      retrySubscriptionIds: [],
    });
  });

  it("is sent when nothing was subscribed, since there is nothing to retry", () => {
    expect(settleAttempt({ lookupFailed: false, deliveries: [] }, 1).status).toBe("sent");
  });

  it("retries only the subscriptions that hit a retryable failure", () => {
    // The channel that already got the message must not get it twice.
    const r = settleAttempt(
      { lookupFailed: false, deliveries: [ok("a"), fail("b", 429), fail("c", 503)] },
      1,
    );
    expect(r).toEqual({ status: "failed", retrySubscriptionIds: ["b", "c"] });
  });

  it("gives up on permanent failures straight away", () => {
    const r = settleAttempt({ lookupFailed: false, deliveries: [fail("a", 404)] }, 1);
    expect(r.status).toBe("dead");
  });

  it("drops a permanent failure but keeps retrying a transient one alongside it", () => {
    const r = settleAttempt(
      { lookupFailed: false, deliveries: [fail("a", 404), fail("b", 429)] },
      2,
    );
    expect(r).toEqual({ status: "failed", retrySubscriptionIds: ["b"] });
  });

  it("stops after the last attempt, so a dead webhook cannot retry forever", () => {
    const r = settleAttempt(
      { lookupFailed: false, deliveries: [fail("a", 503)] },
      MAX_DELIVERY_ATTEMPTS,
    );
    expect(r.status).toBe("dead");
  });

  it("retries every subscription when the lookup failed and nothing was attempted", () => {
    expect(settleAttempt({ lookupFailed: true, deliveries: [] }, 1)).toEqual({
      status: "failed",
      retrySubscriptionIds: null,
    });
    expect(
      settleAttempt({ lookupFailed: true, deliveries: [] }, MAX_DELIVERY_ATTEMPTS).status,
    ).toBe("dead");
  });
});
