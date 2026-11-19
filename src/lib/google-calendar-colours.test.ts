import { describe, expect, it } from "vitest";
import {
  callEventStatus,
  canColourEvents,
  GOOGLE_CALENDAR_SCOPES,
  STATUS_EVENT_COLOR,
} from "./google-calendar";

const policy = { overdueAfterHours: 24, atRiskAfterHours: 4 };
const now = new Date("2026-11-18T12:00:00Z");
const inHours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();

describe("callEventStatus", () => {
  it("is awaiting far out, overdue inside a day, at risk inside four hours", () => {
    expect(callEventStatus({ scheduled_for: inHours(48) }, policy, now)).toBe("awaiting");
    expect(callEventStatus({ scheduled_for: inHours(10) }, policy, now)).toBe("overdue");
    expect(callEventStatus({ scheduled_for: inHours(2) }, policy, now)).toBe("at_risk");
  });

  it("is confirmed when ticked in AscendOS or the invite is accepted", () => {
    expect(
      callEventStatus({ scheduled_for: inHours(2), overall_status: "confirmed" }, policy, now),
    ).toBe("confirmed");
    expect(
      callEventStatus({ scheduled_for: inHours(2), google_rsvp_status: "accepted" }, policy, now),
    ).toBe("confirmed");
  });

  it("puts cancelled and rescheduled ahead of everything else", () => {
    expect(
      callEventStatus(
        { scheduled_for: inHours(2), cancelled: true, overall_status: "confirmed" },
        policy,
        now,
      ),
    ).toBe("cancelled");
    expect(callEventStatus({ scheduled_for: inHours(2), status: "rescheduled" }, policy, now)).toBe(
      "rescheduled",
    );
  });
});

describe("event colours", () => {
  it("matches the Calls on Calendar legend", () => {
    expect(STATUS_EVENT_COLOR.confirmed).toBe("10"); // Basil, green
    expect(STATUS_EVENT_COLOR.overdue).toBe("11"); // Tomato, red
    expect(STATUS_EVENT_COLOR.at_risk).toBe("6"); // Tangerine, orange
    expect(STATUS_EVENT_COLOR.rescheduled).toBe("9"); // Blueberry, blue
  });

  it("only colours with an edit scope, which new sign-ins ask for", () => {
    expect(canColourEvents("https://www.googleapis.com/auth/calendar.events.readonly openid")).toBe(
      false,
    );
    expect(canColourEvents("https://www.googleapis.com/auth/calendar.events openid")).toBe(true);
    expect(canColourEvents(GOOGLE_CALENDAR_SCOPES.join(" "))).toBe(true);
  });
});
