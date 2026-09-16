/**
 * Reusable hierarchical Webinar filter — the shared value shape, label, and
 * matching logic behind every "Webinar" dropdown in the app (Team Calendar,
 * Legacy Lead CRM, DM Setter, Inbound Dialer, Closer, Webinar Analytics, VSL
 * Analytics). One filter value can express: every webinar, every webinar of
 * one classification, or one specific webinar — never requiring the user to
 * drill into an individual webinar.
 *
 * Webinar classification (`webinar_type`) is intentionally a separate
 * concept from a lead's own acquisition source: a webinar can carry leads
 * from both paid and organic sources at once (see webinar_metrics.paid_leads
 * / organic_leads) while still being classified Paid, Organic, or
 * Unclassified for filtering purposes.
 */

export const WEBINAR_TYPES = ["paid", "organic", "unclassified"] as const;
export type WebinarType = (typeof WEBINAR_TYPES)[number];

export type WebinarRecord = {
  id: string;
  name: string;
  status?: string | null;
  starts_at?: string | null;
  webinar_type: WebinarType;
};

export type WebinarFilterValue =
  | { kind: "all" }
  | { kind: "all-paid" }
  | { kind: "all-organic" }
  | { kind: "all-unclassified" }
  | { kind: "webinar"; webinarId: string };

export const ALL_WEBINARS_FILTER: WebinarFilterValue = { kind: "all" };

export function webinarFilterLabel(
  value: WebinarFilterValue,
  webinarsById: Map<string, WebinarRecord>,
): string {
  switch (value.kind) {
    case "all":
      return "All Webinars";
    case "all-paid":
      return "All Paid Webinars";
    case "all-organic":
      return "All Organic Webinars";
    case "all-unclassified":
      return "All Unclassified Webinars";
    case "webinar":
      return webinarsById.get(value.webinarId)?.name ?? "Unknown Webinar";
  }
}

/** True when `value` selects every webinar (no restriction at all). */
export function isAllWebinars(value: WebinarFilterValue): boolean {
  return value.kind === "all";
}

/**
 * Resolves a filter value down to the concrete set of webinar ids it
 * covers, given the full list of known webinars. Used by pages that need to
 * query `webinar_metrics`/`webinar_events`/etc. with `.in("webinar_id", ids)`
 * for an "All Paid Webinars"-style aggregate view. Returns `null` for
 * `{kind: "all"}` to mean "no restriction" (every webinar), distinct from an
 * empty array (a real classification with zero matching webinars).
 */
export function resolveWebinarIds(
  value: WebinarFilterValue,
  webinars: WebinarRecord[],
): string[] | null {
  switch (value.kind) {
    case "all":
      return null;
    case "all-paid":
      return webinars.filter((w) => w.webinar_type === "paid").map((w) => w.id);
    case "all-organic":
      return webinars.filter((w) => w.webinar_type === "organic").map((w) => w.id);
    case "all-unclassified":
      return webinars.filter((w) => w.webinar_type === "unclassified").map((w) => w.id);
    case "webinar":
      return [value.webinarId];
  }
}

/**
 * Does a given row's `webinarId` (e.g. `leads.source_webinar_id` or
 * `calls.source_webinar_id`) match the selected filter? A row with no
 * webinar attribution at all never matches anything except no filter being
 * an unreachable case here — callers should gate on `isAllWebinars` first if
 * unattributed rows should still show under "All Webinars".
 */
export function matchesWebinarFilter(
  value: WebinarFilterValue,
  rowWebinarId: string | null | undefined,
  webinarsById: Map<string, WebinarRecord>,
): boolean {
  if (value.kind === "all") return true;
  if (!rowWebinarId) return false;
  switch (value.kind) {
    case "all-paid":
      return webinarsById.get(rowWebinarId)?.webinar_type === "paid";
    case "all-organic":
      return webinarsById.get(rowWebinarId)?.webinar_type === "organic";
    case "all-unclassified":
      return webinarsById.get(rowWebinarId)?.webinar_type === "unclassified";
    case "webinar":
      return rowWebinarId === value.webinarId;
  }
}

/**
 * Every classification is entirely one type, for scope-level decisions like
 * "should ROAS show N/A — Organic instead of Unavailable." `null` means the
 * scope mixes classifications (e.g. "All Webinars" spanning paid + organic)
 * and callers should fall back to their normal Unavailable-style handling.
 */
export function uniformWebinarType(
  value: WebinarFilterValue,
  webinars: WebinarRecord[],
): WebinarType | null {
  const ids = resolveWebinarIds(value, webinars);
  const scoped = ids == null ? webinars : webinars.filter((w) => ids.includes(w.id));
  if (scoped.length === 0) return null;
  const types = new Set(scoped.map((w) => w.webinar_type));
  return types.size === 1 ? [...types][0] : null;
}
