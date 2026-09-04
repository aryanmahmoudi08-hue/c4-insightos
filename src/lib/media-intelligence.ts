export const VSL_CATEGORIES = [
  "Main VSL",
  "Webinar VSL",
  "Post-booking Confirmation",
  "Testimonial Videos",
  "FAQ / Objection Videos",
] as const;

export type VslCategory = (typeof VSL_CATEGORIES)[number];

export type VslMetricSnapshot = {
  mediaId: string;
  category: VslCategory;
  playRate: number | null;
  completionRate: number | null;
  ctaRate: number | null;
  viewerToLead: number | null;
  viewerToBooking: number | null;
  viewerToClose: number | null;
  viewerToRevenueCents: number | null;
  providerAvailable: boolean;
};

export type VideoAction =
  | "connect_provider"
  | "review_retention"
  | "review_cta"
  | "review_conversion";

export function deriveVideoActionQueue(
  snapshot: VslMetricSnapshot,
): Array<{ action: VideoAction; reason: string }> {
  if (!snapshot.providerAvailable)
    return [
      {
        action: "connect_provider",
        reason: "Wistia is not connected; video telemetry is unavailable.",
      },
    ];
  const queue: Array<{ action: VideoAction; reason: string }> = [];
  if (snapshot.completionRate == null)
    queue.push({
      action: "review_retention",
      reason: "Completion telemetry is unavailable for this media.",
    });
  else if (snapshot.completionRate < 25)
    queue.push({
      action: "review_retention",
      reason: "Completion rate is below the 25% review threshold.",
    });
  if (snapshot.ctaRate == null)
    queue.push({ action: "review_cta", reason: "CTA telemetry is unavailable for this media." });
  else if (snapshot.ctaRate < 5)
    queue.push({ action: "review_cta", reason: "CTA rate is below the 5% review threshold." });
  if (
    snapshot.viewerToLead == null ||
    snapshot.viewerToBooking == null ||
    snapshot.viewerToClose == null
  )
    queue.push({
      action: "review_conversion",
      reason: "Viewer-to-lifecycle joins are unavailable without verified IDs.",
    });
  return queue;
}

export type ObjectionEvidence = {
  objection: string;
  category: string | null;
  speaker: string | null;
  timestampSeconds: number | null;
  callId: string | null;
  transcriptId: string | null;
  decisionFactor: string | null;
  outcome: string | null;
  confidence: number | null;
  evidenceRef: string | null;
};

export function normalizeObjectionEvidence(
  input: Partial<ObjectionEvidence> & { objection: string },
): ObjectionEvidence {
  return {
    objection: input.objection.trim(),
    category: input.category ?? null,
    speaker: input.speaker ?? null,
    timestampSeconds: input.timestampSeconds ?? null,
    callId: input.callId ?? null,
    transcriptId: input.transcriptId ?? null,
    decisionFactor: input.decisionFactor ?? null,
    outcome: input.outcome ?? null,
    confidence: input.confidence == null ? null : Math.max(0, Math.min(1, input.confidence)),
    evidenceRef: input.evidenceRef ?? null,
  };
}

export type VideoActionStatus = "queued" | "running" | "won" | "lost" | "dismissed";
export const VIDEO_ACTION_STATUSES: readonly VideoActionStatus[] = [
  "queued",
  "running",
  "won",
  "lost",
  "dismissed",
] as const;

/**
 * Builds the evidence/confidence payload persisted with a vsl_recommendations
 * row. deriveVideoActionQueue's items are deterministic threshold checks
 * (e.g. "completion rate below 25%"), not a probabilistic model — there is
 * no legitimate confidence score to attach, so confidence always stays
 * null here rather than a fabricated number. The reason string itself is
 * carried into evidence_json so the persisted record stays traceable to
 * the finding that generated it, instead of being lost the moment the
 * live action-queue view recomputes.
 */
export function buildRecommendationEvidence(item: { reason: string }): {
  evidence_json: { reason: string; basis: string };
  confidence: number | null;
} {
  return {
    evidence_json: {
      reason: item.reason,
      basis: "deterministic threshold check (deriveVideoActionQueue)",
    },
    confidence: null,
  };
}

/**
 * Builds a VslMetricSnapshot from real, joinable data only. viewerTo* fields
 * require leads/calls rows tagged with this VSL's id (source_vsl_id) — until
 * a booking page or intake form is wired to tag it, these stay null rather
 * than an inferred/estimated figure.
 */
export function buildVslMetricSnapshot(input: {
  mediaId: string;
  category: VslCategory;
  wistiaConnected: boolean;
  totalPlays: number | null;
  uniqueViewers: number | null;
  playRate: number | null;
  pct100Reached: number | null;
  ctaClicks: number | null;
  ctaClickRate: number | null;
  taggedLeads: number | null;
  taggedBookings: number | null;
  taggedCloses: number | null;
  taggedCashCents: number | null;
}): VslMetricSnapshot {
  const viewers = input.uniqueViewers ?? null;
  const pctOfViewers = (n: number | null) =>
    n == null || viewers == null || viewers <= 0 ? null : (n / viewers) * 100;
  // pct_100_reached (and the other pct_X_reached snapshot columns) are a raw
  // headcount of viewers who reached that milestone — matching how they're
  // used as funnel-stage counts in buildVslFunnel, and how a Wistia
  // dashboard export typically reports them. completionRate is a
  // percentage, so it must be derived by dividing that count by the
  // strongest available viewer denominator, never assigned directly.
  // Falls back to totalPlays when uniqueViewers isn't in the snapshot,
  // since a milestone-reach count is still a fraction of *someone* who
  // watched.
  const completionDenominator = input.uniqueViewers ?? input.totalPlays ?? null;
  const completionRate =
    input.pct100Reached == null || completionDenominator == null || completionDenominator <= 0
      ? null
      : (input.pct100Reached / completionDenominator) * 100;
  return {
    mediaId: input.mediaId,
    category: input.category,
    playRate: input.playRate,
    completionRate,
    ctaRate: input.ctaClickRate ?? pctOfViewers(input.ctaClicks),
    viewerToLead: pctOfViewers(input.taggedLeads),
    viewerToBooking: pctOfViewers(input.taggedBookings),
    viewerToClose: pctOfViewers(input.taggedCloses),
    viewerToRevenueCents: input.taggedCashCents,
    providerAvailable: input.wistiaConnected,
  };
}

export type VslFunnelStageKey =
  | "landing"
  | "play"
  | "milestone_25"
  | "milestone_50"
  | "milestone_75"
  | "milestone_90"
  | "completion"
  | "cta"
  | "application"
  | "show"
  | "close"
  | "cash";

export type VslFunnelDataSource = "wistia_native" | "page_event" | "crm" | "cash" | "unavailable";

/**
 * How the Wistia-native numbers in a snapshot actually got there. There is
 * no live Wistia Stats API connection in this app — "manual"/"csv" are the
 * only ingestion sources that exist today. "live_api" is reserved for if a
 * real live connection is ever built, so the UI can distinguish it from a
 * human-entered figure without a code change to the funnel itself.
 */
export type VslMetricIngestionSource = "manual" | "csv" | "live_api";

export type VslFunnelStage = {
  key: VslFunnelStageKey;
  label: string;
  value: number | null;
  /** What kind of metric this is (Wistia-native, page-event, CRM, cash). */
  source: VslFunnelDataSource;
  /** How a wistia_native stage's value was actually ingested — null for
   * non-wistia_native stages, or when the stage has no value. Never implies
   * "live" unless metricIngestionSource is genuinely "live_api". */
  ingestionSource: VslMetricIngestionSource | null;
  detail: string;
};

export type VslFunnelInput = {
  /** Page-event data: player impressions. */
  pageLoads: number | null;
  /** Wistia-native: plays and milestone reach. */
  totalPlays: number | null;
  pct25Reached: number | null;
  pct50Reached: number | null;
  pct75Reached: number | null;
  pct90Reached: number | null;
  pct100Reached: number | null;
  /** Wistia-native or page-event: CTA clicks. */
  ctaClicks: number | null;
  /** CRM: leads/calls tagged to this VSL via source_vsl_id. */
  applicationCount: number | null;
  showCount: number | null;
  closeCount: number | null;
  /** Cash ledger: collected cash on closed, tagged calls. */
  cashCents: number | null;
  /** Whether this VSL has a Wistia video ID set at all — distinct from
   * whether a metric snapshot has been imported for it. */
  wistiaConfigured: boolean;
  /** How the latest snapshot's numbers were ingested; null when there is no
   * snapshot at all. */
  metricIngestionSource: VslMetricIngestionSource | null;
};

export function buildVslFunnel(input: VslFunnelInput): VslFunnelStage[] {
  const ingestionLabel =
    input.metricIngestionSource === "csv"
      ? "Wistia metric · CSV import"
      : input.metricIngestionSource === "live_api"
        ? "Wistia metric · Live API"
        : "Wistia metric · Manual entry";
  // Distinguishes "the embed/video isn't even configured" from "it's
  // configured but nobody has imported a metric snapshot yet" — these are
  // different problems with different fixes, and collapsing them into one
  // "Wistia is not connected" message hides which one is true.
  const wistiaDisconnectedDetail = input.wistiaConfigured
    ? "No metric snapshot available. Import a Wistia dashboard export to populate this stage."
    : "Wistia is not connected — no video ID set for this VSL.";

  const stage = (
    key: VslFunnelStageKey,
    label: string,
    value: number | null,
    source: VslFunnelDataSource,
    connectedDetail: string,
    disconnectedDetail: string,
  ): VslFunnelStage => ({
    key,
    label,
    value,
    source: value == null ? "unavailable" : source,
    ingestionSource:
      value != null && source === "wistia_native" ? input.metricIngestionSource : null,
    detail: value == null ? disconnectedDetail : connectedDetail,
  });
  return [
    stage(
      "landing",
      "Landing / player impressions",
      input.pageLoads,
      "page_event",
      "Page-event load count.",
      "No page-load telemetry connected.",
    ),
    stage(
      "play",
      "Play",
      input.totalPlays,
      "wistia_native",
      `${ingestionLabel} — play count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "milestone_25",
      "25% watched",
      input.pct25Reached,
      "wistia_native",
      `${ingestionLabel} — milestone reach count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "milestone_50",
      "50% watched",
      input.pct50Reached,
      "wistia_native",
      `${ingestionLabel} — milestone reach count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "milestone_75",
      "75% watched",
      input.pct75Reached,
      "wistia_native",
      `${ingestionLabel} — milestone reach count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "milestone_90",
      "90% watched",
      input.pct90Reached,
      "wistia_native",
      `${ingestionLabel} — milestone reach count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "completion",
      "Completed (100%)",
      input.pct100Reached,
      "wistia_native",
      `${ingestionLabel} — milestone reach count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "cta",
      "CTA clicked",
      input.ctaClicks,
      "wistia_native",
      `${ingestionLabel} — CTA click count.`,
      wistiaDisconnectedDetail,
    ),
    stage(
      "application",
      "Application / booking",
      input.applicationCount,
      "crm",
      "Leads tagged to this VSL (source_vsl_id).",
      "No leads are tagged to this VSL yet.",
    ),
    stage(
      "show",
      "Show",
      input.showCount,
      "crm",
      "Calls tagged to this VSL that showed.",
      "No tagged calls have shown yet.",
    ),
    stage(
      "close",
      "Close",
      input.closeCount,
      "crm",
      "Calls tagged to this VSL that closed.",
      "No tagged calls have closed yet.",
    ),
    stage(
      "cash",
      "Cash collected",
      input.cashCents,
      "cash",
      "Cash collected on tagged, closed calls.",
      "No cash collected on tagged calls yet.",
    ),
  ];
}

const LEAK_RECOMMENDATIONS: Partial<Record<string, string>> = {
  "landing->play": "Test a stronger above-the-fold hook or an autoplay preview frame.",
  "play->milestone_25": "Test tightening the first 15 seconds — the hook is losing viewers early.",
  "milestone_25->milestone_50": "Test restructuring the story/proof section for pacing.",
  "milestone_50->milestone_75": "Test trimming build-up before the offer is introduced.",
  "milestone_75->milestone_90": "Test shortening the pre-close setup.",
  "milestone_90->completion": "Test a tighter, more direct close.",
  "completion->cta": "Test making the CTA more prominent or repeating it earlier.",
  "cta->application": "Test simplifying the booking form or reducing friction to apply.",
  "application->show": "Test a stronger confirmation and reminder sequence.",
  "show->close": "Test tightening the objection-handling script on the call.",
  "close->cash": "Test a deposit-first or payment-plan option to convert contracted deals to cash.",
};

export type VslLargestLeak = {
  fromKey: VslFunnelStageKey;
  toKey: VslFunnelStageKey;
  fromLabel: string;
  toLabel: string;
  dropRatePct: number;
  recommendedTest: string;
};

export function deriveLargestLeak(stages: VslFunnelStage[]): VslLargestLeak | null {
  let worst: VslLargestLeak | null = null;
  for (let i = 0; i < stages.length - 1; i++) {
    const from = stages[i];
    const to = stages[i + 1];
    // "cash" is a currency amount (cents), every other stage is a head
    // count. A "drop rate" computed between a count and a cents figure is a
    // unit mismatch, not a real funnel leak — the cash stage stays visible
    // in the funnel itself, just excluded from this percentage math.
    if (to.key === "cash") continue;
    if (from.value == null || to.value == null || from.value <= 0) continue;
    const dropRatePct = ((from.value - to.value) / from.value) * 100;
    if (dropRatePct <= 0) continue;
    if (!worst || dropRatePct > worst.dropRatePct) {
      worst = {
        fromKey: from.key,
        toKey: to.key,
        fromLabel: from.label,
        toLabel: to.label,
        dropRatePct,
        recommendedTest:
          LEAK_RECOMMENDATIONS[`${from.key}->${to.key}`] ??
          `Investigate the ${from.label} → ${to.label} drop-off.`,
      };
    }
  }
  return worst;
}

export type ContentCashPath = {
  platformId: string | null;
  campaignId: string | null;
  contentId: string | null;
  leadId: string | null;
  setterId: string | null;
  bookingId: string | null;
  callId: string | null;
  closerId: string | null;
  paymentId: string | null;
  cashCents: number | null;
};

export function contentCashPathStrength(
  path: ContentCashPath,
): "direct" | "partial" | "unavailable" {
  const ids = [
    path.platformId,
    path.campaignId,
    path.contentId,
    path.leadId,
    path.setterId,
    path.bookingId,
    path.callId,
    path.closerId,
    path.paymentId,
  ];
  const known = ids.filter(Boolean).length;
  if (path.cashCents != null && path.paymentId && path.contentId && path.leadId) return "direct";
  if (known >= 3) return "partial";
  return "unavailable";
}
