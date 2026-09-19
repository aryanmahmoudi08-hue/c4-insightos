/**
 * Traffic's platform-first hierarchy: Platform -> Format/Placement ->
 * Content/Campaign -> Funnel Stage. Reuses the Phase 1 platform/format
 * compatibility layer (platform-format.ts) and the acquisition-source
 * taxonomy (acquisition-source.ts) rather than inventing a third label set —
 * this module's only job is resolving each REAL lead row to those existing
 * taxonomies and aggregating real leads/bookings/shows/closes/cash, never
 * computing attribution paths itself (that stays content-attribution.ts's
 * job; Traffic answers "where are leads coming from," not "how did this
 * revenue happen").
 *
 * Resolution priority per lead (most authoritative first, never guessed):
 *   1. leads.source_platform / source_format / source_campaign — set
 *      directly on the lead at intake, the most authoritative signal when
 *      present.
 *   2. leads.source_content_id / first_touch_content_id — resolved through
 *      the linked content_pieces row (source_platform-first platform,
 *      `platform` enum read as format — same rule content-command-center.tsx
 *      and platform-format.ts already use).
 *   3. leads.traffic_source_id — resolved through the manually-managed
 *      traffic_sources catalog via normalizeAcquisitionSource(); format is
 *      genuinely unknown at this level (no format field exists on
 *      traffic_sources), so it's reported as "Unidentified", never guessed.
 *   4. Otherwise: "Unknown / Unattributed", format "Unidentified".
 */

import { resolvePlatform, resolveFormat, formatLabel } from "./platform-format";
import { normalizeAcquisitionSource } from "./acquisition-source";
import { normalizeFunnelStage, type FunnelStage } from "./content-taxonomy";
import { MECHANISM_KEYS, type MechanismKey } from "./content-mechanisms";

/** Normalizes a raw content_pieces.mechanism value to a real MechanismKey,
 * or null when unset/unrecognized — never guessed. Mirrors the same
 * normalization content-taxonomy.ts's normalizeMechanism() does, kept local
 * here since this module already owns its own light normalization helpers
 * and importing that one would pull in its "unknown" sentinel semantics
 * this module doesn't use elsewhere. */
function normalizeMechanismKey(value: string | null | undefined): MechanismKey | null {
  const found = MECHANISM_KEYS.find((k) => k === value);
  return found ?? null;
}

export type TrafficLeadRow = {
  id: string;
  status: string;
  created_at: string;
  traffic_source_id: string | null;
  source_content_id: string | null;
  first_touch_content_id: string | null;
  source_platform: string | null;
  source_format: string | null;
  source_campaign: string | null;
};

export type TrafficCallRow = {
  lead_id: string | null;
  closed: boolean | null;
  showed: boolean | null;
  contract_value_cents: number | null;
  cash_collected_cents: number | null;
};

export type TrafficContentRow = {
  id: string;
  title: string | null;
  platform: string | null;
  source_platform: string | null;
  funnel_stage: string | null;
  mechanism: string | null;
  variation: string | null;
};

export type TrafficSourceRow = {
  id: string;
  name: string;
  category: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
};

/** The "qualified" pipeline stage on — real leads.status values that mean
 * the lead was actually qualified, not just a raw inbound message. Never a
 * fabricated boolean; this is the literal enum the app already uses
 * elsewhere (dm_received -> qualified -> pre_call_assets_sent -> call_booked
 * -> showed -> closed). */
export const QUALIFIED_OR_LATER = new Set([
  "qualified",
  "pre_call_assets_sent",
  "call_booked",
  "showed",
  "closed",
]);

export type TrafficMetrics = {
  leads: number;
  qualifiedLeads: number;
  bookings: number;
  shows: number;
  closes: number;
  contractedCents: number;
  collectedCents: number;
};

function emptyMetrics(): TrafficMetrics {
  return {
    leads: 0,
    qualifiedLeads: 0,
    bookings: 0,
    shows: 0,
    closes: 0,
    contractedCents: 0,
    collectedCents: 0,
  };
}

function addCallToMetrics(m: TrafficMetrics, call: TrafficCallRow) {
  m.bookings += 1;
  if (call.showed) m.shows += 1;
  if (call.closed) {
    m.closes += 1;
    m.contractedCents += call.contract_value_cents ?? 0;
    m.collectedCents += call.cash_collected_cents ?? 0;
  }
}

export type TrafficContentNode = {
  key: string;
  label: string;
  funnelStage: FunnelStage | "unknown";
  /** Mechanism/variation are independent tags on the underlying content
   * piece — cross-cutting metadata for display/filtering, never a nesting
   * dimension and never assumed to correlate with funnelStage (a mechanism
   * can legitimately occur at any funnel stage). Null when the resolved
   * lead has no linked content piece to read them from (e.g. resolved via
   * the traffic_sources catalog, which has no mechanism/variation field). */
  mechanism: MechanismKey | null;
  variation: string | null;
  metrics: TrafficMetrics;
};

export type TrafficFormatNode = {
  format: string;
  formatLabel: string;
  metrics: TrafficMetrics;
  content: TrafficContentNode[];
};

export type TrafficPlatformNode = {
  platform: string;
  metrics: TrafficMetrics;
  formats: TrafficFormatNode[];
};

export type TrafficHierarchy = {
  platforms: TrafficPlatformNode[];
  totals: TrafficMetrics;
  /** Leads with genuinely no resolvable platform signal at all. */
  unattributedLeads: number;
};

export type Resolved = {
  platform: string;
  format: string;
  formatLbl: string;
  contentKey: string;
  contentLabel: string;
  funnelStage: FunnelStage | "unknown";
  mechanism: MechanismKey | null;
  variation: string | null;
};

/** Exported so other pages that need "what platform did this lead come
 * from" (e.g. the Mentees lifecycle-attribution strip) reuse this exact
 * resolution priority instead of a second, possibly-diverging copy. */
export function resolveLead(
  lead: TrafficLeadRow,
  contentById: Map<string, TrafficContentRow>,
  sourceById: Map<string, TrafficSourceRow>,
): Resolved {
  // 1) Direct fields on the lead itself — most authoritative when present.
  if (lead.source_platform) {
    const contentId = lead.source_content_id ?? lead.first_touch_content_id;
    const content = contentId ? contentById.get(contentId) : undefined;
    return {
      platform: lead.source_platform,
      format: lead.source_format ?? "unknown",
      formatLbl: lead.source_format ? formatLabel(lead.source_format) : "Unidentified",
      contentKey: content ? content.id : (lead.source_campaign ?? "unattributed-content"),
      contentLabel: content
        ? (content.title ?? "(untitled)")
        : (lead.source_campaign ?? "No campaign / content tagged"),
      funnelStage: content ? normalizeFunnelStage(content.funnel_stage) : "unknown",
      mechanism: content ? normalizeMechanismKey(content.mechanism) : null,
      variation: content?.variation ?? null,
    };
  }

  // 2) Linked content piece.
  const contentId = lead.source_content_id ?? lead.first_touch_content_id;
  const content = contentId ? contentById.get(contentId) : undefined;
  if (content) {
    return {
      platform: resolvePlatform(content.platform, content.source_platform),
      format: resolveFormat(content.platform),
      formatLbl: formatLabel(content.platform),
      contentKey: content.id,
      contentLabel: content.title ?? "(untitled)",
      funnelStage: normalizeFunnelStage(content.funnel_stage),
      mechanism: normalizeMechanismKey(content.mechanism),
      variation: content.variation ?? null,
    };
  }

  // 3) Traffic-source catalog.
  const source = lead.traffic_source_id ? sourceById.get(lead.traffic_source_id) : undefined;
  if (source) {
    return {
      platform: normalizeAcquisitionSource(source.category, source.name, source.utm_source),
      format: "unknown",
      formatLbl: "Unidentified",
      contentKey: source.utm_campaign || source.id,
      contentLabel: source.utm_campaign || source.name,
      funnelStage: "unknown",
      mechanism: null,
      variation: null,
    };
  }

  // 4) Nothing to go on.
  return {
    platform: "Unknown / Unattributed",
    format: "unknown",
    formatLbl: "Unidentified",
    contentKey: "unattributed",
    contentLabel: "Unattributed",
    funnelStage: "unknown",
    mechanism: null,
    variation: null,
  };
}

export function buildTrafficHierarchy(
  leads: TrafficLeadRow[],
  calls: TrafficCallRow[],
  content: TrafficContentRow[],
  sources: TrafficSourceRow[],
): TrafficHierarchy {
  const contentById = new Map(content.map((c) => [c.id, c]));
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const callsByLead = new Map<string, TrafficCallRow[]>();
  for (const call of calls) {
    if (!call.lead_id) continue;
    const arr = callsByLead.get(call.lead_id) ?? [];
    arr.push(call);
    callsByLead.set(call.lead_id, arr);
  }

  const platforms = new Map<string, TrafficPlatformNode>();
  const totals = emptyMetrics();
  let unattributedLeads = 0;

  for (const lead of leads) {
    const resolved = resolveLead(lead, contentById, sourceById);
    if (resolved.platform === "Unknown / Unattributed") unattributedLeads += 1;

    totals.leads += 1;
    if (QUALIFIED_OR_LATER.has(lead.status)) totals.qualifiedLeads += 1;
    for (const call of callsByLead.get(lead.id) ?? []) addCallToMetrics(totals, call);

    let platformNode = platforms.get(resolved.platform);
    if (!platformNode) {
      platformNode = { platform: resolved.platform, metrics: emptyMetrics(), formats: [] };
      platforms.set(resolved.platform, platformNode);
    }
    platformNode.metrics.leads += 1;
    if (QUALIFIED_OR_LATER.has(lead.status)) platformNode.metrics.qualifiedLeads += 1;

    let formatNode = platformNode.formats.find((f) => f.format === resolved.format);
    if (!formatNode) {
      formatNode = {
        format: resolved.format,
        formatLabel: resolved.formatLbl,
        metrics: emptyMetrics(),
        content: [],
      };
      platformNode.formats.push(formatNode);
    }
    formatNode.metrics.leads += 1;
    if (QUALIFIED_OR_LATER.has(lead.status)) formatNode.metrics.qualifiedLeads += 1;

    let contentNode = formatNode.content.find((c) => c.key === resolved.contentKey);
    if (!contentNode) {
      contentNode = {
        key: resolved.contentKey,
        label: resolved.contentLabel,
        funnelStage: resolved.funnelStage,
        mechanism: resolved.mechanism,
        variation: resolved.variation,
        metrics: emptyMetrics(),
      };
      formatNode.content.push(contentNode);
    }
    contentNode.metrics.leads += 1;
    if (QUALIFIED_OR_LATER.has(lead.status)) contentNode.metrics.qualifiedLeads += 1;

    for (const call of callsByLead.get(lead.id) ?? []) {
      addCallToMetrics(platformNode.metrics, call);
      addCallToMetrics(formatNode.metrics, call);
      addCallToMetrics(contentNode.metrics, call);
    }
  }

  return {
    platforms: Array.from(platforms.values()).sort((a, b) => b.metrics.leads - a.metrics.leads),
    totals,
    unattributedLeads,
  };
}

/** Funnel-stage rollup across the whole hierarchy (for the TOF/MOF/BOF
 * FunnelInstrument view) — "unknown" bucket kept separate and honest rather
 * than folded into TOF by default. */
export type FunnelStageRollup = Record<FunnelStage | "unknown", TrafficMetrics>;

export function rollupByFunnelStage(hierarchy: TrafficHierarchy): FunnelStageRollup {
  const rollup: FunnelStageRollup = {
    tof: emptyMetrics(),
    mof: emptyMetrics(),
    bof: emptyMetrics(),
    unknown: emptyMetrics(),
  };
  for (const platform of hierarchy.platforms) {
    for (const format of platform.formats) {
      for (const contentNode of format.content) {
        const bucket = rollup[contentNode.funnelStage];
        bucket.leads += contentNode.metrics.leads;
        bucket.qualifiedLeads += contentNode.metrics.qualifiedLeads;
        bucket.bookings += contentNode.metrics.bookings;
        bucket.shows += contentNode.metrics.shows;
        bucket.closes += contentNode.metrics.closes;
        bucket.contractedCents += contentNode.metrics.contractedCents;
        bucket.collectedCents += contentNode.metrics.collectedCents;
      }
    }
  }
  return rollup;
}
