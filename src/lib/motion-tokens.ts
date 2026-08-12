/**
 * Shared motion vocabulary (B5) — every animated surface in the app pulls
 * durations/easings/springs from here instead of inventing its own numbers,
 * the same way styles.css's tokens back every color decision.
 */

export const EASE = {
  out: [0.16, 1, 0.3, 1] as const, // matches the existing .stagger-fade keyframe's cubic-bezier
  inOut: [0.65, 0, 0.35, 1] as const,
  standard: "ease" as const,
};

export const DURATION = {
  instant: 0.1,
  fast: 0.15, // hover/press feedback
  base: 0.2, // default transitions (matches styles.css's existing 150-200ms micro-interaction layer)
  moderate: 0.32,
  slow: 0.42, // entrance/reveal (matches .stagger-fade's 420ms)
  route: 0.28, // route cross-fade
};

export const SPRING = {
  /** Snappy — buttons, toggles, small UI feedback. */
  snappy: { type: "spring" as const, stiffness: 500, damping: 32 },
  /** Default — cards, dialogs, most layout animation. */
  default: { type: "spring" as const, stiffness: 300, damping: 28 },
  /** Bouncy — leaderboard rank reorders, kanban drag release (Part C5 signature moment). */
  bouncy: { type: "spring" as const, stiffness: 260, damping: 20 },
  /** Gentle — large surfaces, sheet/modal entrances. */
  gentle: { type: "spring" as const, stiffness: 220, damping: 26 },
};

/** Stagger delay per item for card-grid/list reveals — mirrors .stagger-fade's 40ms step, capped depth so long lists never animate hundreds of rows. */
export const STAGGER_STEP = 0.04;
export const STAGGER_MAX_ITEMS = 12;

/** Standard fade+drift entrance, used for route transitions and section reveals. */
export const fadeUp = (distance = 8) => ({
  initial: { opacity: 0, y: distance },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -distance },
});

/** Respects prefers-reduced-motion — callers should branch on this before passing spring/duration props to `motion` components. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
