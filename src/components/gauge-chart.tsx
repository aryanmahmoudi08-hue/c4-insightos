/** Simple semi-circle arc gauge — for single 0-100 "positioning" style scores (Client DNA, health scores). */
export function GaugeChart({ value, max = 100, label, size = 120, tone = "var(--accent)" }: {
  value: number; max?: number; label?: string; size?: number; tone?: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  const startAngle = Math.PI; // 180deg (left)
  const endAngle = Math.PI - pct * Math.PI; // sweeps toward 0deg (right)
  const arcPoint = (angle: number) => [cx + r * Math.cos(angle), cy - r * Math.sin(angle)] as const;
  const [x1, y1] = arcPoint(startAngle);
  const [x2, y2] = arcPoint(endAngle);
  const [bx2, by2] = arcPoint(0);
  const largeArc = pct > 0.5 ? 1 : 0;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 1 1 ${bx2} ${by2}`} fill="none" stroke="var(--muted)" strokeWidth={10} strokeLinecap="round" />
        {pct > 0 && (
          <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`} fill="none" stroke={tone} strokeWidth={10} strokeLinecap="round" />
        )}
        <text x={cx} y={cy - 2} textAnchor="middle" className="font-mono" fontSize={size * 0.2} fontWeight={700} fill="var(--foreground)">
          {Math.round(value)}
        </text>
      </svg>
      {label && <div className="-mt-1 text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>}
    </div>
  );
}
