import type { AttributionEvidence } from "@/lib/acquisition";

type Props = {
  evidence: AttributionEvidence;
  title?: string;
  unavailableMessage?: string;
  compact?: boolean;
};

const coverageLabel: Record<AttributionEvidence["coverage"], string> = {
  direct: "Direct attribution",
  partial: "Partial attribution",
  inferred: "Inferred attribution",
  unavailable: "Unavailable attribution",
};

const strengthLabel: Record<AttributionEvidence["strength"], string> = {
  high: "Strong evidence",
  medium: "Moderate evidence",
  low: "Low-confidence evidence",
  unknown: "Evidence strength unknown",
};

export function AttributionEvidencePanel({
  evidence,
  title = "Attribution evidence",
  unavailableMessage = "No verified relationship is available for this lifecycle stage.",
  compact = false,
}: Props) {
  const unavailable = evidence.coverage === "unavailable";
  const events = evidence.supportingEvents.length
    ? evidence.supportingEvents.join(" · ")
    : unavailableMessage;

  return (
    <div className={`rounded-lg border border-border/70 bg-muted/10 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </div>
        <div className="text-3xs font-medium uppercase tracking-wider text-spectrum-mid">
          {coverageLabel[evidence.coverage]}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground">
        <span>{strengthLabel[evidence.strength]}</span>
        <span>
          {evidence.knownTouchpoints} touchpoint{evidence.knownTouchpoints === 1 ? "" : "s"}
        </span>
        <span>
          {evidence.supportingEvents.length} supporting event
          {evidence.supportingEvents.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-2 text-3xs text-muted-foreground">
        <span className="font-medium text-foreground">Model:</span>{" "}
        {evidence.model.replaceAll("_", " ")}
        {evidence.sampleSize != null && (
          <>
            <span className="mx-1.5">·</span>
            <span className="font-medium text-foreground">Sample:</span> {evidence.sampleSize}
          </>
        )}
      </div>
      <div className="mt-1 text-3xs text-muted-foreground">
        <span className="font-medium text-foreground">Evidence:</span> {events}
      </div>
      {evidence.sampleWarning && (
        <div className="mt-2 text-3xs text-amber-300">{evidence.sampleWarning}</div>
      )}
      {evidence.drilldownKey && (
        <div className="mt-1 break-all text-3xs text-muted-foreground">
          <span className="font-medium text-foreground">Drill-down:</span> {evidence.drilldownKey}
        </div>
      )}
    </div>
  );
}
