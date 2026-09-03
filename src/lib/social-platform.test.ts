import { describe, expect, it } from "vitest";
import { normalizeSocialPlatform, platformMatches, SOCIAL_PLATFORMS } from "./social-platform";

describe("social platform normalization", () => {
  it("maps explicit platform-bearing sources to canonical options", () => {
    expect(normalizeSocialPlatform("Instagram Spiderweb")).toBe("Instagram");
    expect(normalizeSocialPlatform("Instagram Organic")).toBe("Instagram");
    expect(normalizeSocialPlatform("YouTube Short")).toBe("YouTube");
    expect(normalizeSocialPlatform("TikTok organic")).toBe("TikTok");
    expect(normalizeSocialPlatform("Twitter thread")).toBe("X / Twitter");
    expect(normalizeSocialPlatform("LinkedIn post")).toBe("LinkedIn");
    expect(normalizeSocialPlatform("Facebook referral")).toBe("Referral");
    expect(normalizeSocialPlatform("Meta Ads")).toBe("Meta");
    expect(normalizeSocialPlatform("Email sequence")).toBe("Email");
  });

  it("does not guess Ads, Keyword, or unknown sources", () => {
    expect(normalizeSocialPlatform("Keyword")).toBe("Unknown / Unattributed");
    expect(normalizeSocialPlatform("Referral")).toBe("Referral");
    expect(normalizeSocialPlatform("Ads")).toBe("Unknown / Unattributed");
    expect(normalizeSocialPlatform("Other")).toBe("Other");
    expect(normalizeSocialPlatform(null)).toBe("Unknown / Unattributed");
  });

  it("preserves the raw source because normalization is non-destructive", () => {
    const raw = "Instagram Spiderweb";
    expect(raw).toBe("Instagram Spiderweb");
    expect(normalizeSocialPlatform(raw)).toBe("Instagram");
  });

  it("filters all legitimate sources into canonical platform groups", () => {
    const records = [
      "Instagram Spiderweb",
      "Instagram Organic",
      "YouTube Short",
      "Keyword",
      "Referral",
      "Ads",
    ];
    expect(records.filter((source) => platformMatches(source, "Instagram"))).toEqual([
      "Instagram Spiderweb",
      "Instagram Organic",
    ]);
    expect(records.filter((source) => platformMatches(source, "YouTube"))).toEqual([
      "YouTube Short",
    ]);
    expect(records.filter((source) => platformMatches(source, "Referral"))).toEqual(["Referral"]);
    expect(records.filter((source) => platformMatches(source, "Unknown / Unattributed"))).toEqual([
      "Keyword",
      "Ads",
    ]);
    expect(SOCIAL_PLATFORMS).toContain("Unknown / Unattributed");
  });
});
