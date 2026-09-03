import { describe, expect, it } from "vitest";
import {
  decideQueueExecution,
  recordQueueFailure,
  recordQueueSuccess,
  summarizeSchedulerTick,
  type QueueItem,
} from "./operational-queue";

const BASE: QueueItem = {
  id: "q-1",
  state: "due",
  ownerId: "rep-1",
  providerAvailable: true,
  attemptCount: 0,
  maxAttempts: 3,
  nextRunAt: null,
  lastError: null,
};

describe("operational queue", () => {
  it("runs due work and waits for future work", () => {
    expect(decideQueueExecution(BASE).action).toBe("run");
    expect(
      decideQueueExecution(
        { ...BASE, nextRunAt: "2026-09-02T00:05:00Z" },
        new Date("2026-09-02T00:00:00Z"),
      ),
    ).toMatchObject({ action: "wait", reason: "scheduled" });
  });

  it("keeps missing owner and provider states honest", () => {
    expect(decideQueueExecution({ ...BASE, ownerId: null })).toMatchObject({
      action: "unavailable",
      reason: "owner-missing",
    });
    expect(decideQueueExecution({ ...BASE, providerAvailable: false })).toMatchObject({
      action: "unavailable",
      reason: "connector-unavailable",
    });
  });

  it("retries with bounded exponential backoff and then fails", () => {
    const first = recordQueueFailure(BASE, "timeout", new Date("2026-09-02T00:00:00Z"));
    expect(first).toMatchObject({ state: "retry", attemptCount: 1, lastError: "timeout" });
    expect(first.nextRunAt).toBe("2026-09-02T00:01:00.000Z");
    const second = recordQueueFailure(first, "timeout", new Date("2026-09-02T00:01:00Z"));
    const third = recordQueueFailure(second, "timeout", new Date("2026-09-02T00:03:00Z"));
    expect(third).toMatchObject({ state: "failed", attemptCount: 3, nextRunAt: null });
  });

  it("marks successful work completed and summarizes scheduler ticks", () => {
    expect(recordQueueSuccess(BASE)).toMatchObject({
      state: "completed",
      nextRunAt: null,
      lastError: null,
    });
    expect(
      summarizeSchedulerTick([
        BASE,
        { ...BASE, id: "q-2", providerAvailable: false },
        { ...BASE, id: "q-3", ownerId: null },
      ]),
    ).toMatchObject({ evaluated: 3, runnable: 1, unavailable: 2, failed: 0 });
  });
});
