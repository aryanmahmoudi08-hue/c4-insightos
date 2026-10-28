import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { type KpiEmphasis, type SpectrumPosition } from "@/lib/spectrum";
import { MetricCard } from "@/components/metric-card";

/**
 * Home's own semantic color language — reuses the app's existing spectrum
 * (cold/mid/hot = funnel position, per src/lib/spectrum.ts's own documented
 * convention: cold=volume/activity, mid=qualification/booking, hot=cash/
 * revenue) plus the standard success/warning/destructive tones already used
 * everywhere else (leads.tsx's ROW_TINT, badge chips, etc). No new colors.
 */
export type HomeTone = "cold" | "mid" | "hot" | "success" | "warning" | "destructive" | "neutral";

const TONE_BADGE: Record<HomeTone, string> = {
  cold: "bg-spectrum-cold/15 text-spectrum-cold",
  mid: "bg-spectrum-mid/15 text-spectrum-mid",
  hot: "bg-spectrum-hot/15 text-spectrum-hot",
  success: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
  warning: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
  destructive: "bg-destructive/15 text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

/** Raw color var per tone, for the gradient-KPI-card treatment (kpiGradient
 * in spectrum.ts) — "neutral" has none, so `emphasis` on a neutral-tone
 * HomeStat is a deliberate no-op rather than an arbitrary fallback color. */
const TONE_VAR: Partial<Record<HomeTone, string>> = {
  cold: "var(--spectrum-cold)",
  mid: "var(--spectrum-mid)",
  hot: "var(--spectrum-hot)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

/**
 * Section header for a Home block — the same anatomy the rest of the app
 * uses (accent tick, caps title, hairline out to the controls).
 *
 * Was a bordered card with a tone-coloured top edge wrapped around a grid
 * of bordered tiles: cards inside cards, four loud outlines down the page,
 * and a shape that appeared nowhere else in the product. A section header
 * divides without competing — the tiles below it are already cards.
 */
export function HomeSection({
  title,
  subtitle,
  icon,
  tone = "neutral",
  right,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  tone?: HomeTone;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div
        className="flex items-center gap-3"
        style={{ "--chip-color": TONE_VAR[tone] ?? "var(--muted-foreground)" } as CSSProperties}
      >
        {icon && (
          <span className="metric-chip metric-chip-lg" aria-hidden>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-2xs font-bold uppercase leading-tight tracking-[0.14em] text-foreground">
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-2xs leading-tight text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <span className="h-px min-w-4 flex-1 bg-border" aria-hidden />
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

/**
 * A Home metric tile — a thin adapter over MetricCard, the component every
 * other KPI in the app renders through.
 *
 * It used to be a hand-rolled tile with its own padding, its own badge and
 * its own type scale, which is most of why Home looked like a different
 * product. The one reason it existed — MetricCard's old empty state was a
 * dashed "No daily series" box, too heavy for a snapshot page — no longer
 * applies: that state is now a thin accent rule along the card's bottom
 * edge, which is exactly what these tiles want.
 */
export function HomeStat({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  emphasis,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: HomeTone;
  hint?: string;
  /** Opts this tile into the gradient-KPI-card treatment (see MetricCard) —
   * reserve for the 1 genuinely top-tier metric on a Home variant. */
  emphasis?: KpiEmphasis;
}) {
  const spectrum =
    tone === "cold" || tone === "mid" || tone === "hot" ? (tone as SpectrumPosition) : undefined;
  return (
    <MetricCard
      label={label}
      value={value}
      icon={icon}
      spectrum={spectrum}
      accentColor={spectrum ? undefined : TONE_VAR[tone]}
      emphasis={emphasis}
      supporting={hint}
      // Home is a snapshot: not one tile here has a daily series, so the
      // caption would read identically on every card.
      seriesNote={false}
    />
  );
}

const TONE_ROW_ICON: Record<HomeTone, typeof AlertTriangle> = {
  cold: Info,
  mid: Info,
  hot: Info,
  success: CheckCircle2,
  warning: Clock3,
  destructive: AlertTriangle,
  neutral: Info,
};

const TONE_ROW_TINT: Record<HomeTone, string> = {
  cold: "",
  mid: "",
  hot: "",
  success: "",
  warning: "bg-[color:var(--color-warning)]/[0.04]",
  destructive: "bg-destructive/[0.05]",
  neutral: "",
};

/**
 * One actionable row — "3 follow-ups due", "$8,000 opportunity has no next
 * step", etc. Always real data driven by the caller; this component only
 * renders it. `to`/`search` make it a real drill-down into an existing
 * route+filter rather than a dead list item. Urgent/warning rows get a
 * colored icon badge and a faint tinted background so the eye lands on
 * what actually needs attention first, not an undifferentiated list.
 */
export function FocusRow({
  tone = "neutral",
  label,
  detail,
  to,
  search,
}: {
  tone?: HomeTone;
  label: string;
  detail?: string;
  to?: string;
  search?: Record<string, string>;
}) {
  const ToneIcon = TONE_ROW_ICON[tone];
  // Each row is its own card rather than a line inside a wrapper, so a list
  // section needs no box around it — which is what let HomeSection stop
  // being one.
  const content = (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-xs)] transition-colors",
        to && "hover:border-foreground/20",
        TONE_ROW_TINT[tone],
      )}
      style={{ "--chip-color": TONE_VAR[tone] ?? "var(--muted-foreground)" } as CSSProperties}
    >
      <span className="metric-chip" aria-hidden>
        <ToneIcon />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{label}</div>
        {detail && <div className="truncate text-2xs text-muted-foreground">{detail}</div>}
      </div>
      {to && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
  if (!to) return content;
  return (
    <Link to={to} search={search as never} className="block">
      {content}
    </Link>
  );
}

/** Honest "nothing here" row — never a fabricated zero-state pretending to be a real count of zero work. */
export function FocusEmpty({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground shadow-[var(--shadow-xs)]"
      style={{ "--chip-color": "var(--success-vivid)" } as CSSProperties}
    >
      <span className="metric-chip" aria-hidden>
        <Sparkles />
      </span>
      {label}
    </div>
  );
}

/** Data-unavailable row — for metrics the underlying schema genuinely doesn't support yet, distinct from "zero work today." */
export function FocusUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground/70">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[0.5rem] bg-muted text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
      {label}
    </div>
  );
}

export function TimeframeLabel({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-3xs font-medium uppercase tracking-wider text-muted-foreground">
      <Clock3 className="h-3 w-3" />
      {children}
    </span>
  );
}

/**
 * Home's page shape: measures on the left, things to act on down a
 * narrower right rail.
 *
 * Home was a single column of full-width bands — on a wide screen that is
 * a long scroll past a lot of empty margin, and it gave every section the
 * same weight, so nothing led. Splitting it puts the numbers and the queue
 * side by side the way they are actually read: glance left, act right.
 * Collapses to one column below lg, main first.
 */
export function HomeGrid({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <div className="space-y-5">{main}</div>
      <div className="space-y-5">{side}</div>
    </div>
  );
}
