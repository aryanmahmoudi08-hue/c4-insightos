import type { ReactNode } from "react";
import { MetricCard } from "@/components/metric-card";
import type { SpectrumPosition, KpiEmphasis } from "@/lib/spectrum";

export type KpiCardProps = {
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
  spectrum?: SpectrumPosition;
  accentColor?: string;
  /** Opts this card into the gradient-KPI-card treatment — see MetricCard. */
  emphasis?: KpiEmphasis;
  icon?: ReactNode;
  trend?: ReactNode;
  chart?: ReactNode;
  footer?: ReactNode;
  /** `value` is an unavailable-state phrase, not a figure — see MetricCard. */
  unavailable?: boolean;
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
  emphasis,
  icon,
  trend,
  chart,
  footer,
  unavailable,
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
      emphasis={emphasis}
      icon={icon}
      trend={trend}
      chart={chart}
      unavailable={unavailable}
      onClick={onClick}
      className={className}
    />
  );
}
