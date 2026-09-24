import { describe, expect, it } from "vitest";
import { exchangeMetaCodeForToken, exchangeMetaForLongLivedToken } from "./meta-oauth.server";

const APP = { appId: "app-1", appSecret: "secret-1" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("exchangeMetaCodeForToken", () => {
  it("sends the exact documented parameters, including the unchanged redirect_uri", async () => {
    let called = "";
    await exchangeMetaCodeForToken(
      { ...APP, code: "the-code", redirectUri: "https://app.example.com/api/public/oauth/meta" },
      async (input) => {
        called = String(input);
        return jsonResponse({ access_token: "short", token_type: "bearer", expires_in: 3600 });
      },
    );
    const url = new URL(called);
    expect(url.pathname).toBe("/v25.0/oauth/access_token");
    expect(url.searchParams.get("client_id")).toBe("app-1");
    expect(url.searchParams.get("client_secret")).toBe("secret-1");
    expect(url.searchParams.get("code")).toBe("the-code");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/public/oauth/meta",
    );
  });

  it("returns the token with an absolute expiry", async () => {
    const result = await exchangeMetaCodeForToken(
      { ...APP, code: "c", redirectUri: "https://x/cb" },
      async () => jsonResponse({ access_token: "short", token_type: "bearer", expires_in: 3600 }),
    );
    expect(result.accessToken).toBe("short");
    expect(result.tokenType).toBe("bearer");
    expect(new Date(result.expiresAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it("surfaces Meta's error message even when it arrives with a 200", async () => {
    await expect(
      exchangeMetaCodeForToken({ ...APP, code: "c", redirectUri: "https://x/cb" }, async () =>
        jsonResponse({ error: { message: "This authorization code has been used." } }),
      ),
    ).rejects.toThrow(/has been used/);
  });

  it("fails loudly on a non-JSON body rather than returning an empty token", async () => {
    await expect(
      exchangeMetaCodeForToken(
        { ...APP, code: "c", redirectUri: "https://x/cb" },
        async () => new Response("<html>gateway error</html>", { status: 502 }),
      ),
    ).rejects.toThrow(/non-JSON/);
  });

  it("rejects a success-shaped response with no access_token", async () => {
    await expect(
      exchangeMetaCodeForToken({ ...APP, code: "c", redirectUri: "https://x/cb" }, async () =>
        jsonResponse({ token_type: "bearer" }),
      ),
    ).rejects.toThrow(/no access_token/);
  });
});

describe("exchangeMetaForLongLivedToken", () => {
  it("uses the fb_exchange_token grant and does not send a redirect_uri", async () => {
    let called = "";
    await exchangeMetaForLongLivedToken({ ...APP, shortLivedToken: "short" }, async (input) => {
      called = String(input);
      return jsonResponse({ access_token: "long", token_type: "bearer", expires_in: 5184000 });
    });
    const url = new URL(called);
    expect(url.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(url.searchParams.get("fb_exchange_token")).toBe("short");
    expect(url.searchParams.get("redirect_uri")).toBeNull();
  });

  it("accepts a non-expiring long-lived token — null expiry, not an error", async () => {
    // Marketing API apps with Standard access get tokens with no expiry.
    const result = await exchangeMetaForLongLivedToken({ ...APP, shortLivedToken: "s" }, async () =>
      jsonResponse({ access_token: "long", token_type: "bearer" }),
    );
    expect(result.accessToken).toBe("long");
    expect(result.expiresAt).toBeNull();
  });
});
