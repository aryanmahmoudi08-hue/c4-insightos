/**
 * Platform/format compatibility layer.
 *
 * `content_pieces.platform` is a Postgres enum
 * (reel/tiktok/youtube/youtube_short/story_sequence/email/ad_creative/vsl/
 * carousel/post/dm/other) that historically conflates two different
 * concepts: brand platform (tiktok/youtube) and content format
 * (reel/carousel/story_sequence/...). `content_pieces.source_platform` is a
 * separate, unconstrained free-text column that was added later to hold the
 * real brand platform (Instagram/TikTok/YouTube/...).
 *
 * Splitting `platform` into two real enums/columns is a production schema
 * migration and is deliberately NOT done here. Until that migration happens
 * (with explicit sign-off), this module is the single place the UI goes to
 * answer "what platform is this?" vs "what format is this?" — every screen
 * that needs a platform-first hierarchy should route through
 * `resolvePlatform()`/`resolveFormat()` (or the pieceSocialPlatform() helper
 * in content-command-center.tsx, which already does the platform half of
 * this) rather than reading `piece.platform` directly as if it were the
 * platform.
 *
 * Going forward:
 *   - PLATFORM identity  -> source_platform (normalizeSocialPlatform)
 *   - FORMAT / placement -> the `platform` enum value (labeled via
 *     FORMAT_LABELS below)
 *
 * Format options shown in any UI must always be derived from what's actually
 * present in the loaded content pieces (see buildFormatOptions) — never from
 * a hardcoded list — so a platform never shows a format nobody has ever
 * logged.
 */

import { normalizeSocialPlatform } from "./social-platform";

/** Human labels for the `content_pieces.platform` enum when it's read as a
 * FORMAT (its actual meaning for most rows). Values with no real formats
 * (tiktok/youtube used bare, with no more specific format chosen) keep a
 * platform-flavored label since that's genuinely what was logged. */
export const FORMAT_LABELS: Record<string, string> = {
  reel: "Reels",
  story_sequence: "Story Sequences",
  carousel: "Carousels",
  post: "Posts",
  youtube: "Long-Form Video",
  youtube_short: "YouTube Shorts",
  tiktok: "TikTok Videos",
  vsl: "VSL",
  ad_creative: "Ad Creative",
  email: "Email",
  dm: "DM",
  other: "Other",
};

export function formatLabel(raw: string | null | undefined): string {
  if (!raw) return "Unidentified";
  return FORMAT_LABELS[raw] ?? raw.replace(/_/g, " ");
}

/** Canonical platform identity for a piece — source_platform first,
 * honestly falling back to Unknown / Unattributed rather than guessing from
 * the conflated `platform` enum. Thin re-export of the underlying resolver
 * so every call site in the app can import platform resolution from one
 * place. */
export function resolvePlatform(
  formatEnumValue: string | null | undefined,
  sourcePlatform?: string | null,
): string {
  return normalizeSocialPlatform(formatEnumValue ?? null, sourcePlatform ?? null);
}

/** The real format value for a piece — the `platform` enum column, read as
 * format rather than platform (see module doc comment). */
export function resolveFormat(formatEnumValue: string | null | undefined): string {
  return formatEnumValue?.trim() || "unknown";
}

/** Builds { value, label } format options scoped to whatever platform is
 * currently selected (or all pieces, when platform is "all") — always
 * derived from real logged data, never a fixed list, so a platform never
 * offers a format nobody has ever used. */
export function buildFormatOptions<T>(
  pieces: T[],
  getPlatform: (piece: T) => string,
  getFormat: (piece: T) => string,
  selectedPlatform: string,
): { value: string; label: string }[] {
  const scoped =
    selectedPlatform === "all" ? pieces : pieces.filter((p) => getPlatform(p) === selectedPlatform);
  const values = new Set(
    scoped.map((p) => getFormat(p)).filter((value) => value && value !== "unknown"),
  );
  return [...values].map((value) => ({ value, label: formatLabel(value) }));
}
