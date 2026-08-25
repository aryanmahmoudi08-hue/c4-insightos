import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export type StatusPill = { label: string; tone?: "default" | "success" | "warning" | "destructive" | "accent"; spectrum?: SpectrumPosition };
/** `spectrum`, when set, takes precedence over `tone` for the value + sparkline color — a funnel-position stat (B4), not a semantic-state one. */
export type HeroStat = { label: string; value: string; spark?: number[]; tone?: "default" | "success" | "warning" | "destructive"; spectrum?: SpectrumPosition };

const PILL_TONE: Record<NonNullable<StatusPill["tone"]>, string> = {
  default: "text-muted-foreground",
  success: "text-[color:var(--color-success)]",
  warning: "text-[color:var(--color-warning)]",
  destructive: "text-destructive",
  accent: "text-accent",
};

/**
 * Executive hero banner — the hero header for a module's primary route.
 * Icon + title + status pills (what's true right now) + a strip of summary
 * sparkline stats (the shape of the last N days) + a toolbar slot for
 * time-range / role-toggle / export controls.
 */
export function PageHero({
  icon, eyebrow, title, subtitle, status, stats, actions,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: StatusPill[];
  stats?: HeroStat[];
  actions?: ReactNode;
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl border p-5 shadow-lg md:p-6">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br from-foreground/[0.07] to-transparent blur-2xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && (
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-background/45 text-foreground shadow-sm">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h1 className="display-serif mt-0.5 truncate text-3xl leading-[0.96] md:text-4xl">{title}</h1>
            {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
            {status && status.length > 0 && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {status.map((s, i) => (
                  <span key={i} className={cn("badge-glass normal-case tracking-normal", s.spectrum ? SPECTRUM_TEXT_CLASS[s.spectrum] : PILL_TONE[s.tone ?? "default"])}>
                    <span className="status-dot" />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div>}
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-5 grid grid-cols-2 gap-2 border-t border-border/60 pt-4 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s, i) => {
            const toneColor = s.spectrum ? SPECTRUM_VAR[s.spectrum]
              : s.tone === "success" ? "var(--color-success)" : s.tone === "destructive" ? "var(--destructive)" : s.tone === "warning" ? "var(--color-warning)" : "var(--muted-foreground)";
            return (
              <div key={i} className="min-w-0 rounded-lg border border-border/45 bg-background/20 px-3 py-2.5">
                <div className="text-3xs uppercase tracking-[0.14em] text-muted-foreground truncate">{s.label}</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className={cn("font-mono text-base font-semibold tabular-nums", s.spectrum && SPECTRUM_TEXT_CLASS[s.spectrum])}>{s.value}</span>
                  {s.spark && s.spark.length > 1 && (
                    <span style={{ color: toneColor }}>
                      <Sparkline data={s.spark} width={48} height={16} stroke={toneColor} strokeWidth={1.25} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
