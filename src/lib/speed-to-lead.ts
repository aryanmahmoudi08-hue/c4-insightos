import type { NotificationChannel, NotificationRequest } from "./notification-service";

export type SpeedToLeadEvent = {
  leadCreatedAt?: string | null;
  leadAssignedAt?: string | null;
  firstAttemptAt?: string | null;
  firstConnectionAt?: string | null;
  repId?: string | null;
  sourcePlatform?: string | null;
  leadSource?: string | null;
  campaign?: string | null;
  createdAt?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  eligibleForImmediateFollowUp?: boolean | null;
  spam?: boolean | null;
};

export type SpeedToLeadResult = {
  minutesToAttempt: number | null;
  minutesToConnection: number | null;
};

export type SpeedToLeadSlaStatus = "met" | "breached" | "pending" | "ineligible" | "unavailable";

export type SpeedToLeadDeliveryStatus =
  | "ready"
  | "owner-missing"
  | "already-notified"
  | "connector-unavailable"
  | "sent"
  | "failed";

export type SpeedToLeadDeliveryAudit = {
  status: "sent" | "failed";
  notificationKey: string;
};

export type SpeedToLeadQueueItem = SpeedToLeadSlaResult & {
  notificationKey: string | null;
  deliveryStatus: SpeedToLeadDeliveryStatus;
};

export function speedToLeadNotificationRequest(
  organizationId: string,
  item: SpeedToLeadQueueItem,
  channel: NotificationChannel = "discord",
): NotificationRequest | null {
  if (!item.notificationKey || !item.immediateActionRequired) return null;
  return {
    organizationId,
    event: "speed_to_lead.breached",
    recipient: item.ownerId,
    channel,
    provider: channel === "discord" ? "discord-webhook" : null,
    payload: {
      leadId: item.leadId,
      leadName: item.leadName,
      source: item.source,
      thresholdMinutes: item.thresholdMinutes,
      minutesToAttempt: item.minutesToAttempt,
      status: item.status,
    },
    idempotencyKey: item.notificationKey,
  };
}

export type SpeedToLeadSlaResult = {
  status: SpeedToLeadSlaStatus;
  thresholdMinutes: 5;
  minutesToAttempt: number | null;
  leadId: string | null;
  leadName: string | null;
  ownerId: string | null;
  source: string | null;
  immediateActionRequired: boolean;
};

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return (endMs - startMs) / 60000;
}

export function evaluateSpeedToLeadSla(
  event: SpeedToLeadEvent,
  now = new Date(),
): SpeedToLeadSlaResult {
  const base = calculateSpeedToLead(event);
  const eligible = event.eligibleForImmediateFollowUp !== false && event.spam !== true;
  const availableAt = event.leadAssignedAt ?? event.leadCreatedAt;
  if (!eligible) {
    return {
      status: "ineligible",
      thresholdMinutes: 5,
      minutesToAttempt: base.minutesToAttempt,
      leadId: event.leadId ?? null,
      leadName: event.leadName ?? null,
      ownerId: event.repId ?? null,
      source: event.leadSource ?? event.sourcePlatform ?? null,
      immediateActionRequired: false,
    };
  }
  if (!availableAt) {
    return {
      status: "unavailable",
      thresholdMinutes: 5,
      minutesToAttempt: null,
      leadId: event.leadId ?? null,
      leadName: event.leadName ?? null,
      ownerId: event.repId ?? null,
      source: event.leadSource ?? event.sourcePlatform ?? null,
      immediateActionRequired: false,
    };
  }
  const minutesToNow = minutesBetween(availableAt, now.toISOString());
  if (base.minutesToAttempt != null) {
    return {
      status: base.minutesToAttempt <= 5 ? "met" : "breached",
      thresholdMinutes: 5,
      minutesToAttempt: base.minutesToAttempt,
      leadId: event.leadId ?? null,
      leadName: event.leadName ?? null,
      ownerId: event.repId ?? null,
      source: event.leadSource ?? event.sourcePlatform ?? null,
      immediateActionRequired: base.minutesToAttempt > 5,
    };
  }
  const breached = minutesToNow != null && minutesToNow > 5;
  return {
    status: breached ? "breached" : "pending",
    thresholdMinutes: 5,
    minutesToAttempt: null,
    leadId: event.leadId ?? null,
    leadName: event.leadName ?? null,
    ownerId: event.repId ?? null,
    source: event.leadSource ?? event.sourcePlatform ?? null,
    immediateActionRequired: breached,
  };
}

export function buildSpeedToLeadQueue(
  events: SpeedToLeadEvent[],
  now = new Date(),
  alreadyNotifiedKeys: Iterable<string> = [],
  options: {
    connectorAvailable?: boolean;
    deliveryAudit?: SpeedToLeadDeliveryAudit[];
  } = {},
): SpeedToLeadQueueItem[] {
  const notified = new Set(alreadyNotifiedKeys);
  const connectorAvailable = options.connectorAvailable ?? true;
  const deliveryAudit = new Map(
    (options.deliveryAudit ?? []).map((row) => [row.notificationKey, row.status]),
  );
  return events
    .map((event) => {
      const sla = evaluateSpeedToLeadSla(event, now);
      const availableAt = event.leadAssignedAt ?? event.leadCreatedAt;
      const notificationKey =
        event.leadId && availableAt ? `speed-to-lead:${event.leadId}:${availableAt}` : null;
      const deliveryStatus: SpeedToLeadQueueItem["deliveryStatus"] = !sla.immediateActionRequired
        ? "ready"
        : !connectorAvailable
          ? "connector-unavailable"
          : notificationKey && deliveryAudit.get(notificationKey) === "sent"
            ? "sent"
            : notificationKey && deliveryAudit.get(notificationKey) === "failed"
              ? "failed"
              : notificationKey && notified.has(notificationKey)
                ? "already-notified"
                : sla.ownerId
                  ? "ready"
                  : "owner-missing";
      return { ...sla, notificationKey, deliveryStatus };
    })
    .filter((item) => item.status === "breached" || item.status === "pending");
}

export function calculateSpeedToLead(event: SpeedToLeadEvent): SpeedToLeadResult {
  const availableAt = event.leadAssignedAt ?? event.leadCreatedAt;
  return {
    minutesToAttempt: minutesBetween(availableAt, event.firstAttemptAt),
    minutesToConnection: minutesBetween(availableAt, event.firstConnectionAt),
  };
}

export function median(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function speedDistribution(events: SpeedToLeadEvent[]) {
  const results = events.map(calculateSpeedToLead);
  const minutes = results
    .map((result) => result.minutesToAttempt)
    .filter((value): value is number => value != null);
  const thresholds = [1, 5, 15, 30, 60];
  return {
    count: events.length,
    contacted: minutes.length,
    uncontacted: events.length - minutes.length,
    averageMinutes: minutes.length
      ? minutes.reduce((sum, value) => sum + value, 0) / minutes.length
      : null,
    medianMinutes: median(minutes),
    within: Object.fromEntries(
      thresholds.map((threshold) => [
        threshold,
        minutes.filter((value) => value <= threshold).length,
      ]),
    ),
    afterOneHour: minutes.filter((value) => value > 60).length,
    fastestMinutes: minutes.length ? Math.min(...minutes) : null,
    slowestMinutes: minutes.length ? Math.max(...minutes) : null,
    buckets: {
      underOneMinute: minutes.filter((value) => value < 1).length,
      underFiveMinutes: minutes.filter((value) => value < 5).length,
      underFifteenMinutes: minutes.filter((value) => value < 15).length,
      underThirtyMinutes: minutes.filter((value) => value < 30).length,
      underOneHour: minutes.filter((value) => value < 60).length,
      overOneHour: minutes.filter((value) => value >= 60).length,
    },
  };
}

export type SpeedSegmentFilters = {
  repId?: string;
  sourcePlatform?: string;
  leadSource?: string;
  campaign?: string;
  weekday?: number;
  hourStart?: number;
  hourEnd?: number;
};

export function filterSpeedEvents(events: SpeedToLeadEvent[], filters: SpeedSegmentFilters) {
  return events.filter((event) => {
    if (filters.repId && event.repId !== filters.repId) return false;
    if (filters.sourcePlatform && event.sourcePlatform !== filters.sourcePlatform) return false;
    if (filters.leadSource && event.leadSource !== filters.leadSource) return false;
    if (filters.campaign && event.campaign !== filters.campaign) return false;
    if (filters.weekday != null || filters.hourStart != null || filters.hourEnd != null) {
      const timestamp = event.leadAssignedAt ?? event.leadCreatedAt;
      if (!timestamp) return false;
      const date = new Date(timestamp);
      if (filters.weekday != null && date.getDay() !== filters.weekday) return false;
      const hour = date.getHours();
      if (filters.hourStart != null && hour < filters.hourStart) return false;
      if (filters.hourEnd != null && hour > filters.hourEnd) return false;
    }
    return true;
  });
}

export function compareSpeedBuckets(
  rows: Array<{
    minutesToAttempt: number | null;
    connected?: boolean;
    qualified?: boolean;
    set?: boolean;
    bookedCall?: boolean;
    showed?: boolean;
    close?: boolean;
  }>,
) {
  const buckets = {
    underFive: rows.filter((row) => row.minutesToAttempt != null && row.minutesToAttempt < 5),
    thirtyPlus: rows.filter((row) => row.minutesToAttempt != null && row.minutesToAttempt >= 30),
  };
  const summarize = (bucket: typeof buckets.underFive) => ({
    sampleSize: bucket.length,
    connectionRate: bucket.length
      ? bucket.filter((row) => row.connected).length / bucket.length
      : null,
    qualificationRate: bucket.length
      ? bucket.filter((row) => row.qualified).length / bucket.length
      : null,
    setRate: bucket.length ? bucket.filter((row) => row.set).length / bucket.length : null,
    bookedCallRate: bucket.length
      ? bucket.filter((row) => row.bookedCall).length / bucket.length
      : null,
    showRate: bucket.length ? bucket.filter((row) => row.showed).length / bucket.length : null,
    closeRate: bucket.length ? bucket.filter((row) => row.close).length / bucket.length : null,
  });
  return { underFive: summarize(buckets.underFive), thirtyPlus: summarize(buckets.thirtyPlus) };
}
