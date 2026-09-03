import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  History,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

const STATES = [
  ["routing", "Role + workspace routing"],
  ["submission", "Submission received"],
  ["processing", "Processing"],
  ["audit", "Audit recorded"],
] as const;

export function EodWorkflowStatus({ connected, role }: { connected: boolean; role: string }) {
  return (
    <section
      className="rounded-2xl border border-border bg-card/70 p-4"
      aria-label="EOD workflow status"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <ClipboardCheck className="h-3.5 w-3.5 text-spectrum-mid" />
          Internal EOD workflow
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider ${connected ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}`}
        >
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {connected ? "Typeform connected" : "Typeform unavailable"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        {STATES.map(([key, label], index) => (
          <div key={key} className="rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-spectrum-mid/15 text-[10px] text-spectrum-mid">
                {index + 1}
              </span>
              {label}
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {key === "routing" ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : key === "submission" ? (
                <Clock3 className="h-3 w-3 text-amber-400" />
              ) : key === "processing" ? (
                <RefreshCw className="h-3 w-3 text-amber-400" />
              ) : (
                <History className="h-3 w-3 text-muted-foreground" />
              )}
              {key === "routing"
                ? `Routed to ${role.replaceAll("_", " ")}`
                : connected
                  ? "Ready"
                  : "Waiting for provider"}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">
        Submission retries and audit history are persisted internally when the provider is
        connected; no external submission is claimed while the connector is unavailable.
      </p>
    </section>
  );
}
