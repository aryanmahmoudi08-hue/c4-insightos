import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function StatCard({
  label, value, delta, accent = "primary", hint, icon,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  accent?: "primary" | "success" | "warning" | "destructive" | "accent";
  hint?: string;
  icon?: ReactNode;
}) {
  const accentMap: Record<string, string> = {
    primary: "from-primary/20 to-transparent",
    success: "from-[color:var(--color-success)]/20 to-transparent",
    warning: "from-[color:var(--color-warning)]/20 to-transparent",
    destructive: "from-destructive/20 to-transparent",
    accent: "from-accent/20 to-transparent",
  };
  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card p-4">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-60", accentMap[accent])} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular">{value}</div>
          {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
        </div>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      {delta && (
        <div className="relative mt-2 inline-flex items-center rounded-md bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {delta}
        </div>
      )}
    </div>
  );
}
