import { useState } from "react";
import { ArrowRight, GitBranch, X } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export type AttributionPathStage = {
  key: string;
  label: string;
  value: number | null;
  detail: string;
};

export type AttributionPath = {
  id: string;
  label: string;
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
              <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
                {path.stages.map((stage, index) => (
                  <div key={stage.key} className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelected(stage)}
                      title={stage.detail}
                      className="min-w-0 flex-1 rounded-md border border-border/70 bg-muted/20 p-2 text-left transition hover:border-spectrum-mid/50 hover:bg-muted/40"
                    >
                      <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                        {stage.label}
                      </div>
                      <div className="mt-1 font-mono text-lg font-semibold text-foreground">
                        {stage.value == null ? "—" : stage.value.toLocaleString()}
                      </div>
                      <div className="mt-1 truncate text-[10px] text-muted-foreground">
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
