import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { DURATION, EASE, STAGGER_STEP } from "@/lib/motion-tokens";

export type BentoSpan = "hero" | "wide" | "tall" | "standard" | "compact";

// CSS Grid row-span is integer-only, so "compact" (half-height) is achieved via
// self-start + the cell's natural content height instead of a fractional span —
// two compact cells stacked next to a standard one read as roughly half its height.
const SPAN_CLASS: Record<BentoSpan, string> = {
  hero: "md:col-span-2 md:row-span-2",
  wide: "md:col-span-2 md:row-span-1",
  tall: "md:col-span-1 md:row-span-2",
  standard: "md:col-span-1 md:row-span-1",
  compact: "md:col-span-1 md:row-span-1 md:self-start",
};

const COLS_CLASS: Record<2 | 3 | 4, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

/**
 * Bento layout primitive (B1) — a responsive grid (4 columns by default, or
 * `cols` for a grid whose cells fully cover it — e.g. a 2x2 hero paired with
 * nothing else should use `cols={2}` rather than leaving two empty tracks) with
 * importance-sized cells (hero 2x2, wide 2x1, tall 1x2, standard 1x1, compact
 * 1x½). Stacks to a single column below `md`. Every direct BentoCell staggers
 * in on mount (~40ms apart, fading up) — the app-wide default entrance, not opt-in.
 * `grid-auto-flow: dense` backfills gaps a wide/tall cell would otherwise leave
 * mid-row with a later smaller cell — required whenever standard and featured
 * (wide) spans are mixed in one grid, or rows render half-empty.
 */
export function BentoGrid({ children, className, rowHeight = "9rem", cols = 4 }: { children: ReactNode; className?: string; rowHeight?: string; cols?: 2 | 3 | 4 }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("grid grid-cols-1 gap-3", COLS_CLASS[cols], className)}
      style={{ gridAutoRows: rowHeight, gridAutoFlow: "dense" }}
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: reduce ? 0 : STAGGER_STEP } } }}
    >
      {children}
    </motion.div>
  );
}

export function BentoCell({ span = "standard", children, className }: { span?: BentoSpan; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn(SPAN_CLASS[span], className)}
      variants={{
        hidden: { opacity: 0, y: reduce ? 0 : 10 },
        visible: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE.out } },
      }}
    >
      {children}
    </motion.div>
  );
}
