import type { CSSProperties } from "react";

/**
 * The cold → mid → hot funnel-position data language (B4). This is the ONLY
 * place spectrum colors are defined for component consumption — every tone-
 * bearing primitive (KpiTile, MetricCard, StatCard, PageHero) takes an
 * additive `spectrum?` prop resolved through these helpers, alongside its
 * existing semantic `tone`/`accent` prop. Not used for chrome or buttons —
 * see the design-law comment in styles.css. The one deliberate, scoped
 * exception is card BACKGROUNDS for a small number of top-tier KPIs per
 * page (`kpiGradient`/`kpiGradientBorder` below) — everywhere else the rule
 * still holds.
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
  return {
    boxShadow: `0 0 0 1px color-mix(in oklch, ${color} 30%, transparent), 0 0 28px -6px color-mix(in oklch, ${color} 45%, transparent)`,
  };
}

/** Two-stop gradient between ADJACENT spectrum positions only — cold→mid or mid→hot.
 *  Never pass ("cold","hot") directly; that's the banned three-stop-adjacent-skip pattern. */
export function spectrumGradient(
  from: Extract<SpectrumPosition, "cold" | "mid">,
  to: Extract<SpectrumPosition, "mid" | "hot">,
  angle = 135,
): string {
  return `linear-gradient(${angle}deg, ${SPECTRUM_VAR[from]}, ${SPECTRUM_VAR[to]})`;
}

/** Fade-to-transparent area-chart fill at a given spectrum position (B4 rule #5: glow, not flat fill). */
export function spectrumAreaFill(position: SpectrumPosition): string {
  const color = SPECTRUM_VAR[position];
  return `linear-gradient(180deg, color-mix(in oklch, ${color} 35%, transparent), transparent)`;
}

/** Ordinal helper for sequences (funnel stages, heatmap ramps, rank ladders) that need all three stops in order. */
export const SPECTRUM_SEQUENCE: SpectrumPosition[] = ["cold", "mid", "hot"];

/* ------------------------------------------------------------------ *
 * Gradient KPI cards — a deliberate, scoped amendment to the "never a
 * card background" rule above (see the matching note in styles.css).
 * For the small number of top-tier metrics per page (1-3, not every
 * card), the surface itself can carry a semantic gradient instead of
 * plain --card. Everything below is derived from the SAME six semantic
 * color vars the rest of the app already uses — cyan/violet/magenta are
 * the existing spectrum hues, green/amber/red reuse --success/--warning/
 * --destructive — so this introduces no new palette. Every gradient is
 * built with color-mix() blended toward the current --card/--popover
 * surface, which is what keeps it reading as "color embedded in the
 * dark [or light] surface" rather than a flat poster-color block, and
 * makes it self-adjusting between themes with no separate light/dark
 * value table: color-mix toward a dark --card lands dark, toward a
 * light --card lands light, automatically.
 * ------------------------------------------------------------------ */
export type KpiAccent = "cyan" | "violet" | "magenta" | "green" | "amber" | "red";
export type KpiEmphasis = "subtle" | "strong";

/** Friendly-name lookup for the six sanctioned KPI accents — a convenience
 * layer over kpiGradient()/kpiGradientBorder(), which take any raw CSS
 * color (so they compose with `accentColor`, the existing free-form color
 * prop already threaded through MetricCard/KpiCard/StatCard) rather than
 * being locked to this specific enum. */
export const KPI_ACCENT_VAR: Record<KpiAccent, string> = {
  cyan: SPECTRUM_VAR.cold,
  violet: SPECTRUM_VAR.mid,
  magenta: SPECTRUM_VAR.hot,
  green: "var(--success)",
  amber: "var(--warning)",
  red: "var(--destructive)",
};

/** Card-background gradient for a Tier-1/Tier-2 KPI, built from any CSS
 * color (a raw var like `var(--spectrum-hot)`/`var(--destructive)`, or
 * KPI_ACCENT_VAR[...] for a friendly name). "subtle" = a bare wash
 * (restrained, operational metrics); "strong" = the card's own accent
 * visibly dominates (the 1-3 primary executive metrics on a page). Never
 * pass this to more than a handful of cards on one page — the scarcity is
 * what makes the colored cards read as important. */
export function kpiGradient(color: string, emphasis: KpiEmphasis): string {
  return emphasis === "subtle"
    ? `linear-gradient(135deg, color-mix(in oklch, ${color} 16%, var(--card)) 0%, var(--card) 100%)`
    : `linear-gradient(135deg, color-mix(in oklch, ${color} 40%, var(--card)) 0%, color-mix(in oklch, ${color} 20%, var(--card)) 55%, color-mix(in oklch, ${color} 6%, var(--popover)) 100%)`;
}

/** Resting/hover border-color pair for a gradient KPI card — pairs with the
 * `.kpi-gradient` utility in styles.css, which owns the hover/focus
 * transition itself so every gradient card gets identical behavior. */
export function kpiGradientBorder(
  color: string,
  emphasis: KpiEmphasis,
): { border: string; borderHover: string } {
  const base = emphasis === "strong" ? 40 : 24;
  return {
    border: `color-mix(in oklch, ${color} ${base}%, transparent)`,
    borderHover: `color-mix(in oklch, ${color} ${base + 16}%, transparent)`,
  };
}
