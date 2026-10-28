import { useId, useMemo, useState } from "react";

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
  width = 240,
  height = 56,
  stroke = "currentColor",
  fill,
  strokeWidth = 1.75,
}: InteractiveSparklineProps) {
  const [active, setActive] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const points = useMemo(() => (data ?? []).filter((value) => Number.isFinite(value)), [data]);
  if (points.length === 0) return null;

  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  // Headroom at the top so the peak never clips against the card edge, and a
  // sliver at the bottom so a flat series still draws a visible line rather
  // than disappearing into the card's border.
  const padTop = 6;
  const padBottom = 2;
  const plot = height - padTop - padBottom;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const coords = points.map(
    (value, index) => [index * stepX, padTop + (1 - (value - min) / span) * plot] as const,
  );
  const path = coords
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  const activeValue = active == null ? null : points[active];
  const activeLabel = active == null ? null : (labels?.[active] ?? `Series point ${active + 1}`);
  const barGap = 2;
  const barWidth = Math.max(2, width / points.length - barGap);
  const areaFill = fill ?? stroke;

  const updateActive = (clientX: number, rect: DOMRect) => {
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const index = points.length === 1 ? 0 : Math.round((x / rect.width) * (points.length - 1));
    setActive(index);
  };

  return (
    <div className="relative h-full w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        onPointerMove={(event) =>
          updateActive(event.clientX, event.currentTarget.getBoundingClientRect())
        }
        onPointerLeave={() => setActive(null)}
        role="img"
        aria-label="Interactive metric history"
      >
        <defs>
          {/* A fade-to-nothing area wash rather than a flat tint: the series
              reads as volume sitting on the card, and the card's own surface
              still shows through at the baseline so the tile doesn't end in a
              hard block of colour. */}
          <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaFill} stopOpacity="0.42" />
            <stop offset="55%" stopColor={areaFill} stopOpacity="0.14" />
            <stop offset="100%" stopColor={areaFill} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`bar-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={areaFill} stopOpacity="0.95" />
            <stop offset="100%" stopColor={areaFill} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {variant === "bar" ? (
          points.map((value, index) => {
            const barHeight = Math.max(2, ((value - min) / span) * plot + padBottom);
            return (
              <rect
                key={index}
                x={index * (barWidth + barGap)}
                y={height - barHeight}
                width={barWidth}
                height={barHeight}
                fill={`url(#bar-${gid})`}
                opacity={active === index ? 1 : active == null ? 0.9 : 0.45}
              />
            );
          })
        ) : (
          <>
            <path d={area} fill={`url(#spark-${gid})`} />
            <path
              d={path}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              // The viewBox is stretched non-uniformly to the card's width, so
              // without this the line thins or thickens with the column count.
              vectorEffect="non-scaling-stroke"
            />
            {active != null && (
              <line
                x1={coords[active][0]}
                x2={coords[active][0]}
                y1={0}
                y2={height}
                stroke={stroke}
                strokeDasharray="2 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={0.55}
              />
            )}
            {active != null && (
              <circle
                cx={coords[active][0]}
                cy={coords[active][1]}
                r={3}
                fill={stroke}
                vectorEffect="non-scaling-stroke"
              />
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
            strokeDasharray="2 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        )}
      </svg>
      {/* The latest point gets a marker drawn in HTML, not SVG: the viewBox is
          stretched non-uniformly, so an SVG circle here renders as an ellipse
          whose eccentricity depends on the card's width. */}
      {variant === "line" && (
        <span
          className="pointer-events-none absolute h-[7px] w-[7px] rounded-full"
          style={{
            left: "100%",
            top: `${(coords[coords.length - 1][1] / height) * 100}%`,
            // Pulled fully inside the right edge — the card clips its
            // overflow, so a centred marker would be sliced in half.
            transform: "translate(-110%, -50%)",
            background: stroke,
            boxShadow: `0 0 0 3px color-mix(in oklch, ${stroke} 22%, transparent)`,
          }}
          aria-hidden
        />
      )}
      {activeValue != null && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-lg">
          <span className="text-muted-foreground">{activeLabel}</span>
          <span className="ml-1 font-sans tabular-nums">{activeValue.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
