import {
  Instagram,
  Youtube,
  Linkedin,
  Facebook,
  Twitter,
  Mail,
  Music2,
  Megaphone,
  Share2,
  Globe,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { SocialPlatform } from "@/lib/social-platform";

/** One real icon per platform the spec names — no generic placeholder icon
 * standing in for a named platform. lucide-react ships no TikTok/Meta-ads
 * glyph, so those two get the closest honest stand-in (a video-note glyph
 * for TikTok, a megaphone for paid Meta media) rather than a brand mark
 * that doesn't exist in this icon set. */
const PLATFORM_ICONS: Record<SocialPlatform, LucideIcon> = {
  Instagram: Instagram,
  YouTube: Youtube,
  TikTok: Music2,
  "X / Twitter": Twitter,
  LinkedIn: Linkedin,
  Meta: Megaphone,
  Email: Mail,
  Referral: Share2,
  Facebook: Facebook,
  Other: Globe,
  "Unknown / Unattributed": HelpCircle,
};

export function PlatformIcon({
  platform,
  className = "h-3.5 w-3.5",
}: {
  /** Accepts a normalized SocialPlatform, but also a raw/already-stringified
   * platform label from call sites that only have a plain string (e.g. a
   * Set<string> built for array-index lookups) — falls back to a generic
   * icon rather than throwing on an unrecognized value. */
  platform: SocialPlatform | string;
  className?: string;
}) {
  const Icon = PLATFORM_ICONS[platform as SocialPlatform] ?? HelpCircle;
  return <Icon className={className} aria-hidden />;
}
