import { describe, expect, it } from "vitest";
import {
  DISPATCHED_EVENTS,
  DISPATCHED_EVENT_TYPES,
  EVENT_CATALOG,
  STREAM_ONLY_EVENTS,
  eventCatalogEntry,
  maskWebhookUrl,
  undeliverableEventTypes,
  webhookChannelFor,
} from "./event-catalog";

describe("EVENT_CATALOG", () => {
  it("lists every type exactly once", () => {
    const types = EVENT_CATALOG.map((e) => e.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("keeps the two groups honest about dispatchability", () => {
    expect(DISPATCHED_EVENTS.every((e) => e.dispatched)).toBe(true);
    expect(STREAM_ONLY_EVENTS.every((e) => !e.dispatched)).toBe(true);
  });

  it("labels and attributes every entry, so the list can be audited", () => {
    for (const entry of EVENT_CATALOG) {
      expect(entry.label.trim().length).toBeGreaterThan(0);
      expect(entry.emittedBy.trim().length).toBeGreaterThan(0);
      expect(entry.type).toMatch(/^[a-z_]+(\.[a-z_0-9]+)+$/);
    }
  });

  it("offers only dispatchable types for subscription", () => {
    expect(DISPATCHED_EVENT_TYPES).toContain("payment.collected");
    expect(DISPATCHED_EVENT_TYPES).toContain("payment.failed");
    expect(DISPATCHED_EVENT_TYPES).not.toContain("team_member.added");
  });

  it("does not resurrect the types the old hand-written lists invented", () => {
    // These were offered in the UI and emitted by nothing. A subscription to
    // one of them saved, reported Active, and was silent forever.
    const invented = [
      "lead.status_changed",
      "conversation.started",
      "call.booked",
      "call.showed",
      "call.closed_lost",
      "content.posted",
      "content.milestone_10k",
      "alert.fired",
      "client.renewed",
    ];
    for (const type of invented) {
      expect(eventCatalogEntry(type)).toBeNull();
    }
  });

  it("includes the types the old lists left out", () => {
    for (const type of [
      "lead.application_submitted",
      "client.stage_changed",
      "onboarding.submitted",
      "payment.collected",
      "content.ready_to_post",
    ]) {
      expect(eventCatalogEntry(type)?.dispatched).toBe(true);
    }
  });
});

describe("undeliverableEventTypes", () => {
  it("returns nothing when every type dispatches", () => {
    expect(undeliverableEventTypes(["call.closed_won", "payment.collected"])).toEqual([]);
  });

  it("flags a type no code emits", () => {
    expect(undeliverableEventTypes(["call.closed_won", "alert.fired"])).toEqual(["alert.fired"]);
  });

  it("flags a stream-only type, which saves but never delivers", () => {
    expect(undeliverableEventTypes(["team_member.added"])).toEqual(["team_member.added"]);
  });

  it("treats an empty or missing list as nothing to flag", () => {
    expect(undeliverableEventTypes([])).toEqual([]);
    expect(undeliverableEventTypes(null)).toEqual([]);
    expect(undeliverableEventTypes(undefined)).toEqual([]);
  });
});

describe("maskWebhookUrl", () => {
  it("keeps the host and hides the path, which is the credential", () => {
    const out = maskWebhookUrl(
      "https://discord.com/api/webhooks/1402993771/aBcDeFgHiJkLmNoPqRsTuVwXyZ012345",
    );
    expect(out).toBe("discord.com/…2345");
    expect(out).not.toContain("1402993771");
    expect(out).not.toContain("aBcDeFgHiJ");
  });

  it("leaves two rows on the same host distinguishable", () => {
    const a = maskWebhookUrl("https://hooks.slack.com/services/T000/B000/aaaaaaaaaaaa");
    const b = maskWebhookUrl("https://hooks.slack.com/services/T000/B000/bbbbbbbbbbbb");
    expect(a).not.toBe(b);
  });

  it("withholds even the tail when the path is short enough to be most of it", () => {
    expect(maskWebhookUrl("https://example.com/hook")).toBe("example.com/…");
  });

  it("shows a bare host as-is, since there is nothing to hide", () => {
    expect(maskWebhookUrl("https://example.com")).toBe("example.com");
    expect(maskWebhookUrl("https://example.com/")).toBe("example.com");
  });

  it("masks a query string too, not just the path", () => {
    expect(maskWebhookUrl("https://n8n.example.com/webhook?token=supersecretvalue")).toBe(
      "n8n.example.com/…alue",
    );
  });

  it("keeps the port, which is part of which service a row points at", () => {
    expect(maskWebhookUrl("http://localhost:5678/webhook/abcdefghijkl")).toBe(
      "localhost:5678/…ijkl",
    );
  });

  it("refuses to print something that is not a URL, which may be a stray secret", () => {
    expect(maskWebhookUrl("whoops-pasted-a-token-here")).toBe("Unreadable target URL");
  });

  it("says so plainly when there is no URL", () => {
    expect(maskWebhookUrl("")).toBe("No target URL");
    expect(maskWebhookUrl("   ")).toBe("No target URL");
    expect(maskWebhookUrl(null)).toBe("No target URL");
    expect(maskWebhookUrl(undefined)).toBe("No target URL");
  });
});

describe("webhookChannelFor", () => {
  it("recognises a Discord webhook from its URL", () => {
    // The 400s came from this being stored as 'slack' and never corrected.
    expect(webhookChannelFor("https://discord.com/api/webhooks/123/abc")).toBe("discord");
    expect(webhookChannelFor("https://discordapp.com/api/webhooks/123/abc")).toBe("discord");
    expect(webhookChannelFor("https://ptb.discord.com/api/webhooks/123/abc")).toBe("discord");
  });

  it("overrides a stored channel that contradicts the URL", () => {
    // This is what repairs rows already saved with the default.
    expect(webhookChannelFor("https://discord.com/api/webhooks/123/abc", "slack")).toBe("discord");
  });

  it("recognises Slack", () => {
    expect(webhookChannelFor("https://hooks.slack.com/services/T/B/x")).toBe("slack");
  });

  it("keeps a stored channel for a host it cannot identify", () => {
    expect(webhookChannelFor("https://n8n.example.com/webhook/abc", "n8n")).toBe("n8n");
    expect(webhookChannelFor("https://hooks.zapier.com/hooks/catch/1/x", "zapier")).toBe("zapier");
  });

  it("does not match a discord.com URL that is not a webhook endpoint", () => {
    expect(webhookChannelFor("https://discord.com/channels/123", "slack")).toBe("slack");
  });

  it("is not fooled by a lookalike host", () => {
    expect(webhookChannelFor("https://notdiscord.com/api/webhooks/1/a", "slack")).toBe("slack");
    expect(webhookChannelFor("https://discord.com.evil.test/api/webhooks/1/a", "slack")).toBe(
      "slack",
    );
  });

  it("falls back to slack, the column default, when there is nothing to go on", () => {
    expect(webhookChannelFor("")).toBe("slack");
    expect(webhookChannelFor(null)).toBe("slack");
    expect(webhookChannelFor("not-a-url")).toBe("slack");
  });
});
