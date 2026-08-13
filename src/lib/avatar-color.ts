// Identity colors (per-person, categorical) — deliberately lower saturation than
// the spectrum data-language, and hue-clear of the spectrum's 230-350 arc (cold
// blue through hot pink), so a teammate avatar never reads as a data temperature.
const PALETTE = [
  "oklch(0.7 0.09 40)", "oklch(0.7 0.09 75)", "oklch(0.7 0.09 110)",
  "oklch(0.7 0.09 145)", "oklch(0.7 0.09 178)", "oklch(0.7 0.09 210)",
];

/** Deterministic per-person color — same hash AvatarInitials renders with, so
 * other UI (e.g. a multi-select highlight) can stay visually consistent with
 * a person's avatar instead of picking its own colors. */
export function avatarColorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
