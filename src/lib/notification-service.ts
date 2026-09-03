export type NotificationChannel = "discord" | "webhook" | "in_app";

export type NotificationDeliveryState =
  | "unavailable"
  | "queued"
  | "sent"
  | "failed"
  | "already-notified";

export type NotificationCapability = {
  channel: NotificationChannel;
  provider: string | null;
  available: boolean;
  reason: string | null;
};

export type NotificationRequest = {
  organizationId: string;
  event: string;
  recipient: string | null;
  channel: NotificationChannel;
  provider: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export type NotificationAttemptRecord = {
  organizationId: string;
  idempotencyKey: string;
  event: string;
  recipient: string | null;
  channel: NotificationChannel;
  provider: string | null;
  status: "queued" | "sent" | "failed" | "unavailable";
  attemptCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  payload: Record<string, unknown>;
};

export type NotificationAudit = {
  idempotencyKey: string;
  state: Exclude<NotificationDeliveryState, "unavailable" | "queued" | "already-notified">;
  providerMessageId?: string | null;
  responseCode?: number | null;
  failureReason?: string | null;
  attemptedAt?: string | null;
};

export type NotificationDecision = {
  state: NotificationDeliveryState;
  reason: string | null;
  request: NotificationRequest;
};

export type NotificationProvider = {
  name: string;
  channel: NotificationChannel;
  detect(): Promise<NotificationCapability>;
  send(request: NotificationRequest): Promise<NotificationAudit>;
};

export function notificationIdempotencyKey(
  request: Pick<NotificationRequest, "organizationId" | "event" | "recipient" | "idempotencyKey">,
) {
  return [
    request.organizationId,
    request.event,
    request.recipient ?? "unassigned",
    request.idempotencyKey,
  ].join(":");
}

export function decideNotificationDelivery(
  request: NotificationRequest,
  capability: NotificationCapability,
  audits: NotificationAudit[] = [],
): NotificationDecision {
  const key = notificationIdempotencyKey(request);
  const previous = audits.find((audit) => audit.idempotencyKey === key);
  if (previous?.state === "sent") {
    return {
      state: "already-notified",
      reason: "A provider-confirmed delivery already exists.",
      request,
    };
  }
  if (!capability.available) {
    return {
      state: "unavailable",
      reason: capability.reason ?? "No compatible notification provider is configured.",
      request,
    };
  }
  if (previous?.state === "failed") {
    return {
      state: "queued",
      reason: "A prior attempt failed and is eligible for retry.",
      request,
    };
  }
  return { state: "queued", reason: null, request };
}

export function withNotificationKey(request: NotificationRequest): NotificationRequest {
  return { ...request, idempotencyKey: notificationIdempotencyKey(request) };
}

export function toNotificationAttemptRecord(
  request: NotificationRequest,
  decision: NotificationDecision,
  attemptCount = 0,
  nextRetryAt: string | null = null,
): NotificationAttemptRecord {
  return {
    organizationId: request.organizationId,
    idempotencyKey: notificationIdempotencyKey(request),
    event: request.event,
    recipient: request.recipient,
    channel: request.channel,
    provider: request.provider,
    status:
      decision.state === "sent" || decision.state === "already-notified"
        ? "sent"
        : decision.state === "failed"
          ? "failed"
          : decision.state === "unavailable"
            ? "unavailable"
            : "queued",
    attemptCount,
    nextRetryAt,
    lastError: decision.reason,
    payload: request.payload,
  };
}
