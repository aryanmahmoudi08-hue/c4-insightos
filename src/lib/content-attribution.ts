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
