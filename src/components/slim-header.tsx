import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SlimHeaderProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  accent?: "primary" | "accent" | "success" | "destructive";
}

/**
 * Slim section header replacement for the big gold DashboardBar.
 * 3px left accent border + icon + title + optional subtitle + right slot.
 */
export function SlimHeader({ icon, title, subtitle, right, accent = "accent" }: SlimHeaderProps) {
  const border = {
    primary: "border-l-primary",
    accent: "border-l-accent",
    success: "border-l-[color:var(--color-success)]",
    destructive: "border-l-destructive",
  }[accent];
  const iconTone = {
    primary: "text-primary",
    accent: "text-accent",
    success: "text-[color:var(--color-success)]",
    destructive: "text-destructive",
  }[accent];
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-r-md border-l-[3px] bg-card/40 px-4 py-2.5", border)}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className={cn("shrink-0", iconTone)}>{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight truncate">{title}</h2>
          {subtitle && <div className="text-[11px] text-muted-foreground truncate">{subtitle}</div>}
        </div>
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </div>
  );
}
