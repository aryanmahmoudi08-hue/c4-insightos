import { csvHeaderIndex, csvNumber, csvOptionalNumber, parseCSVLine } from "@/lib/csv";

/**
 * Manual/CSV entry for `public.webinar_metrics` — the day-level rollup the
 * Webinar Analytics page already reads but nothing could previously write.
 *
 * This is the documented degraded path for a webinar platform that can't
 * expose per-attendee events (docs/ascendos-external-integration-contract.md
 * §5): filling this table lights up the Executive KPI and Closing & Return
 * groups without any event-level integration, exactly as VSL Analytics
 * already works off manually entered / CSV-imported snapshots.
 *
 * Pure on purpose — no Supabase import — so the parsing and coercion rules
 * are unit-testable on their own, same separation as rep-kpi-actuals.ts.
 */

/** Every nullable metric column on `webinar_metrics`. Money is in cents, to
 * match the column names and the rest of this schema. */
export type WebinarMetricInput = {
  lead_capture_investment_cents: number | null;
  clicks: number | null;
  visits_paid: number | null;
  visits_organic: number | null;
  paid_leads: number | null;
  organic_leads: number | null;
  group_leads: number | null;
  email_opens: number | null;
  email_clicks: number | null;
  registered: number | null;
  live_attendees: number | null;
  pitch_attendees: number | null;
  deposits: number | null;
  sales: number | null;
  core_revenue_cents: number | null;
  refunds_cents: number | null;
  order_bump_sales: number | null;
  order_bump_revenue_cents: number | null;
  upsell_sales: number | null;
  upsell_revenue_cents: number | null;
};

export type WebinarMetricRowInput = WebinarMetricInput & { captured_at: string };

export const EMPTY_WEBINAR_METRIC: WebinarMetricInput = {
  lead_capture_investment_cents: null,
  clicks: null,
  visits_paid: null,
  visits_organic: null,
  paid_leads: null,
  organic_leads: null,
  group_leads: null,
  email_opens: null,
  email_clicks: null,
  registered: null,
  live_attendees: null,
  pitch_attendees: null,
  deposits: null,
  sales: null,
  core_revenue_cents: null,
  refunds_cents: null,
  order_bump_sales: null,
  order_bump_revenue_cents: null,
  upsell_sales: null,
  upsell_revenue_cents: null,
};

/** Accepted CSV header spellings per column. Deliberately generous about
 * wording but never about meaning — e.g. "attendees" alone is NOT accepted,
 * because it's ambiguous between live and pitch attendance. */
const COLUMN_ALIASES: Record<keyof WebinarMetricInput, string[]> = {
  lead_capture_investment_cents: ["lead_capture_investment", "ad_spend", "spend", "investment"],
  clicks: ["clicks"],
  visits_paid: ["visits_paid", "paid_visits"],
  visits_organic: ["visits_organic", "organic_visits"],
  paid_leads: ["paid_leads"],
  organic_leads: ["organic_leads"],
  group_leads: ["group_leads"],
  email_opens: ["email_opens", "opens"],
  email_clicks: ["email_clicks"],
  registered: ["registered", "registrations", "registrants"],
  live_attendees: ["live_attendees", "live_attendance", "attended_live"],
  pitch_attendees: ["pitch_attendees", "pitch_attendance", "stayed_to_pitch"],
  deposits: ["deposits"],
  sales: ["sales", "closes"],
  core_revenue_cents: ["core_revenue", "revenue"],
  refunds_cents: ["refunds", "refunded"],
  order_bump_sales: ["order_bump_sales", "bump_sales"],
  order_bump_revenue_cents: ["order_bump_revenue", "bump_revenue"],
  upsell_sales: ["upsell_sales"],
  upsell_revenue_cents: ["upsell_revenue"],
};

/** Columns whose CSV value is written in whole currency units and stored as
 * cents. Counts are never scaled. */
const MONEY_COLUMNS = new Set<keyof WebinarMetricInput>([
  "lead_capture_investment_cents",
  "core_revenue_cents",
  "refunds_cents",
  "order_bump_revenue_cents",
  "upsell_revenue_cents",
]);

export type ParsedWebinarCsv = {
  rows: WebinarMetricRowInput[];
  /** Header names that matched no known column — surfaced so a user whose
   * export uses different wording finds out, rather than silently importing
   * a row of nulls. */
  unrecognizedHeaders: string[];
  /** Columns this import will populate. */
  matchedColumns: Array<keyof WebinarMetricInput>;
};

/**
 * Parse an exported CSV into rows ready for `webinar_metrics`.
 *
 * A row's `captured_at` comes from a date column when present, otherwise the
 * caller's `fallbackCapturedAt` — never silently "now" from inside here, so
 * the caller stays in control of what an undated import claims.
 *
 * Money columns are read as whole currency units and converted to cents.
 * Absent columns and blank cells stay null: on this table 0 is a real
 * measurement ("nobody showed") and null means "not supplied", and the page
 * renders the two differently ("0" vs "Unavailable").
 */
export function parseWebinarMetricsCsv(csv: string, fallbackCapturedAt: string): ParsedWebinarCsv {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length < 2) throw new Error("Need a header row plus at least one data row.");

  const idx = csvHeaderIndex(lines[0]);
  const headerCells = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
  );
  const dateIndex = idx(["captured_at", "date", "day"]);

  const columnIndex = {} as Record<keyof WebinarMetricInput, number>;
  const matchedColumns: Array<keyof WebinarMetricInput> = [];
  const claimed = new Set<number>();
  if (dateIndex >= 0) claimed.add(dateIndex);

  for (const key of Object.keys(COLUMN_ALIASES) as Array<keyof WebinarMetricInput>) {
    const found = idx(COLUMN_ALIASES[key]);
    columnIndex[key] = found;
    if (found >= 0) {
      matchedColumns.push(key);
      claimed.add(found);
    }
  }

  const unrecognizedHeaders = headerCells.filter((h, i) => h !== "" && !claimed.has(i));

  const rows: WebinarMetricRowInput[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    if (!cells.some((c) => c !== "")) continue;

    const metric = { ...EMPTY_WEBINAR_METRIC };
    for (const key of matchedColumns) {
      const value = csvOptionalNumber(cells, columnIndex[key]);
      metric[key] =
        value === null ? null : MONEY_COLUMNS.has(key) ? Math.round(value * 100) : value;
    }

    let capturedAt = fallbackCapturedAt;
    if (dateIndex >= 0 && cells[dateIndex]) {
      const parsed = new Date(cells[dateIndex]);
      if (!Number.isNaN(parsed.getTime())) capturedAt = parsed.toISOString();
    }
    rows.push({ ...metric, captured_at: capturedAt });
  }

  if (!rows.length) throw new Error("No data rows found below the header.");
  return { rows, unrecognizedHeaders, matchedColumns };
}

/** True when every metric on the row is null — a snapshot that would claim
 * nothing. Blocked at the boundary rather than written as an empty row that
 * silently becomes the page's "latest" snapshot. */
export function isEmptyWebinarMetric(metric: WebinarMetricInput): boolean {
  return Object.values(metric).every((v) => v === null);
}

/** Dollars (or whatever the workspace's entry currency is) -> cents, for the
 * manual form's money inputs. Blank stays null rather than becoming 0. */
export function moneyInputToCents(value: string): number | null {
  if (!value.trim()) return null;
  const n = csvNumber(value);
  return Math.round(n * 100);
}

/** Plain count input -> number, blank stays null. */
export function countInputToNumber(value: string): number | null {
  if (!value.trim()) return null;
  return Math.round(csvNumber(value));
}
