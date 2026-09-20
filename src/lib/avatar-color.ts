// Identity colors (per-person, categorical) — deliberately lower saturation than
// the spectrum data-language, and hue-clear of the spectrum's 230-350 arc (cold
// blue through hot pink), so a teammate avatar never reads as a data temperature.
const HUES = [40, 75, 110, 145, 178, 210];

function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

/** Deterministic per-person color — same hash AvatarInitials renders with, so
 * other UI (e.g. a multi-select highlight) can stay visually consistent with
 * a person's avatar instead of picking its own colors. Flat, single value —
 * for borders/text/accent-line uses where a gradient doesn't apply. */
export function avatarColorFor(name: string): string {
  return `oklch(0.7 0.09 ${hueFor(name)})`;
}

/** Same per-person hue as avatarColorFor, as a solid two-tone gradient
 * (light → dark, same hue, fully opaque — no color-mix dilution) for a
 * circle/chip BACKGROUND, plus a matching dark readable foreground color.
 * Used by AvatarInitials so every avatar in the app reads as a solid,
 * confident color instead of a flat low-opacity tint. */
export function avatarGradientFor(name: string): { background: string; color: string } {
  const hue = hueFor(name);
  return {
    background: `linear-gradient(135deg, oklch(0.82 0.07 ${hue}) 0%, oklch(0.68 0.1 ${hue}) 55%, oklch(0.54 0.12 ${hue}) 100%)`,
    color: `oklch(0.26 0.05 ${hue})`,
  };
}
