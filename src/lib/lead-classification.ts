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

/** One plain amount: "$5,000", "5000", "5k", "5,000.50", "750+". Returns null
 *  for anything with no usable digits. Does not handle ranges — see
 *  `parseCurrencyToCents`. */
function parseSingleAmountToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const kMatch = /^[$]?\s*([\d,]+(?:\.\d+)?)\s*k\+?$/i.exec(trimmed);
  if (kMatch) {
    const n = Number(kMatch[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * 1000 * 100) : null;
  }
  const cleaned = trimmed.replace(/[^\d.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/**
 * A range answer, split on the separator — "$3,000-$5,000", "3k to 5k",
 * "$95–$120K". Returns the two sides unparsed, or null when the text is not a
 * range.
 *
 * Deliberately requires digits on both sides of the separator so "750+",
 * "$10,000+" and a hyphenated word are not mistaken for ranges.
 */
function splitRange(trimmed: string): [string, string] | null {
  const m = /^(.*?\d[\d,.\sk$]*)\s*(?:-|–|—|to)\s*([$]?\s*\d[\d,.\sk$+]*)$/i.exec(trimmed);
  if (!m) return null;
  return [m[1], m[2]];
}

/**
 * Parses a Typeform answer as a dollar amount in cents.
 *
 * Accepts a plain amount ("$5,000", "5000", "5k", "5,000.50", "750+") and a
 * range ("$3,000-$5,000", "$3k-$5k", "95k to 120k"), and returns null for
 * anything else — a name, a choice label with no digits, an empty string —
 * rather than a guess.
 *
 * ## Ranges, and why the lower bound
 *
 * A range used to fall through to the plain-amount path, which strips every
 * non-digit before parsing. That silently concatenated the two ends:
 * "$3,000-$5,000" became the number 30005000, i.e. **$30,005,000**, which
 * clears any realistic tier threshold — and "$3k-$5k" became $35, which
 * clears none. A dropdown of capital bands is the normal shape for this
 * question, so most real answers hit one of those two failures, and a
 * classification is written to the lead with no sign anything went wrong.
 *
 * A range is now read as its lower bound, because a threshold rule asks
 * whether a lead has at least some amount and the lower bound is the part the
 * range actually asserts. Reading "$3,000-$5,000" as $5,000 would classify on
 * money the lead never claimed to have.
 */
export function parseCurrencyToCents(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const range = splitRange(trimmed);
  if (range) {
    // People write the unit once, on the end: "$95-120K" means $95,000 to
    // $120,000, not $95 to $120,000. So a bare low side inherits the high
    // side's k. Only in that direction — "95k-120" is someone's typo, and
    // guessing at it would invent a figure.
    const hasK = (part: string) => /k\s*\+?$/i.test(part.trim());
    const lowText = !hasK(range[0]) && hasK(range[1]) ? `${range[0].trim()}k` : range[0];

    const low = parseSingleAmountToCents(lowText);
    const high = parseSingleAmountToCents(range[1]);
    if (low == null || high == null) return null;
    // "$5,000-$3,000" is written backwards, not a different claim.
    return Math.min(low, high);
  }

  return parseSingleAmountToCents(trimmed);
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

/**
 * `fieldMap` is the connection's slot -> Typeform field ref mapping
 * (`connector_connections.field_map`).
 *
 * Without it, a rule's `typeform_field_key` is looked up directly in the
 * answer index, which only hits when the question's ref or its normalised
 * title happens to equal the rule's key. That is precisely the assumption
 * 20261112160000 removed for `application_data`: a client writes questions in
 * their own words, so "How much capital do you have available?" never keys as
 * `capital`. Classification was left on the old assumption, which is why a
 * lead could show a filled Capital slot and still read Unclassified — the
 * slot resolved through the map and the rule did not.
 *
 * It stays optional, and omitting it behaves exactly as before, so a caller
 * with no connection in hand is unchanged.
 */
export function classifyLead(
  answers: Record<string, string>,
  rules: ClassificationRule[],
  fieldMap?: Record<string, string> | null,
): ClassificationResult {
  const ordered = [...rules].filter((r) => r.is_active).sort((a, b) => a.priority - b.priority);
  for (const rule of ordered) {
    const mappedRef = fieldMap?.[rule.typeform_field_key];
    // A mapped rule reads only the question it was pointed at. Falling back to
    // key matching here would classify a lead on some other question's
    // answer, which is worse than leaving it unclassified.
    const raw = mappedRef ? answers[mappedRef] : answers[rule.typeform_field_key];
    const cents = parseCurrencyToCents(raw);
    if (cents == null) continue;
    if (operatorMatches(rule.operator, cents, rule.threshold_cents)) {
      return { tierKey: rule.tier_key, ruleId: rule.id, rawValue: raw ?? null };
    }
  }
  return { tierKey: null, ruleId: null, rawValue: null };
}
