import { retentionFromEvents, webinarEventCounts, type WebinarEventRow } from "./webinar-events";

export type WebinarMetricRow = {
  captured_at?: string | null;
  lead_capture_investment_cents?: number | null;
  clicks?: number | null;
  visits_paid?: number | null;
  visits_organic?: number | null;
  paid_leads?: number | null;
  organic_leads?: number | null;
  group_leads?: number | null;
  email_opens?: number | null;
  email_clicks?: number | null;
  registered?: number | null;
  live_attendees?: number | null;
  pitch_attendees?: number | null;
  deposits?: number | null;
  sales?: number | null;
  core_revenue_cents?: number | null;
  refunds_cents?: number | null;
  order_bump_sales?: number | null;
  order_bump_revenue_cents?: number | null;
  upsell_sales?: number | null;
  upsell_revenue_cents?: number | null;
};

const sum = (rows: WebinarMetricRow[], key: keyof WebinarMetricRow) =>
  rows.reduce((total, row) => total + (Number(row[key] ?? 0) || 0), 0);
const divide = (n: number, d: number) => (d > 0 ? n / d : null);

export function aggregateWebinarMetrics(rows: WebinarMetricRow[], events: WebinarEventRow[] = []) {
  const eventCounts = webinarEventCounts(events);
  const paidLeads = sum(rows, "paid_leads");
  const organicLeads = sum(rows, "organic_leads");
  const totalLeads = paidLeads + organicLeads;
  const visitsPaid = sum(rows, "visits_paid");
  const clicks = sum(rows, "clicks");
  const registered = events.length > 0 ? eventCounts.registrations : sum(rows, "registered");
  const liveAttendees = events.length > 0 ? eventCounts.liveAttendees : sum(rows, "live_attendees");
  const pitchAttendees =
    events.length > 0 ? eventCounts.pitchAttendees : sum(rows, "pitch_attendees");
  const coreRevenueCents = sum(rows, "core_revenue_cents");
  const bumpRevenueCents = sum(rows, "order_bump_revenue_cents");
  const upsellRevenueCents = sum(rows, "upsell_revenue_cents");
  const spendCents = sum(rows, "lead_capture_investment_cents");
  const revenueCents = coreRevenueCents + bumpRevenueCents + upsellRevenueCents;
  const deposits = events.length > 0 ? eventCounts.deposits : sum(rows, "deposits");
  const sales = events.length > 0 ? eventCounts.closes : sum(rows, "sales");
  return {
    awareness: {
      investmentCents: spendCents,
      cpcCents: divide(spendCents, clicks),
      ctr: divide(clicks, visitsPaid),
      connectRate: divide(totalLeads, visitsPaid),
      paidVisits: visitsPaid,
    },
    capture: {
      conversionRate: divide(totalLeads, visitsPaid),
      paidLeads,
      organicLeads,
      totalLeads,
      cplCents: divide(spendCents, paidLeads),
      groupLeads: sum(rows, "group_leads"),
      leadToGroupRate: divide(sum(rows, "group_leads"), totalLeads),
      emailOpenRate: divide(sum(rows, "email_opens"), totalLeads),
      emailCtor: divide(sum(rows, "email_clicks"), sum(rows, "email_opens")),
    },
    webinar: {
      registered,
      showUpRate: divide(liveAttendees, registered),
      liveAttendees,
      pitchAttendees,
      retentionUntilPitch: divide(pitchAttendees, liveAttendees),
      applications: events.length > 0 ? eventCounts.applications : null,
      engagementEvents: events.length > 0 ? eventCounts.engagement : null,
      replayStarts: events.length > 0 ? eventCounts.replayStarts : null,
      replayCompletions: events.length > 0 ? eventCounts.replayCompletions : null,
    },
    salesSetting: {
      deposits,
      pitchConversionRate: divide(deposits, pitchAttendees),
      leadListConversionRate: divide(deposits, totalLeads),
      bookedCalls: events.length > 0 ? eventCounts.bookedCalls : null,
      shows: events.length > 0 ? eventCounts.shows : null,
      offers: events.length > 0 ? eventCounts.offers : null,
    },
    closing: {
      checkoutConversionRate: divide(sales, deposits),
      coreRevenueCents,
      refundsCents: sum(rows, "refunds_cents"),
      cpaCents: divide(spendCents, sales),
      orderBumpSales: sum(rows, "order_bump_sales"),
      orderBumpConversion: divide(sum(rows, "order_bump_sales"), sales),
      orderBumpRevenueCents: bumpRevenueCents,
      upsellSales: sum(rows, "upsell_sales"),
      upsellConversion: divide(sum(rows, "upsell_sales"), sales),
      upsellRevenueCents: upsellRevenueCents,
    },
    revenue: {
      totalSales: sales,
      totalRevenueCents: revenueCents,
      roas: spendCents > 0 && revenueCents > 0 ? revenueCents / spendCents : null,
    },
  };
}

export type WebinarEvent = WebinarEventRow;

export function retentionCurve(events: WebinarEvent[]) {
  return retentionFromEvents(events);
}

export function compareWebinars(
  left: WebinarMetricRow[],
  right: WebinarMetricRow[],
  leftEvents: WebinarEvent[] = [],
  rightEvents: WebinarEvent[] = [],
) {
  return {
    left: aggregateWebinarMetrics(left, leftEvents),
    right: aggregateWebinarMetrics(right, rightEvents),
  };
}
