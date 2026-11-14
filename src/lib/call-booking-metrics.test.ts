import { describe, expect, it } from "vitest";
import { callsBookedTotal, isBooking } from "./call-booking-metrics";

describe("isBooking", () => {
  const base = {
    source_connector: "calendly",
    eod_lead_status: null,
    rescheduled_from_external_id: null,
  };

  it("counts a call synced from a scheduling tool", () => {
    expect(isBooking(base)).toBe(true);
  });

  it("does not count a closer's post-call log, which records an outcome", () => {
    expect(isBooking({ ...base, eod_lead_status: "Closed" })).toBe(false);
    expect(isBooking({ ...base, source_connector: null })).toBe(false);
  });

  it("does not count a reschedule as a second booking", () => {
    expect(isBooking({ ...base, rescheduled_from_external_id: "old-invitee" })).toBe(false);
  });
});

describe("callsBookedTotal", () => {
  it("takes the larger of synced and setter-reported bookings, never the sum", () => {
    expect(callsBookedTotal(4, 0)).toBe(4);
    expect(callsBookedTotal(2, 5)).toBe(5);
    expect(callsBookedTotal(3, 3)).toBe(3);
  });
});
