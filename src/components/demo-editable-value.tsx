import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useDemoMode } from "@/hooks/use-demo-mode";
import {
  DEMO_OVERRIDES_EVENT,
  overrideKey,
  readOverrides,
  writeOverride,
} from "@/lib/demo-overrides";
import { cn } from "@/lib/utils";

/**
 * Click-to-edit for KPI figures, active only while Mock Data is on.
 *
 * When `demoMode` is false this returns `children` untouched — no wrapper
 * element, no listener, no class. That is deliberate and load-bearing: a real
 * workspace must never render an editable metric, because a figure a user can
 * retype is a figure nobody can trust. The guard is the first statement in the
 * component so there is no path where real data becomes editable.
 */
export function DemoEditableValue({
  label,
  children,
  className,
}: {
  /** Must match the card's own label — it is half the storage key. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const { demoMode } = useDemoMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const key = overrideKey(pathname, label);

  const [override, setOverride] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Read on mount and whenever any override changes, including from the
  // "Clear demo edits" action elsewhere in the app.
  const sync = useCallback(() => setOverride(readOverrides()[key]), [key]);
  useEffect(() => {
    if (!demoMode) return;
    sync();
    window.addEventListener(DEMO_OVERRIDES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DEMO_OVERRIDES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [demoMode, sync]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!demoMode) return <>{children}</>;

  const commit = () => {
    writeOverride(key, draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        // A clickable KPI card is a <button> around this, so without these
        // the click that puts the caret in the box also fires the card's
        // drill-down and navigates away mid-edit.
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          // Escape abandons the edit rather than committing a half-typed value.
          if (e.key === "Escape") setEditing(false);
        }}
        // Sized to the value, not to the card. `w-full` stretched a two-digit
        // figure into a box across the whole tile, which read as the layout
        // having broken rather than as a field waiting for input.
        style={{ width: `${Math.max(draft.length, 3) + 1}ch` }}
        className={cn(
          "max-w-full min-w-0 rounded border border-amber-500/60 bg-amber-500/10 px-1 outline-none",
          "font-sans tabular-nums text-inherit",
          className,
        )}
        aria-label={`Demo value for ${label}`}
      />
    );
  }

  const shown = override ?? children;

  const begin = () => {
    // Seed the input with the current override if there is one, otherwise
    // the rendered text, so editing starts from what is on screen.
    setDraft(override ?? (typeof children === "string" ? children : ""));
    setEditing(true);
  };

  return (
    // A <span role="button">, not a <button>: MetricCard renders a real
    // <button> around its whole surface when the card has a drill-down, and a
    // nested button is invalid HTML whose click fires both handlers — so
    // clicking the figure to edit it also navigated to the drilldown.
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        begin();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          begin();
        }
      }}
      data-demo-editable="kpi"
      title="Demo mode — click to edit this value"
      className={cn(
        "cursor-text text-left text-inherit",
        // A dotted underline marks what is editable without competing with the
        // figure itself; amber when overridden, so an edited card is obvious
        // at a glance and nothing gets left changed by accident.
        override
          ? "underline decoration-amber-400/70 decoration-dotted underline-offset-4"
          : "hover:underline hover:decoration-muted-foreground/40 hover:decoration-dotted hover:underline-offset-4",
        className,
      )}
    >
      {shown}
    </span>
  );
}
