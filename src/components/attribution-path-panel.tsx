import { useState } from "react";
import { ArrowRight, GitBranch, GitMerge, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PlatformIcon } from "@/components/platform-icon";

export type AttributionPathStage = {
  key: string;
  label: string;
  value: number | null;
  detail: string;
  // Opens a records drilldown for this node (real underlying rows, via the
  // caller's own MetricDetailPanel state) — omitted when the stage has no
  // row-level data behind it (e.g. an aggregate rollup with no per-record
  // join), so it stays a plain non-interactive stat instead of a dead click.
  onOpenRecords?: () => void;
};

export type AttributionSourceNode = {
  key: string;
  label: string;
  value: number;
  onOpenRecords?: () => void;
};

export type AttributionPath = {
  id: string;
  label: string;
  /**
   * Real per-source breakdown (e.g. Instagram/TikTok/YouTube, each a real
   * count over actually-fetched rows) that merges into `stages[0]` — Priority
   * 5's core fix: without this, a single aggregate "Channel: 3" stage number
   * visually implies one linear path when the reality is several distinct
   * sources converging on the same downstream stage. Omit entirely when no
   * reliable per-record source join exists — never fabricate a split.
   */
  sources?: AttributionSourceNode[];
  stages: AttributionPathStage[];
  unavailable?: string;
};

export function AttributionPathPanel({
  title,
  subtitle,
  paths,
}: {
  title: string;
  subtitle: string;
  paths: AttributionPath[];
}) {
  const [selected, setSelected] = useState<AttributionPathStage | null>(null);
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5 text-spectrum-mid" /> {title}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="h-2 w-2 rounded-full bg-spectrum-mid shadow-[0_0_10px_var(--spectrum-mid)]" />
      </div>
      <div className="mt-4 space-y-4">
        {paths.map((path) => (
          <div key={path.id} className="rounded-lg border border-border/70 bg-background/40 p-3">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {path.label}
            </div>
            {path.unavailable ? (
              <EmptyState
                icon={<GitBranch className="h-4 w-4" />}
                title="Not Connected"
                description={path.unavailable}
              />
            ) : (
              // Fixed comfortable min-width per stage + horizontal scroll,
              // not flex-1 shrink-to-fit — a long funnel (VSL's 12 stages,
              // DM Setter's 8-stage path) was squeezing every stage down to
              // ~70-90px on a normal viewport, truncating labels/details to
              // near-illegibility. Short paths still render naturally; long
              // ones scroll instead of cramming.
              <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:overflow-x-auto md:pb-1">
                {path.sources && path.sources.length > 0 && (
                  <div className="flex flex-col gap-2 md:shrink-0 md:flex-row md:items-center">
                    {/* Real per-source breakdown, stacked vertically, merging
                        into stages[0] — never one flat "Channel: N" number
                        standing in for several actually-distinct sources. */}
                    <div className="flex flex-col gap-1 md:w-40">
                      {path.sources.map((src) => (
                        <button
                          key={src.key}
                          type="button"
                          onClick={src.onOpenRecords}
                          disabled={!src.onOpenRecords}
                          title={src.onOpenRecords ? "Click to see records" : undefined}
                          className="flex w-full items-center gap-1.5 rounded-md border border-border/70 bg-muted/20 px-2 py-1 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/40 disabled:cursor-default disabled:hover:border-border/70 disabled:hover:bg-muted/20"
                        >
                          <PlatformIcon
                            platform={src.label}
                            className="h-3 w-3 shrink-0 text-muted-foreground"
                          />
                          <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">
                            {src.label}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] font-semibold text-muted-foreground">
                            {src.value.toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div
                      className="flex items-center justify-center text-muted-foreground md:px-1"
                      title={`${path.sources.length} source${path.sources.length === 1 ? "" : "s"} merge here`}
                    >
                      <GitMerge className="h-4 w-4 rotate-90 md:rotate-0" />
                    </div>
                  </div>
                )}
                {path.stages.map((stage, index) => (
                  <div key={stage.key} className="flex items-center gap-2 md:shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        stage.onOpenRecords ? stage.onOpenRecords() : setSelected(stage)
                      }
                      title={
                        stage.onOpenRecords
                          ? `${stage.detail} — click to see records`
                          : stage.detail
                      }
                      className={`w-full min-w-0 rounded-md border border-border/70 bg-muted/20 p-2 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/40 md:w-36 ${stage.onOpenRecords ? "ring-1 ring-inset ring-spectrum-mid/20" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                          {stage.label}
                        </div>
                        {stage.onOpenRecords && (
                          <span className="shrink-0 text-[9px] text-spectrum-mid">▸</span>
                        )}
                      </div>
                      <div className="mt-1 truncate font-mono text-lg font-semibold text-foreground">
                        {stage.value == null ? "—" : stage.value.toLocaleString()}
                      </div>
                      <div className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                        {stage.detail}
                      </div>
                    </button>
                    {index < path.stages.length - 1 && (
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {selected && (
        <div className="mt-3 rounded-lg border border-spectrum-mid/30 bg-spectrum-mid/5 p-3 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{selected.label}</div>
              <div className="mt-1 text-muted-foreground">{selected.detail}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close stage details"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
