import { describe, expect, it } from "vitest";
import { addWeights, emptyWeights } from "./content-mechanisms";

describe("addWeights", () => {
  it("sums two full weight objects normally", () => {
    const a = { educational: 1, credibility: 2, authoritative: 3, relatability: 4 };
    const b = { educational: 10, credibility: 20, authoritative: 30, relatability: 40 };
    expect(addWeights(a, b)).toEqual({ educational: 11, credibility: 22, authoritative: 33, relatability: 44 });
  });

  it("never produces NaN when one side is missing keys (e.g. a partial DB value cast to the full type)", () => {
    // The exact shape that broke computeDemand: a stored mechanism_signals
    // value with only ONE mechanism key present, cast (not defaulted) to the
    // full MechanismWeights type at the call site.
    const partial = { relatability: 5 } as unknown as ReturnType<typeof emptyWeights>;
    const result = addWeights(emptyWeights(), partial);
    expect(result).toEqual({ educational: 0, credibility: 0, authoritative: 0, relatability: 5 });
    expect(Object.values(result).some((v) => Number.isNaN(v))).toBe(false);
  });

  it("does not let one NaN-prone key contaminate the others", () => {
    const partial = { educational: 3 } as unknown as ReturnType<typeof emptyWeights>;
    const result = addWeights({ educational: 1, credibility: 1, authoritative: 1, relatability: 1 }, partial);
    expect(result.educational).toBe(4);
    expect(result.credibility).toBe(1);
    expect(result.authoritative).toBe(1);
    expect(result.relatability).toBe(1);
  });
});
