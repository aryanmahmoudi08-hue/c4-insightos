import type { AcquisitionSpendRecord } from "./acquisition";
import type { WebinarEventRow } from "./webinar-events";
import type { WebinarMetricRow } from "./webinar-analytics";

type MockWebinar = { id: string; name: string; status: string; starts_at: string; source: "mock" };

export type MockWebinarFixture = {
  webinars: MockWebinar[];
  metrics: Record<string, WebinarMetricRow[]>;
  events: Record<string, WebinarEventRow[]>;
  spend: Record<string, AcquisitionSpendRecord[]>;
};

const DEMO_ORG = "00000000-0000-4000-8000-000000000001";
const CONTENT_A = "00000000-0000-4000-8000-000000000101";
const CONTENT_B = "00000000-0000-4000-8000-000000000102";
const CONTENT_C = "00000000-0000-4000-8000-000000000103";

const isoDay = (base: Date, daysAgo: number) => {
  const value = new Date(base);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
};
const isoTime = (base: Date, daysAgo: number, hour: number, minute = 0) => {
  const value = new Date(`${isoDay(base, daysAgo)}T00:00:00.000Z`);
  value.setUTCHours(hour, minute, 0, 0);
  return value.toISOString();
};

function event(
  webinarId: string,
  eventType: WebinarEventRow["event_type"],
  occurredAt: string,
  sequence: number,
  fields: Partial<WebinarEventRow> = {},
): WebinarEventRow {
  return {
    id: `mock-event-${webinarId}-${sequence}`,
    org_id: DEMO_ORG,
    webinar_id: webinarId,
    event_type: eventType,
    occurred_at: occurredAt,
    event_key: `mock:${webinarId}:${eventType}:${sequence}`,
    source_platform: fields.source_platform ?? null,
    source_type: fields.source_type ?? null,
    registration_source: "MOCK / DEMO",
    source_campaign: fields.source_campaign ?? null,
    source_content_id: fields.source_content_id ?? null,
    source_format: fields.source_format ?? null,
    lead_id: fields.lead_id ?? null,
    provider_event_id: null,
    metadata: { demo: true, ...(fields.metadata ?? {}) },
  };
}

function buildEvents(
  webinarId: string,
  base: Date,
  counts: {
    registrations: number;
    live: number;
    pitch: number;
    applications: number;
    booked: number;
    shows: number;
    offers: number;
    closes: number;
    deposits: number;
    sales: number;
    engagement: number;
    replay: number;
  },
  contentId: string,
  platform: string,
  campaign: string,
) {
  const events: WebinarEventRow[] = [];
  let sequence = 0;
  const sourceFields = {
    source_platform: platform,
    source_type: "paid" as const,
    source_campaign: campaign,
    source_content_id: contentId,
    source_format: "Short Video",
  };
  for (let index = 0; index < counts.registrations; index += 1) {
    const leadId = `mock-lead-${webinarId}-${index + 1}`;
    events.push(
      event(webinarId, "registered", isoTime(base, 9 - (index % 3), 9, index % 50), sequence++, {
        ...sourceFields,
        lead_id: leadId,
      }),
    );
    if (index < counts.live)
      events.push(
        event(webinarId, "live", isoTime(base, 7, 18, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.pitch)
      events.push(
        event(webinarId, "pitch", isoTime(base, 7, 19, 20 + (index % 10)), sequence++, {
          ...sourceFields,
          lead_id: leadId,
          metadata: { audience_remaining: counts.pitch - Math.floor(index / 4) },
        }),
      );
    if (index < counts.engagement)
      events.push(
        event(
          webinarId,
          index % 3 === 0 ? "question" : index % 3 === 1 ? "poll" : "engagement",
          isoTime(base, 7, 18, 10 + (index % 40)),
          sequence++,
          { ...sourceFields, lead_id: leadId },
        ),
      );
    if (index < counts.applications)
      events.push(
        event(webinarId, "application", isoTime(base, 6, 11, index % 50), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.booked)
      events.push(
        event(webinarId, "booked_call", isoTime(base, 5, 12, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.shows)
      events.push(
        event(webinarId, "show", isoTime(base, 4, 13, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.offers)
      events.push(
        event(webinarId, "offer", isoTime(base, 3, 14, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.closes)
      events.push(
        event(webinarId, "close", isoTime(base, 2, 15, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.deposits)
      events.push(
        event(webinarId, "deposit", isoTime(base, 2, 15, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
    if (index < counts.sales)
      events.push(
        event(webinarId, "sale", isoTime(base, 1, 15, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
  }
  for (let index = 0; index < counts.replay; index += 1) {
    const leadId = `mock-replay-lead-${webinarId}-${index + 1}`;
    events.push(
      event(webinarId, "replay_started", isoTime(base, 1, 20, index % 45), sequence++, {
        ...sourceFields,
        lead_id: leadId,
      }),
    );
    if (index < Math.ceil(counts.replay * 0.7))
      events.push(
        event(webinarId, "replay_completed", isoTime(base, 1, 21, index % 45), sequence++, {
          ...sourceFields,
          lead_id: leadId,
        }),
      );
  }
  events.push(
    event(webinarId, "cta_click", isoTime(base, 7, 18, 52), sequence++, { ...sourceFields }),
  );
  events.push(
    event(webinarId, "notification", isoTime(base, 7, 17), sequence++, { ...sourceFields }),
  );
  events.push(
    event(webinarId, "confirmation", isoTime(base, 9, 9), sequence++, { ...sourceFields }),
  );
  events.push(
    event(webinarId, "exited", isoTime(base, 7, 19, 55), sequence++, { ...sourceFields }),
  );
  return events;
}

function buildSpend(
  webinarId: string,
  base: Date,
  values: {
    campaign: string;
    campaignName: string;
    platform: string;
    contentId: string;
    spend: number;
    impressions: number;
    clicks: number;
    visits: number;
  }[],
) {
  return values.map((value, index) => ({
    orgId: DEMO_ORG,
    provider: "mock-demo",
    adAccountId: `mock-ad-account-${webinarId}`,
    campaignId: value.campaign,
    campaignName: `${value.campaignName} · MOCK / DEMO`,
    spendDate: isoDay(base, 8 - index),
    currency: "USD",
    spendAmountCents: value.spend,
    impressions: value.impressions,
    clicks: value.clicks,
    paidVisits: value.visits,
    isRemarketing: index === values.length - 1,
    sourcePlatform: value.platform,
    sourceType: "paid" as const,
    webinarId,
    contentId: value.contentId,
    externalRecordId: `mock-spend-${webinarId}-${value.campaign}`,
    capturedAt: isoTime(base, 8 - index, 23),
    metadata: { demo: true, source: "mock" },
  }));
}

export function createMockWebinarFixture(base = new Date()): MockWebinarFixture {
  const webinars: MockWebinar[] = [
    {
      id: "mock-webinar-a",
      name: "The $10K/Month Growth System · MOCK / DEMO",
      status: "completed",
      starts_at: isoTime(base, 7, 18),
      source: "mock",
    },
    {
      id: "mock-webinar-b",
      name: "How We Generate Qualified Leads Every Week · MOCK / DEMO",
      status: "completed",
      starts_at: isoTime(base, 14, 18),
      source: "mock",
    },
    {
      id: "mock-webinar-c",
      name: "The Client Acquisition Masterclass · MOCK / DEMO",
      status: "completed",
      starts_at: isoTime(base, 21, 18),
      source: "mock",
    },
  ];
  const profiles = [
    {
      id: "mock-webinar-a",
      contentId: CONTENT_A,
      platform: "Instagram",
      campaign: "mock-campaign-instagram-a",
      counts: {
        registrations: 120,
        live: 75,
        pitch: 55,
        applications: 18,
        booked: 15,
        shows: 11,
        offers: 8,
        closes: 4,
        deposits: 6,
        sales: 4,
        engagement: 42,
        replay: 30,
      },
      spend: [
        {
          campaign: "mock-campaign-instagram-a",
          campaignName: "Growth Reels",
          platform: "Instagram",
          contentId: CONTENT_A,
          spend: 185000,
          impressions: 180000,
          clicks: 5200,
          visits: 4100,
        },
        {
          campaign: "mock-campaign-youtube-a",
          campaignName: "Growth Shorts",
          platform: "YouTube",
          contentId: CONTENT_A,
          spend: 95000,
          impressions: 105000,
          clicks: 2600,
          visits: 2050,
        },
      ],
    },
    {
      id: "mock-webinar-b",
      contentId: CONTENT_B,
      platform: "YouTube",
      campaign: "mock-campaign-youtube-b",
      counts: {
        registrations: 150,
        live: 110,
        pitch: 70,
        applications: 30,
        booked: 26,
        shows: 22,
        offers: 17,
        closes: 10,
        deposits: 18,
        sales: 10,
        engagement: 95,
        replay: 45,
      },
      spend: [
        {
          campaign: "mock-campaign-youtube-b",
          campaignName: "Qualified Leads Shorts",
          platform: "YouTube",
          contentId: CONTENT_B,
          spend: 210000,
          impressions: 220000,
          clicks: 7200,
          visits: 5900,
        },
        {
          campaign: "mock-campaign-tiktok-b",
          campaignName: "Qualified Leads Spark",
          platform: "TikTok",
          contentId: CONTENT_B,
          spend: 125000,
          impressions: 160000,
          clicks: 4800,
          visits: 3900,
        },
      ],
    },
    {
      id: "mock-webinar-c",
      contentId: CONTENT_C,
      platform: "TikTok",
      campaign: "mock-campaign-tiktok-c",
      counts: {
        registrations: 80,
        live: 60,
        pitch: 35,
        applications: 14,
        booked: 12,
        shows: 8,
        offers: 6,
        closes: 3,
        deposits: 7,
        sales: 3,
        engagement: 55,
        replay: 28,
      },
      spend: [
        {
          campaign: "mock-campaign-tiktok-c",
          campaignName: "Client Acquisition Spark",
          platform: "TikTok",
          contentId: CONTENT_C,
          spend: 140000,
          impressions: 130000,
          clicks: 6100,
          visits: 4700,
        },
        {
          campaign: "mock-campaign-x-c",
          campaignName: "Client Acquisition Threads",
          platform: "X / Twitter",
          contentId: CONTENT_C,
          spend: 60000,
          impressions: 75000,
          clicks: 1900,
          visits: 1450,
        },
      ],
    },
  ];
  const metrics: Record<string, WebinarMetricRow[]> = {};
  const events: Record<string, WebinarEventRow[]> = {};
  const spend: Record<string, AcquisitionSpendRecord[]> = {};
  for (const profile of profiles) {
    const totalSpend = profile.spend.reduce((sum, row) => sum + row.spend, 0);
    metrics[profile.id] = [
      {
        captured_at: isoTime(base, 0, 23),
        lead_capture_investment_cents: totalSpend,
        clicks: profile.spend.reduce((sum, row) => sum + row.clicks, 0),
        visits_paid: profile.spend.reduce((sum, row) => sum + row.visits, 0),
        paid_leads: Math.round(profile.counts.registrations * 0.65),
        organic_leads: Math.round(profile.counts.registrations * 0.35),
        group_leads: Math.round(profile.counts.registrations * 0.28),
        email_opens: Math.round(profile.counts.registrations * 0.72),
        email_clicks: Math.round(profile.counts.registrations * 0.22),
        registered: profile.counts.registrations,
        live_attendees: profile.counts.live,
        pitch_attendees: profile.counts.pitch,
        deposits: profile.counts.deposits,
        sales: profile.counts.sales,
        core_revenue_cents: profile.counts.sales * 1250000,
        refunds_cents: profile.counts.sales * 35000,
        order_bump_sales: Math.floor(profile.counts.sales * 0.4),
        order_bump_revenue_cents: Math.floor(profile.counts.sales * 0.4) * 150000,
        upsell_sales: Math.floor(profile.counts.sales * 0.25),
        upsell_revenue_cents: Math.floor(profile.counts.sales * 0.25) * 300000,
      },
    ];
    events[profile.id] = buildEvents(
      profile.id,
      base,
      profile.counts,
      profile.contentId,
      profile.platform,
      profile.campaign,
    );
    spend[profile.id] = buildSpend(profile.id, base, profile.spend);
  }
  return { webinars, metrics, events, spend };
}
