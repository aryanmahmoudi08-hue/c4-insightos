import { useMemo, useState } from "react";

type InteractiveSparklineProps = {
  data: number[];
  labels?: string[];
  variant?: "line" | "bar";
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
};

export function InteractiveSparkline({
  data,
  labels,
  variant = "line",
  width = 220,
  height = 44,
  stroke = "currentColor",
  fill,
  strokeWidth = 1.5,
}: InteractiveSparklineProps) {
  const [active, setActive] = useState<number | null>(null);
  const points = useMemo(() => (data ?? []).filter((value) => Number.isFinite(value)), [data]);
  if (points.length === 0) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map(
    (value, index) => [index * stepX, height - ((value - min) / span) * (height - 4) - 2] as const,
  );
  const path = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const activeValue = active == null ? null : points[active];
  const activeLabel = active == null ? null : (labels?.[active] ?? `Series point ${active + 1}`);
  const barGap = 2;
  const barWidth = Math.max(2, width / points.length - barGap);

  const updateActive = (clientX: number, rect: DOMRect) => {
    const x = Math.max(0, Math.min(width, clientX - rect.left));
    const index = points.length === 1 ? 0 : Math.round((x / width) * (points.length - 1));
    setActive(index);
  };

  return (
    <div className="relative h-full w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
        onPointerMove={(event) =>
          updateActive(event.clientX, event.currentTarget.getBoundingClientRect())
        }
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label="Interactive metric history"
      >
        {variant === "bar" ? (
          points.map((value, index) => {
            const barHeight = Math.max(2, (value / max) * (height - 4));
            return (
              <rect
                key={index}
                x={index * (barWidth + barGap)}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                rx={1}
                fill={fill ?? stroke}
                opacity={active === index ? 1 : index === points.length - 1 ? 0.95 : 0.55}
              />
            );
          })
        ) : (
          <>
            {fill && <path d={area} fill={fill} opacity={0.2} />}
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {active != null && (
              <line
                x1={coords[active][0]}
                x2={coords[active][0]}
                y1={0}
                y2={height}
                stroke={stroke}
                strokeDasharray="2 2"
                opacity={0.6}
              />
            )}
            <circle
              cx={coords[coords.length - 1][0]}
              cy={coords[coords.length - 1][1]}
              r={1.8}
              fill={stroke}
            />
            {active != null && (
              <circle cx={coords[active][0]} cy={coords[active][1]} r={2.6} fill={stroke} />
            )}
          </>
        )}
        {active != null && variant === "bar" && (
          <line
            x1={active * (barWidth + barGap) + barWidth / 2}
            x2={active * (barWidth + barGap) + barWidth / 2}
            y1={0}
            y2={height}
            stroke={stroke}
            strokeDasharray="2 2"
            opacity={0.6}
          />
        )}
      </svg>
      {activeValue != null && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-lg">
          <span className="text-muted-foreground">{activeLabel}</span>
          <span className="ml-1 font-mono tabular-nums">{activeValue.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
