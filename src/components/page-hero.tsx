import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/sparkline";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export type StatusPill = {
  label: string;
  tone?: "default" | "success" | "warning" | "destructive" | "accent";
  spectrum?: SpectrumPosition;
};
/** `spectrum`, when set, takes precedence over `tone` for the value + sparkline color — a funnel-position stat (B4), not a semantic-state one. */
export type HeroStat = {
  label: string;
  value: string;
  spark?: number[];
  tone?: "default" | "success" | "warning" | "destructive";
  spectrum?: SpectrumPosition;
};

const PILL_TONE: Record<NonNullable<StatusPill["tone"]>, string> = {
  default: "var(--muted-foreground)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  destructive: "var(--destructive)",
  accent: "var(--accent)",
};

/**
 * Executive hero banner — the hero header for a module's primary route.
 * Icon + title + status pills (what's true right now) + a strip of summary
 * sparkline stats (the shape of the last N days) + a toolbar slot.
 *
 * The 2026-10 revamp swapped the frosted-glass slab for a surface that
 * carries a soft wash of the brand spectrum across its own background. A
 * page opens on exactly one of these, so it is the one place in the app
 * where colour is allowed to be atmospheric rather than semantic — every
 * card below it still has to earn its colour from the data.
 */
export function PageHero({
  icon,
  eyebrow,
  title,
  subtitle,
  status,
  stats,
  actions,
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: StatusPill[];
  stats?: HeroStat[];
  actions?: ReactNode;
}) {
  const words = title.trim().split(/\s+/);
  const tail = words[words.length - 1];
  const head = words.slice(0, -1).join(" ");

  return (
    <div className="relative overflow-hidden rounded-[1.4rem] border border-border bg-card p-5 shadow-[var(--shadow-md)] md:p-6">
      {/* Two offset washes rather than one centred gradient: the warm stop
          anchors the right edge where the toolbar sits, the cool one sits
          behind the title, and the card surface shows through between them. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 150% at 2% 0%, color-mix(in oklch, var(--spectrum-mid) 28%, transparent), transparent 64%)," +
            "radial-gradient(75% 140% at 100% 105%, color-mix(in oklch, var(--spectrum-hot) 20%, transparent), transparent 68%)",
        }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon && (
            <div
              className="metric-chip grid h-12 w-12 shrink-0 place-items-center rounded-[0.9rem]"
              style={{ "--chip-color": "var(--accent)" } as CSSProperties}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {/* The last word carries the accent. A module title is almost
                always "<qualifier> <noun>" — Closer Dashboard, Content
                Intelligence, Client Results — so colouring the noun gives
                every page a consistent focal point with no per-page config,
                and a single-word title simply renders in full colour. */}
            <h1 className="display-serif mt-1 truncate text-[2.1rem] leading-[0.95] md:text-[2.6rem]">
              {head && <span>{head} </span>}
              <span className="text-spectrum-hot">{tail}</span>
            </h1>
            {subtitle && (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            )}
            {status && status.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {status.map((s, i) => (
                  <span
                    key={i}
                    className={cn("delta-pill px-2.5 py-1 text-[11px] font-semibold")}
                    style={
                      {
                        "--pill-color": s.spectrum
                          ? SPECTRUM_VAR[s.spectrum]
                          : PILL_TONE[s.tone ?? "default"],
                      } as CSSProperties
                    }
                  >
                    <span className="status-dot" />
                    {s.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start">{actions}</div>
        )}
      </div>

      {stats && stats.length > 0 && (
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 border-t border-border/70 pt-4 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s, i) => {
            const toneColor = s.spectrum
              ? SPECTRUM_VAR[s.spectrum]
              : s.tone === "success"
                ? "var(--color-success)"
                : s.tone === "destructive"
                  ? "var(--destructive)"
                  : s.tone === "warning"
                    ? "var(--color-warning)"
                    : "var(--muted-foreground)";
            return (
              <div
                key={i}
                className="min-w-0 rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
              >
                <div className="truncate text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {s.label}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "font-sans text-lg font-bold tabular-nums tracking-tight",
                      s.spectrum && SPECTRUM_TEXT_CLASS[s.spectrum],
                    )}
                  >
                    {s.value}
                  </span>
                  {s.spark && s.spark.length > 1 && (
                    <span style={{ color: toneColor }}>
                      <Sparkline
                        data={s.spark}
                        width={52}
                        height={18}
                        stroke={toneColor}
                        strokeWidth={1.5}
                      />
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
