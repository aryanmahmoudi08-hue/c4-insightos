import type { ReactNode } from "react";
import { KpiCard } from "@/components/kpi-card";
import type { SpectrumPosition } from "@/lib/spectrum";

export function StatCard({
  label,
  value,
  delta,
  accent = "primary",
  spectrum,
  hint,
  icon,
  chart,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  accent?: "primary" | "success" | "warning" | "destructive" | "accent";
  spectrum?: SpectrumPosition;
  hint?: ReactNode;
  icon?: ReactNode;
  chart?: ReactNode;
}) {
  const accentMap: Record<string, string> = {
    primary: "var(--primary)",
    success: "var(--color-success)",
    warning: "var(--color-warning)",
    destructive: "var(--destructive)",
    accent: "var(--accent)",
  };

  return (
    <KpiCard
      label={label}
      value={value}
      supporting={hint}
      trend={delta}
      spectrum={spectrum}
      accentColor={spectrum ? undefined : accentMap[accent]}
      icon={icon}
      chart={chart}
    />
  );
}
