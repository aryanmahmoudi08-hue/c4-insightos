import type { ReactNode } from "react";
import { MetricCard } from "@/components/metric-card";
import type { SpectrumPosition } from "@/lib/spectrum";

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
  spectrum?: SpectrumPosition;
  accentColor?: string;
  icon?: ReactNode;
  trend?: ReactNode;
  chart?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
  className?: string;
};

/**
 * Compatibility adapter for existing KPI call sites. The Content Intelligence
 * MetricCard is the only canonical implementation and owns the visual anatomy.
 */
export function KpiCard({
  label,
  value,
  supporting,
  spectrum,
  accentColor,
  icon,
  trend,
  chart,
  footer,
  onClick,
  className,
}: KpiCardProps) {
  const secondary = footer ? (
    <>
      {supporting}
      {supporting && <span className="mx-1">·</span>}
      {footer}
    </>
  ) : (
    supporting
  );

  return (
    <MetricCard
      label={label}
      value={value}
      supporting={secondary}
      spectrum={spectrum}
      accentColor={accentColor}
      icon={icon}
      trend={trend}
      chart={chart}
      onClick={onClick}
      className={className}
    />
  );
}
