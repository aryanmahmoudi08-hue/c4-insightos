import {
  buildCanonicalLifecycleAttributionPath,
  deduplicateCanonicalAttributionPaths,
  type AttributionModel,
  type CanonicalLifecycleAttributionPath,
} from "./acquisition";

/**
 * Multi-model Content-to-Cash attribution (InsightOS upgrade spec's
 * "Attribution confidence and strength" requirement). Each model pulls from
 * a genuinely distinct real field/table — nothing here recomputes the same
 * number under a different label. assisted_touch is the only model that
 * is always `inferred: true`: crediting a non-final touchpoint for a
 * multi-touch journey is real signal, but it's never certain direct credit,
 * so it must never render with "direct" coverage.
 */

export type AttributionModelInput = {
  leads: Array<{ id: string; created_at: string; source_content_id: string | null }>;
  calls: Array<{
    id: string;
    lead_id: string | null;
    created_at: string | null;
    closed: boolean | null;
    source_content_id: string | null;
  }>;
  touches: Array<{ lead_id: string; content_id: string; touched_at: string }>;
  sampleSize: number | null;
};

function touchesByLead(touches: AttributionModelInput["touches"]) {
  const map = new Map<string, AttributionModelInput["touches"]>();
  for (const t of touches) map.set(t.lead_id, [...(map.get(t.lead_id) ?? []), t]);
  for (const arr of map.values()) arr.sort((a, b) => a.touched_at.localeCompare(b.touched_at));
  return map;
}

/** Builds canonical paths for exactly one attribution model. Leads/calls
 * with no resolvable content_id for that model are simply excluded — never
 * backfilled from a different model's field, which would silently blend
 * two models together. */
export function buildAttributionPathsForModel(
  model: AttributionModel,
  input: AttributionModelInput,
): CanonicalLifecycleAttributionPath[] {
  const byLead = touchesByLead(input.touches);
  const closedCalls = input.calls.filter((c) => c.closed && c.lead_id);
  const paths: CanonicalLifecycleAttributionPath[] = [];

  for (const call of closedCalls) {
    const lead = input.leads.find((l) => l.id === call.lead_id);
    if (!lead || !call.id || !call.lead_id) continue;
    const leadTouches = byLead.get(lead.id) ?? [];

    if (model === "lead_source") {
      if (!lead.source_content_id) continue;
      paths.push(
        buildCanonicalLifecycleAttributionPath({
          personKey: call.lead_id,
          outcomeKey: call.id,
          contentId: lead.source_content_id,
          callId: call.id,
          events: [
            { id: lead.id, type: "lead", at: lead.created_at },
            { id: call.id, type: "call_closed", at: String(call.created_at ?? "") },
          ],
          evidence: {
            model,
            supportingEvents: ["lead", "source_content", "call_closed"],
            knownTouchpoints: 3,
            sampleSize: input.sampleSize,
            directOutcomeLinked: true,
            drilldownKey: `${lead.id}:${call.id}`,
          },
        }),
      );
      continue;
    }

    if (model === "booking_source") {
      if (!call.source_content_id) continue;
      paths.push(
        buildCanonicalLifecycleAttributionPath({
          personKey: call.lead_id,
          outcomeKey: call.id,
          contentId: call.source_content_id,
          callId: call.id,
          events: [
            { id: call.id, type: "call_booked_and_closed", at: String(call.created_at ?? "") },
          ],
          evidence: {
            model,
            supportingEvents: ["call_source_content", "call_closed"],
            knownTouchpoints: 2,
            sampleSize: input.sampleSize,
            directOutcomeLinked: true,
            drilldownKey: `${lead.id}:${call.id}`,
          },
        }),
      );
      continue;
    }

    if (model === "first_touch" || model === "last_touch") {
      if (!leadTouches.length) continue;
      const touch = model === "first_touch" ? leadTouches[0] : leadTouches[leadTouches.length - 1];
      paths.push(
        buildCanonicalLifecycleAttributionPath({
          personKey: call.lead_id,
          outcomeKey: call.id,
          contentId: touch.content_id,
          callId: call.id,
          events: [
            { id: touch.content_id, type: `${model}_touch`, at: touch.touched_at },
            { id: call.id, type: "call_closed", at: String(call.created_at ?? "") },
          ],
          evidence: {
            model,
            supportingEvents: ["lead_content_touch", "call_closed"],
            knownTouchpoints: leadTouches.length + 1,
            sampleSize: input.sampleSize,
            directOutcomeLinked: true,
            drilldownKey: `${lead.id}:${call.id}`,
          },
        }),
      );
      continue;
    }

    if (model === "assisted_touch") {
      // Every touch before the last one assisted the outcome but wasn't the
      // final driver — always inferred, never direct credit.
      const assisting = leadTouches.slice(0, -1);
      for (const touch of assisting) {
        paths.push(
          buildCanonicalLifecycleAttributionPath({
            personKey: call.lead_id,
            outcomeKey: call.id,
            contentId: touch.content_id,
            callId: call.id,
            events: [
              { id: touch.content_id, type: "assisted_touch", at: touch.touched_at },
              { id: call.id, type: "call_closed", at: String(call.created_at ?? "") },
            ],
            evidence: {
              model,
              supportingEvents: ["lead_content_touch"],
              knownTouchpoints: leadTouches.length,
              sampleSize: input.sampleSize,
              directOutcomeLinked: false,
              inferred: true,
              drilldownKey: `${lead.id}:${call.id}:${touch.content_id}`,
            },
          }),
        );
      }
    }
  }

  // deduplicateCanonicalAttributionPaths keys on person+outcome+payment+call —
  // right for the single-attribution models (one canonical row per outcome),
  // but wrong for assisted_touch, which deliberately credits several distinct
  // content pieces against the same outcome. Dedupe assisted_touch on the
  // finer (person, outcome, content) key instead so those rows survive.
  if (model === "assisted_touch") {
    const seen = new Set<string>();
    return paths.filter((path) => {
      const key = `${path.personKey}:${path.outcomeKey ?? "none"}:${path.contentId ?? "none"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return deduplicateCanonicalAttributionPaths(paths);
}

export type ContentCashAggregate = {
  contentId: string;
  cashCents: number;
  callCount: number;
};

/**
 * Aggregates verified `calls.cash_collected_cents` by contentId, using the
 * SAME canonical paths that drive the Canonical Content -> Cash table — so
 * the money-flow view and the evidence table can never disagree about which
 * calls are attributed to which content for a given model.
 *
 * For the single-attribution models (first_touch/last_touch/lead_source/
 * booking_source), buildAttributionPathsForModel already guarantees at most
 * one path per call (deduplicateCanonicalAttributionPaths keys on
 * person+outcome+payment+call), so each call's cash is counted toward
 * exactly one content piece — the totals here can never exceed real total
 * cash for those models.
 *
 * assisted_touch is different by design: the same call can legitimately
 * appear against several assisting content pieces, so the same dollars are
 * intentionally counted toward more than one node. That's real assisted
 * credit, not a bug — callers MUST label assisted_touch output as inferred/
 * assisted rather than presenting it as an aggregate total (see
 * ATTRIBUTION_MODEL_LABELS / evidence.coverage, which is already always
 * "inferred" for this model).
 */
export function aggregateCashByContent(
  paths: CanonicalLifecycleAttributionPath[],
  callCashCentsById: Record<string, number | null | undefined>,
): ContentCashAggregate[] {
  const byContent = new Map<string, { cashCents: number; callCount: number }>();
  for (const path of paths) {
    if (!path.contentId || !path.callId) continue;
    const cash = callCashCentsById[path.callId];
    if (cash == null || cash <= 0) continue;
    const cur = byContent.get(path.contentId) ?? { cashCents: 0, callCount: 0 };
    cur.cashCents += cash;
    cur.callCount += 1;
    byContent.set(path.contentId, cur);
  }
  return Array.from(byContent.entries()).map(([contentId, v]) => ({ contentId, ...v }));
}

export type PlatformCashAggregate = {
  platform: string;
  cashCents: number;
  callCount: number;
};

/**
 * Channel -> Cash, same shape/guarantees as `aggregateCashByContent` (see its
 * doc comment for the double-counting analysis — identical here, just grouped
 * by platform instead of contentId). `buildAttributionPathsForModel` never
 * populates `path.platform` itself (confirmed: every call site passes it as
 * null) — platform lives on `content_pieces`, so callers resolve it via a
 * contentId->platform map exactly like content-command-center.tsx's own
 * `platformByContentId` already does. This function takes that same
 * pre-built map rather than re-deriving it, so there is one join, not two.
 */
export function aggregateCashByPlatform(
  paths: CanonicalLifecycleAttributionPath[],
  callCashCentsById: Record<string, number | null | undefined>,
  platformByContentId: Record<string, string | null | undefined>,
): PlatformCashAggregate[] {
  const byPlatform = new Map<string, { cashCents: number; callCount: number }>();
  for (const path of paths) {
    if (!path.callId) continue;
    const platform = path.platform ?? (path.contentId ? platformByContentId[path.contentId] : null);
    if (!platform) continue;
    const cash = callCashCentsById[path.callId];
    if (cash == null || cash <= 0) continue;
    const cur = byPlatform.get(platform) ?? { cashCents: 0, callCount: 0 };
    cur.cashCents += cash;
    cur.callCount += 1;
    byPlatform.set(platform, cur);
  }
  return Array.from(byPlatform.entries()).map(([platform, v]) => ({ platform, ...v }));
}

export type AttributionJourney = {
  key: string;
  platform: string | null;
  source: string | null;
  setterOrDialerId: string | null;
  closerId: string | null;
  offerId: string | null;
  callCount: number;
  cashCents: number;
  contractValueCents: number;
  showCount: number;
  refundCount: number;
};

/**
 * Groups the SAME canonical paths from `buildAttributionPathsForModel` into
 * recurring journeys (spec: "Top Converting Customer Journeys") — a derived
 * view over existing attribution output, not a new attribution computation.
 * `callMeta` supplies the per-call fields the engine itself doesn't carry
 * (setter/dialer/closer, contract value, show/refund state), joined by
 * `path.callId` the same way content-command-center.tsx joins platform by
 * `path.contentId` — one external map, not a second engine.
 */
export function identifyTopAttributionJourneys(
  paths: CanonicalLifecycleAttributionPath[],
  callMeta: Record<
    string,
    {
      cashCents: number | null;
      contractValueCents: number | null;
      setterId: string | null;
      dialerId: string | null;
      closerId: string | null;
      showed: boolean | null;
      refunded: boolean | null;
    }
  >,
  platformByContentId: Record<string, string | null | undefined>,
): AttributionJourney[] {
  const byKey = new Map<string, AttributionJourney>();
  for (const path of paths) {
    if (!path.callId) continue;
    const meta = callMeta[path.callId];
    if (!meta) continue;
    const platform =
      path.platform ?? (path.contentId ? (platformByContentId[path.contentId] ?? null) : null);
    const setterOrDialerId = meta.setterId ?? meta.dialerId ?? null;
    const key = [
      platform ?? "unknown",
      path.source ?? "unknown",
      setterOrDialerId ?? "unknown",
      meta.closerId ?? "unknown",
      path.offerId ?? "unknown",
    ].join("|");
    const cur = byKey.get(key) ?? {
      key,
      platform,
      source: path.source,
      setterOrDialerId,
      closerId: meta.closerId,
      offerId: path.offerId,
      callCount: 0,
      cashCents: 0,
      contractValueCents: 0,
      showCount: 0,
      refundCount: 0,
    };
    cur.callCount += 1;
    cur.cashCents += meta.cashCents ?? 0;
    cur.contractValueCents += meta.contractValueCents ?? 0;
    if (meta.showed) cur.showCount += 1;
    if (meta.refunded) cur.refundCount += 1;
    byKey.set(key, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.cashCents - a.cashCents);
}

export const ATTRIBUTION_MODEL_LABELS: Record<AttributionModel, string> = {
  first_touch: "First touch",
  lead_source: "Lead source",
  booking_source: "Booking source",
  last_touch: "Last touch",
  assisted_touch: "Assisted touch",
};

export const ATTRIBUTION_MODELS: AttributionModel[] = [
  "first_touch",
  "lead_source",
  "booking_source",
  "last_touch",
  "assisted_touch",
];
