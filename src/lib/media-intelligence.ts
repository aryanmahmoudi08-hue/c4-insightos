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
