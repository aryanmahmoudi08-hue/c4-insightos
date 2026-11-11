import { describe, expect, it } from "vitest";
import {
  cardTitle,
  groupLeadsByStage,
  sortStages,
  stageForLeadStatus,
  upcomingCall,
  type BoardCall,
  type BoardLead,
  type BoardStage,
} from "./crm-board";

const NOW = new Date("2026-11-11T12:00:00Z");

function call(p: Partial<BoardCall>): BoardCall {
  return {
    id: "c",
    scheduled_for: null,
    status: "booked",
    cancelled: false,
    calendly_cancel_url: null,
    calendly_reschedule_url: null,
    ...p,
  };
}

function lead(p: Partial<BoardLead>): BoardLead {
  return {
    id: "l",
    full_name: null,
    email: null,
    phone: null,
    crm_stage_id: null,
    ticket_tier: null,
    source_platform: null,
    assigned_setter_id: null,
    created_at: null,
    ...p,
  };
}

function stage(p: Partial<BoardStage>): BoardStage {
  return { id: "s", name: "Stage", position: 1, is_closed_won: false, is_closed_lost: false, ...p };
}

describe("upcomingCall", () => {
  it("returns null when there are no calls", () => {
    expect(upcomingCall([], NOW)).toBeNull();
    expect(upcomingCall(null, NOW)).toBeNull();
  });

  it("ignores calls in the past", () => {
    const past = call({ id: "past", scheduled_for: "2026-11-10T12:00:00Z" });
    expect(upcomingCall([past], NOW)).toBeNull();
  });

  it("ignores cancelled calls even when they are in the future", () => {
    const c = call({ id: "x", scheduled_for: "2026-11-12T12:00:00Z", cancelled: true });
    expect(upcomingCall([c], NOW)).toBeNull();
  });

  it("ignores a future call whose status says cancelled or rescheduled", () => {
    const a = call({ id: "a", scheduled_for: "2026-11-12T12:00:00Z", status: "cancelled" });
    const b = call({ id: "b", scheduled_for: "2026-11-12T12:00:00Z", status: "rescheduled" });
    expect(upcomingCall([a, b], NOW)).toBeNull();
  });

  it("ignores a call with no scheduled time", () => {
    expect(upcomingCall([call({ id: "n", scheduled_for: null })], NOW)).toBeNull();
  });

  it("returns the soonest future call when several qualify", () => {
    const later = call({ id: "later", scheduled_for: "2026-11-20T12:00:00Z" });
    const sooner = call({ id: "sooner", scheduled_for: "2026-11-12T09:00:00Z" });
    expect(upcomingCall([later, sooner], NOW)?.id).toBe("sooner");
  });
});

describe("groupLeadsByStage", () => {
  const stages = [stage({ id: "s1", position: 1 }), stage({ id: "s2", position: 2 })];

  it("buckets leads into their stage", () => {
    const { byStage, unplaced } = groupLeadsByStage(
      [lead({ id: "a", crm_stage_id: "s1" }), lead({ id: "b", crm_stage_id: "s2" })],
      stages,
    );
    expect(byStage.get("s1")!.map((l) => l.id)).toEqual(["a"]);
    expect(byStage.get("s2")!.map((l) => l.id)).toEqual(["b"]);
    expect(unplaced).toEqual([]);
  });

  it("gives every stage a bucket even when empty", () => {
    const { byStage } = groupLeadsByStage([], stages);
    expect(byStage.get("s1")).toEqual([]);
    expect(byStage.get("s2")).toEqual([]);
  });

  it("reports leads with no stage as unplaced rather than dropping them", () => {
    const { unplaced } = groupLeadsByStage([lead({ id: "a", crm_stage_id: null })], stages);
    expect(unplaced.map((l) => l.id)).toEqual(["a"]);
  });

  it("reports a lead pointing at another pipeline's stage as unplaced", () => {
    const { byStage, unplaced } = groupLeadsByStage(
      [lead({ id: "a", crm_stage_id: "elsewhere" })],
      stages,
    );
    expect(unplaced.map((l) => l.id)).toEqual(["a"]);
    expect(byStage.get("s1")).toEqual([]);
  });

  it("orders each column newest first", () => {
    const { byStage } = groupLeadsByStage(
      [
        lead({ id: "old", crm_stage_id: "s1", created_at: "2026-01-01T00:00:00Z" }),
        lead({ id: "new", crm_stage_id: "s1", created_at: "2026-11-01T00:00:00Z" }),
      ],
      stages,
    );
    expect(byStage.get("s1")!.map((l) => l.id)).toEqual(["new", "old"]);
  });
});

describe("sortStages", () => {
  it("orders by position", () => {
    const out = sortStages([stage({ id: "b", position: 2 }), stage({ id: "a", position: 1 })]);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("falls back to name when positions collide", () => {
    const out = sortStages([
      stage({ id: "z", name: "Zeta", position: 1 }),
      stage({ id: "a", name: "Alpha", position: 1 }),
    ]);
    expect(out.map((s) => s.id)).toEqual(["a", "z"]);
  });
});

describe("cardTitle", () => {
  it("prefers the name", () => {
    expect(cardTitle(lead({ full_name: "Ada", email: "a@b.c" }))).toBe("Ada");
  });
  it("falls back to the email", () => {
    expect(cardTitle(lead({ full_name: "  ", email: "a@b.c" }))).toBe("a@b.c");
  });
  it("never returns blank", () => {
    expect(cardTitle(lead({}))).toBe("Unnamed lead");
  });
});

describe("stageForLeadStatus", () => {
  const mappings = [
    { legacy_value: "Closed", pipeline_stage_id: "stage-closed" },
    { legacy_value: "No Close", pipeline_stage_id: "stage-no-close" },
    { legacy_value: "Orphan", pipeline_stage_id: null },
  ];

  it("maps a known status to its stage", () => {
    expect(stageForLeadStatus("No Close", mappings)).toBe("stage-no-close");
  });

  it("returns null for an unmapped status rather than guessing", () => {
    expect(stageForLeadStatus("Something Else", mappings)).toBeNull();
  });

  it("returns null when the mapping exists but points nowhere", () => {
    expect(stageForLeadStatus("Orphan", mappings)).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(stageForLeadStatus(null, mappings)).toBeNull();
    expect(stageForLeadStatus("   ", mappings)).toBeNull();
  });
});
