export type AcquisitionSpendRecord = {
  orgId: string;
  provider: string;
  adAccountId?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
  spendDate: string;
  currency: string;
  spendAmountCents?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  paidVisits?: number | null;
  isRemarketing?: boolean;
  sourcePlatform?: string | null;
  sourceType?: "paid" | "organic" | "direct" | "referral" | "unattributed" | null;
  webinarId?: string | null;
  contentId?: string | null;
  externalRecordId: string;
  capturedAt?: string | null;
  metadata?: Record<string, unknown>;
};

export type AcquisitionMetrics = {
  spendCents: number | null;
  impressions: number | null;
  clicks: number | null;
  paidVisits: number | null;
  paidLeads: number | null;
  attributableCustomers: number | null;
  attributableRevenueCents: number | null;
  ctr: number | null;
  cpcCents: number | null;
  cplCents: number | null;
  cpaCents: number | null;
  roas: number | null;
  currency: string | null;
  hasSpend: boolean;
  hasRevenue: boolean;
  scopeCompatible: boolean;
};

export type AcquisitionAttribution = {
  platform?: string | null;
  source?: string | null;
  campaignId?: string | null;
  contentId?: string | null;
  format?: string | null;
  webinarId?: string | null;
  leadId?: string | null;
  date?: string | null;
};

export type AttributionModel =
  | "first_touch"
  | "lead_source"
  | "booking_source"
  | "last_touch"
  | "assisted_touch";
export type AttributionCoverage = "direct" | "partial" | "inferred" | "unavailable";

export type CanonicalLifecycleAttributionPath = {
  personKey: string;
  outcomeKey: string | null;
  platform: string | null;
  source: string | null;
  campaign: string | null;
  contentId: string | null;
  format: string | null;
  setterId: string | null;
  dialerId: string | null;
  closerId: string | null;
  bookingId: string | null;
  callId: string | null;
  offerId: string | null;
  paymentId: string | null;
  retentionOutcome: string | null;
  refundOutcome: string | null;
  events: Array<{ id: string; type: string; at: string }>;
  evidence: AttributionEvidence;
};

export type AttributionEvidence = {
  model: AttributionModel;
  coverage: AttributionCoverage;
  strength: "high" | "medium" | "low" | "unknown";
  knownTouchpoints: number;
  supportingEvents: string[];
  sampleSize: number | null;
  sampleWarning: string | null;
  drilldownKey: string | null;
};

/**
 * Converts observed path evidence into an explainable attribution state.
 * Missing evidence remains unavailable; it is never promoted to direct credit.
 */
export function buildCanonicalLifecycleAttributionPath(input: {
  personKey: string;
  outcomeKey?: string | null;
  platform?: string | null;
  source?: string | null;
  campaign?: string | null;
  contentId?: string | null;
  format?: string | null;
  setterId?: string | null;
  dialerId?: string | null;
  closerId?: string | null;
  bookingId?: string | null;
  callId?: string | null;
  offerId?: string | null;
  paymentId?: string | null;
  retentionOutcome?: string | null;
  refundOutcome?: string | null;
  events?: Array<{ id: string; type: string; at: string }>;
  evidence: Parameters<typeof evaluateAttributionEvidence>[0];
}): CanonicalLifecycleAttributionPath {
  return {
    personKey: input.personKey,
    outcomeKey: input.outcomeKey ?? null,
    platform: input.platform ?? null,
    source: input.source ?? null,
    campaign: input.campaign ?? null,
    contentId: input.contentId ?? null,
    format: input.format ?? null,
    setterId: input.setterId ?? null,
    dialerId: input.dialerId ?? null,
    closerId: input.closerId ?? null,
    bookingId: input.bookingId ?? null,
    callId: input.callId ?? null,
    offerId: input.offerId ?? null,
    paymentId: input.paymentId ?? null,
    retentionOutcome: input.retentionOutcome ?? null,
    refundOutcome: input.refundOutcome ?? null,
    events: input.events ?? [],
    evidence: evaluateAttributionEvidence(input.evidence),
  };
}

export function canonicalAttributionDeduplicationKey(
  path: Pick<
    CanonicalLifecycleAttributionPath,
    "personKey" | "outcomeKey" | "paymentId" | "callId"
  >,
) {
  return [
    path.personKey,
    path.outcomeKey ?? "no-outcome",
    path.paymentId ?? "no-payment",
    path.callId ?? "no-call",
  ].join(":");
}

/** Keeps the first canonical path for one person/outcome/payment/call tuple. */
export function deduplicateCanonicalAttributionPaths(paths: CanonicalLifecycleAttributionPath[]) {
  const seen = new Set<string>();
  return paths.filter((path) => {
    const key = canonicalAttributionDeduplicationKey(path);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function deduplicatePaymentRecords<T extends { id: string }>(records: T[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function evaluateAttributionEvidence(input: {
  model: AttributionModel;
  supportingEvents?: string[];
  knownTouchpoints?: number | null;
  sampleSize?: number | null;
  directOutcomeLinked?: boolean;
  inferred?: boolean;
  drilldownKey?: string | null;
}): AttributionEvidence {
  const supportingEvents = [...new Set(input.supportingEvents ?? [])];
  const knownTouchpoints = input.knownTouchpoints ?? supportingEvents.length;
  const hasOutcome = input.directOutcomeLinked === true;
  const inferred = input.inferred === true;
  const coverage: AttributionCoverage =
    !hasOutcome && supportingEvents.length === 0
      ? "unavailable"
      : inferred
        ? "inferred"
        : hasOutcome && supportingEvents.length >= 2
          ? "direct"
          : "partial";
  const strength =
    coverage === "direct" && knownTouchpoints >= 3
      ? "high"
      : coverage === "direct" || coverage === "partial"
        ? "medium"
        : coverage === "inferred"
          ? "low"
          : "unknown";
  const sampleWarning =
    input.sampleSize == null
      ? "Sample size unavailable"
      : input.sampleSize < 10
        ? "Insufficient sample size (<10 outcomes)"
        : null;
  return {
    model: input.model,
    coverage,
    strength,
    knownTouchpoints: Math.max(0, knownTouchpoints),
    supportingEvents,
    sampleSize: input.sampleSize ?? null,
    sampleWarning,
    drilldownKey: input.drilldownKey ?? null,
  };
}

export function acquisitionRecordKey(
  record: Pick<AcquisitionSpendRecord, "orgId" | "provider" | "externalRecordId">,
) {
  return `${record.orgId}:${record.provider}:${record.externalRecordId}`;
}

export function validateAcquisitionSpendRecord(record: AcquisitionSpendRecord) {
  const errors: string[] = [];
  if (!record.orgId.trim()) errors.push("organization is required");
  if (!record.provider.trim()) errors.push("provider is required");
  if (!record.externalRecordId.trim()) errors.push("external record ID is required");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(record.spendDate) ||
    Number.isNaN(Date.parse(`${record.spendDate}T00:00:00Z`))
  )
    errors.push("spend date must be an ISO date");
  if (!record.currency.trim()) errors.push("currency is required");
  for (const [label, value] of [
    ["spend", record.spendAmountCents],
    ["impressions", record.impressions],
    ["clicks", record.clicks],
    ["paid visits", record.paidVisits],
  ] as const) {
    if (value != null && (!Number.isFinite(value) || value < 0))
      errors.push(`${label} must be a non-negative number`);
  }
  if (
    record.sourceType &&
    !["paid", "organic", "direct", "referral", "unattributed"].includes(record.sourceType)
  )
    errors.push("source type is invalid");
  return { valid: errors.length === 0, errors };
}

function sumNullable(values: Array<number | null | undefined>) {
  const known = values.filter((value): value is number => value != null && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

export function calculateAcquisitionMetrics(input: {
  spend: AcquisitionSpendRecord[];
  paidLeads?: number | null;
  attributableCustomers?: number | null;
  attributableRevenueCents?: number | null;
  currency?: string | null;
}): AcquisitionMetrics {
  const currencySet = new Set(input.spend.map((row) => row.currency).filter(Boolean));
  const scopeCompatible =
    currencySet.size <= 1 &&
    (!input.currency || currencySet.size === 0 || currencySet.has(input.currency));
  const currency = currencySet.size === 1 ? [...currencySet][0] : (input.currency ?? null);
  const spendCents = sumNullable(input.spend.map((row) => row.spendAmountCents));
  const impressions = sumNullable(input.spend.map((row) => row.impressions));
  const clicks = sumNullable(input.spend.map((row) => row.clicks));
  const paidVisits = sumNullable(input.spend.map((row) => row.paidVisits));
  const paidLeads = input.paidLeads ?? null;
  const attributableCustomers = input.attributableCustomers ?? null;
  const attributableRevenueCents = input.attributableRevenueCents ?? null;
  const safeRatio = (numerator: number | null, denominator: number | null) =>
    numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
  return {
    spendCents,
    impressions,
    clicks,
    paidVisits,
    paidLeads,
    attributableCustomers,
    attributableRevenueCents,
    ctr: safeRatio(clicks, impressions),
    cpcCents: safeRatio(spendCents, clicks),
    cplCents: safeRatio(spendCents, paidLeads),
    cpaCents: safeRatio(spendCents, attributableCustomers),
    roas: scopeCompatible ? safeRatio(attributableRevenueCents, spendCents) : null,
    currency,
    hasSpend: spendCents != null,
    hasRevenue: attributableRevenueCents != null,
    scopeCompatible,
  };
}

export function attributionMatchesScope(
  attribution: AcquisitionAttribution,
  scope: AcquisitionAttribution,
) {
  const dimensions: Array<keyof AcquisitionAttribution> = [
    "platform",
    "campaignId",
    "contentId",
    "webinarId",
    "date",
  ];
  return dimensions.every((dimension) => {
    const expected = scope[dimension];
    return expected == null || attribution[dimension] === expected;
  });
}

export function aggregateSpendByCurrency(records: AcquisitionSpendRecord[]) {
  const byCurrency = new Map<string, AcquisitionSpendRecord[]>();
  for (const record of records)
    byCurrency.set(record.currency, [...(byCurrency.get(record.currency) ?? []), record]);
  return [...byCurrency.entries()].map(([currency, spend]) => ({ currency, spend }));
}
