/**
 * Standardized acquisition-source taxonomy (the top-level dimension in the
 * lifecycle hierarchy: Acquisition Source → Campaign → Content → Placement/
 * Format → Capture Mechanism → Setter/Dialer → Booked Call → ... → Cash).
 * These are WHERE a lead actually originated — never a sales-activity/
 * capture-mechanism concept like "Outbound DM"/"Inbound DM"/"Application"/
 * "Phone call", which are separate, lower-level fields.
 *
 * "Unknown / Unattributed" is not one of the 10 standardized categories
 * itself — it's the required honest fallback for real data that doesn't map
 * to any of them (same precedent as SOCIAL_PLATFORMS in social-platform.ts),
 * so a source is never guessed into a named category it doesn't have
 * evidence for.
 */
export const ACQUISITION_SOURCES = [
  "Meta Ads",
  "TikTok",
  "Instagram",
  "YouTube",
  "LinkedIn",
  "Google",
  "Email",
  "Referral / Partner",
  "Direct / Organic",
  "Other",
  "Unknown / Unattributed",
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

const normalize = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

/**
 * Only explicit acquisition evidence is promoted into a filterable source —
 * a platform name is only ever assigned when the raw source/platform field
 * genuinely says so, never guessed from unrelated signals.
 */
export function normalizeAcquisitionSource(
  sourceType?: string | null,
  explicitSource?: string | null,
  provider?: string | null,
): AcquisitionSource {
  const explicit = normalize(explicitSource);
  const type = normalize(sourceType);
  const providerName = normalize(provider);
  const candidate = explicit || providerName;

  if (candidate === "meta ads" || candidate === "meta" || candidate.includes("facebook ads"))
    return "Meta Ads";
  if (candidate === "tiktok" || candidate === "tiktok ads" || candidate.includes("tiktok"))
    return "TikTok";
  if (candidate === "instagram" || candidate.includes("instagram")) return "Instagram";
  if (candidate === "youtube" || candidate.includes("youtube")) return "YouTube";
  if (candidate === "linkedin" || candidate.includes("linkedin")) return "LinkedIn";
  if (candidate === "google" || candidate === "google ads" || candidate.includes("google"))
    return "Google";
  if (candidate === "email" || candidate.includes("email")) return "Email";
  if (
    candidate === "referral" ||
    candidate === "partner" ||
    candidate.includes("referral") ||
    candidate.includes("partner") ||
    type === "referral"
  )
    return "Referral / Partner";
  if (candidate === "direct" || candidate === "organic" || type === "direct" || type === "organic")
    return "Direct / Organic";
  if (explicit === "other") return "Other";
  return "Unknown / Unattributed";
}

export function acquisitionSourceMatches(
  sourceType: string | null | undefined,
  selected: AcquisitionSource | "all",
  explicitSource?: string | null,
  provider?: string | null,
) {
  return (
    selected === "all" ||
    normalizeAcquisitionSource(sourceType, explicitSource, provider) === selected
  );
}

export function acquisitionSourceOptions() {
  return [...ACQUISITION_SOURCES];
}
