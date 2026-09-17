/**
 * Canonical sales-call objection taxonomy — the single source of truth for
 * "what prevented or delayed the prospect from buying," used everywhere the
 * app captures, displays, filters, or aggregates objections (Closer EOD,
 * the closer dashboard's "Log a sales call" dialog + objection-frequency
 * breakdown, call_objections.category). Every consumer imports this list
 * rather than keeping its own copy, so the taxonomy can't drift between
 * pages.
 *
 * Deliberately distinct from lead status / disposition ("what ultimately
 * happened to the opportunity") — CLOSER_LEAD_STATUS_OPTIONS (eod-reports.ts)
 * and DISPOSITION_OPTIONS (_authenticated.closer.tsx) are the disposition
 * taxonomy and are never touched by this file. Never add a
 * disposition-shaped value here (Not a Fit, Unqualified, Follow-Up,
 * Nurture, No Decision, etc.).
 */

export interface ObjectionCategoryOption {
  value: string;
  label: string;
}

export const OTHER_OBJECTION_VALUE = "other";

export const OBJECTION_CATEGORIES: ObjectionCategoryOption[] = [
  { value: "money", label: "Money" },
  { value: "think_about_it", label: "Think About It" },
  { value: "partner_spouse", label: "Partner / Spouse" },
  { value: "trust", label: "Trust" },
  { value: "competitor", label: "Competitor" },
  { value: "timing", label: "Timing" },
  { value: "diy_themselves", label: "DIY / Do It Themselves" },
  { value: OTHER_OBJECTION_VALUE, label: "Other" },
];

/**
 * Values `call_objections.category` allowed before this taxonomy sync
 * (migration 20260525173112 predates this; the original CHECK constraint
 * was added in 20260903161218_phase2_dm_setter_dialer_closer_objections.sql
 * as 'price','timing','trust','partner_spouse','competitor','product_fit',
 * 'no_need','unqualified','other'). Four of those are now legacy-only:
 * "price" (renamed to "money"), and "product_fit"/"no_need"/"unqualified"
 * (no canonical equivalent — "unqualified" in particular was disposition
 * bleeding into the objection list, exactly what this taxonomy fixes).
 * Kept here — and in the DB CHECK constraint (migration
 * 20260917090000_objection_taxonomy_sync.sql) — ONLY so historical rows
 * stay valid and render a real label; never offered in any picker.
 */
export const LEGACY_OBJECTION_CATEGORY_LABELS: Record<string, string> = {
  price: "Price (legacy)",
  product_fit: "Product Fit (legacy)",
  no_need: "No Need (legacy)",
  unqualified: "Unqualified (legacy)",
};

/**
 * Best-effort rollup for aggregated reporting only (e.g. the closer
 * dashboard's "By category" breakdown) — a display-time grouping so old
 * rows still contribute to a real bucket instead of vanishing from totals.
 * The stored `category` value on the row itself is never rewritten.
 */
export const LEGACY_OBJECTION_ROLLUP: Record<string, string> = {
  price: "money",
  product_fit: OTHER_OBJECTION_VALUE,
  no_need: OTHER_OBJECTION_VALUE,
  unqualified: OTHER_OBJECTION_VALUE,
};

/** Every value the DB still accepts for `call_objections.category` —
 * canonical + legacy — for anything that needs the full valid set (e.g.
 * bucketing a raw row into a display category). */
export const ALL_OBJECTION_CATEGORY_VALUES: string[] = [
  ...OBJECTION_CATEGORIES.map((c) => c.value),
  ...Object.keys(LEGACY_OBJECTION_CATEGORY_LABELS),
];

export function objectionCategoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const canonical = OBJECTION_CATEGORIES.find((c) => c.value === value);
  if (canonical) return canonical.label;
  return LEGACY_OBJECTION_CATEGORY_LABELS[value] ?? value;
}

/** The canonical bucket a raw stored category rolls up into for aggregated
 * counts — canonical values map to themselves, legacy values roll up per
 * LEGACY_OBJECTION_ROLLUP, and anything unrecognized falls back to "other"
 * rather than disappearing from a report. */
export function objectionCategoryBucket(value: string | null | undefined): string {
  if (!value) return OTHER_OBJECTION_VALUE;
  if (OBJECTION_CATEGORIES.some((c) => c.value === value)) return value;
  return LEGACY_OBJECTION_ROLLUP[value] ?? OTHER_OBJECTION_VALUE;
}
