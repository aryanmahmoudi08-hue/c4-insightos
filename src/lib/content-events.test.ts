import { describe, expect, it } from "vitest";
import {
  categoryFromPlatform,
  contentFormOf,
  platformLabel,
  statusLabel,
  timeOfDayLabel,
} from "./content-events";

describe("contentFormOf", () => {
  it("sends edited short video to short-form", () => {
    for (const p of ["reel", "tiktok", "youtube_short", "story_sequence", "ad_creative"])
      expect(contentFormOf(p), p).toBe("short_form");
  });
  it("sends edited long video to long-form", () => {
    expect(contentFormOf("youtube")).toBe("long_form");
    expect(contentFormOf("vsl")).toBe("long_form");
  });
  it("keeps static posts, email and DMs out of both edited channels", () => {
    for (const p of ["carousel", "post", "email", "dm", "other", "", null])
      expect(contentFormOf(p as string | null)).toBeNull();
  });
});

describe("labels", () => {
  it("reads platforms, times and statuses the way a person would", () => {
    expect(platformLabel("reel")).toBe("Instagram reel");
    expect(platformLabel("youtube_short")).toBe("YouTube Short");
    expect(timeOfDayLabel("14:30:00")).toBe("2:30 PM");
    expect(timeOfDayLabel("00:05")).toBe("12:05 AM");
    expect(timeOfDayLabel("garbage")).toBe("");
    expect(statusLabel("ready_to_post")).toBe("Ready to post");
  });
});

describe("categoryFromPlatform", () => {
  it("categorises the real enum values, which it used to miss", () => {
    expect(categoryFromPlatform("reel")).toBe("reels");
    expect(categoryFromPlatform("story_sequence")).toBe("story");
    expect(categoryFromPlatform("vsl")).toBe("long-form");
  });
});
