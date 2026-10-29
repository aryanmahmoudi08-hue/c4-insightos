import { describe, expect, it } from "vitest";
import { avatarFor, avatarNameKey } from "./avatar-url";

describe("avatarNameKey", () => {
  it("lowercases and trims", () => {
    expect(avatarNameKey("  Jamie Lee  ")).toBe("jamie lee");
  });

  it("collapses inner whitespace, which is invisible in the UI", () => {
    // A double space between first and last name renders identically but would
    // otherwise never match the profile's own key.
    expect(avatarNameKey("Jamie  Lee")).toBe("jamie lee");
    expect(avatarNameKey("Jamie\tLee")).toBe("jamie lee");
  });

  it("treats absent and whitespace-only names as no key", () => {
    expect(avatarNameKey(null)).toBeNull();
    expect(avatarNameKey(undefined)).toBeNull();
    expect(avatarNameKey("")).toBeNull();
    expect(avatarNameKey("   ")).toBeNull();
  });
});

describe("avatarFor", () => {
  const avatars = new Map([["jamie lee", "https://signed/jamie.jpg"]]);

  it("finds a photo regardless of the casing and padding it is asked with", () => {
    expect(avatarFor(avatars, "Jamie Lee")).toBe("https://signed/jamie.jpg");
    expect(avatarFor(avatars, "  JAMIE   LEE ")).toBe("https://signed/jamie.jpg");
  });

  it("returns undefined rather than throwing for someone with no photo", () => {
    // The caller renders initials on undefined, so a miss has to be quiet.
    expect(avatarFor(avatars, "Alex Stone")).toBeUndefined();
    expect(avatarFor(avatars, null)).toBeUndefined();
    expect(avatarFor(new Map(), "Jamie Lee")).toBeUndefined();
  });
});
