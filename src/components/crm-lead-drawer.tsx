/**
 * What opens when you click a lead card on the CRM board: where the lead is
 * in the pipeline (and a control to move it), their calls with confirmation
 * status, payments, and the board's history for them — above the same full
 * lead record /leads shows (LeadDetail), so the two pages never show a lead
 * two different ways.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEAD_ROW_SELECT, LeadDetail, toLeadRow, type LeadRow } from "@/components/lead-detail";
import { cardTitle, type BoardLead, type BoardStage } from "@/lib/crm-board";
import { cn } from "@/lib/utils";

// call_confirmations, crm_activities and calls.cancelled are ahead of the
// generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const SELECT_CLASS =
  "h-8 rounded-md border border-input bg-transparent px-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const CONFIRMATION_LABEL: Record<string, string> = {
  awaiting: "Awaiting confirmation",
  confirmed: "Confirmed",
  overdue: "Overdue",
  at_risk: "At risk",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

/** A LeadRow from what the board already has — Dev Bypass only, where the
 *  fixture leads are not in the database. */
function leadRowFromBoard(l: BoardLead): LeadRow {
  return {
    id: l.id,
    full_name: l.full_name,
    email: l.email,
    handle: null,
    phone: l.phone,
    status: "call_booked",
    pipeline_stage: null,
    priority: "normal",
    precall_video_watched: false,
    intent_score: null,
    engagement_score: null,
    estimated_close_probability: null,
    source_connector: null,
    source_platform: l.source_platform,
    source_webinar_id: null,
    source_format: null,
    source_campaign: null,
    first_touch_at: null,
    first_touch_content_id: null,
    assigned_setter_id: l.assigned_setter_id,
    qualification_notes: null,
    application_data: null,
    notes: null,
    created_at: l.created_at ?? new Date().toISOString(),
    tags: [],
    ticket_tier: l.ticket_tier,
    callCount: l.calls?.length ?? 0,
    lastCallAt: l.calls?.[0]?.scheduled_for ?? null,
    closerName: null,
  };
}

export function CrmLeadDrawer({
  lead,
  stages,
  orgId,
  devBypass,
  onClose,
  onMove,
  moving,
}: {
  lead: BoardLead | null;
  stages: BoardStage[];
  orgId: string | undefined;
  devBypass: boolean;
  onClose: () => void;
  onMove: (stageId: string) => void;
  moving: boolean;
}) {
  const leadId = lead?.id ?? null;

  const { data: row } = useQuery({
    queryKey: ["crm-lead-row", orgId, leadId, devBypass],
    enabled: !!leadId && (devBypass || !!orgId),
    queryFn: async (): Promise<LeadRow | null> => {
      if (devBypass) return lead ? leadRowFromBoard(lead) : null;
      const { data, error } = await supabase
        .from("leads")
        .select(LEAD_ROW_SELECT)
        .eq("org_id", orgId!)
        .eq("id", leadId!)
        .maybeSingle();
      if (error) throw error;
      return data ? toLeadRow(data) : null;
    },
  });

  const { data: pipeline } = useQuery({
    queryKey: ["crm-lead-pipeline", orgId, leadId, devBypass],
    enabled: !!leadId && !!orgId && !devBypass,
    queryFn: async () => {
      const { data: calls } = await db
        .from("calls")
        .select(
          "id, scheduled_for, status, cancelled, closer_name, source_connector, eod_lead_status",
        )
        .eq("org_id", orgId)
        .eq("lead_id", leadId)
        .order("scheduled_for", { ascending: false })
        .limit(20);
      const callList = (calls ?? []) as Array<{
        id: string;
        scheduled_for: string | null;
        status: string | null;
        cancelled: boolean | null;
        closer_name: string | null;
        source_connector: string | null;
        eod_lead_status: string | null;
      }>;
      const ids = callList.map((c) => c.id);
      const [confs, pays, targets] = await Promise.all([
        ids.length
          ? db.from("call_confirmations").select("call_id, overall_status").in("call_id", ids)
          : Promise.resolve({ data: [] }),
        ids.length
          ? db
              .from("payments")
              .select("id, amount_cents, currency, status, collected_at, processor")
              .eq("org_id", orgId)
              .in("call_id", ids)
              .order("collected_at", { ascending: false })
          : Promise.resolve({ data: [] }),
        db
          .from("crm_activity_targets")
          .select("activity_id")
          .eq("org_id", orgId)
          .eq("entity_type", "legacy_lead")
          .eq("entity_id", leadId)
          .limit(50),
      ]);
      const activityIds = ((targets.data ?? []) as Array<{ activity_id: string }>).map(
        (t) => t.activity_id,
      );
      const { data: activities } = activityIds.length
        ? await db
            .from("crm_activities")
            .select("id, title, body, created_at, payload")
            .in("id", activityIds)
            .eq("activity_type", "pipeline_stage_changed")
            .order("created_at", { ascending: false })
            .limit(15)
        : { data: [] };
      const confByCall = new Map(
        ((confs.data ?? []) as Array<{ call_id: string; overall_status: string }>).map((c) => [
          c.call_id,
          c.overall_status,
        ]),
      );
      return {
        calls: callList.map((c) => ({ ...c, confirmation: confByCall.get(c.id) ?? null })),
        payments: (pays.data ?? []) as Array<{
          id: string;
          amount_cents: number;
          currency: string;
          status: string;
          collected_at: string;
          processor: string | null;
        }>,
        history: (activities ?? []) as Array<{
          id: string;
          title: string;
          body: string | null;
          created_at: string;
          payload: { manual?: boolean } | null;
        }>,
      };
    },
  });

  const currentStage = stages.find((s) => s.id === lead?.crm_stage_id) ?? null;

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{lead ? cardTitle(lead) : "Lead"}</DialogTitle>
        </DialogHeader>
        {lead && (
          <div className="space-y-4">
            <section className="space-y-3 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Pipeline stage
                </span>
                <select
                  className={SELECT_CLASS}
                  value={lead.crm_stage_id ?? ""}
                  disabled={moving}
                  onChange={(e) => e.target.value && onMove(e.target.value)}
                  aria-label="Move to stage"
                >
                  {!currentStage && <option value="">Not on this board yet</option>}
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="text-3xs text-muted-foreground">
                  Moving here is the same as dragging the card, and is logged the same way.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Calls
                  </div>
                  {devBypass ? (
                    <p className="text-xs text-muted-foreground">Not available in Dev Bypass.</p>
                  ) : !pipeline?.calls.length ? (
                    <p className="text-xs text-muted-foreground">No calls linked to this lead.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {pipeline.calls.map((c) => (
                        <li key={c.id} className="flex flex-col">
                          <span className={cn(c.cancelled && "line-through text-muted-foreground")}>
                            {when(c.scheduled_for)}
                          </span>
                          <span className="text-3xs text-muted-foreground">
                            {[
                              c.eod_lead_status ??
                                (c.source_connector === "calendly"
                                  ? "Booked via Calendly"
                                  : c.status),
                              c.confirmation
                                ? (CONFIRMATION_LABEL[c.confirmation] ?? c.confirmation)
                                : null,
                              c.closer_name,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Payments
                  </div>
                  {devBypass ? (
                    <p className="text-xs text-muted-foreground">Not available in Dev Bypass.</p>
                  ) : !pipeline?.payments.length ? (
                    <p className="text-xs text-muted-foreground">
                      No payments linked to this lead's calls.
                    </p>
                  ) : (
                    <ul className="space-y-1 text-xs tabular-nums">
                      {pipeline.payments.map((p) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span>
                            {(p.amount_cents / 100).toLocaleString(undefined, {
                              style: "currency",
                              currency: p.currency || "USD",
                            })}
                          </span>
                          <span className="text-3xs text-muted-foreground">
                            {new Date(p.collected_at).toLocaleDateString()} · {p.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                    Stage history
                  </div>
                  {devBypass ? (
                    <p className="text-xs text-muted-foreground">Not available in Dev Bypass.</p>
                  ) : !pipeline?.history.length ? (
                    <p className="text-xs text-muted-foreground">No moves recorded yet.</p>
                  ) : (
                    <ul className="space-y-1 text-xs">
                      {pipeline.history.map((h) => (
                        <li key={h.id} className="flex flex-col">
                          <span>{h.title}</span>
                          <span className="text-3xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleString()} ·{" "}
                            {h.payload?.manual ? "moved by hand" : "automatic"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            {row ? (
              <LeadDetail lead={row} setterName={null} availability={null} />
            ) : (
              <p className="text-xs text-muted-foreground">Loading lead…</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
