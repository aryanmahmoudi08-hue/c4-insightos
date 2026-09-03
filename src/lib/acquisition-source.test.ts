import { describe, expect, it } from "vitest";
import { acquisitionSourceMatches, normalizeAcquisitionSource } from "./acquisition-source";
import { normalizeSocialPlatform, platformMatches } from "./social-platform";

describe("Main Hub attribution filters", () => {
  it("normalizes explicit platform evidence without changing raw source", () => {
    const raw = "Instagram Spiderweb";
    expect(normalizeSocialPlatform(raw)).toBe("Instagram");
    expect(raw).toBe("Instagram Spiderweb");
    expect(normalizeSocialPlatform("Keyword")).toBe("Unknown / Unattributed");
  });

  it("requires explicit acquisition evidence for Meta Ads", () => {
    expect(normalizeAcquisitionSource("paid", "Meta Ads")).toBe("Meta Ads");
    expect(normalizeAcquisitionSource("organic", "Instagram")).not.toBe("Meta Ads");
    expect(normalizeAcquisitionSource("paid", "Instagram")).toBe("Unknown / Unattributed");
  });

  it("uses AND semantics for combined platform and acquisition filters", () => {
    const row = {
      raw: "Instagram Spiderweb",
      platform: "Instagram",
      source: "Meta Ads",
      type: "paid",
    };
    const matchesBoth =
      platformMatches(row.raw, "Instagram", row.platform) &&
      acquisitionSourceMatches(row.type, "Meta Ads", row.source);
    const failsPlatform =
      platformMatches(row.raw, "YouTube", row.platform) &&
      acquisitionSourceMatches(row.type, "Meta Ads", row.source);
    const failsAcquisition =
      platformMatches(row.raw, "Instagram", row.platform) &&
      acquisitionSourceMatches("organic", "Meta Ads", "Instagram");
    expect(matchesBoth).toBe(true);
    expect(failsPlatform).toBe(false);
    expect(failsAcquisition).toBe(false);
  });
});
