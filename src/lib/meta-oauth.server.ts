import { META_GRAPH_VERSION, expiryFromExpiresIn } from "@/lib/oauth";

/**
 * The two network legs of Meta's authorization-code flow. Server-only: the app
 * secret must never reach a client bundle.
 *
 * `fetchImpl` is injectable for the same reason `normalizePaymentToUsd` takes
 * its rate fetcher — this codebase has no vi.mock() anywhere, so testability
 * comes from parameters.
 */

export type MetaTokenResult = {
  accessToken: string;
  tokenType: string | null;
  /** Null means the token does not expire — see expiryFromExpiresIn. */
  expiresAt: string | null;
};

type FetchImpl = typeof fetch;

/** Meta returns errors as 200-with-body in some cases and 4xx in others, so
 * both are checked rather than trusting the status alone. */
async function readTokenResponse(response: Response, leg: string): Promise<MetaTokenResult> {
  const text = await response.text();
  let body: {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    error?: { message?: string; type?: string; code?: number };
  };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Meta ${leg} returned a non-JSON response (${response.status}).`);
  }
  if (body.error) {
    throw new Error(`Meta ${leg} failed: ${body.error.message ?? body.error.type ?? "unknown"}`);
  }
  if (!response.ok) {
    throw new Error(`Meta ${leg} failed with HTTP ${response.status}.`);
  }
  if (!body.access_token) {
    throw new Error(`Meta ${leg} returned no access_token.`);
  }
  return {
    accessToken: body.access_token,
    tokenType: body.token_type ?? null,
    expiresAt: expiryFromExpiresIn(body.expires_in),
  };
}

/**
 * Leg 1 — authorization code to a short-lived user access token.
 * `redirectUri` must be byte-identical to the one used on the authorize call;
 * Meta rejects the exchange otherwise, which is why it's stored on the state
 * row rather than recomputed here.
 * https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
 */
export async function exchangeMetaCodeForToken(
  params: {
    code: string;
    appId: string;
    appSecret: string;
    redirectUri: string;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<MetaTokenResult> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("code", params.code);
  const response = await fetchImpl(url.toString());
  return readTokenResponse(response, "code exchange");
}

/**
 * Leg 2 — short-lived token to a long-lived one. Worth always doing: the
 * short-lived token expires in about an hour, which would make the connection
 * appear to work and then silently stop.
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/
 */
export async function exchangeMetaForLongLivedToken(
  params: {
    shortLivedToken: string;
    appId: string;
    appSecret: string;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<MetaTokenResult> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("fb_exchange_token", params.shortLivedToken);
  const response = await fetchImpl(url.toString());
  return readTokenResponse(response, "long-lived exchange");
}
