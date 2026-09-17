import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Info, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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

const TONE_BORDER: Record<HomeTone, string> = {
  cold: "border-t-spectrum-cold",
  mid: "border-t-spectrum-mid",
  hot: "border-t-spectrum-hot",
  success: "border-t-[color:var(--color-success)]",
  warning: "border-t-[color:var(--color-warning)]",
  destructive: "border-t-destructive",
  neutral: "border-t-border",
};

/** Card shell every Home section uses — same border/radius/card surface as
 * the rest of the app, with a thin tone-colored top accent and a colored
 * icon badge instead of a flat gray icon, so sections read as distinct at a
 * glance instead of an undifferentiated stack of identical boxes. */
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
    <section
      className={cn(
        "rounded-2xl border border-t-2 border-border bg-card p-4 shadow-sm md:p-5",
        TONE_BORDER[tone],
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                TONE_BADGE[tone],
              )}
            >
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** Compact metric tile purpose-built for Home — a snapshot page, not a
 * trend page, so it deliberately skips MetricCard's chart/sparkline anatomy
 * (its "No daily series" placeholder is meant for pages that mostly do have
 * one; forcing it here just fills the page with empty dashed boxes). Same
 * typographic treatment as every other KPI surface in the app (font-sans
 * tabular-nums bold value), with a colored icon badge carrying the tone. */
export function HomeStat({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: HomeTone;
  hint?: string;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-background/40 p-3.5 transition-colors hover:border-foreground/15"
      title={hint}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
              TONE_BADGE[tone],
            )}
          >
            {icon}
          </span>
        )}
        <span className="min-w-0 truncate text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-2 font-sans text-2xl font-bold tabular-nums tracking-tight text-foreground sm:text-[1.65rem]">
        {value}
      </div>
    </div>
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
  const content = (
    <div className={cn("flex items-center gap-2.5 rounded-lg px-2 py-2", TONE_ROW_TINT[tone])}>
      <span
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
          TONE_BADGE[tone],
        )}
      >
        <ToneIcon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{label}</div>
        {detail && <div className="truncate text-2xs text-muted-foreground">{detail}</div>}
      </div>
      {to && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
    </div>
  );
  if (!to) return content;
  return (
    <Link
      to={to}
      search={search as never}
      className="-mx-2 block rounded-lg transition-colors hover:bg-muted/40"
    >
      {content}
    </Link>
  );
}

/** Honest "nothing here" row — never a fabricated zero-state pretending to be a real count of zero work. */
export function FocusEmpty({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-[color:var(--color-success)]/[0.04] px-2 py-2.5 text-xs text-muted-foreground">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      {label}
    </div>
  );
}

/** Data-unavailable row — for metrics the underlying schema genuinely doesn't support yet, distinct from "zero work today." */
export function FocusUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-xs text-muted-foreground/70">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
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
