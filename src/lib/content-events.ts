/**
 * Content pieces as Discord events: which "edited" channel a ready piece
 * belongs in, and how its platform and time read to a person.
 *
 * Keyed on the real `content_platform` enum values ('reel', 'story_sequence',
 * 'vsl', …). The older categoryFromPlatform matched names the enum never
 * contained ('reels', 'instagram_reel', 'story'), so a real reel fell through
 * to "hooks" and a VSL counted as short-form.
 */

export type ContentForm = "short_form" | "long_form";

/**
 * Short-form is edited short video; long-form is edited long video. Static
 * formats (carousel, post), email, DMs and "other" are neither — the edited
 * channels are where an editor's cut lands, and those are not cuts.
 */
const FORM_BY_PLATFORM: Record<string, ContentForm> = {
  reel: "short_form",
  tiktok: "short_form",
  youtube_short: "short_form",
  story_sequence: "short_form",
  ad_creative: "short_form",
  youtube: "long_form",
  vsl: "long_form",
};

export function contentFormOf(platform: string | null | undefined): ContentForm | null {
  return FORM_BY_PLATFORM[(platform ?? "").toLowerCase()] ?? null;
}

export const CONTENT_FORM_EVENT: Record<ContentForm, string> = {
  short_form: "content.ready_to_post.short_form",
  long_form: "content.ready_to_post.long_form",
};

const PLATFORM_LABELS: Record<string, string> = {
  reel: "Instagram reel",
  tiktok: "TikTok",
  youtube: "YouTube",
  youtube_short: "YouTube Short",
  story_sequence: "Story sequence",
  email: "Email",
  ad_creative: "Ad creative",
  vsl: "VSL",
  carousel: "Carousel",
  post: "Post",
  dm: "DM",
  other: "Other",
};

export function platformLabel(platform: string | null | undefined): string {
  const p = (platform ?? "").trim();
  return PLATFORM_LABELS[p.toLowerCase()] ?? p;
}

/** "14:30:00" → "2:30 PM". Anything unparseable → "". */
export function timeOfDayLabel(time: string | null | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((time ?? "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  if (h > 23) return "";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** "Status: ready_to_post" → "Ready to post". */
export function statusLabel(status: string | null | undefined): string {
  const s = (status ?? "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

/** Map a content_piece platform to a routing category. */
export function categoryFromPlatform(platform: string | null | undefined): string {
  // The bare enum values ('reel', 'story_sequence', 'vsl') were missing, so
  // every real reel and story fell through to "hooks" and a VSL counted as
  // short-form. The older names stay for anything that still sends them.
  switch ((platform ?? "").toLowerCase()) {
    case "reel":
    case "instagram_reel":
    case "tiktok":
    case "youtube_short":
    case "reels":
      return "reels";
    case "story_sequence":
    case "instagram_story":
    case "story":
      return "story";
    case "email":
    case "newsletter":
      return "email";
    case "youtube":
    case "vsl":
    case "long_form":
    case "blog":
    case "podcast":
      return "long-form";
    default:
      return "hooks";
  }
}
