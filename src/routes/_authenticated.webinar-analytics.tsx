import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  ClipboardCheck,
  Radio,
  RefreshCw,
  UsersRound,
  UserRound,
  Video,
} from "lucide-react";
import { TopBar } from "@/components/app-sidebar";
import { KpiBand } from "@/components/kpi-band";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import { supabase } from "@/integrations/supabase/client";
import {
  aggregateWebinarMetrics,
  compareWebinars,
  retentionCurve,
  type WebinarEvent,
  type WebinarMetricRow,
} from "@/lib/webinar-analytics";
import { splitPitchOutcomes, type WebinarEventRow } from "@/lib/webinar-events";
import { calculateAcquisitionMetrics, type AcquisitionSpendRecord } from "@/lib/acquisition";
import { createMockWebinarFixture } from "@/lib/webinar-mock-data";
import { webinarProfit } from "@/lib/operating-workflows";

export const Route = createFileRoute("/_authenticated/webinar-analytics")({
  component: WebinarAnalyticsPage,
});

type Webinar = { id: string; name: string; status: string; starts_at: string | null };
type WebinarMetric = {
  registered?: number | null;
  live_attendees?: number | null;
  pitch_attendees?: number | null;
  deposits?: number | null;
  sales?: number | null;
  core_revenue_cents?: number | null;
  lead_capture_investment_cents?: number | null;
  paid_leads?: number | null;
  organic_leads?: number | null;
  group_leads?: number | null;
  source?: string | null;
};

const currency = (cents: number | null | undefined) =>
  cents == null ? "Unavailable" : `$${Math.round(cents / 100).toLocaleString()}`;
const number = (value: number | null | undefined) =>
  value == null ? "Unavailable" : value.toLocaleString();
const rate = (numerator: number | null | undefined, denominator: number | null | undefined) =>
  numerator == null || denominator == null || denominator === 0
    ? "Unavailable"
    : `${((numerator / denominator) * 100).toFixed(1)}%`;

function WebinarAnalyticsPage() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;
  const [selectedId, setSelectedIdRaw] = useState(devBypass ? "mock-webinar-a" : "all");
  const [comparisonId, setComparisonId] = useState(devBypass ? "mock-webinar-b" : "none");
  // A webinar can't be compared against itself — if the primary selection
  // changes to match the current comparison choice, drop the comparison
  // back to "none" rather than silently comparing a webinar with itself.
  const setSelectedId = (id: string) => {
    setSelectedIdRaw(id);
    setComparisonId((prev) => (prev === id ? "none" : prev));
  };
  const webinarOptionLabel = (webinar: Webinar) => {
    const date = webinar.starts_at
      ? new Date(webinar.starts_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "No date";
    return `${webinar.name} · ${date} · ${webinar.status}`;
  };
  const mockFixture = useMemo(
    () => createMockWebinarFixture(new Date("2026-08-27T12:00:00.000Z")),
    [],
  );
  // Webinar tables are from the additive analytics migration and are not yet present in the generated client type snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const webinarsQuery = useQuery({
    queryKey: ["webinars", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async (): Promise<Webinar[]> => {
      if (devBypass) return mockFixture.webinars;
      const { data, error } = await db
        .from("webinars")
        .select("id,name,status,starts_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const metricsQuery = useQuery({
    queryKey: ["webinar-metrics", orgId, selectedId, range.from, range.to, devBypass],
    enabled: (devBypass || !!orgId) && selectedId !== "all",
    queryFn: async (): Promise<WebinarMetric[]> => {
      if (devBypass) return mockFixture.metrics[selectedId] ?? [];
      const { data, error } = await db
        .from("webinar_metrics")
        .select("*")
        .eq("org_id", orgId)
        .eq("webinar_id", selectedId)
        .gte("captured_at", `${range.from}T00:00:00`)
        .lte("captured_at", `${range.to}T23:59:59`)
        .order("captured_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  const latest = metricsQuery.data?.[0];
  const comparisonQuery = useQuery({
    queryKey: ["webinar-metrics-comparison", orgId, comparisonId, range.from, range.to, devBypass],
    enabled: (devBypass || !!orgId) && comparisonId !== "none" && comparisonId !== "all",
    queryFn: async (): Promise<WebinarMetricRow[]> => {
      if (devBypass) return mockFixture.metrics[comparisonId] ?? [];
      const { data, error } = await db
        .from("webinar_metrics")
        .select("*")
        .eq("org_id", orgId)
        .eq("webinar_id", comparisonId)
        .gte("captured_at", `${range.from}T00:00:00`)
        .lte("captured_at", `${range.to}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
  const eventsQuery = useQuery({
    queryKey: ["webinar-events", orgId, selectedId, range.from, range.to, devBypass],
    enabled: (devBypass || !!orgId) && selectedId !== "all",
    queryFn: async (): Promise<WebinarEvent[]> => {
      if (devBypass) return mockFixture.events[selectedId] ?? [];
      const { data, error } = await db
        .from("webinar_events")
        .select(
          "id, lead_id, event_type, occurred_at, source_platform, source_type, registration_source, source_campaign, source_content_id, source_format, provider_event_id, event_key, metadata",
        )
        .eq("org_id", orgId)
        .eq("webinar_id", selectedId)
        .gte("occurred_at", `${range.from}T00:00:00`)
        .lte("occurred_at", `${range.to}T23:59:59`)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });
  const webinarEvents = useMemo(
    () => (eventsQuery.data ?? []) as WebinarEventRow[],
    [eventsQuery.data],
  );
  const spendQuery = useQuery({
    queryKey: ["acquisition-spend", orgId, selectedId, range.from, range.to, devBypass],
    enabled: (devBypass || !!orgId) && selectedId !== "all",
    queryFn: async (): Promise<AcquisitionSpendRecord[]> => {
      if (devBypass) return mockFixture.spend[selectedId] ?? [];
      const { data, error } = await db
        .from("acquisition_spend")
        .select(
          "org_id, provider, ad_account_id, campaign_id, campaign_name, spend_date, currency, spend_amount_cents, impressions, clicks, paid_visits, is_remarketing, source_platform, source_type, webinar_id, content_id, external_record_id, captured_at, metadata",
        )
        .eq("org_id", orgId)
        .eq("webinar_id", selectedId)
        .gte("spend_date", range.from)
        .lte("spend_date", range.to);
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        orgId: String(row.org_id),
        provider: String(row.provider),
        adAccountId: row.ad_account_id as string | null,
        campaignId: row.campaign_id as string | null,
        campaignName: row.campaign_name as string | null,
        spendDate: String(row.spend_date),
        currency: String(row.currency),
        spendAmountCents: row.spend_amount_cents == null ? null : Number(row.spend_amount_cents),
        impressions: row.impressions == null ? null : Number(row.impressions),
        clicks: row.clicks == null ? null : Number(row.clicks),
        paidVisits: row.paid_visits == null ? null : Number(row.paid_visits),
        isRemarketing: Boolean(row.is_remarketing),
        sourcePlatform: row.source_platform as string | null,
        sourceType: row.source_type as AcquisitionSpendRecord["sourceType"],
        webinarId: row.webinar_id as string | null,
        contentId: row.content_id as string | null,
        externalRecordId: String(row.external_record_id),
        capturedAt: row.captured_at as string | null,
        metadata: (row.metadata as Record<string, unknown> | null) ?? {},
      }));
    },
    retry: false,
  });
  const summary = useMemo(
    () => aggregateWebinarMetrics(metricsQuery.data ?? [], webinarEvents),
    [metricsQuery.data, webinarEvents],
  );
  const retention = useMemo(() => retentionCurve(webinarEvents), [webinarEvents]);
  const acquisition = useMemo(
    () =>
      calculateAcquisitionMetrics({
        spend: spendQuery.data ?? [],
        paidLeads: summary.capture.paidLeads,
        attributableCustomers: summary.revenue.totalSales,
        attributableRevenueCents: summary.revenue.totalRevenueCents,
      }),
    [
      spendQuery.data,
      summary.capture.paidLeads,
      summary.revenue.totalSales,
      summary.revenue.totalRevenueCents,
    ],
  );
  const pitchSplit = useMemo(() => splitPitchOutcomes(webinarEvents), [webinarEvents]);
  const profit = useMemo(
    () =>
      webinarProfit({
        contractedRevenueCents: summary.revenue.totalRevenueCents,
        // No column on webinar_metrics or the event pipeline guarantees a
        // distinct "cash collected" figure separate from contracted revenue
        // — unlike calls.cash_collected_cents. Rather than duplicate
        // totalRevenueCents under a different label, this stays null/
        // "Unavailable" until that data genuinely exists.
        cashCollectedCents: null,
        realizedRevenueCents: summary.closing.coreRevenueCents,
        attributableCostsCents: acquisition.spendCents,
      }),
    [acquisition.spendCents, summary.closing.coreRevenueCents, summary.revenue.totalRevenueCents],
  );
  const comparison = useMemo(
    () => compareWebinars(metricsQuery.data ?? [], comparisonQuery.data ?? []),
    [metricsQuery.data, comparisonQuery.data],
  );
  const selected = useMemo(
    () => webinarsQuery.data?.find((webinar) => webinar.id === selectedId),
    [webinarsQuery.data, selectedId],
  );
  const comparisonWebinar = useMemo(
    () => webinarsQuery.data?.find((webinar) => webinar.id === comparisonId),
    [webinarsQuery.data, comparisonId],
  );
  const hasData = !!latest || webinarEvents.length > 0;

  return (
    <>
      <TopBar
        title="Webinar Analytics"
        subtitle="A unified acquisition, attendance, sales, and revenue view for every webinar."
        showDateRange
      />
      <main className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/40 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.2)] backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2 text-cyan-300">
              <Video className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
                {webinarEvents.length > 0 ? (
                  <>
                    <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
                    Telemetry connected · {webinarEvents.length} events
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    Telemetry not connected
                  </>
                )}
              </div>
              <div className="mt-1 truncate text-base font-semibold tracking-tight text-white">
                {selected?.name ?? "Webinar workspace"}
              </div>
            </div>
          </div>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger
              className="w-full border-white/10 bg-black/50 text-xs shadow-none backdrop-blur-xl sm:w-[280px]"
              title={selected?.name}
            >
              <SelectValue placeholder="Choose webinar command" className="truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All webinars</SelectItem>
              {(webinarsQuery.data ?? []).map((webinar) => (
                <SelectItem key={webinar.id} value={webinar.id} title={webinarOptionLabel(webinar)}>
                  <span className="block max-w-[260px] truncate">
                    {webinarOptionLabel(webinar)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedId === "all" ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" />}
            title="No webinar selected"
            description="Create or select a webinar to analyze acquisition, attendance, retention, sales setting, closing, and return."
          />
        ) : (
          <>
            <section className="space-y-3">
              <SectionTitle
                title={selected?.name ?? "Webinar detail"}
                subtitle="Executive KPI layer · metrics remain unavailable until a legitimate source is connected."
              />
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3 backdrop-blur">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
                  Compare with
                </span>
                {(webinarsQuery.data?.length ?? 0) < 2 ? (
                  <span className="text-xs text-white/45">
                    Add another webinar to enable a comparison.
                  </span>
                ) : (
                  <Select value={comparisonId} onValueChange={setComparisonId}>
                    <SelectTrigger className="w-full max-w-[280px]" title={comparisonWebinar?.name}>
                      <SelectValue placeholder="Select a webinar to compare" className="truncate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No comparison</SelectItem>
                      {(webinarsQuery.data ?? [])
                        .filter((webinar) => webinar.id !== selectedId)
                        .map((webinar) => (
                          <SelectItem
                            key={webinar.id}
                            value={webinar.id}
                            title={webinarOptionLabel(webinar)}
                          >
                            <span className="block max-w-[260px] truncate">
                              {webinarOptionLabel(webinar)}
                            </span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <KpiBand
                title="Executive KPIs"
                items={[
                  {
                    key: "totalLeads",
                    label: "Total Leads",
                    value: number(summary.capture.totalLeads),
                    spectrum: "cold",
                    icon: <UsersRound className="h-4 w-4" />,
                  },
                  {
                    key: "showUpRate",
                    label: "Show-up Rate",
                    value:
                      summary.webinar.showUpRate == null
                        ? "Unavailable"
                        : `${(summary.webinar.showUpRate * 100).toFixed(1)}%`,
                    spectrum: "mid",
                    icon: <Video className="h-4 w-4" />,
                    empty: summary.webinar.showUpRate == null,
                    emptyHint: "Requires event-backed live-attendance data.",
                  },
                  {
                    key: "liveAtPitch",
                    label: "Live at Pitch",
                    value: number(summary.webinar.pitchAttendees),
                    spectrum: "mid",
                    icon: <BarChart3 className="h-4 w-4" />,
                  },
                  {
                    key: "totalRevenue",
                    label: "Total Revenue",
                    value: currency(summary.revenue.totalRevenueCents),
                    spectrum: "hot",
                    icon: <CircleDollarSign className="h-4 w-4" />,
                  },
                  {
                    key: "roas",
                    label: "ROAS",
                    value:
                      summary.revenue.roas == null
                        ? "Unavailable"
                        : `${summary.revenue.roas.toFixed(2)}x`,
                    spectrum: "hot",
                    icon: <CircleDollarSign className="h-4 w-4" />,
                    empty: summary.revenue.roas == null,
                    emptyHint: acquisition.hasSpend
                      ? "No attributable revenue yet."
                      : "Requires connected acquisition spend.",
                  },
                ]}
              />
              <section className="space-y-3">
                <SectionTitle
                  title="Acquisition efficiency"
                  subtitle="Provider-reported spend and delivery facts; unavailable until a legitimate acquisition source is connected."
                />
                <KpiBand
                  title="Acquisition efficiency"
                  items={[
                    {
                      key: "leadCaptureInvestment",
                      label: "Lead Capture Investment",
                      value: acquisition.hasSpend
                        ? currency(acquisition.spendCents)
                        : "Unavailable",
                      spectrum: "hot",
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      empty: !acquisition.hasSpend,
                      emptyHint: "Requires connected acquisition spend.",
                    },
                    {
                      key: "impressions",
                      label: "Impressions",
                      value: number(acquisition.impressions),
                      spectrum: "cold",
                      icon: <BarChart3 className="h-4 w-4" />,
                    },
                    {
                      key: "clicks",
                      label: "Clicks",
                      value: number(acquisition.clicks),
                      spectrum: "cold",
                      icon: <BarChart3 className="h-4 w-4" />,
                    },
                    {
                      key: "ctr",
                      label: "CTR",
                      value:
                        acquisition.ctr == null
                          ? "Unavailable"
                          : `${(acquisition.ctr * 100).toFixed(2)}%`,
                      spectrum: "mid",
                      icon: <BarChart3 className="h-4 w-4" />,
                      empty: acquisition.ctr == null,
                    },
                    {
                      key: "cpc",
                      label: "CPC",
                      value:
                        acquisition.cpcCents == null
                          ? "Unavailable"
                          : currency(acquisition.cpcCents),
                      spectrum: "mid",
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      empty: acquisition.cpcCents == null,
                    },
                    {
                      key: "cpl",
                      label: "CPL",
                      value:
                        acquisition.cplCents == null
                          ? "Unavailable"
                          : currency(acquisition.cplCents),
                      spectrum: "mid",
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      empty: acquisition.cplCents == null,
                    },
                    {
                      key: "cpa",
                      label: "CPA",
                      value:
                        acquisition.cpaCents == null
                          ? "Unavailable"
                          : currency(acquisition.cpaCents),
                      spectrum: "hot",
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      empty: acquisition.cpaCents == null,
                    },
                    {
                      key: "roasAcquisition",
                      label: "ROAS (Acquisition)",
                      value:
                        acquisition.roas == null
                          ? "Unavailable"
                          : `${acquisition.roas.toFixed(2)}x`,
                      spectrum: "hot",
                      icon: <CircleDollarSign className="h-4 w-4" />,
                      empty: acquisition.roas == null,
                    },
                  ]}
                />
                <div className="text-xs text-muted-foreground">
                  Paid visits: {number(acquisition.paidVisits)} · Remarketing spend is kept separate
                  in the acquisition ledger. Currency: {acquisition.currency ?? "Unavailable"}
                </div>
              </section>
              <section className="space-y-3">
                <SectionTitle
                  title="Paid vs. organic"
                  subtitle="Real lead-capture split by source — same figures used in the webinar comparison table, promoted here for single-webinar view."
                />
                <KpiBand
                  title="Paid vs. organic"
                  items={[
                    {
                      key: "paidLeads",
                      label: "Paid Leads",
                      value: number(summary.capture.paidLeads),
                      spectrum: "hot",
                      empty: !summary.capture.paidLeads,
                      emptyHint: "No paid-source leads captured in this range.",
                    },
                    {
                      key: "organicLeads",
                      label: "Organic Leads",
                      value: number(summary.capture.organicLeads),
                      spectrum: "cold",
                      empty: !summary.capture.organicLeads,
                      emptyHint: "No organic-source leads captured in this range.",
                    },
                    {
                      key: "cpl",
                      label: "Cost per Paid Lead",
                      value:
                        summary.capture.cplCents == null
                          ? "Unavailable"
                          : currency(summary.capture.cplCents),
                      spectrum: "mid",
                      empty: summary.capture.cplCents == null,
                      emptyHint: "Requires connected acquisition spend and paid leads.",
                    },
                  ]}
                />
              </section>
            </section>
            <section className="space-y-3">
              <SectionTitle
                title="Traffic analytics"
                subtitle="Visitor-to-registration flow with attendance split by live and replay behavior."
              />
              <TrafficAnalytics
                visitors={acquisition.paidVisits}
                registrants={summary.webinar.registered}
                liveAttendees={summary.webinar.liveAttendees}
                replayAttendees={
                  retention.find((point) => point.label.toLowerCase().includes("replay"))
                    ?.audience ?? null
                }
              />
            </section>
            <section className="space-y-3">
              <SectionTitle
                title="Webinar analytics"
                subtitle="Key session metrics from the selected webinar event stream. The attendee retention curve is charted once, below, in Audience retention."
              />
              <WebinarAnalyticsOverview
                liveAttendees={summary.webinar.liveAttendees}
                totalSales={summary.revenue.totalSales}
                revenueCents={summary.revenue.totalRevenueCents}
                retentionRate={summary.webinar.retentionUntilPitch}
              />
            </section>
            <section className="grid gap-4 xl:grid-cols-2">
              <RetentionPanel
                retention={retention}
                registered={summary.webinar.registered}
                liveAttendees={summary.webinar.liveAttendees}
                pitchAttendees={summary.webinar.pitchAttendees}
                retentionRate={summary.webinar.retentionUntilPitch}
              />
              <AnalyticsPanel
                title="Closing and return"
                description="Checkout conversion, sales, core offer revenue, refunds, and ROAS"
                values={[
                  ["Deposits", number(summary.salesSetting.deposits)],
                  ["Sales", number(summary.revenue.totalSales)],
                  ["Contracted revenue", currency(summary.revenue.totalRevenueCents)],
                  ["Core offer revenue", currency(summary.closing.coreRevenueCents)],
                  ["Refunds", currency(summary.closing.refundsCents)],
                  ["Order bump revenue", currency(summary.closing.orderBumpRevenueCents)],
                  ["Upsell revenue", currency(summary.closing.upsellRevenueCents)],
                  [
                    "ROAS (core + bump + upsell revenue)",
                    summary.revenue.roas == null
                      ? "Unavailable without legitimate spend"
                      : `${summary.revenue.roas.toFixed(2)}x`,
                  ],
                  [
                    "Net profit (core offer revenue basis)",
                    profit.netProfitCents == null
                      ? "Unavailable — cost data not connected"
                      : currency(profit.netProfitCents),
                  ],
                ]}
              />
              <AnalyticsPanel
                title="During-pitch vs. after-pitch"
                description="Direct in-webinar checkouts vs. sales-team call outcomes, from the real event stream"
                values={[
                  ["During-pitch sales", number(pitchSplit.duringPitchSales)],
                  [
                    "During-pitch revenue",
                    pitchSplit.duringPitchRevenueCents == null
                      ? `Unavailable — 0 of ${pitchSplit.duringPitchSales} sale event(s) carry an amount`
                      : currency(pitchSplit.duringPitchRevenueCents),
                  ],
                  ["After-pitch sales (booked calls)", number(pitchSplit.afterPitchSales)],
                  [
                    "After-pitch revenue",
                    pitchSplit.afterPitchRevenueCents == null
                      ? `Unavailable — 0 of ${pitchSplit.afterPitchSales} sale event(s) carry an amount`
                      : currency(pitchSplit.afterPitchRevenueCents),
                  ],
                  [
                    "After-pitch conversion (of classified sales)",
                    pitchSplit.afterPitchSales + pitchSplit.duringPitchSales > 0
                      ? `${((pitchSplit.afterPitchSales / (pitchSplit.afterPitchSales + pitchSplit.duringPitchSales)) * 100).toFixed(1)}%`
                      : "Unavailable",
                  ],
                  [
                    "Unclassified sales (no lead ID)",
                    pitchSplit.unclassifiedSales > 0
                      ? `${number(pitchSplit.unclassifiedSales)} — can't tell during vs. after-pitch without a lead ID`
                      : number(pitchSplit.unclassifiedSales),
                  ],
                  [
                    "Unclassified revenue",
                    pitchSplit.unclassifiedRevenueCents == null
                      ? "Unavailable"
                      : currency(pitchSplit.unclassifiedRevenueCents),
                  ],
                ]}
              />
            </section>
            {comparisonId !== "none" && comparisonId !== "all" && comparisonQuery.data && (
              <section className="space-y-3">
                <SectionTitle
                  title="Webinar comparison"
                  subtitle={`${selected?.name ?? "Selected webinar"} vs ${comparisonWebinar?.name ?? "Comparison webinar"}, aggregated from the selected metric rows.`}
                />
                <ComparisonPanel
                  left={comparison.left}
                  right={comparison.right}
                  leftName={selected?.name ?? "Selected webinar"}
                  rightName={comparisonWebinar?.name ?? "Comparison webinar"}
                />
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function TrafficAnalytics({
  visitors,
  registrants,
  liveAttendees,
  replayAttendees,
}: {
  visitors: number | null;
  registrants: number | null | undefined;
  liveAttendees: number;
  replayAttendees: number | null;
}) {
  const signup =
    visitors && registrants != null
      ? `${((registrants / visitors) * 100).toFixed(1)}%`
      : "Unavailable";
  const showup = registrants
    ? `${((liveAttendees / registrants) * 100).toFixed(1)}%`
    : "Unavailable";
  const replayRate =
    registrants && replayAttendees != null
      ? `${((replayAttendees / registrants) * 100).toFixed(1)}%`
      : "Unavailable";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-6 backdrop-blur">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 1000 220"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M235 88 C315 88 325 88 390 88 M610 88 C690 44 715 44 780 44 M610 128 C690 168 715 168 780 168"
          fill="none"
          stroke="rgba(148,163,184,0.65)"
          strokeWidth="2"
          strokeDasharray="5 8"
        />
      </svg>
      <div className="relative grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <TrafficNode
          icon={<UserRound className="h-4 w-4" />}
          label="Visitors"
          value={number(visitors)}
        />
        <TrafficConnector label="Sign up rate" value={signup} />
        <div className="grid gap-4 sm:grid-cols-2 md:col-span-1 md:grid-cols-1">
          <div className="relative">
            <TrafficNode
              icon={<ClipboardCheck className="h-4 w-4" />}
              label="Registrants"
              value={number(registrants)}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 md:absolute md:left-full md:top-0 md:ml-5 md:w-[22rem]">
              <div>
                <TrafficConnector label="Show up rate" value={showup} />
                <TrafficNode
                  icon={<Radio className="h-4 w-4" />}
                  label="Live attendees"
                  value={number(liveAttendees)}
                />
              </div>
              <div>
                <TrafficConnector label="Replay share" value={replayRate} />
                <TrafficNode
                  icon={<RefreshCw className="h-4 w-4" />}
                  label="Replay attendees"
                  value={number(replayAttendees)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="relative mt-5 text-[10px] uppercase tracking-[0.16em] text-white/35">
        Source-backed attendance split · no provider data is inferred
      </div>
    </div>
  );
}

function TrafficNode({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-white/55">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
    </div>
  );
}

function TrafficConnector({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1 text-[10px] uppercase tracking-[0.12em] text-white/40 md:flex-col md:px-0">
      <span className="h-px flex-1 bg-white/15 md:h-6 md:w-px" />
      <span className="whitespace-nowrap text-cyan-300/80">
        {label} · {value}
      </span>
      <ChevronRight className="h-3 w-3 text-white/40 md:rotate-90" />
    </div>
  );
}

// The attendee retention curve used to be charted here AND, redundantly,
// again in RetentionPanel below (identical `retention` data, two separate
// hand-rolled SVG implementations). RetentionPanel's version is the more
// complete one (interactive hover, drop-off %), so it's now the single
// canonical retention chart — this component keeps only the metrics list,
// which RetentionPanel doesn't duplicate.
function WebinarAnalyticsOverview({
  liveAttendees,
  totalSales,
  revenueCents,
  retentionRate,
}: {
  liveAttendees: number;
  totalSales: number;
  revenueCents: number | null;
  retentionRate: number | null;
}) {
  const metrics: Array<[ReactNode, string, string]> = [
    [<Radio className="h-4 w-4" />, "Live attendees", number(liveAttendees)],
    [<Clock3 className="h-4 w-4" />, "Session length", "Unavailable"],
    [<Clock3 className="h-4 w-4" />, "Avrg. time on live room", "Unavailable"],
    [
      <Activity className="h-4 w-4" />,
      "Saw the full webinar",
      retentionRate == null ? "Unavailable" : `${(retentionRate * 100).toFixed(1)}%`,
    ],
    [<BarChart3 className="h-4 w-4" />, "Sales", number(totalSales)],
    [<CircleDollarSign className="h-4 w-4" />, "Revenue", currency(revenueCents)],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-6">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
        Key metrics
      </div>
      <div className="grid gap-x-8 divide-y divide-white/5 sm:grid-cols-2 sm:divide-y-0">
        {metrics.map(([icon, label, value]) => (
          <div
            key={label}
            className="flex items-center gap-3 border-white/5 py-3 first:pt-0 sm:border-b sm:py-2.5"
          >
            <span className="text-cyan-300">{icon}</span>
            <span className="min-w-0 flex-1 text-xs text-white/55">{label}</span>
            <span className="font-mono text-sm text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
function RetentionPanel({
  retention,
  registered,
  liveAttendees,
  pitchAttendees,
  retentionRate,
}: {
  retention: Array<{ label: string; timestamp: string; audience: number; dropOff: number | null }>;
  registered: number | null | undefined;
  liveAttendees: number;
  pitchAttendees: number;
  retentionRate: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(...retention.map((point) => point.audience), 1);
  const points = retention.map((point, index) => ({
    ...point,
    x: retention.length === 1 ? 50 : 8 + (index / (retention.length - 1)) * 84,
    y: 92 - (point.audience / max) * 72,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points.at(-1)?.x ?? 92} 96 L ${points[0]?.x ?? 8} 96 Z`;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Audience retention</h3>
          <p className="mt-1 text-xs text-white/45">
            Registration → live attendance → audience remaining → pitch, based on event timestamps.
          </p>
        </div>
        <Activity className="h-4 w-4 text-cyan-300" />
      </div>
      {retention.length ? (
        <div className="relative mt-5 h-56 overflow-visible">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full overflow-visible"
            preserveAspectRatio="none"
            role="img"
            aria-label="Audience retention curve"
          >
            <defs>
              <linearGradient id="retention-fill" x1="0" x2="0" y1="0" y2="1">
                <stop stopColor="#22d3ee" stopOpacity="0.28" />
                <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Reference gridlines, purely visual — no data changes. Faint
                enough not to compete with the curve itself. */}
            <path d="M8 26 H92" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <path d="M8 61 H92" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            <path d="M8 96 H92" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <path d={area} fill="url(#retention-fill)" />
            <path
              d={line}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="1.8"
              vectorEffect="non-scaling-stroke"
            />
            {points.map((point, index) => (
              <circle
                key={`${point.label}-${point.timestamp}`}
                cx={point.x}
                cy={point.y}
                r={hovered === index ? 3.5 : 2.6}
                fill="white"
                stroke="#22d3ee"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                <title>{`${point.label}: ${point.audience.toLocaleString()} audience${point.dropOff == null ? "" : ` · ${((point.dropOff ?? 0) * 100).toFixed(1)}% drop-off`}`}</title>
              </circle>
            ))}
          </svg>
          {hovered != null && points[hovered] && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-lg border border-cyan-400/30 bg-slate-950/95 px-3 py-2 text-[11px] shadow-[0_0_18px_rgba(34,211,238,0.18)]"
              style={{
                left: `${points[hovered].x}%`,
                top: `${Math.max(0, points[hovered].y - 20)}%`,
              }}
            >
              <div className="font-semibold text-cyan-200">{points[hovered].label}</div>
              <div className="mt-1 text-white">
                {points[hovered].audience.toLocaleString()} audience
              </div>
              <div className="text-white/55">
                {points[hovered].dropOff == null
                  ? "Baseline"
                  : `${((points[hovered].dropOff ?? 0) * 100).toFixed(1)}% drop-off`}
              </div>
            </div>
          )}
        </div>
      ) : null}
      {retention.length ? (
        // Permanent timeline strip — the curve itself carries no on-chart
        // text (SVG text would distort under preserveAspectRatio="none"),
        // so without this the stage each point represents was only ever
        // visible on hover. Safe to always render: retentionFromEvents()
        // caps this at 3 points (Registered / Live attendance / At pitch).
        <div className="relative mt-1 h-8">
          {points.map((point, index) => (
            <div
              key={`label-${point.label}-${point.timestamp}`}
              className="absolute top-0 flex -translate-x-1/2 flex-col items-center text-center"
              style={{ left: `${point.x}%` }}
            >
              <div className="text-3xs whitespace-nowrap uppercase tracking-wider text-white/45">
                {point.label}
              </div>
              <div className="font-mono text-2xs text-white/80">
                {point.audience.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Video className="h-5 w-5" />}
          title="Retention unavailable"
          description="No event-backed registration, attendance, or pitch timestamps are connected for this webinar."
        />
      )}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <RetentionStat label="Registered" value={number(registered)} />
        <RetentionStat label="Live attendees" value={number(liveAttendees)} />
        <RetentionStat label="At pitch" value={number(pitchAttendees)} />
        <RetentionStat
          label="Retention"
          value={retentionRate == null ? "Unavailable" : `${(retentionRate * 100).toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

function RetentionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2">
      <div className="text-3xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}

function ComparisonPanel({
  left,
  right,
  leftName,
  rightName,
}: {
  left: ReturnType<typeof aggregateWebinarMetrics>;
  right: ReturnType<typeof aggregateWebinarMetrics>;
  leftName: string;
  rightName: string;
}) {
  const rows: Array<[string, string, string, number | null, number | null]> = [
    [
      "Paid leads",
      left.capture.paidLeads.toLocaleString(),
      right.capture.paidLeads.toLocaleString(),
      left.capture.paidLeads,
      right.capture.paidLeads,
    ],
    [
      "Organic leads",
      left.capture.organicLeads.toLocaleString(),
      right.capture.organicLeads.toLocaleString(),
      left.capture.organicLeads,
      right.capture.organicLeads,
    ],
    [
      "Total leads",
      left.capture.totalLeads.toLocaleString(),
      right.capture.totalLeads.toLocaleString(),
      left.capture.totalLeads,
      right.capture.totalLeads,
    ],
    [
      "Capture conversion",
      left.capture.conversionRate == null
        ? "Unavailable"
        : `${(left.capture.conversionRate * 100).toFixed(1)}%`,
      right.capture.conversionRate == null
        ? "Unavailable"
        : `${(right.capture.conversionRate * 100).toFixed(1)}%`,
      left.capture.conversionRate,
      right.capture.conversionRate,
    ],
    [
      "Show-up rate",
      left.webinar.showUpRate == null
        ? "Unavailable"
        : `${(left.webinar.showUpRate * 100).toFixed(1)}%`,
      right.webinar.showUpRate == null
        ? "Unavailable"
        : `${(right.webinar.showUpRate * 100).toFixed(1)}%`,
      left.webinar.showUpRate,
      right.webinar.showUpRate,
    ],
    [
      "Live attendees",
      left.webinar.liveAttendees.toLocaleString(),
      right.webinar.liveAttendees.toLocaleString(),
      left.webinar.liveAttendees,
      right.webinar.liveAttendees,
    ],
    [
      "Pitch attendees",
      left.webinar.pitchAttendees.toLocaleString(),
      right.webinar.pitchAttendees.toLocaleString(),
      left.webinar.pitchAttendees,
      right.webinar.pitchAttendees,
    ],
    [
      "Deposits",
      left.salesSetting.deposits.toLocaleString(),
      right.salesSetting.deposits.toLocaleString(),
      left.salesSetting.deposits,
      right.salesSetting.deposits,
    ],
    [
      "Total sales",
      left.revenue.totalSales.toLocaleString(),
      right.revenue.totalSales.toLocaleString(),
      left.revenue.totalSales,
      right.revenue.totalSales,
    ],
    [
      "Revenue",
      currency(left.revenue.totalRevenueCents),
      currency(right.revenue.totalRevenueCents),
      left.revenue.totalRevenueCents,
      right.revenue.totalRevenueCents,
    ],
    [
      "ROAS",
      left.revenue.roas == null ? "Unavailable" : `${left.revenue.roas.toFixed(2)}x`,
      right.revenue.roas == null ? "Unavailable" : `${right.revenue.roas.toFixed(2)}x`,
      left.revenue.roas,
      right.revenue.roas,
    ],
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30 backdrop-blur">
      <div className="grid grid-cols-3 border-b border-white/10 bg-white/[0.02] px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-white/55">
        <span>Metric</span>
        <span className="truncate" title={leftName}>
          {leftName}
        </span>
        <span className="truncate" title={rightName}>
          {rightName}
        </span>
      </div>
      {rows.map(([label, a, b, aNum, bNum]) => {
        const max = Math.max(aNum ?? 0, bNum ?? 0, 1);
        const bar = (value: number | null, color: string) =>
          value == null ? null : (
            <span
              className={`absolute inset-y-1 left-1 rounded-md ${color}`}
              style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
            />
          );
        return (
          <div
            key={label}
            className="grid grid-cols-3 border-b border-white/5 px-4 py-3 text-sm transition hover:bg-white/[0.02] last:border-0"
          >
            <span className="self-center text-white/55">{label}</span>
            <span className="relative overflow-hidden rounded-md px-2 py-1 font-mono text-white">
              <span className="relative z-10">{a}</span>
              {bar(aNum, "bg-purple-500/20")}
            </span>
            <span className="relative overflow-hidden rounded-md px-2 py-1 font-mono text-white">
              <span className="relative z-10">{b}</span>
              {bar(bNum, "bg-cyan-500/15")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AnalyticsPanel({
  title,
  description,
  values,
}: {
  title: string;
  description: string;
  values: [string, string][];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-xs text-white/45">{description}</p>
      <div className="mt-4 space-y-2">
        {values.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
          >
            <span className="text-white/55">{label}</span>
            <span className="font-mono text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
