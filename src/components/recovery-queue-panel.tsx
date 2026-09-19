import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import {
  RECOVERY_BUCKET_LABELS,
  type RecoveryBucketKey,
  type ReconciledRecoveryRow,
  type StaleRecoveryRow,
  type RecoveryItemRow,
} from "@/lib/mentee-payments";

// Trimmed from six actions (reminder/retry/promise/check-in/resolved/
// escalate) to the two that actually get used — retry/promise/check-in/
// escalate had no automation or provider behind them (same "Provider
// execution unavailable" reality as everything else here), so a dedicated
// button per one just added noise. `next_action` stores this exact label —
// "Reminder sent" (not "Send reminder") so the row's own "Last action" field
// and the activity-log entry read as a completed fact, matching a checkbox.
export const RECOVERY_ACTIONS = [
  { key: "reminder", label: "Reminder sent" },
  { key: "resolved", label: "Mark resolved" },
] as const;
export type RecoveryActionKey = (typeof RECOVERY_ACTIONS)[number]["key"];

const BUCKET_ORDER: RecoveryBucketKey[] = [
  "failed_today",
  "retry_pending",
  "due_next_3d",
  "overdue_1_7",
  "overdue_8_30",
  "overdue_30_plus",
  "promise_to_pay_today",
  "high_value_outstanding",
];

function money(cents: number | null | undefined) {
  return cents == null ? "Unavailable" : `$${Math.round(cents / 100).toLocaleString()}`;
}

export type RecoveryCommsInfo = { label: string; tone: "queued" | "sent" };

/**
 * The single canonical Recovery Queue — replaces the old, separate "Failed &
 * At-Risk Payments" ledger table and MenteeOperationsPanel's own recovery
 * section. Rows come from `reconcileRecoveryQueue()` (src/lib/mentee-
 * payments.ts), the one function that decides what's active vs. stale, so
 * this list and the ledger's "Failed & At-Risk" stat card can never
 * disagree — both read the exact same reconciled result. Purely
 * presentational: the parent owns the queries/mutation so there's one
 * `payment_recovery_items` write path, not a second one duplicated here.
 */
export function RecoveryQueuePanel({
  active,
  stale,
  onAction,
  onClearStale,
  actionPending,
  onOpenMentee,
  commsByClient,
}: {
  active: ReconciledRecoveryRow[];
  stale: StaleRecoveryRow[];
  onAction: (row: ReconciledRecoveryRow, actionKey: RecoveryActionKey) => void;
  onClearStale: (item: RecoveryItemRow) => void;
  actionPending: boolean;
  onOpenMentee?: (client: { id: string }) => void;
  commsByClient?: Map<string, RecoveryCommsInfo>;
}) {
  const [bucketFilter, setBucketFilter] = useState<RecoveryBucketKey | "all">("all");
  const [showStale, setShowStale] = useState(false);
  // Immediate checked feedback for the click that just happened, ahead of
  // the mutation's own refetch landing — real persisted state
  // (`next_action`) still wins once that arrives. For "resolved" there's no
  // persisted "checked" state to read at all (the row leaves `active` once
  // resolved), so this is the only thing that ever shows it checked, briefly,
  // before the row disappears.
  const [justChecked, setJustChecked] = useState<Set<string>>(new Set());
  const fireAction = (row: ReconciledRecoveryRow, action: RecoveryActionKey) => {
    setJustChecked((prev) => new Set(prev).add(`${row.client.id}:${action}`));
    onAction(row, action);
  };

  const bucketCounts = new Map<RecoveryBucketKey, number>();
  for (const row of active) {
    for (const b of row.buckets) bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
  }
  const filtered =
    bucketFilter === "all" ? active : active.filter((r) => r.buckets.includes(bucketFilter));

  return (
    <section
      className="hover-lift relative space-y-4 overflow-hidden rounded-xl border border-border bg-card/70 p-4"
      aria-label="Payment recovery queue"
    >
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
            Recovery queue <span className="ml-1 font-sans tabular-nums">{active.length}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            One canonical queue — every action here writes to the same persisted state the "Failed &
            At-Risk" total above reads from.
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          <ShieldAlert className="h-3 w-3 text-amber-400" />
          Provider execution unavailable
        </Badge>
      </div>

      <div className="relative mb-1 flex flex-wrap gap-1.5">
        <button
          onClick={() => setBucketFilter("all")}
          className={`rounded border px-2 py-1 text-2xs ${bucketFilter === "all" ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
        >
          All ({active.length})
        </button>
        {BUCKET_ORDER.filter((b) => (bucketCounts.get(b) ?? 0) > 0).map((b) => (
          <button
            key={b}
            onClick={() => setBucketFilter(b)}
            className={`rounded border px-2 py-1 text-2xs ${bucketFilter === b ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
          >
            {RECOVERY_BUCKET_LABELS[b]} ({bucketCounts.get(b)})
          </button>
        ))}
      </div>

      <div className="relative space-y-2">
        {filtered.slice(0, 12).map((row) => {
          const comms = commsByClient?.get(row.client.id);
          const reminderSent =
            row.recoveryItem?.next_action === "Reminder sent" ||
            justChecked.has(`${row.client.id}:reminder`);
          const resolvedChecked = justChecked.has(`${row.client.id}:resolved`);
          return (
            <div key={row.client.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {onOpenMentee ? (
                  <button
                    type="button"
                    onClick={() => onOpenMentee(row.client)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {row.client.full_name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.client.full_name}
                  </span>
                )}
                {row.buckets.map((b) => (
                  <Badge key={b} variant="outline" className="text-[10px]">
                    {RECOVERY_BUCKET_LABELS[b]}
                  </Badge>
                ))}
                {row.ageDays != null && row.ageDays > 0 && (
                  <Badge variant="outline" className="text-[10px] text-destructive">
                    {row.ageDays}d
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] ${row.tracked ? "text-cyan-300" : "text-amber-400"}`}
                >
                  {row.tracked ? "Tracked" : "Not yet tracked"}
                </Badge>
              </div>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-5">
                <span className="text-muted-foreground">
                  Offer
                  <strong className="block truncate text-foreground">
                    {row.client.offer_name ?? "—"}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Amount
                  <strong className="block text-foreground">{money(row.amountCents)}</strong>
                </span>
                <span className="text-muted-foreground">
                  Due
                  <strong className="block text-foreground">{row.dueDate ?? "—"}</strong>
                </span>
                <span className="text-muted-foreground">
                  Status
                  <strong className="block capitalize text-foreground">
                    {row.recoveryItem?.status.replaceAll("_", " ") ?? "Not logged"}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Last action
                  <strong className="block text-amber-300">
                    {row.recoveryItem?.next_action ?? "None"}
                  </strong>
                </span>
              </div>
              {comms && (
                <div className="mt-2 text-2xs text-muted-foreground">
                  {comms.tone === "sent" ? "Marked sent" : "Reminder queued"} — {comms.label}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <label
                  htmlFor={`reminder-${row.client.id}`}
                  className={`flex items-center gap-1.5 text-2xs ${
                    reminderSent ? "text-muted-foreground" : "cursor-pointer text-foreground"
                  }`}
                >
                  <Checkbox
                    id={`reminder-${row.client.id}`}
                    checked={reminderSent}
                    disabled={actionPending || reminderSent}
                    onCheckedChange={(checked) => checked && fireAction(row, "reminder")}
                  />
                  Reminder sent?
                </label>
                <label
                  htmlFor={`resolved-${row.client.id}`}
                  className={`flex items-center gap-1.5 text-2xs ${
                    resolvedChecked ? "text-muted-foreground" : "cursor-pointer text-foreground"
                  }`}
                >
                  <Checkbox
                    id={`resolved-${row.client.id}`}
                    checked={resolvedChecked}
                    disabled={actionPending || resolvedChecked}
                    onCheckedChange={(checked) => checked && fireAction(row, "resolved")}
                  />
                  Mark resolved
                </label>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
            <CheckCircle2 className="mr-2 inline h-3.5 w-3.5 text-emerald-400" />
            No mentees in this bucket.
          </div>
        )}
      </div>

      {stale.length > 0 && (
        <div className="relative border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setShowStale((v) => !v)}
            className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showStale ? "Hide" : "Show"} {stale.length} item{stale.length === 1 ? "" : "s"} that no
            longer qualify
          </button>
          {showStale && (
            <div className="mt-2 space-y-1.5">
              {stale.map(({ recoveryItem, client }) => (
                <div
                  key={recoveryItem.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border/60 p-2 text-2xs text-muted-foreground"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {client?.full_name ?? "Unknown mentee"} — logged "{recoveryItem.status}", no
                    longer meets a live recovery condition
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-2xs"
                    disabled={actionPending}
                    onClick={() => onClearStale(recoveryItem)}
                  >
                    Clear
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
