import {
  MECHANISMS,
  MECHANISM_KEYS,
  type MechanismKey,
  variationLabel,
} from "./content-mechanisms";

export const FUNNEL_STAGES = ["tof", "mof", "bof"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const SIGNAL_SOURCES = [
  "FAQ",
  "Client Onboarding",
  "Setting Calls",
  "Content Performance",
  "Content Coverage",
  "Platform Performance",
] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export type ContentTaxonomy = {
  funnelStage: FunnelStage | "unknown";
  mechanism: MechanismKey | "unknown";
  variation: string;
  platform: string;
  format: string;
};

export type ContentTaxonomyMetric = {
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  dms_generated?: number | null;
  leads_generated?: number | null;
  clients?: number | null;
  closes?: number | null;
  cash_collected_cents?: number | null;
  avg_watch_pct?: number | null;
  hook_retention_pct?: number | null;
  engagement_rate_pct?: number | null;
};

export type ContentTaxonomyPiece = ContentTaxonomy & {
  id?: string;
  metrics?: ContentTaxonomyMetric | null;
};

export type TaxonomyAggregate = ContentTaxonomy & {
  pieces: number;
  views: number;
  reach: number;
  interactions: number;
  leads: number;
  clients: number;
  closes: number;
  cashCents: number;
  retentionSum: number;
  retentionSamples: number;
};

export type NormalizedContentSignal = {
  source: SignalSource;
  detail: string;
  rawText: string;
  weight: number | null;
  mechanism: MechanismKey | null;
  topic: string | null;
  occurredAt: string | null;
  frequency: number | null;
  answerState: "answered" | "unanswered" | "unknown";
};

const UNKNOWN = "unknown";

export function normalizeFunnelStage(value: string | null | undefined): FunnelStage | "unknown" {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (normalized === "tof" || normalized === "topoffunnel") return "tof";
  if (normalized === "mof" || normalized === "middleoffunnel") return "mof";
  if (normalized === "bof" || normalized === "bottomoffunnel") return "bof";
  return UNKNOWN;
}

export function normalizeMechanism(value: string | null | undefined): MechanismKey | "unknown" {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
  const match = MECHANISM_KEYS.find((key) => key.replace(/_/g, "") === normalized);
  return match ?? UNKNOWN;
}

export function normalizeTaxonomy(input: {
  funnelStage?: string | null;
  mechanism?: string | null;
  variation?: string | null;
  platform?: string | null;
  format?: string | null;
}): ContentTaxonomy {
  const mechanism = normalizeMechanism(input.mechanism);
  return {
    funnelStage: normalizeFunnelStage(input.funnelStage),
    mechanism,
    variation: input.variation?.trim() || UNKNOWN,
    platform: input.platform?.trim() || UNKNOWN,
    format: input.format?.trim() || UNKNOWN,
  };
}

export function aggregateContentByTaxonomy(
  pieces: ContentTaxonomyPiece[],
  dimensions: Array<keyof ContentTaxonomy> = [
    "funnelStage",
    "mechanism",
    "variation",
    "platform",
    "format",
  ],
): TaxonomyAggregate[] {
  const groups = new Map<string, TaxonomyAggregate>();
  for (const piece of pieces) {
    const key = dimensions.map((dimension) => piece[dimension]).join("|");
    const existing = groups.get(key) ?? {
      funnelStage: "unknown",
      mechanism: "unknown",
      variation: UNKNOWN,
      platform: UNKNOWN,
      format: UNKNOWN,
      pieces: 0,
      views: 0,
      reach: 0,
      interactions: 0,
      leads: 0,
      clients: 0,
      closes: 0,
      cashCents: 0,
      retentionSum: 0,
      retentionSamples: 0,
    };
    for (const dimension of dimensions) existing[dimension] = piece[dimension] as never;
    const metric = piece.metrics;
    existing.pieces += 1;
    existing.views += Number(metric?.views ?? 0);
    existing.reach += Number(metric?.reach ?? 0);
    existing.interactions +=
      Number(metric?.likes ?? 0) +
      Number(metric?.comments ?? 0) +
      Number(metric?.shares ?? 0) +
      Number(metric?.saves ?? 0) +
      Number(metric?.dms_generated ?? 0);
    existing.leads += Number(metric?.leads_generated ?? 0);
    existing.clients += Number(metric?.clients ?? 0);
    existing.closes += Number(metric?.closes ?? 0);
    existing.cashCents += Number(metric?.cash_collected_cents ?? 0);
    const retention = metric?.avg_watch_pct ?? metric?.hook_retention_pct;
    if (retention != null) {
      existing.retentionSum += Number(retention);
      existing.retentionSamples += 1;
    }
    groups.set(key, existing);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    retentionSum: row.retentionSamples ? row.retentionSum / row.retentionSamples : 0,
  }));
}

export function normalizeFaqSignal(row: {
  title?: string | null;
  question?: string | null;
  mechanism?: string | null;
  clicks?: number | null;
  plays?: number | null;
  created_at?: string | null;
}): NormalizedContentSignal | null {
  const rawText = [row.title, row.question].filter(Boolean).join(" — ").trim();
  if (!rawText) return null;
  const frequency =
    row.clicks != null || row.plays != null
      ? Number(row.clicks ?? 0) + Number(row.plays ?? 0)
      : null;
  return {
    source: "FAQ",
    detail: rawText,
    rawText,
    weight: frequency == null ? null : frequency * 2,
    mechanism:
      normalizeMechanism(row.mechanism) === UNKNOWN
        ? null
        : (normalizeMechanism(row.mechanism) as MechanismKey),
    topic: row.question?.trim() || row.title?.trim() || null,
    occurredAt: row.created_at ?? null,
    frequency,
    answerState: "unknown",
  };
}

export function normalizeOnboardingSignal(row: {
  responses?: Record<string, unknown> | null;
  submitted_at?: string | null;
  created_at?: string | null;
  mechanism_signals?: Record<string, unknown> | null;
}): NormalizedContentSignal | null {
  const responses = row.responses ?? {};
  const rawText = Object.values(responses)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" · ")
    .trim();
  if (!rawText) return null;
  const storedMechanism =
    MECHANISM_KEYS.find((key) => Number(row.mechanism_signals?.[key] ?? 0) > 0) ?? null;
  return {
    source: "Client Onboarding",
    detail: rawText,
    rawText,
    weight: storedMechanism ? 2 : null,
    mechanism: storedMechanism,
    topic: null,
    occurredAt: row.submitted_at ?? row.created_at ?? null,
    frequency: null,
    answerState: "unknown",
  };
}

export function normalizeSettingCallSignal(row: {
  setter_name?: string | null;
  call_date?: string | null;
  limiting_beliefs?: string[] | null;
  objections?: string[] | null;
  mechanism?: string | null;
  ai_summary?: string | null;
  notes?: string | null;
}): NormalizedContentSignal | null {
  const rawText = [
    ...(row.limiting_beliefs ?? []),
    ...(row.objections ?? []),
    row.ai_summary,
    row.notes,
  ]
    .filter(Boolean)
    .join(" · ")
    .trim();
  if (!rawText) return null;
  const mechanism = normalizeMechanism(row.mechanism);
  return {
    source: "Setting Calls",
    detail: `${row.setter_name ?? "Unknown setter"} · ${row.call_date ?? "Unknown date"}`,
    rawText,
    weight: mechanism === UNKNOWN ? null : 3,
    mechanism: mechanism === UNKNOWN ? null : mechanism,
    topic: null,
    occurredAt: row.call_date ?? null,
    frequency: null,
    answerState: "unknown",
  };
}

export function taxonomyLabels() {
  return {
    funnelStages: [...FUNNEL_STAGES],
    mechanisms: MECHANISM_KEYS.map((key) => ({ value: key, label: MECHANISMS[key].label })),
    variations: MECHANISM_KEYS.flatMap((key) =>
      MECHANISMS[key].variations.map((variation) => ({
        value: variation.value,
        label: variationLabel(key, variation.value) ?? variation.label,
        mechanism: key,
      })),
    ),
  };
}
