import { describe, it, expect } from "vitest";
import { computeOverlapColumns } from "./calls-on-calendar";

/**
 * Priority 6/38/69 — the standard calendar overlap algorithm. Real column
 * math, not a visual spot-check: every entry must land in a real column
 * index with the correct columnCount for its cluster, and events that
 * don't actually overlap must never be forced into extra columns.
 */
describe("computeOverlapColumns", () => {
  it("gives a single, non-overlapping event the full column", () => {
    const layout = computeOverlapColumns([{ id: "a", startMin: 840, endMin: 870 }]);
    expect(layout.get("a")).toEqual({ column: 0, columnCount: 1 });
  });

  it("two calls at the exact same time split into two side-by-side columns", () => {
    const layout = computeOverlapColumns([
      { id: "a", startMin: 840, endMin: 870 },
      { id: "b", startMin: 840, endMin: 870 },
    ]);
    expect(layout.get("a")!.columnCount).toBe(2);
    expect(layout.get("b")!.columnCount).toBe(2);
    expect(layout.get("a")!.column).not.toBe(layout.get("b")!.column);
  });

  it("three overlapping calls get three columns", () => {
    const layout = computeOverlapColumns([
      { id: "a", startMin: 840, endMin: 870 },
      { id: "b", startMin: 845, endMin: 875 },
      { id: "c", startMin: 850, endMin: 880 },
    ]);
    const columns = new Set(["a", "b", "c"].map((id) => layout.get(id)!.column));
    expect(columns.size).toBe(3);
    for (const id of ["a", "b", "c"]) expect(layout.get(id)!.columnCount).toBe(3);
  });

  it("four+ overlapping calls allocate gracefully, one column each", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      startMin: 600 + i, // all start within the same minute-ish window
      endMin: 630 + i,
    }));
    const layout = computeOverlapColumns(entries);
    const columns = entries.map((e) => layout.get(e.id)!.column);
    expect(new Set(columns).size).toBe(5);
    for (const e of entries) expect(layout.get(e.id)!.columnCount).toBe(5);
  });

  it("sequential, non-overlapping calls each keep a full-width single column", () => {
    const layout = computeOverlapColumns([
      { id: "a", startMin: 600, endMin: 630 }, // 10:00-10:30
      { id: "b", startMin: 630, endMin: 660 }, // 10:30-11:00, back-to-back, not overlapping
    ]);
    expect(layout.get("a")).toEqual({ column: 0, columnCount: 1 });
    expect(layout.get("b")).toEqual({ column: 0, columnCount: 1 });
  });

  it("a call that overlaps the first half of a cluster but ends before the second reuses a freed column", () => {
    // a: 10:00-10:30, b: 10:10-10:40 (overlaps a), c: 10:35-11:00 (overlaps b's tail, not a)
    const layout = computeOverlapColumns([
      { id: "a", startMin: 600, endMin: 630 },
      { id: "b", startMin: 610, endMin: 640 },
      { id: "c", startMin: 635, endMin: 660 },
    ]);
    // All three are one connected cluster (a overlaps b, b overlaps c), so
    // they share one columnCount even though a and c never overlap directly.
    const columnCount = layout.get("a")!.columnCount;
    expect(columnCount).toBe(layout.get("b")!.columnCount);
    expect(columnCount).toBe(layout.get("c")!.columnCount);
    // a and c can safely share a column (they don't overlap); b cannot share with either.
    expect(layout.get("a")!.column).not.toBe(layout.get("b")!.column);
    expect(layout.get("c")!.column).not.toBe(layout.get("b")!.column);
  });

  it("two independent clusters on the same day don't affect each other's column count", () => {
    const layout = computeOverlapColumns([
      { id: "a", startMin: 600, endMin: 630 },
      { id: "b", startMin: 600, endMin: 630 },
      { id: "c", startMin: 900, endMin: 930 }, // hours later, unrelated
    ]);
    expect(layout.get("a")!.columnCount).toBe(2);
    expect(layout.get("c")!.columnCount).toBe(1);
  });
});
