import type { ReactNode } from "react";
import { KpiCard } from "@/components/kpi-card";
import type { SpectrumPosition, KpiEmphasis } from "@/lib/spectrum";

export function StatCard({
  label,
  value,
  delta,
  accent = "primary",
  spectrum,
  emphasis,
  hint,
  icon,
  chart,
  onClick,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  accent?: "primary" | "success" | "warning" | "destructive" | "accent";
  spectrum?: SpectrumPosition;
  /** Opts this card into the gradient-KPI-card treatment — see MetricCard.
   * Reserve for the 1-3 genuinely top-tier cards on a page. */
  emphasis?: KpiEmphasis;
  hint?: ReactNode;
  icon?: ReactNode;
  chart?: ReactNode;
  onClick?: () => void;
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
      emphasis={emphasis}
      icon={icon}
      chart={chart}
      onClick={onClick}
    />
  );
}
