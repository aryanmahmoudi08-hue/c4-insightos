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
  return {
    mediaId: input.mediaId,
    category: input.category,
    playRate: input.playRate,
    completionRate: input.pct100Reached,
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

export type VslFunnelStage = {
  key: VslFunnelStageKey;
  label: string;
  value: number | null;
  source: VslFunnelDataSource;
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
};

export function buildVslFunnel(input: VslFunnelInput): VslFunnelStage[] {
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
      "Wistia-native play count.",
      "Wistia is not connected.",
    ),
    stage(
      "milestone_25",
      "25% watched",
      input.pct25Reached,
      "wistia_native",
      "Wistia-native milestone reach.",
      "Milestone data not in the imported sheet.",
    ),
    stage(
      "milestone_50",
      "50% watched",
      input.pct50Reached,
      "wistia_native",
      "Wistia-native milestone reach.",
      "Milestone data not in the imported sheet.",
    ),
    stage(
      "milestone_75",
      "75% watched",
      input.pct75Reached,
      "wistia_native",
      "Wistia-native milestone reach.",
      "Milestone data not in the imported sheet.",
    ),
    stage(
      "milestone_90",
      "90% watched",
      input.pct90Reached,
      "wistia_native",
      "Wistia-native milestone reach.",
      "Milestone data not in the imported sheet.",
    ),
    stage(
      "completion",
      "Completed (100%)",
      input.pct100Reached,
      "wistia_native",
      "Wistia-native milestone reach.",
      "Milestone data not in the imported sheet.",
    ),
    stage(
      "cta",
      "CTA clicked",
      input.ctaClicks,
      "wistia_native",
      "Wistia-native/page CTA click count.",
      "CTA click telemetry not connected.",
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
