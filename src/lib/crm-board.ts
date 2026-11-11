/**
 * Pure helpers for the CRM board.
 *
 * The board is three pipelines — Applications, Sales, Cancelled calls — and a
 * lead sits in exactly one stage of one of them at a time. Stage definitions
 * come from `crm_pipeline_stages`; a lead's position is `leads.crm_stage_id`.
 *
 * Everything here is deliberately free of Supabase so the grouping and
 * upcoming-call rules can be tested directly rather than against a database.
 */

export type BoardStage = {
  id: string;
  name: string;
  position: number;
  is_closed_won: boolean;
  is_closed_lost: boolean;
};

export type BoardCall = {
  id: string;
  scheduled_for: string | null;
  status: string | null;
  cancelled: boolean | null;
  calendly_cancel_url: string | null;
  calendly_reschedule_url: string | null;
};

export type BoardLead = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  crm_stage_id: string | null;
  ticket_tier: string | null;
  source_platform: string | null;
  assigned_setter_id: string | null;
  created_at: string | null;
  calls?: BoardCall[];
};

/** The three pipelines, in the order a lead travels through them. */
export const BOARD_PIPELINES = ["Applications", "Sales", "Cancelled calls"] as const;
export type BoardPipelineName = (typeof BOARD_PIPELINES)[number];

export function isBoardPipelineName(v: unknown): v is BoardPipelineName {
  return (BOARD_PIPELINES as readonly string[]).includes(String(v ?? ""));
}

/**
 * The lead's next real meeting, or null.
 *
 * "Next real meeting" is deliberately narrow: in the future, not cancelled,
 * and with a time on it. A call row with no `scheduled_for` is not a meeting
 * anyone can attend, and a cancelled one is not upcoming however future its
 * date — the card says "already has an upcoming meeting" and that has to be
 * true, because it is what stops someone double-booking a lead.
 */
export function upcomingCall(calls: BoardCall[] | null | undefined, now: Date): BoardCall | null {
  if (!calls?.length) return null;
  const future = calls
    .filter((c) => {
      if (c.cancelled) return false;
      if (c.status === "cancelled" || c.status === "rescheduled") return false;
      if (!c.scheduled_for) return false;
      const t = Date.parse(c.scheduled_for);
      return Number.isFinite(t) && t > now.getTime();
    })
    .sort((a, b) => Date.parse(a.scheduled_for!) - Date.parse(b.scheduled_for!));
  return future[0] ?? null;
}

/** Stages in board order. Archived stages are filtered out upstream. */
export function sortStages(stages: BoardStage[]): BoardStage[] {
  return [...stages].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * Leads bucketed by stage id.
 *
 * A lead whose `crm_stage_id` is null, or points at a stage outside the
 * pipeline being shown, is not placed anywhere — it is returned as
 * `unplaced` rather than dropped silently or dumped into the first column,
 * so "where did that lead go?" has an answer the UI can show.
 */
export function groupLeadsByStage(
  leads: BoardLead[],
  stages: BoardStage[],
): { byStage: Map<string, BoardLead[]>; unplaced: BoardLead[] } {
  const known = new Set(stages.map((s) => s.id));
  const byStage = new Map<string, BoardLead[]>();
  for (const s of stages) byStage.set(s.id, []);
  const unplaced: BoardLead[] = [];
  for (const lead of leads) {
    if (lead.crm_stage_id && known.has(lead.crm_stage_id)) {
      byStage.get(lead.crm_stage_id)!.push(lead);
    } else {
      unplaced.push(lead);
    }
  }
  // Newest first inside a column: a board is a worklist, and the thing that
  // just arrived is the thing nobody has looked at yet.
  const ts = (l: BoardLead) => (l.created_at ? Date.parse(l.created_at) : 0);
  for (const [, rows] of byStage) rows.sort((a, b) => ts(b) - ts(a));
  unplaced.sort((a, b) => ts(b) - ts(a));
  return { byStage, unplaced };
}

/** Display name for a card, never blank — an unnamed lead still has to be draggable. */
export function cardTitle(lead: BoardLead): string {
  const name = (lead.full_name ?? "").trim();
  if (name) return name;
  const email = (lead.email ?? "").trim();
  if (email) return email;
  return "Unnamed lead";
}

/**
 * Which stage a Closer's Lead Status answer should move the lead to.
 *
 * `mappings` comes from `crm_legacy_stage_mappings` (legacy_entity_type
 * 'lead_status'), seeded alongside the stages. An unmapped status returns
 * null and the lead is left where it is — a status nobody mapped is not a
 * reason to move a card somewhere arbitrary.
 */
export function stageForLeadStatus(
  leadStatus: string | null | undefined,
  mappings: { legacy_value: string; pipeline_stage_id: string | null }[],
): string | null {
  const raw = String(leadStatus ?? "").trim();
  if (!raw) return null;
  const hit = mappings.find((m) => m.legacy_value === raw);
  return hit?.pipeline_stage_id ?? null;
}
