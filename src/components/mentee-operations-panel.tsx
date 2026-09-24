import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

  // Remediation (metric-dictionary audit, FULF-0681): real org members, to
  // resolve/pick owner_id (a real uuid) instead of the prior free-text
  // "Owner: <name>" prefix hack — same profiles-join pattern already used
  // for Closer/Setter identity elsewhere (mentee-renewal-panel.tsx).
  const { data: orgMembers = [] } = useQuery({
    queryKey: ["renewal-owner-candidates", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data: memberships, error: membershipError } = await supabase
        .from("memberships")
        .select("user_id")
        .eq("org_id", orgId!);
      if (membershipError) throw membershipError;
      const userIds = Array.from(new Set((memberships ?? []).map((m) => m.user_id)));
      if (userIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      if (profilesError) throw profilesError;
      return (profiles ?? []) as { id: string; display_name: string | null }[];
    },
  });
  const memberNameById = useMemo(
    () => new Map(orgMembers.map((m) => [m.id, m.display_name ?? m.id.slice(0, 8)])),
    [orgMembers],
  );

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
    mutationFn: async ({ clientId, ownerId }: { clientId: string; ownerId: string | null }) => {
      const existing = renewalByClient.get(clientId);
      // Remediation (metric-dictionary audit, FULF-0681): writes the real
      // owner_id uuid column now that a real team-member picker exists,
      // instead of overloading next_action with an "Owner: <name>" prefix —
      // next_action stays exclusively the real next-step text going forward.
      if (existing) {
        const { error } = await supabase
          .from("renewal_work_items")
          .update({ owner_id: ownerId })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("renewal_work_items").insert({
          org_id: orgId!,
          client_id: clientId,
          owner_id: ownerId,
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
          // Remediation (metric-dictionary audit, FULF-0681): prefer the real
          // owner_id -> profiles.display_name resolution; fall back to
          // parsing a legacy "Owner: <name>" prefix ONLY for historical rows
          // written before this fix (owner_id null, next_action still
          // carries the old prefix) — read-only compatibility, never
          // rewritten back into next_action.
          const ownerLabel = renewal?.owner_id
            ? (memberNameById.get(renewal.owner_id) ?? "Unknown member")
            : renewal?.next_action?.startsWith("Owner:")
              ? renewal.next_action.slice(6).trim()
              : null;
          const legacyOwnerPrefix =
            !renewal?.owner_id && renewal?.next_action?.startsWith("Owner:");
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
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-5">
                <span className="text-muted-foreground">
                  Stage
                  <strong className="block capitalize text-foreground">
                    {(client.renewal_stage ?? "not_started").replaceAll("_", " ")}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Owner
                  {legacyOwnerPrefix && (
                    <span
                      className="ml-1 text-3xs text-amber-400"
                      title="Set before the real owner field existed — re-select to link it to a real member."
                    >
                      (legacy)
                    </span>
                  )}
                  {ownerDraftId === client.id ? (
                    <div className="mt-0.5 flex items-center gap-1">
                      <select
                        className="h-6 rounded border border-border bg-background text-2xs"
                        value={ownerDraft}
                        onChange={(e) => setOwnerDraft(e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {orgMembers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.display_name ?? m.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="text-2xs text-accent"
                        onClick={() =>
                          setRenewalOwner.mutate({
                            clientId: client.id,
                            ownerId: ownerDraft || null,
                          })
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
                        setOwnerDraft(renewal?.owner_id ?? "");
                      }}
                    >
                      {ownerLabel ?? "Unassigned — click to set"}
                    </button>
                  )}
                </span>
                <span className="text-muted-foreground">
                  Renewal Action / Next Step
                  <strong className="block text-cyan-300">
                    {legacyOwnerPrefix
                      ? "Needs next step"
                      : (renewal?.reason ??
                        (ownerLabel ? "Needs next step" : "Needs owner + action"))}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  {/* Remediation (metric-dictionary audit, FULF-0682): was
                      showing clients.renewal_date under "Action date" —
                      renewal_work_items.next_action_at is the semantically
                      correct field for a workflow action date; renewal_date
                      is kept as its own, separately-labeled field below so
                      the two concepts are never conflated. */}
                  Action date
                  <strong className="block text-foreground">
                    {renewal?.next_action_at
                      ? new Date(renewal.next_action_at).toLocaleDateString()
                      : "Not set"}
                  </strong>
                </span>
                <span className="text-muted-foreground">
                  Renewal Date
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
