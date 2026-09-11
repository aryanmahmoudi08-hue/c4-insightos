/**
 * Canonical disqualification logic (Master Plan Priority 2/3).
 *
 * The app already has a real, single-column signal for this — the
 * `call_status` enum has carried a `disqualified` value since the very
 * first migration, and the Closer's own EOD/Log Call flow already writes it
 * explicitly (the "DQ" status option, and the free-text EOD's "Lost" /
 * "Bad Fit" / "DQ" Lead Status choices — see eod-reports.ts's
 * LEAD_STATUS_MAP). `closer.tsx` already exposes this as a real, clickable
 * "Post-call disposition mix" entry via
 * `normalizeCloserDisposition(status) === "not_qualified"`. This file does
 * NOT introduce a second taxonomy or a new EOD question — it's the one
 * place the *cross-dashboard* rollup (Main Hub, DM Setter, Inbound Dialer)
 * of that same signal lives, so it can never drift from what Closer already
 * shows.
 *
 * A lead counts as disqualified once, however it got there:
 *  - its own `leads.status` was set to "disqualified" directly (a rep
 *    editing the pipeline stage in Legacy Leads, no call required), or
 *  - it has at least one linked `calls` row with `status === "disqualified"`
 *    (the Closer's EOD/Log Call flow).
 * Both paths are deduped by lead id — a lead disqualified via both, or via
 * more than one call, still counts once. Never once per dashboard it
 * happens to surface on (spec: no double counting).
 *
 * Calls with no `lead_id` (only the free-text EOD Reports flow produces
 * these — see eod-reports.ts's `buildClosureCallPayload`, which always
 * inserts `lead_id: null`) are real disqualification events with no lead
 * record to dedupe against or attribute to a rep. They are counted
 * separately as `unattributed`, never silently folded into a "leads" count
 * they don't actually belong to, and never credited to a setter/closer the
 * schema can't actually connect them to (data honesty).
 */

export interface DqLeadRow {
  id: string;
  status?: string | null;
  assigned_setter_id?: string | null;
}

export interface DqCallRow {
  lead_id?: string | null;
  status?: string | null;
}

export function isDisqualifiedStatus(status: string | null | undefined): boolean {
  return status === "disqualified";
}

export interface DqResult {
  /** Distinct disqualified lead ids. */
  leadIds: Set<string>;
  /** Disqualified calls with no `lead_id` — real events, no lead to attribute. */
  unattributed: number;
}

export function computeDisqualified(leads: DqLeadRow[], calls: DqCallRow[]): DqResult {
  const leadIds = new Set<string>();
  for (const l of leads) if (isDisqualifiedStatus(l.status)) leadIds.add(l.id);
  let unattributed = 0;
  for (const c of calls) {
    if (!isDisqualifiedStatus(c.status)) continue;
    if (c.lead_id) leadIds.add(c.lead_id);
    else unattributed += 1;
  }
  return { leadIds, unattributed };
}

/** Headline "# Of Disqualified Leads" count: distinct leads only.
 * Unattributed call-only disqualifications are surfaced separately (see
 * `DqResult.unattributed`), never folded into a leads count they don't
 * belong to. */
export function disqualifiedLeadCount(leads: DqLeadRow[], calls: DqCallRow[]): number {
  return computeDisqualified(leads, calls).leadIds.size;
}

/** Per-setter breakdown, keyed by `leads.assigned_setter_id` (a
 * `team_members.id`) — the lead's real set/booking owner, not whoever most
 * recently messaged it. Leads with no `assigned_setter_id` can't be
 * attributed to anyone and are excluded here, not guessed at. */
export function disqualifiedCountBySetter(
  leads: DqLeadRow[],
  calls: DqCallRow[],
): Map<string, number> {
  const { leadIds } = computeDisqualified(leads, calls);
  const setterOf = new Map<string, string | null | undefined>();
  for (const l of leads) setterOf.set(l.id, l.assigned_setter_id);
  const bySetterCount = new Map<string, number>();
  for (const id of leadIds) {
    const setterId = setterOf.get(id);
    if (!setterId) continue;
    bySetterCount.set(setterId, (bySetterCount.get(setterId) ?? 0) + 1);
  }
  return bySetterCount;
}

/** Disqualification rate. The denominator must reflect the population
 * actually eligible to be disqualified at the stage being measured — never
 * a blind "÷ total leads" everywhere (spec: the denominator should reflect
 * the actual stage). Callers pass the right eligible-population count for
 * their own view (e.g. total leads org-wide on Main Hub, calls logged on
 * Closer, leads owned by a specific setter on DM Setter/Dialer). */
export function disqualificationRate(
  disqualifiedCount: number,
  eligiblePopulation: number,
): number | null {
  return eligiblePopulation > 0 ? (disqualifiedCount / eligiblePopulation) * 100 : null;
}
