import type { CSSProperties } from "react";

/**
 * The cold → mid → hot funnel-position data language (B4). This is the ONLY
 * place spectrum colors are defined for component consumption — every tone-
 * bearing primitive (KpiTile, MetricCard, StatCard, PageHero) takes an
 * additive `spectrum?` prop resolved through these helpers, alongside its
 * existing semantic `tone`/`accent` prop. Never used for chrome, buttons, or
 * card backgrounds — see the design-law comment in styles.css.
 */
export type SpectrumPosition = "cold" | "mid" | "hot";

/** cold = top-of-funnel volume (views, dials, leads contacted, reach)
 *  mid  = qualified/booked (convos, sets, calls booked, applications)
 *  hot  = converted/cash (closes, cash collected, revenue, renewals) */
export const SPECTRUM_VAR: Record<SpectrumPosition, string> = {
  cold: "var(--spectrum-cold)",
  mid: "var(--spectrum-mid)",
  hot: "var(--spectrum-hot)",
};

export const SPECTRUM_TEXT_CLASS: Record<SpectrumPosition, string> = {
  cold: "text-spectrum-cold",
  mid: "text-spectrum-mid",
  hot: "text-spectrum-hot",
};

/** Translucent tint for chip-style backgrounds — mirrors CHIP_TONE_CLASSES' 15% convention. */
export const SPECTRUM_CHIP_CLASS: Record<SpectrumPosition, string> = {
  cold: "bg-spectrum-cold/15 text-spectrum-cold",
  mid: "bg-spectrum-mid/15 text-spectrum-mid",
  hot: "bg-spectrum-hot/15 text-spectrum-hot",
};

/** Soft ambient glow (box-shadow) at a card's own data temperature — for hover/lift states (B2 L2, B5). */
export function spectrumGlowStyle(position: SpectrumPosition): CSSProperties {
  const color = SPECTRUM_VAR[position];
  return { boxShadow: `0 0 0 1px color-mix(in oklch, ${color} 30%, transparent), 0 0 28px -6px color-mix(in oklch, ${color} 45%, transparent)` };
}

/** Two-stop gradient between ADJACENT spectrum positions only — cold→mid or mid→hot.
 *  Never pass ("cold","hot") directly; that's the banned three-stop-adjacent-skip pattern. */
export function spectrumGradient(from: Extract<SpectrumPosition, "cold" | "mid">, to: Extract<SpectrumPosition, "mid" | "hot">, angle = 135): string {
  return `linear-gradient(${angle}deg, ${SPECTRUM_VAR[from]}, ${SPECTRUM_VAR[to]})`;
}

/** Fade-to-transparent area-chart fill at a given spectrum position (B4 rule #5: glow, not flat fill). */
export function spectrumAreaFill(position: SpectrumPosition): string {
  const color = SPECTRUM_VAR[position];
  return `linear-gradient(180deg, color-mix(in oklch, ${color} 35%, transparent), transparent)`;
}

/** Ordinal helper for sequences (funnel stages, heatmap ramps, rank ladders) that need all three stops in order. */
export const SPECTRUM_SEQUENCE: SpectrumPosition[] = ["cold", "mid", "hot"];
