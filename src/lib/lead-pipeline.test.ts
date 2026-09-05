import { describe, expect, it } from "vitest";
import {
  deriveLeadAvailability,
  formatLeadAge,
  pipelineStageInfo,
  relativeTimeAgo,
} from "./lead-pipeline";

describe("pipelineStageInfo", () => {
  it("maps every real lead_status enum value to a real label", () => {
    const cases: [string, string][] = [
      ["dm_received", "New / Not Contacted"],
      ["qualified", "Qualified"],
      ["pre_call_assets_sent", "Attempted Contact"],
      ["call_booked", "Booked"],
      ["showed", "Showed"],
      ["closed", "Closed"],
      ["disqualified", "Lost / Disqualified"],
      ["follow_up", "Follow-up"],
      ["no_show", "No-show"],
      ["ghosted", "Lost / Disqualified"],
    ];
    for (const [status, label] of cases) {
      expect(pipelineStageInfo(status).label).toBe(label);
    }
  });

  it("a status outside the real enum (e.g. a stale STATUS_OPTIONS value) resolves to Unknown, never a guessed stage", () => {
    const info = pipelineStageInfo("opt_in");
    expect(info.label).toBe("Unknown");
    expect(info.availability).toBe("unavailable");
  });
});

describe("deriveLeadAvailability", () => {
  const now = "2026-09-05T12:00:00Z";

  it("new lead, zero calls on record", () => {
    const a = deriveLeadAvailability({
      status: "dm_received",
      callCount: 0,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.bucket).toBe("new");
    expect(a.headline).toBe("New — 0 calls on record");
  });

  it("attempted lead shows the real call count and a relative last-call time", () => {
    const a = deriveLeadAvailability({
      status: "qualified",
      callCount: 3,
      lastCallAt: "2026-09-05T10:00:00Z",
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.bucket).toBe("attempted");
    expect(a.headline).toBe("Attempted — 3 calls on record · last call 2h ago");
  });

  it("singular 'call' for exactly one call on record", () => {
    const a = deriveLeadAvailability({
      status: "pre_call_assets_sent",
      callCount: 1,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.headline).toBe("Attempted — 1 call on record");
  });

  it("follow_up with a callback due today", () => {
    const a = deriveLeadAvailability({
      status: "follow_up",
      callCount: 2,
      lastCallAt: null,
      callbackDueAt: "2026-09-05T15:00:00Z",
      nowISO: now,
    });
    expect(a.bucket).toBe("followup");
    expect(a.detail).toBe("Callback due today");
  });

  it("follow_up with an overdue callback", () => {
    const a = deriveLeadAvailability({
      status: "follow_up",
      callCount: 2,
      lastCallAt: null,
      callbackDueAt: "2026-09-01T15:00:00Z",
      nowISO: now,
    });
    expect(a.detail).toBe("Callback overdue since 2026-09-01");
  });

  it("follow_up with a future scheduled callback", () => {
    const a = deriveLeadAvailability({
      status: "follow_up",
      callCount: 0,
      lastCallAt: null,
      callbackDueAt: "2026-09-10T15:00:00Z",
      nowISO: now,
    });
    expect(a.detail).toBe("Callback scheduled for 2026-09-10");
  });

  it("follow_up with no callback tracked at all shows no fabricated detail", () => {
    const a = deriveLeadAvailability({
      status: "follow_up",
      callCount: 0,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.detail).toBeNull();
  });

  it("no_show is a follow-up-eligible bucket (recoverable), not permanently lost", () => {
    const a = deriveLeadAvailability({
      status: "no_show",
      callCount: 1,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.bucket).toBe("followup");
  });

  it("booked leads are marked unavailable with the exact worked example from the brief", () => {
    const a = deriveLeadAvailability({
      status: "call_booked",
      callCount: 1,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.bucket).toBe("unavailable");
    expect(a.headline).toBe("Booked — remove from active call queue");
  });

  it("closed/disqualified/ghosted/showed are all unavailable", () => {
    for (const status of ["closed", "disqualified", "ghosted", "showed"]) {
      expect(
        deriveLeadAvailability({
          status,
          callCount: 0,
          lastCallAt: null,
          callbackDueAt: null,
          nowISO: now,
        }).bucket,
      ).toBe("unavailable");
    }
  });

  it("does not silently exclude an unrecognized status — flags it unavailable/unknown rather than guessing callable", () => {
    const a = deriveLeadAvailability({
      status: "some_future_enum_value",
      callCount: 0,
      lastCallAt: null,
      callbackDueAt: null,
      nowISO: now,
    });
    expect(a.bucket).toBe("unavailable");
    expect(a.headline).toContain("Unknown");
  });
});

describe("relativeTimeAgo", () => {
  const now = "2026-09-05T12:00:00Z";
  it("just now for under a minute", () => {
    expect(relativeTimeAgo("2026-09-05T11:59:30Z", now)).toBe("just now");
  });
  it("minutes", () => {
    expect(relativeTimeAgo("2026-09-05T11:45:00Z", now)).toBe("15m ago");
  });
  it("hours", () => {
    expect(relativeTimeAgo("2026-09-05T09:00:00Z", now)).toBe("3h ago");
  });
  it("days", () => {
    expect(relativeTimeAgo("2026-09-02T12:00:00Z", now)).toBe("3d ago");
  });
});

describe("formatLeadAge", () => {
  const now = "2026-09-05T12:00:00Z";
  it("under an hour", () => {
    expect(formatLeadAge("2026-09-05T11:40:00Z", now)).toBe("<1h");
  });
  it("hours", () => {
    expect(formatLeadAge("2026-09-05T04:00:00Z", now)).toBe("8h");
  });
  it("days", () => {
    expect(formatLeadAge("2026-09-01T12:00:00Z", now)).toBe("4d");
  });
});
