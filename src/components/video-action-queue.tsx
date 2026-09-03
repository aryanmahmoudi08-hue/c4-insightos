import { AlertTriangle, CheckCircle2, PlayCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function VideoActionQueue({
  providerAvailable,
  mediaCount,
}: {
  providerAvailable: boolean;
  mediaCount: number;
}) {
  const actions = providerAvailable
    ? [
        ["Retention review", "Review completion and drop-off timestamps for each active VSL."],
        ["CTA review", "Confirm CTA events are present before comparing viewer conversion."],
        [
          "Conversion joins",
          "Trace viewer → lead → booking → close → revenue only where IDs are verified.",
        ],
      ]
    : [
        [
          "Connect Wistia",
          "Wistia is not connected; retention, completion, CTA, and viewer conversion telemetry are unavailable.",
        ],
      ];
  return (
    <section
      className="rounded-xl border border-border bg-card/70 p-4"
      aria-label="Video action queue"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <PlayCircle className="h-3.5 w-3.5 text-spectrum-mid" />
          Video action queue
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          {providerAvailable ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-3 w-3 text-amber-400" />
          )}
          {providerAvailable ? `${mediaCount} media records` : "Wistia unavailable"}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {actions.map(([title, description]) => (
          <div key={title} className="rounded-lg border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <AlertTriangle
                className={`h-3.5 w-3.5 ${providerAvailable ? "text-cyan-400" : "text-amber-400"}`}
              />
              {title}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
