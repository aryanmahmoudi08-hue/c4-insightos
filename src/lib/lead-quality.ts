/**
 * Shared lead-quality derivation — the same real signals `hub-metrics.tsx`
 * already averages into its fleet-level "Quality 1-5" card (intent_score,
 * scaled), bucketed per-lead into a discrete label for surfaces (like Calls
 * on Calendar) that need a single-lead category rather than an aggregate
 * score. Never invents a new AI/ML score — a lead with no scoring signal at
 * all is honestly "Unknown", not defaulted into a guessed bucket.
 *
 * Priority fallback uses `leads.priority`'s real constrained values
 * ('low'|'normal'|'high'|'urgent' — see the sales_crm_foundation migration).
 * hub-metrics.tsx separately checks `priority === "diamond"`, a value that
 * constraint never allows (pre-existing there, out of scope to fix here) —
 * this function does not repeat that dead check.
 */

export type LeadQuality =
  | "High Quality"
  | "Qualified"
  | "Standard"
  | "Low Quality"
  | "Unqualified"
  | "Unknown";

export type LeadQualityInput = {
  status?: string | null;
  intent_score?: number | null;
  priority?: string | null;
};

/** intent_score is stored on two different scales in practice (0-5 direct,
 * or 0-100-ish) — same normalization `hub-metrics.tsx` already uses. */
export function scaleIntentScore(intent: number): number {
  return Math.max(1, Math.min(5, intent > 5 ? intent / 20 : intent));
}

export function deriveLeadQuality(lead: LeadQualityInput): LeadQuality {
  if (lead.status === "disqualified" || lead.status === "ghosted") return "Unqualified";

  const intent = Number(lead.intent_score ?? 0);
  if (intent > 0) {
    const scaled = scaleIntentScore(intent);
    if (scaled >= 4) return "High Quality";
    if (scaled >= 3) return "Qualified";
    if (scaled >= 2) return "Standard";
    return "Low Quality";
  }

  if (lead.priority === "urgent") return "High Quality";
  if (lead.priority === "high") return "Qualified";
  if (lead.status === "qualified") return "Qualified";

  return "Unknown";
}

export const LEAD_QUALITY_TONE: Record<LeadQuality, "hot" | "mid" | "cold"> = {
  "High Quality": "hot",
  Qualified: "hot",
  Standard: "mid",
  "Low Quality": "cold",
  Unqualified: "cold",
  Unknown: "cold",
};

/* ---------------------------- Diamond leads ---------------------------- */

/**
 * Minimum normalised intent (1-5) for a lead to qualify as Diamond on
 * intent alone. Four of five — the top band, not merely above average.
 */
export const DIAMOND_INTENT_FLOOR = 4;

/** Statuses where the lead is no longer worth calling first, or at all. */
const DIAMOND_EXCLUDED_STATUSES = new Set(["closed", "disqualified", "ghosted"]);

export type DiamondLeadInput = LeadQualityInput & {
  precall_video_watched?: boolean | null;
};

/**
 * "Call this one first."
 *
 * Replaces a check that could never fire. The Diamond badge previously tested
 * `priority === "diamond"`, but `leads.priority` is constrained to
 * ('low','normal','high','urgent') by the sales_crm_foundation migration — so
 * the count was structurally always zero, not merely undefined.
 *
 * Every input here is a real, observed signal:
 *   - `precall_video_watched` is now proven by an actual link open
 *     (lead_video_links / the /pcv resolve), not a checkbox a rep ticks
 *   - `intent_score` is the same field hub-metrics already averages
 *   - `priority = 'urgent'` is the one genuine escalation value the schema
 *     permits, so a rep keeps a manual lever that actually works
 *
 * Nothing is invented and no new column is needed. A lead with no signal at
 * all is not Diamond — absence of evidence is not evidence of quality.
 */
export function isDiamondLead(lead: DiamondLeadInput): boolean {
  if (lead.status && DIAMOND_EXCLUDED_STATUSES.has(lead.status)) return false;

  // A rep flagging a lead urgent outranks the derived signals — they have
  // context the columns don't.
  if (lead.priority === "urgent") return true;

  const intent = Number(lead.intent_score ?? 0);
  const scaledIntent = intent > 0 ? scaleIntentScore(intent) : 0;
  const hotIntent = scaledIntent >= DIAMOND_INTENT_FLOOR;
  const watched = lead.precall_video_watched === true;

  // Both signals, not either: high intent alone is a warm lead, and watching
  // the video alone is curiosity. Together they are someone qualified who has
  // done the homework — which is the thing worth interrupting your day for.
  return hotIntent && watched;
}
