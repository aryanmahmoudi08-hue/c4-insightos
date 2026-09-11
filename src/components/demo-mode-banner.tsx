import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Status indicator for the pages that participate in the isolated Demo /
 * Preview Data system (Attribution Command Center, Calls on Calendar, and
 * whatever else Priority 5 extends this to). Read-only by design — the
 * actual ON/OFF switch lives in exactly one place, the sidebar's Dev
 * Workspace panel (app-sidebar.tsx), gated to admins only (Priority 4).
 * This banner used to carry its own independent toggle button here; that
 * gave every viewer of these pages — not just admins — a way to flip the
 * app-wide `useDemoMode()` state, which is the opposite of "Dev
 * Workspace-only." Every other page ignores this flag entirely and always
 * shows real data.
 */
export function DemoModeBanner({ demoMode }: { demoMode: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs",
        demoMode
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-border/60 bg-card text-muted-foreground",
      )}
    >
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      {demoMode ? (
        <span className="font-semibold">
          Demo Data Active — everything below is a deterministic fixture, not real data.
        </span>
      ) : (
        <span>Real data. An admin can preview a fully populated example via Dev Workspace.</span>
      )}
    </div>
  );
}
