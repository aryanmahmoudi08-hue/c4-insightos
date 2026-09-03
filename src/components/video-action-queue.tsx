import { AlertTriangle, CheckCircle2, PlayCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type VideoActionQueueStatus = "queued" | "running" | "won" | "lost" | "dismissed";

export type VideoActionQueueItem = {
  vsl_id: string;
  vsl_name: string;
  action: string;
  reason: string;
  status: VideoActionQueueStatus;
  recommendation_id: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  connect_provider: "Connect Wistia",
  review_retention: "Review retention",
  review_cta: "Review CTA",
  review_conversion: "Review conversion joins",
};

const STATUS_OPTIONS: VideoActionQueueStatus[] = ["queued", "running", "won", "lost", "dismissed"];

/**
 * Real, per-video action queue driven by deriveVideoActionQueue
 * (src/lib/media-intelligence.ts) against each VSL's actual latest snapshot
 * and CRM-tagged lead/call counts — no generic, always-shown copy.
 */
export function VideoActionQueue({
  items,
  providerAvailable,
  mediaCount,
  onStatusChange,
}: {
  items: VideoActionQueueItem[];
  providerAvailable: boolean;
  mediaCount: number;
  onStatusChange?: (item: VideoActionQueueItem, status: VideoActionQueueStatus) => void;
}) {
  const active = items.filter((item) => item.status !== "dismissed" && item.status !== "won");
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
      {active.length === 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No open actions — every VSL either clears its review thresholds or has no telemetry to
          review yet.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {active.map((item) => (
            <div
              key={`${item.vsl_id}:${item.action}`}
              className="rounded-lg border border-border/60 bg-muted/10 p-3"
            >
              <div className="flex items-center gap-2 text-xs font-medium">
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 ${item.action === "connect_provider" ? "text-amber-400" : "text-cyan-400"}`}
                />
                <span className="truncate">{ACTION_LABEL[item.action] ?? item.action}</span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {item.vsl_name}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {item.reason}
              </p>
              {onStatusChange && (
                <Select
                  value={item.status}
                  onValueChange={(v) => onStatusChange(item, v as VideoActionQueueStatus)}
                >
                  <SelectTrigger className="mt-2 h-7 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status} className="text-[10px] capitalize">
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
