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
