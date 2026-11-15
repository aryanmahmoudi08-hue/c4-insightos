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
  cash_collected_cents: number | null;
  original_currency: string | null;
};

export type SourceRow = {
  name: string;
  leads: number;
  applications: number;
  booked: number;
  cashCents: number;
};

export type SourceBoard = {
  sources: SourceRow[];
  unattributed: SourceRow;
  content: Array<SourceRow & { contentId: string }>;
  /** Calls with cash logged in a currency other than USD — not summed. */
  non_usd_rows_excluded: number;
};

const blank = (name: string): SourceRow => ({
  name,
  leads: 0,
  applications: 0,
  booked: 0,
  cashCents: 0,
});

const rank = (a: SourceRow, b: SourceRow) =>
  b.leads - a.leads ||
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

  const rowFor = (l: SourceLead | null) => {
    if (!l) return { source: unattributed, content: null };
    const name = sourceOf(l);
    const source =
      name === UNATTRIBUTED
        ? unattributed
        : (bySource.get(name) ?? bySource.set(name, blank(name)).get(name)!);
    const cid = contentOf(l);
    let content: (SourceRow & { contentId: string }) | null = null;
    if (cid) {
      content =
        byContent.get(cid) ??
        byContent
          .set(cid, { ...blank(contentTitles.get(cid) ?? "Untitled piece"), contentId: cid })
          .get(cid)!;
    }
    return { source, content };
  };

  for (const l of windowLeads) {
    const { source, content } = rowFor(l);
    source.leads += 1;
    if (content) content.leads += 1;
    // A partial is a lead, but not an application submitted.
    if (!l.application_partial && hasApplication(l.application_data)) {
      source.applications += 1;
      if (content) content.applications += 1;
    }
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
    const { source, content } = rowFor(leadOfCall(c));
    // A booking is a Calendly row; closer-logged rows are outcomes of calls,
    // not new bookings, and are counted only for the cash on them.
    if (c.source_connector === "calendly") {
      source.booked += 1;
      if (content) content.booked += 1;
    }
    const cash = c.cash_collected_cents ?? 0;
    if (cash) {
      const cur = (c.original_currency ?? "USD").toUpperCase();
      if (cur !== "USD") {
        nonUsd += 1;
        continue;
      }
      source.cashCents += cash;
      if (content) content.cashCents += cash;
    }
  }

  return {
    sources: [...bySource.values()].sort(rank),
    unattributed,
    content: [...byContent.values()].sort(rank).slice(0, 5),
    non_usd_rows_excluded: nonUsd,
  };
}
