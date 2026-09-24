import { describe, expect, it } from "vitest";
import {
  META_GRAPH_VERSION,
  OAUTH_STATE_TTL_MS,
  buildMetaAuthorizeUrl,
  expiryFromExpiresIn,
  generateOAuthState,
  isOAuthStateUsable,
  metaRedirectUri,
  needsRefresh,
  oauthStateExpiry,
} from "./oauth";

const NOW = new Date("2026-09-24T12:00:00.000Z");

describe("oauth state", () => {
  it("generates distinct, URL-safe, high-entropy nonces", () => {
    const a = generateOAuthState();
    const b = generateOAuthState();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes base64url, unpadded
    expect(a.length).toBeGreaterThanOrEqual(42);
  });

  it("accepts a fresh, unconsumed state", () => {
    expect(isOAuthStateUsable({ expires_at: oauthStateExpiry(NOW), consumed_at: null }, NOW)).toBe(
      true,
    );
  });

  it("rejects a replayed state even when it is still inside its window", () => {
    expect(
      isOAuthStateUsable(
        { expires_at: oauthStateExpiry(NOW), consumed_at: "2026-09-24T12:00:01.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects an expired state", () => {
    const expired = new Date(NOW.getTime() - 1000).toISOString();
    expect(isOAuthStateUsable({ expires_at: expired, consumed_at: null }, NOW)).toBe(false);
  });

  it("expires exactly one TTL out", () => {
    expect(new Date(oauthStateExpiry(NOW)).getTime() - NOW.getTime()).toBe(OAUTH_STATE_TTL_MS);
  });
});

describe("token expiry", () => {
  it("converts a relative expires_in to an absolute instant", () => {
    expect(expiryFromExpiresIn(3600, NOW)).toBe("2026-09-24T13:00:00.000Z");
  });

  it("treats a missing or zero expires_in as no-expiry, not as expired", () => {
    // Meta issues non-expiring long-lived tokens to Marketing API apps with
    // Standard access — null here is a real state, not absent data.
    expect(expiryFromExpiresIn(undefined, NOW)).toBeNull();
    expect(expiryFromExpiresIn(null, NOW)).toBeNull();
    expect(expiryFromExpiresIn(0, NOW)).toBeNull();
    expect(needsRefresh(null, NOW)).toBe(false);
  });

  it("flags a token inside the refresh margin, and leaves a distant one alone", () => {
    const inThreeDays = new Date(NOW.getTime() + 3 * 864e5).toISOString();
    const inSixtyDays = new Date(NOW.getTime() + 60 * 864e5).toISOString();
    expect(needsRefresh(inThreeDays, NOW)).toBe(true);
    expect(needsRefresh(inSixtyDays, NOW)).toBe(false);
  });

  it("treats an already-expired or unparseable expiry as needing refresh", () => {
    expect(needsRefresh(new Date(NOW.getTime() - 1000).toISOString(), NOW)).toBe(true);
    expect(needsRefresh("not-a-date", NOW)).toBe(true);
  });
});

describe("meta authorize url", () => {
  it("includes the CSRF state, pinned version, and read-only scope", () => {
    const url = new URL(
      buildMetaAuthorizeUrl({
        appId: "123",
        redirectUri: "https://app.example.com/api/public/oauth/meta",
        state: "nonce-abc",
      }),
    );
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/dialog/oauth`);
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("state")).toBe("nonce-abc");
    expect(url.searchParams.get("response_type")).toBe("code");
    // read-only: this integration pulls spend, it never manages ads
    expect(url.searchParams.get("scope")).toBe("ads_read");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/public/oauth/meta",
    );
  });

  it("builds a redirect uri that matches the callback route, without a double slash", () => {
    expect(metaRedirectUri("https://app.example.com")).toBe(
      "https://app.example.com/api/public/oauth/meta",
    );
    expect(metaRedirectUri("https://app.example.com/")).toBe(
      "https://app.example.com/api/public/oauth/meta",
    );
  });
});
