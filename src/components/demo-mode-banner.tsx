import { FlaskConical } from "lucide-react";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { cn } from "@/lib/utils";

/**
 * Shared toggle + label for the two features that participate in the
 * isolated Demo / Preview Data system (Attribution Command Center, Calls on
 * Calendar). Toggling here flips the SAME app-wide `useDemoMode()` state —
 * every other page ignores it and always shows real data.
 */
export function DemoModeBanner({ demoMode }: { demoMode: boolean }) {
  const { setDemoMode } = useDemoMode();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs",
        demoMode
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-border/60 bg-card text-muted-foreground",
      )}
    >
      <span className="flex items-center gap-2">
        <FlaskConical className="h-3.5 w-3.5" />
        {demoMode ? (
          <span className="font-semibold">
            Demo Data Active — everything below is a deterministic fixture, not real data.
          </span>
        ) : (
          <span>Real data. Toggle Demo / Preview Data to see a fully populated example.</span>
        )}
      </span>
      <button
        type="button"
        onClick={() => setDemoMode(!demoMode)}
        className={cn(
          "rounded-full border px-3 py-1 text-3xs font-semibold uppercase tracking-wider transition",
          demoMode
            ? "border-amber-500/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
            : "border-border text-muted-foreground hover:bg-muted/40",
        )}
      >
        {demoMode ? "Exit Demo Data" : "Preview Demo Data"}
      </button>
    </div>
  );
}
