import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

// Module-level (not component-level) cursor tracker: Recharts only mounts a
// custom tooltip `content` component once it decides to show the tooltip,
// which happens on the very same mousemove event — so a listener attached
// inside that component's own `useEffect` always misses the activating
// event (it doesn't exist yet when that event fires) and only catches the
// *next* one, leaving the tooltip positionless until the mouse moves again.
// Tracking at module scope means the listener is already running well
// before any hover happens, so the position is already known the instant a
// tooltip component mounts.
let lastCursor: { x: number; y: number } | null = null;
const cursorSubscribers = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("mousemove", (e) => {
    lastCursor = { x: e.clientX, y: e.clientY };
    cursorSubscribers.forEach((fn) => fn());
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any -- call sites pass formatters typed against their own known payload shape (number/string args); `any` here (matching Recharts' own loose Formatter typing) avoids a contravariant parameter-type mismatch against every one of those narrower signatures. */
type TooltipFormatter = (
  value: any,
  name: any,
  entry: any,
  index: number,
  payload: any[],
) => ReactNode | [ReactNode, ReactNode];

type TooltipLabelFormatter = (label: any, payload: any[]) => ReactNode;
/* eslint-enable @typescript-eslint/no-explicit-any */

type RechartsPayloadEntry = {
  color?: string;
  value?: unknown;
  name?: unknown;
  dataKey?: unknown;
  payload?: unknown;
};

/**
 * Shared positioning fix for Recharts tooltip content: Recharts renders a
 * custom `content` node as a positioned child inside the chart's own DOM, so
 * it gets clipped the instant it extends past an `overflow-hidden` ancestor
 * (true of every KpiCard/MetricCard sparkline in this app), and only mounts
 * that content component once it decides to show the tooltip — the same
 * mousemove event that triggers that decision. A listener started from this
 * hook's own `useEffect` would always miss that first, activating event (the
 * component doesn't exist yet when it fires) and only catch the next one,
 * leaving the tooltip positionless until the mouse moved again. Reading from
 * the always-on module-level tracker above sidesteps that: the position is
 * already known the instant this hook's component mounts. Returns a
 * viewport-clamped `{left, top}` (fixed-position page coordinates) plus a
 * ref to attach to the rendered node so its own measured size feeds the edge
 * clamping. Any custom tooltip content component (generic or bespoke) can
 * portal itself to `document.body` at this position instead of rendering
 * in-place — that's the actual fix, not just a style tweak.
 *
 * Edge-clamp sizing is a genuine two-pass problem: both consumers below
 * render `null` (never attaching `nodeRef`) until `style` is non-null, so a
 * clamp that only trusted a *measured* `nodeRef.current` could never
 * bootstrap — the node doesn't exist yet on the render that would decide to
 * show it. The first render below clamps against an estimated 160×60 box
 * (same fallback as before) so the node actually mounts; a `useLayoutEffect`
 * then re-measures the real, just-committed node via
 * `getBoundingClientRect()` and — if it differs from the estimate — corrects
 * the clamp through state before the browser paints, so any tooltip content
 * meaningfully wider/taller than the estimate never shows a wrongly clamped
 * or clipped first frame.
 */
export function useFollowCursorTooltipPosition(active: boolean | undefined) {
  const [cursor, setCursor] = useState(lastCursor);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const onUpdate = () => setCursor(lastCursor);
    cursorSubscribers.add(onUpdate);
    onUpdate();
    return () => {
      cursorSubscribers.delete(onUpdate);
    };
  }, []);

  const style = (() => {
    if (!active || !cursor) return null as CSSProperties | null;
    const margin = 14;
    const w = measured?.w ?? nodeRef.current?.offsetWidth ?? 160;
    const h = measured?.h ?? nodeRef.current?.offsetHeight ?? 60;
    let left = cursor.x + margin;
    let top = cursor.y + margin;
    if (left + w > window.innerWidth - 8) left = cursor.x - w - margin;
    if (top + h > window.innerHeight - 8) top = cursor.y - h - margin;
    left = Math.max(8, left);
    top = Math.max(8, top);
    return { position: "fixed", left, top, zIndex: 9999, pointerEvents: "none" } as CSSProperties;
  })();

  useLayoutEffect(() => {
    if (!active || !nodeRef.current) return;
    const rect = nodeRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (rect.width === measured?.w && rect.height === measured?.h) return;
    setMeasured({ w: rect.width, h: rect.height });
    // Only the node's real size should trigger a re-measure — re-running on
    // every cursor move would just re-measure the same unchanged node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, style?.left, style?.top]);

  return { nodeRef, style };
}

/**
 * Portals arbitrary bespoke tooltip content (e.g. a rich multi-line money
 * comparison card) to `document.body`, positioned via
 * `useFollowCursorTooltipPosition` — for the handful of charts with a custom
 * `content` renderer that isn't a simple label/value list (see
 * `ChartTooltip` below for that generic case).
 */
export function FollowCursorTooltip({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const { nodeRef, style } = useFollowCursorTooltipPosition(active);
  if (!active || !style || typeof document === "undefined") return null;
  return createPortal(
    <div ref={nodeRef} style={style}>
      {children}
    </div>,
    document.body,
  );
}

/**
 * Shared Recharts tooltip content renderer — drop-in replacement for
 * `<Tooltip contentStyle={{...}} />` (`<Tooltip content={<ChartTooltip />} />`)
 * for the generic label/value-list case. Same visual style as the
 * contentStyle every chart already used; only the positioning mechanism
 * changes (see `useFollowCursorTooltipPosition`).
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
  contentStyle,
  labelStyle,
}: {
  active?: boolean;
  payload?: RechartsPayloadEntry[];
  label?: unknown;
  formatter?: TooltipFormatter;
  labelFormatter?: TooltipLabelFormatter;
  /** Merged over the shared default box style — for the handful of call
   * sites that used a slightly different background/fontSize before. */
  contentStyle?: CSSProperties;
  labelStyle?: CSSProperties;
}) {
  const { nodeRef, style } = useFollowCursorTooltipPosition(active && !!payload?.length);
  if (!active || !payload?.length || !style || typeof document === "undefined") return null;

  const resolvedLabel = labelFormatter ? labelFormatter(label, payload) : (label as ReactNode);

  return createPortal(
    <div
      ref={nodeRef}
      style={{
        ...style,
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "var(--shadow-md)",
        padding: "8px 10px",
        color: "var(--popover-foreground)",
        maxWidth: 260,
        ...contentStyle,
      }}
    >
      {resolvedLabel != null && resolvedLabel !== "" && (
        <div style={{ fontWeight: 600, marginBottom: 4, ...labelStyle }}>{resolvedLabel}</div>
      )}
      {payload.map((entry, i) => {
        let value: ReactNode = entry.value as ReactNode;
        let name: ReactNode = entry.name as ReactNode;
        if (formatter) {
          const r = formatter(entry.value, entry.name, entry, i, payload);
          if (Array.isArray(r)) [value, name] = r;
          else value = r;
        }
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {entry.color && (
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: entry.color,
                  flexShrink: 0,
                }}
              />
            )}
            {name != null && <span style={{ opacity: 0.7 }}>{name}:</span>}
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
