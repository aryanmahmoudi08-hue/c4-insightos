import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { daysBetween, type RecoveryQueueClient } from "@/lib/mentee-payments";

export type MenteeOperationsClient = RecoveryQueueClient & {
  renewal_date: string | null;
  renewal_stage: string | null;
};

/** Compact, real-data-only payment context for a renewal record — omits any
 * field that isn't actually available rather than rendering a placeholder. */
export type RenewalPaymentContext = {
  outstandingCents: number;
  overdueCount: number;
  nextPaymentCents: number | null;
  nextPaymentDate: string | null;
};

/**
 * Renewal workflow — who's approaching renewal, whose stage/owner/next-step
 * needs setting. Payment recovery used to live here too; it moved to
 * `RecoveryQueuePanel` (src/components/recovery-queue-panel.tsx), the single
 * canonical recovery surface reconciled against `payment_recovery_items` —
 * this component no longer touches that table at all, so there is exactly
 * one recovery workflow on the page, not two.
 */
export function MenteeOperationsPanel({
  orgId,
  clients,
  renewalAtRiskDays,
  paymentContextByClient,
  onOpenMentee,
}: {
  orgId: string | undefined;
  clients: MenteeOperationsClient[];
  renewalAtRiskDays: number;
  /** Real payment context per client (outstanding/overdue/next payment) —
   * omitted entirely for a client with no computable context, never faked. */
  paymentContextByClient?: Map<string, RenewalPaymentContext>;
  /** Opens the mentee's real profile/financial-timeline dialog in the parent
   * page — omitted, the name renders as static text (no dead click). */
  onOpenMentee?: (client: { id: string }) => void;
}) {
  const qc = useQueryClient();
  const [ownerDraftId, setOwnerDraftId] = useState<string | null>(null);
  const [ownerDraft, setOwnerDraft] = useState("");

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
  const renewals = clients
    .map((client) => ({ client, days: daysBetween(client.renewal_date, today) }))
    .filter((row) => row.days != null && row.days <= renewalAtRiskDays)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

  return (
    <section
      className="hover-lift relative space-y-4 overflow-hidden rounded-xl border border-border bg-card/70 p-4"
      aria-label="Renewal workflow"
    >
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
      <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5 text-cyan-400" />
        Renewal workflow <span className="ml-auto font-sans tabular-nums">{renewals.length}</span>
      </div>
      <div className="relative space-y-2">
        {renewals.slice(0, 8).map(({ client, days }) => {
          const renewal = renewalByClient.get(client.id);
          const ownerLabel = renewal?.next_action?.startsWith("Owner:")
            ? renewal.next_action.slice(6).trim()
            : null;
          const ctx = paymentContextByClient?.get(client.id);
          const ctxParts = ctx
            ? [
                ctx.outstandingCents > 0
                  ? `$${Math.round(ctx.outstandingCents / 100).toLocaleString()} outstanding`
                  : null,
                ctx.overdueCount > 0
                  ? `${ctx.overdueCount} payment${ctx.overdueCount === 1 ? "" : "s"} overdue`
                  : null,
                ctx.nextPaymentCents && ctx.nextPaymentDate
                  ? `Next: $${Math.round(ctx.nextPaymentCents / 100).toLocaleString()} on ${ctx.nextPaymentDate}`
                  : null,
              ].filter((p): p is string => !!p)
            : [];
          return (
            <div key={client.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
              <div className="flex items-center gap-2">
                {onOpenMentee ? (
                  <button
                    type="button"
                    onClick={() => onOpenMentee(client)}
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:text-primary hover:underline"
                  >
                    {client.full_name}
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {client.full_name}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {days! < 0 ? `${Math.abs(days!)}d overdue` : `in ${days}d`}
                </Badge>
              </div>
              {ctxParts.length > 0 && (
                <div className="mt-1 text-2xs text-muted-foreground">{ctxParts.join(" · ")}</div>
              )}
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                <span className="text-muted-foreground">
                  Stage
                  <strong className="block capitalize text-foreground">
                    {(client.renewal_stage ?? "not_started").replaceAll("_", " ")}
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
                    {client.renewal_date ?? "Unavailable"}
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
    </section>
  );
}
