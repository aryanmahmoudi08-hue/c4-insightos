import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SlimHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  accent?: "primary" | "accent" | "success" | "destructive";
}

const ACCENT_VAR: Record<NonNullable<SlimHeaderProps["accent"]>, string> = {
  primary: "var(--primary)",
  accent: "var(--accent)",
  success: "var(--color-success)",
  destructive: "var(--destructive)",
};

/**
 * Section header for a band of cards.
 *
 * Previously this was a glass slab with a 3px left border — a second card
 * sitting above the cards, competing with them. A section header's whole job
 * is to divide, so it is now typographic: a tinted icon chip, a tight caps
 * title, and a hairline that runs out to the right edge and stops at the
 * controls. Nothing to look at, everything to navigate by.
 */
export function SlimHeader({ icon, title, subtitle, right, accent = "accent" }: SlimHeaderProps) {
  return (
    <div
      className="flex items-center gap-3"
      style={{ "--chip-color": ACCENT_VAR[accent] } as CSSProperties}
    >
      {icon && (
        <span className="metric-chip metric-chip-lg" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <h2
          className={cn(
            "truncate text-2xs font-bold uppercase leading-tight tracking-[0.14em] text-foreground",
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <div className="truncate text-2xs leading-tight text-muted-foreground">{subtitle}</div>
        )}
      </div>
      <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
