export const SOCIAL_PLATFORMS = [
  "Instagram",
  "YouTube",
  "TikTok",
  "X / Twitter",
  "LinkedIn",
  "Meta",
  "Email",
  "Referral",
  "Facebook",
  "Other",
  "Unknown / Unattributed",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

const normalizeText = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

/**
 * Maps only explicit platform evidence. Raw source remains a separate field;
 * unknown values are never promoted to a platform by guesswork.
 */
export function normalizeSocialPlatform(
  rawSource: string | null | undefined,
  explicitPlatform?: string | null,
): SocialPlatform {
  const explicit = normalizeText(explicitPlatform);
  const raw = normalizeText(rawSource);
  const candidate = explicit || raw;

  if (candidate === "other") return "Other";
  if (candidate === "instagram" || candidate.includes("instagram")) return "Instagram";
  if (candidate === "youtube" || candidate.includes("youtube")) return "YouTube";
  if (candidate === "tiktok" || candidate.includes("tiktok")) return "TikTok";
  if (
    candidate === "x / twitter" ||
    candidate === "twitter" ||
    candidate === "x" ||
    candidate.includes("twitter")
  )
    return "X / Twitter";
  if (candidate === "linkedin" || candidate.includes("linkedin")) return "LinkedIn";
  if (candidate === "meta" || candidate.includes("meta ads") || candidate.includes("facebook ads"))
    return "Meta";
  if (candidate === "email" || candidate.includes("email")) return "Email";
  if (candidate === "referral" || candidate.includes("referral")) return "Referral";
  if (candidate === "facebook" || candidate.includes("facebook")) return "Facebook";
  return "Unknown / Unattributed";
}

export function platformMatches(
  rawSource: string | null | undefined,
  selected: SocialPlatform | "all",
  explicitPlatform?: string | null,
) {
  return selected === "all" || normalizeSocialPlatform(rawSource, explicitPlatform) === selected;
}

export function socialPlatformOptions() {
  return [...SOCIAL_PLATFORMS];
}
