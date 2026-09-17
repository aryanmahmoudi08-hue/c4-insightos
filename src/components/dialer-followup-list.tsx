import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock3, PhoneCall, Sparkles } from "lucide-react";
import { useDialerCallbacks, type CallbackRow } from "@/hooks/use-dialer-callbacks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function sortByDueSoonest(rows: CallbackRow[]) {
  return [...rows].sort((a, b) => {
    if (!a.due_at && !b.due_at) return 0;
    if (!a.due_at) return 1;
    if (!b.due_at) return -1;
    return a.due_at.localeCompare(b.due_at);
  });
}

function dueInfo(dueAt: string | null) {
  if (!dueAt) return { label: "No time set", tone: "neutral" as const };
  const today = new Date().toISOString().slice(0, 10);
  const overdue = new Date(dueAt).getTime() < Date.now();
  const isToday = dueAt.slice(0, 10) === today;
  const label = new Date(dueAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  if (overdue) return { label, tone: "destructive" as const, tag: "Overdue" };
  if (isToday) return { label, tone: "hot" as const, tag: "Due today" };
  return { label, tone: "cold" as const };
}

const TONE_CLASS: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/15 text-destructive",
  hot: "bg-spectrum-hot/15 text-spectrum-hot",
  cold: "bg-spectrum-cold/15 text-spectrum-cold",
};

/**
 * Just the rows — no outer card, so a caller with its own section/card
 * chrome (Home's HomeSection, the Inbound Dialer dashboard's own card
 * style) can wrap it however fits that page. Reused inside
 * DialerCallbackFab's own drawer too, so the "who + when" list is visible
 * in both places off the same live data (useDialerCallbacks).
 */
export function DialerFollowUpRows({
  orgId,
  devBypass,
  limit,
}: {
  orgId: string;
  devBypass: boolean;
  limit?: number;
}) {
  const { openCallbacks, completeCallback } = useDialerCallbacks(orgId, devBypass);
  const sorted = sortByDueSoonest(openCallbacks);
  const shown = limit ? sorted.slice(0, limit) : sorted;

  if (sorted.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-[color:var(--color-success)]/[0.04] px-2 py-2.5 text-xs text-muted-foreground">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]">
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        No follow-up calls queued.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {shown.map((c) => {
        const due = dueInfo(c.due_at);
        const ToneIcon = due.tone === "destructive" ? AlertTriangle : PhoneCall;
        return (
          <div
            key={c.id}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2 py-2",
              due.tone === "destructive" && "bg-destructive/[0.05]",
              due.tone === "hot" && "bg-spectrum-hot/[0.05]",
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                TONE_CLASS[due.tone],
              )}
            >
              <ToneIcon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              {c.entity_id ? (
                <Link
                  to="/leads"
                  search={{ leadId: c.entity_id }}
                  className="block truncate text-sm text-foreground hover:underline"
                >
                  {c.payload?.lead_name ?? "Unnamed lead"}
                </Link>
              ) : (
                <div className="truncate text-sm text-foreground">
                  {c.payload?.lead_name ?? "Unnamed lead"}
                </div>
              )}
              <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <Clock3 className="h-3 w-3 shrink-0" />
                <span className="truncate">{due.label}</span>
                {due.tag && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide",
                      TONE_CLASS[due.tone],
                    )}
                  >
                    {due.tag}
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-2xs"
              disabled={completeCallback.isPending}
              onClick={() => completeCallback.mutate(c.id)}
            >
              Mark completed
            </Button>
          </div>
        );
      })}
      {limit && sorted.length > limit && (
        <div className="pt-1 text-2xs text-muted-foreground">
          +{sorted.length - limit} more queued — open Log Callback to see the full list.
        </div>
      )}
    </div>
  );
}
