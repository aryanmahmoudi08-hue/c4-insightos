import { describe, expect, it } from "vitest";
import {
  buildLeaderboard,
  isNoShow,
  type CloserCallRow,
  type SetterActivityRow,
} from "./sales-leaderboard";

const setter = (p: Partial<SetterActivityRow>): SetterActivityRow => ({
  team_member_name: "Jo",
  dials: 0,
  sets: 0,
  calls_on_calendar: 0,
  live_calls: 0,
  closes: 0,
  cash_collected_cents: 0,
  original_currency: "USD",
  ...p,
});

const call = (p: Partial<CloserCallRow>): CloserCallRow => ({
  closer_name: "Sam",
  showed: false,
  closed: false,
  status: "follow_up",
  eod_lead_status: null,
  cash_collected_cents: 0,
  original_currency: "USD",
  ...p,
});

describe("buildLeaderboard", () => {
  it("adds up each setter across their EOD rows", () => {
    const lb = buildLeaderboard(
      [setter({ dials: 100, sets: 3 }), setter({ dials: 50, sets: 1, calls_on_calendar: 2 })],
      [],
    );
    expect(lb.setters).toEqual([
      expect.objectContaining({ name: "Jo", dials: 150, sets: 4, booked: 2 }),
    ]);
  });

  it("counts a closer's calls, shows, no-shows and closes", () => {
    const lb = buildLeaderboard(
      [],
      [
        call({ showed: true, closed: true, cash_collected_cents: 300000 }),
        call({ showed: true }),
        call({ status: "no_show", eod_lead_status: "No Show" }),
      ],
    );
    expect(lb.closers[0]).toEqual(
      expect.objectContaining({
        name: "Sam",
        taken: 3,
        showed: 2,
        noShows: 1,
        closed: 1,
        cashCents: 300000,
      }),
    );
  });

  it("does not double count a sale both sides logged", () => {
    const lb = buildLeaderboard(
      [setter({ closes: 1, cash_collected_cents: 300000 })],
      [call({ showed: true, closed: true, cash_collected_cents: 300000 })],
    );
    expect(lb.team.closed).toBe(1);
    expect(lb.team.cashCents).toBe(300000);
  });

  it("takes sets and dials from setters and shows from closers for the team", () => {
    const lb = buildLeaderboard(
      [setter({ dials: 80, sets: 4, live_calls: 9 })],
      [call({ showed: true }), call({ status: "no_show" })],
    );
    expect(lb.team).toEqual(expect.objectContaining({ dials: 80, sets: 4, showed: 1, noShows: 1 }));
  });

  it("excludes non-USD cash and says how many rows it left out", () => {
    const lb = buildLeaderboard(
      [setter({ cash_collected_cents: 50000, original_currency: "CAD" })],
      [call({ closed: true, cash_collected_cents: 100000, original_currency: "USD" })],
    );
    expect(lb.setters[0].cashCents).toBe(0);
    expect(lb.closers[0].cashCents).toBe(100000);
    expect(lb.non_usd_rows_excluded).toBe(1);
  });

  it("ranks by cash, then closes, then sets, then dials", () => {
    const lb = buildLeaderboard(
      [
        setter({ team_member_name: "A", dials: 200 }),
        setter({ team_member_name: "B", sets: 1 }),
        setter({ team_member_name: "C", closes: 1, cash_collected_cents: 1000 }),
      ],
      [],
    );
    expect(lb.setters.map((r) => r.name)).toEqual(["C", "B", "A"]);
  });

  it("skips rows with no name rather than inventing an 'Unknown' rep", () => {
    const lb = buildLeaderboard(
      [setter({ team_member_name: "  " })],
      [call({ closer_name: null })],
    );
    expect(lb.setters).toEqual([]);
    expect(lb.closers).toEqual([]);
  });
});

describe("isNoShow", () => {
  it("reads either the enum or the EOD label, and never a call that showed", () => {
    expect(isNoShow({ status: "no_show", eod_lead_status: null, showed: false })).toBe(true);
    expect(isNoShow({ status: "follow_up", eod_lead_status: "No Show", showed: false })).toBe(true);
    expect(isNoShow({ status: "no_show", eod_lead_status: "No Show", showed: true })).toBe(false);
    expect(
      isNoShow({ status: "follow_up", eod_lead_status: "Follow Up (short term)", showed: false }),
    ).toBe(false);
  });
});
