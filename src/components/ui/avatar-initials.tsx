import { cn } from "@/lib/utils";

// Identity colors (per-person, categorical) — deliberately lower saturation than
// the spectrum data-language, and hue-clear of the spectrum's 230-350 arc (cold
// blue through hot pink), so a teammate avatar never reads as a data temperature.
const PALETTE = [
  "oklch(0.7 0.09 40)", "oklch(0.7 0.09 75)", "oklch(0.7 0.09 110)",
  "oklch(0.7 0.09 145)", "oklch(0.7 0.09 178)", "oklch(0.7 0.09 210)",
];

function hashHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic initials avatar — no photo storage in this app, so every "avatar" is derived from the name. */
export function AvatarInitials({ name, size = "md", className }: { name: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const dims = { xs: "h-5 w-5 text-4xs", sm: "h-7 w-7 text-3xs", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  const color = hashHue(name || "?");
  return (
    <div
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-inset ring-white/10", dims, className)}
      style={{ background: `color-mix(in oklch, ${color} 22%, var(--muted))`, color }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
