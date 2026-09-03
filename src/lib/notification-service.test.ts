import { describe, expect, it } from "vitest";
import {
  decideNotificationDelivery,
  notificationIdempotencyKey,
  withNotificationKey,
  type NotificationRequest,
} from "./notification-service";

const request: NotificationRequest = {
  organizationId: "org-1",
  event: "speed_to_lead.breached",
  recipient: "rep-1",
  channel: "discord",
  provider: "discord-webhook",
  payload: { leadId: "lead-1" },
  idempotencyKey: "speed-to-lead:lead-1:2026-08-27T10:00:00Z",
};

describe("notification service", () => {
  it("creates a deterministic scoped idempotency key", () => {
    expect(notificationIdempotencyKey(request)).toBe(
      "org-1:speed_to_lead.breached:rep-1:speed-to-lead:lead-1:2026-08-27T10:00:00Z",
    );
    expect(withNotificationKey(request).idempotencyKey).toBe(
      "org-1:speed_to_lead.breached:rep-1:speed-to-lead:lead-1:2026-08-27T10:00:00Z",
    );
  });

  it("returns unavailable without claiming delivery", () => {
    expect(
      decideNotificationDelivery(request, {
        channel: "discord",
        provider: null,
        available: false,
        reason: "Discord connector is not configured",
      }),
    ).toMatchObject({ state: "unavailable", reason: "Discord connector is not configured" });
  });

  it("queues an available notification and retries a failed audit", () => {
    const capability = {
      channel: "discord" as const,
      provider: "discord-webhook",
      available: true,
      reason: null,
    };
    expect(decideNotificationDelivery(request, capability).state).toBe("queued");
    expect(
      decideNotificationDelivery(request, capability, [
        {
          idempotencyKey: notificationIdempotencyKey(request),
          state: "failed",
          failureReason: "timeout",
        },
      ]).state,
    ).toBe("queued");
  });

  it("suppresses a duplicate after provider-confirmed delivery", () => {
    expect(
      decideNotificationDelivery(
        request,
        {
          channel: "discord",
          provider: "discord-webhook",
          available: true,
          reason: null,
        },
        [
          {
            idempotencyKey: notificationIdempotencyKey(request),
            state: "sent",
            providerMessageId: "message-1",
          },
        ],
      ).state,
    ).toBe("already-notified");
  });
});
