/**
 * Pure ticket-tier classification — shared by the Typeform ingest handler
 * (server) and anywhere client code needs to preview/audit a classification
 * decision. No I/O here; rules and the raw answer dict are passed in.
 *
 * Rules are evaluated in ascending `priority` order; the first rule whose
 * `typeform_field_key` is present in `answers` AND whose value parses as a
 * currency-like number wins. If no rule matches — missing field, unparsable
 * value, or no active rules at all — the result is `null` (unclassified).
 * Never guess: an unparsable response is a miss, not a fallback tier.
 */
export type ClassificationRule = {
  id: string;
  priority: number;
  typeform_field_key: string;
  operator: "lt" | "lte" | "gt" | "gte" | "eq";
  threshold_cents: number;
  tier_key: string;
  is_active: boolean;
};

export type ClassificationResult = {
  tierKey: string | null;
  ruleId: string | null;
  rawValue: string | null;
};

/** Parses a free-text Typeform answer as a dollar amount in cents. Accepts
 * "$5,000", "5000", "5k", "5,000.50" — anything else (a name, a choice
 * label with no digits, empty string) returns null rather than a guess. */
export function parseCurrencyToCents(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const kMatch = /^[$]?\s*([\d,]+(?:\.\d+)?)\s*k$/i.exec(trimmed);
  if (kMatch) {
    const n = Number(kMatch[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * 1000 * 100) : null;
  }
  const cleaned = trimmed.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

function operatorMatches(op: ClassificationRule["operator"], value: number, threshold: number) {
  switch (op) {
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "eq":
      return value === threshold;
  }
}

export function classifyLead(
  answers: Record<string, string>,
  rules: ClassificationRule[],
): ClassificationResult {
  const ordered = [...rules].filter((r) => r.is_active).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const raw = answers[rule.typeform_field_key];
    const cents = parseCurrencyToCents(raw);
    if (cents == null) continue;
    if (operatorMatches(rule.operator, cents, rule.threshold_cents)) {
      return { tierKey: rule.tier_key, ruleId: rule.id, rawValue: raw ?? null };
    }
  }
  return { tierKey: null, ruleId: null, rawValue: null };
}
