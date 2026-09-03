export type QueueState =
  | "queued"
  | "due"
  | "running"
  | "retry"
  | "completed"
  | "failed"
  | "unavailable";

export type QueueItem = {
  id: string;
  state: QueueState;
  ownerId: string | null;
  providerAvailable: boolean;
  attemptCount: number;
  maxAttempts: number;
  nextRunAt: string | null;
  lastError: string | null;
};

export type QueueDecision =
  | { action: "run"; reason: "due" | "retry"; item: QueueItem }
  | { action: "wait"; reason: "scheduled"; item: QueueItem }
  | { action: "unavailable"; reason: "owner-missing" | "connector-unavailable"; item: QueueItem }
  | { action: "stop"; reason: "completed" | "failed"; item: QueueItem };

export function decideQueueExecution(item: QueueItem, now: Date = new Date()): QueueDecision {
  if (item.state === "completed") return { action: "stop", reason: "completed", item };
  if (item.state === "failed" && item.attemptCount >= item.maxAttempts)
    return { action: "stop", reason: "failed", item };
  if (!item.ownerId) return { action: "unavailable", reason: "owner-missing", item };
  if (!item.providerAvailable)
    return { action: "unavailable", reason: "connector-unavailable", item };
  if (item.nextRunAt && new Date(item.nextRunAt).getTime() > now.getTime())
    return { action: "wait", reason: "scheduled", item };
  return { action: "run", reason: item.state === "retry" ? "retry" : "due", item };
}

export function recordQueueFailure(
  item: QueueItem,
  error: string,
  now: Date = new Date(),
): QueueItem {
  const attemptCount = item.attemptCount + 1;
  const exhausted = attemptCount >= item.maxAttempts;
  const backoffMinutes = Math.min(60, 2 ** Math.max(0, attemptCount - 1));
  return {
    ...item,
    state: exhausted ? "failed" : "retry",
    attemptCount,
    nextRunAt: exhausted ? null : new Date(now.getTime() + backoffMinutes * 60_000).toISOString(),
    lastError: error,
  };
}

export function recordQueueSuccess(item: QueueItem): QueueItem {
  return { ...item, state: "completed", nextRunAt: null, lastError: null };
}

export type SchedulerTick = {
  startedAt: string;
  finishedAt: string | null;
  evaluated: number;
  runnable: number;
  unavailable: number;
  failed: number;
};

export function summarizeSchedulerTick(items: QueueItem[], now: Date = new Date()): SchedulerTick {
  const evaluated = items.length;
  const decisions = items.map((item) => decideQueueExecution(item, now));
  return {
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    evaluated,
    runnable: decisions.filter((decision) => decision.action === "run").length,
    unavailable: decisions.filter((decision) => decision.action === "unavailable").length,
    failed: decisions.filter(
      (decision) => decision.action === "stop" && decision.reason === "failed",
    ).length,
  };
}
