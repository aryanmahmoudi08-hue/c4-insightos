/**
 * Provider-neutral OAuth authorization-code helpers.
 *
 * Pure on purpose — no network, no Supabase — so the parts that are easy to
 * get subtly wrong (CSRF state lifecycle, expiry arithmetic, URL assembly) are
 * unit-testable without a live provider app. The network legs live in
 * `*-oauth.server.ts`.
 */

/** How long an issued `state` stays usable. Long enough for a human to read a
 * consent screen, short enough that a leaked nonce is near-useless. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

/** Refresh this far ahead of expiry, so a token is never first discovered to
 * be dead by a user-facing sync failing. */
export const OAUTH_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;

export type OAuthStateRow = {
  expires_at: string;
  consumed_at: string | null;
};

/** 256 bits of CSRF nonce, URL-safe. Uses Web Crypto so the same code runs on
 * the Cloudflare Worker runtime as in Node. */
export function generateOAuthState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A state row is only good once, and only inside its window. Both halves
 * matter: expiry alone still lets a replayed callback through. */
export function isOAuthStateUsable(row: OAuthStateRow, now: Date = new Date()): boolean {
  if (row.consumed_at) return false;
  const expires = new Date(row.expires_at).getTime();
  return Number.isFinite(expires) && expires > now.getTime();
}

export function oauthStateExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + OAUTH_STATE_TTL_MS).toISOString();
}

/**
 * Absolute expiry from a provider's relative `expires_in` (seconds).
 *
 * Returns null when the provider omits it or reports 0 — for Meta that is a
 * real, documented state (apps with Standard access to the Marketing API get
 * long-lived tokens with no expiry), not missing data. Callers must treat null
 * as "does not expire", never as "expired".
 */
export function expiryFromExpiresIn(
  expiresIn: number | null | undefined,
  now: Date = new Date(),
): string | null {
  if (expiresIn === null || expiresIn === undefined) return null;
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) return null;
  return new Date(now.getTime() + expiresIn * 1000).toISOString();
}

/** Null expiry never needs refreshing. Anything inside the margin does. */
export function needsRefresh(
  expiresAt: string | null,
  now: Date = new Date(),
  marginMs: number = OAUTH_REFRESH_MARGIN_MS,
): boolean {
  if (!expiresAt) return false;
  const expires = new Date(expiresAt).getTime();
  if (!Number.isFinite(expires)) return true;
  return expires - now.getTime() <= marginMs;
}

/** Graph API version this integration is pinned to. Meta dates its versions
 * and changes behaviour between them, so this is explicit rather than
 * defaulting to "latest" and shifting under us. */
export const META_GRAPH_VERSION = "v25.0";

/** Read-only: this integration pulls campaign spend and never manages ads. */
export const META_ADS_SCOPES = ["ads_read"];

/**
 * Meta's authorization dialog URL.
 * https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/
 */
export function buildMetaAuthorizeUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
}): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", (params.scopes ?? META_ADS_SCOPES).join(","));
  return url.toString();
}

/** The redirect URI registered with the provider and reused verbatim at
 * exchange time — Meta rejects the exchange if the two differ. */
export function metaRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/public/oauth/meta`;
}
