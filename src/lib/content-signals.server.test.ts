import { describe, expect, it } from "vitest";
import { computeDemand, computeWeeklyContentCheck } from "./content-signals.server";

/** A minimal fake Supabase client: `.from(table)` returns a proxy where every
 * chained call (.select/.eq/.gte/.limit/...) just returns itself, and
 * `await`-ing it resolves via `.then` to the configured {data, error} for
 * that table. Lets these tests deterministically simulate one query failing
 * without touching a real database. */
function mockSb(overrides: Record<string, { data: unknown; error: { message: string } | null }>) {
  return {
    from(table: string) {
      const result = overrides[table] ?? { data: [], error: null };
      const builder: unknown = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") return (resolve: (v: typeof result) => void) => resolve(result);
            return () => builder;
          },
        },
      );
      return builder;
    },
  };
}

// The whole point of this project's cold-start gating (insufficientData /
// "Not enough data") is that it must ONLY ever fire on genuinely sparse real
// data — never as a side effect of a query that silently failed. Before this
// fix, computeDemand's `faq.data ?? []` pattern made those two cases
// indistinguishable: a broken query rendered exactly like an empty one.
describe("computeDemand — a failed query throws, it never silently renders as zero/insufficient data", () => {
  it("throws when the FAQ videos query fails", async () => {
    const sb = mockSb({ faq_videos: { data: null, error: { message: "simulated failure" } } });
    await expect(computeDemand(sb as never, "org-1")).rejects.toThrow(/FAQ videos query failed/);
  });

  it("throws when the setter call signals query fails", async () => {
    const sb = mockSb({ setter_call_signals: { data: null, error: { message: "simulated failure" } } });
    await expect(computeDemand(sb as never, "org-1")).rejects.toThrow(/Setter call signals query failed/);
  });

  it("throws when the onboarding responses query fails", async () => {
    const sb = mockSb({ onboarding_responses: { data: null, error: { message: "simulated failure" } } });
    await expect(computeDemand(sb as never, "org-1")).rejects.toThrow(/Onboarding responses query failed/);
  });

  it("throws when the content pieces (reels) query fails", async () => {
    const sb = mockSb({ content_pieces: { data: null, error: { message: "simulated failure" } } });
    await expect(computeDemand(sb as never, "org-1")).rejects.toThrow(/Content pieces query failed/);
  });

  it("still succeeds with a real, correctly-flagged zero-signal result when every query genuinely returns empty (not an error)", async () => {
    const sb = mockSb({});
    const result = await computeDemand(sb as never, "org-1");
    expect(result.insufficientData).toBe(true);
    expect(result.totalWeight).toBe(0);
  });
});

describe("computeWeeklyContentCheck — same requirement", () => {
  it("throws when the content pieces query fails", async () => {
    const sb = mockSb({ content_pieces: { data: null, error: { message: "simulated failure" } } });
    await expect(computeWeeklyContentCheck(sb as never, "org-1")).rejects.toThrow();
  });

  it("throws when the content metrics query fails", async () => {
    const sb = mockSb({
      content_pieces: { data: [{ id: "p1", mechanism: "educational", variation: null, platform: "reel", posted_at: null, pipeline_status: null }], error: null },
      content_metrics: { data: null, error: { message: "simulated failure" } },
    });
    await expect(computeWeeklyContentCheck(sb as never, "org-1")).rejects.toThrow(/Content metrics query failed/);
  });
});
