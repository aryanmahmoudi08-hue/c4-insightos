interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  /** "line" (default) draws a trend path + soft fill; "bar" draws mini bars — better for discrete/count data. */
  variant?: "line" | "bar";
}

/**
 * Tiny inline sparkline. No axes, no tooltip — just trend at a glance.
 * Auto-scales to its own min/max. Renders an SVG path + soft area fill, or mini bars.
 */
export function Sparkline({
  data,
  width = 80,
  height = 22,
  stroke = "currentColor",
  fill,
  strokeWidth = 1.5,
  variant = "line",
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div style={{ width, height }} className="opacity-20" />;
  }
  if (variant === "bar") {
    const max = Math.max(...data, 1);
    const gap = 2;
    const barW = Math.max(1.5, data.length ? width / data.length - gap : width);
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {data.map((v, i) => {
          const h = Math.max(1, (v / max) * (height - 2));
          const x = i * (barW + gap);
          return (
            <rect key={i} x={x} y={height - h} width={barW} height={h} rx={1}
              fill={fill ?? stroke} opacity={i === data.length - 1 ? 1 : 0.55} />
          );
        })}
      </svg>
    );
  }
  const pts = data.length === 1 ? [data[0], data[0]] : data;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = pts.length > 1 ? width / (pts.length - 1) : width;
  const coords = pts.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * (height - 2) - 1;
    return [x, y] as const;
  });
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const last = coords[coords.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && <path d={area} fill={fill} opacity={0.25} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={1.8} fill={stroke} />
    </svg>
  );
}
