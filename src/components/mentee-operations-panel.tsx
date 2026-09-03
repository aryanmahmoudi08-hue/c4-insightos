import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRecoveryQueue,
  daysBetween,
  RECOVERY_BUCKET_LABELS,
  type RecoveryBucketKey,
  type RecoveryQueueClient,
  type RecoveryPaymentRow,
} from "@/lib/mentee-payments";

export type MenteeOperationsClient = RecoveryQueueClient & {
  renewal_date: string | null;
  renewal_stage: string | null;
};

export type MenteeOperationsPayment = RecoveryPaymentRow & { id: string };

const RECOVERY_ACTIONS = [
  { key: "reminder", label: "Send reminder" },
  { key: "retry", label: "Retry payment" },
  { key: "promise", label: "Log promise-to-pay" },
  { key: "checkin", label: "Schedule check-in" },
  { key: "resolved", label: "Mark resolved" },
  { key: "escalate", label: "Escalate" },
] as const;

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

export function MenteeOperationsPanel({
  orgId,
  clients,
  payments,
  renewalAtRiskDays,
}: {
  orgId: string | undefined;
  clients: MenteeOperationsClient[];
  payments: MenteeOperationsPayment[];
  renewalAtRiskDays: number;
}) {
  const qc = useQueryClient();
  const [bucketFilter, setBucketFilter] = useState<RecoveryBucketKey | "all">("all");
  const [ownerDraftId, setOwnerDraftId] = useState<string | null>(null);
  const [ownerDraft, setOwnerDraft] = useState("");

  const { data: recoveryItems = [] } = useQuery({
    queryKey: ["payment-recovery-items", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_recovery_items")
        .select("id, client_id, status, owner_id, next_action, next_action_at, updated_at")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        client_id: string | null;
        status: string;
        owner_id: string | null;
        next_action: string | null;
        next_action_at: string | null;
        updated_at: string;
      }>;
    },
  });

  const { data: renewalItems = [] } = useQuery({
    queryKey: ["renewal-work-items", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renewal_work_items")
        .select("id, client_id, owner_id, next_action, next_action_at, stage, reason")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        client_id: string;
        owner_id: string | null;
        next_action: string | null;
        next_action_at: string | null;
        stage: string;
        reason: string | null;
      }>;
    },
  });
  const renewalByClient = useMemo(
    () => new Map(renewalItems.map((r) => [r.client_id, r])),
    [renewalItems],
  );

  const logActivity = async (clientId: string, eventType: string, body: string) => {
    if (!orgId) return;
    await supabase
      .from("client_activity_events")
      .insert({ org_id: orgId, client_id: clientId, event_type: eventType, body });
  };

  const recoveryAction = useMutation({
    mutationFn: async ({
      client,
      actionKey,
      amountCents,
      dueDate,
    }: {
      client: RecoveryQueueClient;
      actionKey: (typeof RECOVERY_ACTIONS)[number]["key"];
      amountCents: number;
      dueDate: string | null;
    }) => {
      const existing = recoveryItems.find((r) => r.client_id === client.id);
      const actionLabel = RECOVERY_ACTIONS.find((a) => a.key === actionKey)!.label;
      const status =
        actionKey === "resolved"
          ? "recovered"
          : actionKey === "retry"
            ? "retry"
            : actionKey === "escalate"
              ? "overdue"
              : undefined;
      const patch = {
        org_id: orgId!,
        client_id: client.id,
        amount_cents: amountCents,
        due_at: dueDate,
        next_action: actionLabel,
        next_action_at: new Date().toISOString(),
        ...(status ? { status } : {}),
      };
      if (existing) {
        const { error } = await supabase
          .from("payment_recovery_items")
          .update(patch)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("payment_recovery_items")
          .insert({ status: "due", ...patch });
        if (error) throw error;
      }
      await logActivity(client.id, "payment_recovery", `${actionLabel} (${money(amountCents)})`);
    },
    onSuccess: () => {
      toast.success("Logged — provider execution still unavailable (no payment-provider secret)");
      qc.invalidateQueries({ queryKey: ["payment-recovery-items", orgId] });
      qc.invalidateQueries({ queryKey: ["client-activity", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRenewalOwner = useMutation({
    mutationFn: async ({ clientId, owner }: { clientId: string; owner: string }) => {
      const existing = renewalByClient.get(clientId);
      // renewal_work_items.owner_id is a uuid (a real team-member id), but this
      // panel takes a free-text name for now — no team-member picker wired to
      // this table yet — so the owner is kept as a readable label inside
      // next_action rather than faking a uuid.
      if (existing) {
        const { error } = await supabase
          .from("renewal_work_items")
          .update({ next_action: owner ? `Owner: ${owner}` : existing.next_action })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("renewal_work_items").insert({
          org_id: orgId!,
          client_id: clientId,
          next_action: owner ? `Owner: ${owner}` : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Renewal owner updated");
      qc.invalidateQueries({ queryKey: ["renewal-work-items", orgId] });
      setOwnerDraftId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date();
  const allRows = useMemo(() => buildRecoveryQueue(clients, payments, today), [clients, payments]);
  const filteredRows =
    bucketFilter === "all" ? allRows : allRows.filter((r) => r.bucket === bucketFilter);
  const bucketCounts = useMemo(() => {
    const m = new Map<RecoveryBucketKey, number>();
    for (const row of allRows) m.set(row.bucket, (m.get(row.bucket) ?? 0) + 1);
    return m;
  }, [allRows]);

  const renewals = clients
    .map((client) => ({
      client,
      days: daysBetween(
        (client as MenteeOperationsClient & { renewal_date: string | null }).renewal_date,
        today,
      ),
    }))
    .filter((row) => row.days != null && row.days <= renewalAtRiskDays)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card/70 p-4"
      aria-label="Mentee payment recovery and renewal operations"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-spectrum-hot" />
            Recovery & renewal operations
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Real queue, persisted actions — payment-provider execution stays unavailable until a
            provider secret is connected
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          <ShieldAlert className="h-3 w-3 text-amber-400" />
          Provider execution unavailable
        </Badge>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
          Payment recovery queue <span className="ml-auto font-mono">{allRows.length}</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setBucketFilter("all")}
            className={`rounded border px-2 py-1 text-2xs ${bucketFilter === "all" ? "border-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/40"}`}
          >
            All ({allRows.length})
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
        <div className="space-y-2">
          {filteredRows.slice(0, 12).map((row) => {
            const item = recoveryItems.find((r) => r.client_id === row.client.id);
            return (
              <div
                key={`${row.bucket}-${row.client.id}`}
                className="rounded-lg border border-border/60 bg-muted/10 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.client.full_name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {RECOVERY_BUCKET_LABELS[row.bucket]}
                  </Badge>
                  {row.ageDays != null && row.ageDays > 0 && (
                    <Badge variant="outline" className="text-[10px] text-destructive">
                      {row.ageDays}d
                    </Badge>
                  )}
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
                      {item?.status?.replaceAll("_", " ") ?? "Not logged"}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Last action
                    <strong className="block text-amber-300">{item?.next_action ?? "None"}</strong>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {RECOVERY_ACTIONS.map((a) => (
                    <Button
                      key={a.key}
                      size="sm"
                      variant="outline"
                      className="h-6 text-2xs"
                      disabled={recoveryAction.isPending}
                      onClick={() =>
                        recoveryAction.mutate({
                          client: row.client,
                          actionKey: a.key,
                          amountCents: row.amountCents,
                          dueDate: row.dueDate,
                        })
                      }
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
          {filteredRows.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              <CheckCircle2 className="mr-2 inline h-3.5 w-3.5 text-emerald-400" />
              No mentees in this bucket.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 text-cyan-400" />
          Renewal workflow <span className="ml-auto font-mono">{renewals.length}</span>
        </div>
        <div className="space-y-2">
          {renewals.slice(0, 8).map(({ client, days }) => {
            const renewal = renewalByClient.get(client.id);
            const ownerLabel = renewal?.next_action?.startsWith("Owner:")
              ? renewal.next_action.slice(6).trim()
              : null;
            return (
              <div key={client.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {client.full_name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {days! < 0 ? `${Math.abs(days!)}d overdue` : `in ${days}d`}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                  <span className="text-muted-foreground">
                    Stage
                    <strong className="block capitalize text-foreground">
                      {(
                        (client as MenteeOperationsClient & { renewal_stage: string | null })
                          .renewal_stage ?? "not_started"
                      ).replaceAll("_", " ")}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Owner
                    {ownerDraftId === client.id ? (
                      <div className="mt-0.5 flex items-center gap-1">
                        <Input
                          value={ownerDraft}
                          onChange={(e) => setOwnerDraft(e.target.value)}
                          className="h-6 text-2xs"
                          placeholder="Name"
                        />
                        <button
                          className="text-2xs text-accent"
                          onClick={() =>
                            setRenewalOwner.mutate({ clientId: client.id, owner: ownerDraft })
                          }
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        className="block text-cyan-300 hover:underline"
                        onClick={() => {
                          setOwnerDraftId(client.id);
                          setOwnerDraft(ownerLabel ?? "");
                        }}
                      >
                        {ownerLabel ?? "Unassigned — click to set"}
                      </button>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    Renewal Action / Next Step
                    <strong className="block text-cyan-300">
                      {renewal?.reason ?? (ownerLabel ? "Needs next step" : "Needs owner + action")}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Action date
                    <strong className="block text-foreground">
                      {(client as MenteeOperationsClient & { renewal_date: string | null })
                        .renewal_date ?? "Unavailable"}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })}
          {renewals.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              <AlertTriangle className="mr-2 inline h-3.5 w-3.5" />
              No renewal records inside the configured risk window.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
