import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "border-border text-foreground hover:border-ring/40",
        success: "border-transparent bg-[color:var(--color-success)]/12 text-[color:var(--color-success)]",
        warning: "border-transparent bg-[color:var(--color-warning)]/12 text-[color:var(--color-warning)]",
        info: "border-transparent bg-accent/12 text-accent",
        glass: "text-foreground backdrop-blur-md border-[color:var(--glass-border)] bg-[color:var(--glass-bg)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * The 4-accent semantic system (success/warning/destructive/info) plus neutral,
 * as raw class strings — for chip-styled elements that can't be a <Badge> (e.g.
 * an editable <select> that needs to *look* like a status pill). Keeps every
 * status/priority/stage chip in the app on the exact same 5-tone palette.
 */
export type ChipTone = "default" | "success" | "warning" | "destructive" | "info";
export const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
  warning: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-accent/15 text-accent",
};

export { Badge, badgeVariants };
