import { describe, expect, it } from "vitest";
import {
  UNATTRIBUTED,
  buildSourceBoard,
  type SourceCall,
  type SourceLead,
} from "./source-leaderboard";

const lead = (p: Partial<SourceLead>): SourceLead => ({
  id: "l",
  email: null,
  source_platform: null,
  source_content_id: null,
  first_touch_content_id: null,
  application_data: null,
  created_at: "2026-11-13T12:00:00Z",
  ...p,
});

const call = (p: Partial<SourceCall>): SourceCall => ({
  lead_id: null,
  lead_email: null,
  created_at: "2026-11-13T12:00:00Z",
  source_connector: "calendly",
  cancelled: false,
  cash_collected_cents: 0,
  original_currency: "USD",
  ...p,
});

describe("buildSourceBoard", () => {
  it("ranks sources by leads and keeps Unknown out of the ranking", () => {
    const leads = [
      lead({ id: "a", source_platform: "instagram" }),
      lead({ id: "b", source_platform: "instagram" }),
      lead({ id: "c", source_platform: "tiktok" }),
      lead({ id: "d" }),
      lead({ id: "e" }),
      lead({ id: "f" }),
    ];
    const board = buildSourceBoard(leads, [], leads, new Map());
    expect(board.sources.map((s) => [s.name, s.leads])).toEqual([
      ["Instagram", 2],
      ["TikTok", 1],
    ]);
    // The biggest bucket, but reported on its own line, never as the winner.
    expect(board.unattributed).toEqual(expect.objectContaining({ name: UNATTRIBUTED, leads: 3 }));
  });

  it("counts applications among the window's leads", () => {
    const leads = [
      lead({ id: "a", source_platform: "instagram", application_data: { income: "$95-120K" } }),
      lead({ id: "b", source_platform: "instagram", application_data: {} }),
    ];
    expect(buildSourceBoard(leads, [], leads, new Map()).sources[0]).toEqual(
      expect.objectContaining({ leads: 2, applications: 1 }),
    );
  });

  it("attributes a booking to its lead's source, even when the lead predates the window", () => {
    const older = lead({
      id: "old",
      source_platform: "youtube",
      created_at: "2026-10-01T00:00:00Z",
    });
    const board = buildSourceBoard([], [call({ lead_id: "old" })], [older], new Map());
    expect(board.sources[0]).toEqual(
      expect.objectContaining({ name: "YouTube", leads: 0, booked: 1 }),
    );
  });

  it("links closer-logged cash by email when the call has no lead id", () => {
    const l = lead({ id: "x", email: "Ada@Example.com", source_platform: "instagram" });
    const c = call({
      source_connector: null,
      lead_email: "ada@example.com",
      cash_collected_cents: 300000,
    });
    const board = buildSourceBoard([], [c], [l], new Map());
    expect(board.sources[0]).toEqual(expect.objectContaining({ cashCents: 300000, booked: 0 }));
  });

  it("puts calls and cash it cannot tie to a lead under Unattributed, not a guessed source", () => {
    const board = buildSourceBoard(
      [],
      [call({}), call({ source_connector: null, cash_collected_cents: 100000 })],
      [],
      new Map(),
    );
    expect(board.sources).toEqual([]);
    expect(board.unattributed).toEqual(expect.objectContaining({ booked: 1, cashCents: 100000 }));
  });

  it("ignores cancelled bookings", () => {
    const l = lead({ id: "a", source_platform: "instagram" });
    const board = buildSourceBoard([], [call({ lead_id: "a", cancelled: true })], [l], new Map());
    expect(board.sources).toEqual([]);
  });

  it("excludes non-USD cash and counts what it left out", () => {
    const l = lead({ id: "a", source_platform: "instagram" });
    const board = buildSourceBoard(
      [],
      [
        call({
          lead_id: "a",
          source_connector: null,
          cash_collected_cents: 500,
          original_currency: "CAD",
        }),
      ],
      [l],
      new Map(),
    );
    expect(board.non_usd_rows_excluded).toBe(1);
    expect(board.sources[0]?.cashCents ?? 0).toBe(0);
  });

  it("ranks content pieces, falling back to first touch, by title", () => {
    const leads = [
      lead({ id: "a", source_platform: "instagram", source_content_id: "p1" }),
      lead({ id: "b", source_platform: "instagram", first_touch_content_id: "p1" }),
      lead({ id: "c", source_platform: "tiktok", source_content_id: "p2" }),
    ];
    const board = buildSourceBoard(
      leads,
      [],
      leads,
      new Map([
        ["p1", "Why your salary is capped"],
        ["p2", "3 interview mistakes"],
      ]),
    );
    expect(board.content.map((c) => [c.name, c.leads])).toEqual([
      ["Why your salary is capped", 2],
      ["3 interview mistakes", 1],
    ]);
  });
});
