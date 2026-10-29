import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { avatarGradientFor } from "@/lib/avatar-color";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DIMS = {
  xs: "h-5 w-5 text-4xs",
  sm: "h-7 w-7 text-3xs",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

/**
 * A person's avatar: their photo when we have one, otherwise deterministic
 * initials derived from their name.
 *
 * `photoUrl` is a signed URL — the applicant-photos bucket is private, so it
 * expires. That is also why a load failure falls back to initials rather than
 * showing a broken image: an expired or revoked URL should look like "no
 * photo", not like a bug.
 */
export function AvatarInitials({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // A row can be re-used for a different person as a list re-sorts (the
  // leaderboard literally animates rows past each other), so a previous
  // failure must not stick to whoever lands in this slot next.
  useEffect(() => setFailed(false), [photoUrl]);

  const dims = DIMS[size];

  if (photoUrl && !failed) {
    return (
      <img
        src={photoUrl}
        alt={name}
        title={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-inset ring-white/10",
          dims,
          className,
        )}
      />
    );
  }

  const { background, color } = avatarGradientFor(name || "?");
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-inset ring-white/10",
        dims,
        className,
      )}
      style={{ background, color }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
