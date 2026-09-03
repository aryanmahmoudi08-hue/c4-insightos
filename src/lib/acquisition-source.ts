export const ACQUISITION_SOURCES = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "Organic",
  "Referral",
  "Direct",
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
 * Only explicit acquisition evidence is promoted into a filterable source.
 * A social platform is never treated as Meta Ads by inference.
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
  if (candidate === "meta ads" || candidate === "meta") return "Meta Ads";
  if (candidate === "google ads" || candidate === "google") return "Google Ads";
  if (candidate === "tiktok ads" || candidate === "tiktok") return "TikTok Ads";
  if (type === "organic") return "Organic";
  if (type === "referral") return "Referral";
  if (type === "direct") return "Direct";
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
