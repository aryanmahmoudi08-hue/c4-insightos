/**
 * Where leads came from over a window, ranked — for the daily, weekly and
 * monthly top-content-sources channels.
 *
 * Four numbers per source, each attributed through the lead it belongs to:
 *   leads         leads created in the window
 *   applications  of those, the ones that came with an application
 *   booked        calls booked in the window whose lead is known
 *   cash          closer-logged cash in the window on calls whose lead is
 *                 known (by id, or by email when the call only has one)
 *
 * A source is the lead's acquisition source (normalizeAcquisitionSource), and
 * a content piece is its source_content_id, falling back to the first-touch
 * piece.
 *
 * "Unknown / Unattributed" is reported on its own line and never ranked.
 * Links are not UTM-tagged yet, so it is the biggest bucket by far — ranked,
 * it would "win" every report and say nothing. Calls and cash that cannot be
 * tied to any lead land there too rather than being guessed into a source.
 */
import { normalizeAcquisitionSource } from "./acquisition-source";

export const UNATTRIBUTED = "Unknown / Unattributed";

export type SourceLead = {
  id: string;
  email: string | null;
  source_platform: string | null;
  /** utm_medium: where on the platform (bio, story, reel, dm…). */
  source_medium?: string | null;
  /** utm_content: the exact post's tag, e.g. "reel-1114-layoff". */
  source_content_tag?: string | null;
  source_content_id: string | null;
  first_touch_content_id: string | null;
  application_data: unknown;
  /** A started-but-unsubmitted Typeform application. */
  application_partial?: boolean | null;
  created_at: string;
};

export type SourceCall = {
  lead_id: string | null;
  lead_email: string | null;
  created_at: string;
  source_connector: string | null;
  cancelled: boolean | null;
  closed?: boolean | null;
  cash_collected_cents: number | null;
  contract_value_cents?: number | null;
  original_currency: string | null;
};

export type SourceRow = {
  name: string;
  leads: number;
  applications: number;
  booked: number;
  closed: number;
  cashCents: number;
  revenueCents: number;
};

export type SourceBoard = {
  sources: SourceRow[];
  unattributed: SourceRow;
  /** Platform · placement (utm_medium), ranked like sources. */
  placements: SourceRow[];
  /** Top posts: a content piece, or a tagged link's utm_content. */
  content: Array<SourceRow & { contentId: string }>;
  totals: SourceRow;
  /** Calls with cash logged in a currency other than USD — not summed. */
  non_usd_rows_excluded: number;
};

const blank = (name: string): SourceRow => ({
  name,
  leads: 0,
  applications: 0,
  booked: 0,
  closed: 0,
  cashCents: 0,
  revenueCents: 0,
});

const rank = (a: SourceRow, b: SourceRow) =>
  b.leads - a.leads ||
  b.closed - a.closed ||
  b.booked - a.booked ||
  b.cashCents - a.cashCents ||
  b.applications - a.applications ||
  a.name.localeCompare(b.name);

function hasApplication(data: unknown) {
  return !!data && typeof data === "object" && Object.keys(data as object).length > 0;
}

/**
 * @param windowLeads   leads created inside the window
 * @param windowCalls   calls created inside the window
 * @param knownLeads    every lead those calls point at (by id or email),
 *                      which may predate the window
 * @param contentTitles content piece id → title, for the content ranking
 */
export function buildSourceBoard(
  windowLeads: SourceLead[],
  windowCalls: SourceCall[],
  knownLeads: SourceLead[],
  contentTitles: Map<string, string>,
): SourceBoard {
  const bySource = new Map<string, SourceRow>();
  const byContent = new Map<string, SourceRow & { contentId: string }>();
  const unattributed = blank(UNATTRIBUTED);
  let nonUsd = 0;

  const sourceOf = (l: SourceLead) => normalizeAcquisitionSource(null, l.source_platform);
  const contentOf = (l: SourceLead) => l.source_content_id ?? l.first_touch_content_id ?? null;

  const byPlacement = new Map<string, SourceRow>();
  const totals = blank("Total");
  const mediumOf = (l: SourceLead) => (l.source_medium ?? "").trim().toLowerCase();

  const rowFor = (l: SourceLead | null) => {
    if (!l) return { source: unattributed, content: null, placement: null };
    const name = sourceOf(l);
    const source =
      name === UNATTRIBUTED
        ? unattributed
        : (bySource.get(name) ?? bySource.set(name, blank(name)).get(name)!);
    const medium = mediumOf(l);
    let placement: SourceRow | null = null;
    if (name !== UNATTRIBUTED && medium) {
      const key = `${name} · ${medium}`;
      placement = byPlacement.get(key) ?? byPlacement.set(key, blank(key)).get(key)!;
    }
    // A logged content piece wins; otherwise the tagged link's utm_content.
    const cid = contentOf(l);
    const tag = (l.source_content_tag ?? "").trim();
    const key = cid ?? (tag ? `tag:${tag.toLowerCase()}` : null);
    let content: (SourceRow & { contentId: string }) | null = null;
    if (key) {
      const label = cid
        ? (contentTitles.get(cid) ?? "Untitled piece")
        : `${tag}${name !== UNATTRIBUTED ? ` (${name}${medium ? ` ${medium}` : ""})` : ""}`;
      content =
        byContent.get(key) ?? byContent.set(key, { ...blank(label), contentId: key }).get(key)!;
    }
    return { source, content, placement };
  };

  const each = (rows: Array<SourceRow | null>, fn: (r: SourceRow) => void) => {
    for (const r of rows) if (r) fn(r);
  };

  for (const l of windowLeads) {
    const { source, content, placement } = rowFor(l);
    const rows = [source, content, placement, totals];
    each(rows, (r) => (r.leads += 1));
    // A partial is a lead, but not an application submitted.
    if (!l.application_partial && hasApplication(l.application_data))
      each(rows, (r) => (r.applications += 1));
  }

  const leadById = new Map(knownLeads.map((l) => [l.id, l]));
  // Newest lead per email, matching how bookings are linked.
  const leadByEmail = new Map<string, SourceLead>();
  for (const l of [...knownLeads].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (l.email) leadByEmail.set(l.email.trim().toLowerCase(), l);
  }
  const leadOfCall = (c: SourceCall) =>
    (c.lead_id ? leadById.get(c.lead_id) : undefined) ??
    (c.lead_email ? leadByEmail.get(c.lead_email.trim().toLowerCase()) : undefined) ??
    null;

  for (const c of windowCalls) {
    if (c.cancelled) continue;
    const { source, content, placement } = rowFor(leadOfCall(c));
    const rows = [source, content, placement, totals];
    // A booking is a Calendly row; closer-logged rows are outcomes of calls,
    // not new bookings, and are counted only for the close and money on them.
    if (c.source_connector === "calendly") each(rows, (r) => (r.booked += 1));
    const cur = (c.original_currency ?? "USD").toUpperCase();
    if (cur !== "USD") {
      if (c.cash_collected_cents) nonUsd += 1;
      continue;
    }
    const cash = c.cash_collected_cents ?? 0;
    const revenue = c.closed ? c.contract_value_cents || cash : 0;
    each(rows, (r) => {
      if (c.closed) r.closed += 1;
      r.cashCents += cash;
      r.revenueCents += revenue;
    });
  }

  return {
    sources: [...bySource.values()].sort(rank),
    unattributed,
    placements: [...byPlacement.values()].sort(rank),
    content: [...byContent.values()].sort(rank),
    totals,
    non_usd_rows_excluded: nonUsd,
  };
}
