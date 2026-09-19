import { useEffect, useState, type ReactNode } from "react";
import { useSearch } from "@tanstack/react-router";
import {
  Wrench,
  TriangleAlert,
  ArrowRight,
  CalendarCheck,
  TrendingUp,
  Sparkles,
  Loader2,
  Radar,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SetterSignalsPanel } from "@/components/setter-signals-panel";
import { cn } from "@/lib/utils";
import {
  MECHANISMS,
  MECHANISM_KEYS,
  MECHANISM_COLORS,
  reelSplit,
  type MechanismKey,
} from "@/lib/content-mechanisms";
import type {
  Driver,
  DemandEvidence,
  DemandEvidenceRow,
  WeeklyMechanismStat,
  WeeklyDiagnosis,
  BottleneckReadResult,
} from "@/lib/content-taxonomy";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import type { Derivation } from "@/lib/funnel-derivation";

/**
 * Content Signals, migrated from the standalone /content-signals page into
 * Content Command Center (Phase 2 consolidation). Every computation here —
 * the mix, the drivers, the weekly diagnosis, the AI read — is unchanged
 * server-side logic (computeDemand / computeWeeklyContentCheck /
 * analyzeContentSystem, all in content-signals.server.ts); this file is
 * purely the presentational port, restyled to CCC's own card/typography
 * language instead of the standalone page's generic <Card> treatment.
 */

export type SignalsDemand = {
  mix: Record<string, number>;
  insufficientData?: boolean;
  totalWeight?: number;
  minTotalWeight?: number;
  drivers?: Driver[];
  counts?: { faq: number; setter_calls: number; intakes: number; reels: number };
  evidence?: DemandEvidence;
};

export type SignalsWeekly = {
  per?: Record<string, WeeklyMechanismStat>;
  reels: number;
  missing: string[];
  untracked: number;
  best: string | null;
  worst: string | null;
  worstDiagnosis?: WeeklyDiagnosis | null;
  total: number;
};

type WeeklyPiece = NonNullable<WeeklyMechanismStat["pieces"]>[number];

// None of these evidence drill-downs are a sequential funnel stage — a
// FAQ-video list, a raw driver record, a week's untagged posts — so
// deriveCap/deriveWorking don't apply. Honest "not applicable" rather than
// forcing a funnel-shaped sentence onto a non-funnel record list (same
// precedent as Traffic's NOT_EVALUATED / CCC's NOT_A_FUNNEL_STAGE).
const EVIDENCE_NOT_APPLICABLE: Derivation = {
  status: "insufficient_data",
  sentence:
    "A raw evidence record, not a sequential funnel stage — no upstream constraint to derive.",
};

const DRIVER_COLUMNS: DetailColumn<Driver>[] = [
  { key: "source", label: "Source", render: (d) => d.source },
  { key: "detail", label: "Detail", render: (d) => d.detail },
  { key: "weight", label: "Weight", render: (d) => `w${Math.round(d.weight)}`, align: "right" },
];

const EVIDENCE_ROW_COLUMNS: DetailColumn<DemandEvidenceRow>[] = [
  { key: "title", label: "Record", render: (r) => r.title },
  { key: "detail", label: "Detail", render: (r) => r.detail },
];

const PIECE_COLUMNS: DetailColumn<WeeklyPiece>[] = [
  { key: "platform", label: "Platform", render: (p) => p.platform },
  {
    key: "posted_at",
    label: "Posted",
    render: (p) => (p.posted_at ? p.posted_at.slice(0, 10) : "Unknown date"),
  },
];

type EvidenceKey = "faq" | "setter_calls" | "intakes" | "reels";
const EVIDENCE_META: Record<EvidenceKey, { title: string; empty: string }> = {
  faq: { title: "FAQ videos", empty: "No FAQ videos logged in this range." },
  setter_calls: {
    title: "Setting-call signals",
    empty: "No setting-call signals logged in this range.",
  },
  intakes: { title: "Client intakes", empty: "No client intakes logged in this range." },
  reels: { title: "Content pieces", empty: "No content pieces logged in this range." },
};

function EvidenceCountLink({
  label,
  count,
  onClick,
}: {
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 hover:text-foreground hover:decoration-foreground"
    >
      {count} {label}
    </button>
  );
}

/** Small radial mix indicator, colored per-mechanism via MECHANISM_COLORS
 * (the same fixed color every other mechanism surface in the app uses —
 * never a locally-invented palette). Same underlying `pct` the old linear
 * bar showed, just a denser reading. */
function MechanismRing({ pct, color }: { pct: number; color: string }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--border)" strokeWidth="4" />
      <circle
        cx="19"
        cy="19"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function RootCauseChain({
  untaggedCount,
  untrackedCount,
  totalPosts,
  untaggedPieces,
}: {
  untaggedCount: number;
  untrackedCount: number;
  totalPosts: number;
  untaggedPieces: WeeklyPiece[];
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const post = (n: number) => (n === 1 ? "post" : "posts");
  const gap: "mix" | "perf" | null = untaggedCount > 0 ? "mix" : untrackedCount > 0 ? "perf" : null;

  if (!gap) {
    return (
      <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
        <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
        <div className="relative flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Wrench className="h-3.5 w-3.5" /> Root cause — why the numbers move
        </div>
        <div className="relative mt-3 rounded-md border border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/10 px-3 py-2 text-2xs text-[color:var(--color-success)]">
          Tracking is healthy — {totalPosts} posts this week are all mechanism-tagged with metrics
          logged. The mix below reflects real signal, not guesswork.
        </div>
      </div>
    );
  }

  const evidenceBody =
    gap === "mix" ? (
      untaggedPieces.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowEvidence(true)}
          className="underline decoration-dotted underline-offset-2 hover:text-foreground"
        >
          {untaggedCount} of {totalPosts} {post(totalPosts)} this week untagged
        </button>
      ) : (
        <>
          {untaggedCount} of {totalPosts} {post(totalPosts)} this week untagged
        </>
      )
    ) : (
      <>
        {untrackedCount} of {totalPosts} {post(totalPosts)} this week have no performance metrics
        logged
      </>
    );

  // Spectrum progression from "problem" to "fix" — cold (signal) → hot
  // (evidence of the gap) → mid (diagnosis/implication) → success (the
  // action that closes it). Presentation only; the gap-detection logic
  // above is unchanged.
  const steps: { label: string; body: ReactNode; color: string }[] =
    gap === "mix"
      ? [
          {
            label: "Signal",
            body: "Cash results look inconsistent week to week.",
            color: "var(--spectrum-cold)",
          },
          { label: "Evidence", body: evidenceBody, color: "var(--destructive)" },
          {
            label: "Root cause",
            body: "Posting mix isn't tracked — there's no reliable way to tell which mechanism is driving (or hurting) cash.",
            color: "var(--spectrum-mid)",
          },
          {
            label: "Business implication",
            body: `The mix % and AI bottleneck read below are resting on ${totalPosts - untaggedCount} of ${totalPosts} posts' worth of real signal.`,
            color: "var(--spectrum-mid)",
          },
          {
            label: "Recommended action",
            body: "Tag a mechanism on every post going forward — the mix %, weekly check, and AI read all sharpen automatically once this closes.",
            color: "var(--color-success)",
          },
        ]
      : [
          {
            label: "Signal",
            body: "Cash results look inconsistent week to week.",
            color: "var(--spectrum-cold)",
          },
          { label: "Evidence", body: evidenceBody, color: "var(--destructive)" },
          {
            label: "Root cause",
            body: "Performance isn't tracked — there's no way to verify whether a mechanism is actually converting.",
            color: "var(--spectrum-mid)",
          },
          {
            label: "Business implication",
            body: `The weekly check and AI bottleneck read below can only speak to ${totalPosts - untrackedCount} of ${totalPosts} posts this week.`,
            color: "var(--spectrum-mid)",
          },
          {
            label: "Recommended action",
            body: "Log views/DMs/calls/cash for every post — the diagnosis becomes trustworthy once metrics are complete.",
            color: "var(--color-success)",
          },
        ];

  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <Wrench className="h-3.5 w-3.5" /> Root cause — why the numbers move
      </div>
      <div className="relative mt-3">
        {steps.map((s, i) => (
          <div key={s.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-semibold text-background"
                style={{
                  background: s.color,
                  boxShadow: `0 0 10px color-mix(in oklch, ${s.color} 65%, transparent)`,
                }}
              >
                {i + 1}
              </div>
              {i < steps.length - 1 && (
                <div
                  className="mt-0.5 w-px flex-1"
                  style={{
                    background: `linear-gradient(to bottom, ${s.color}, ${steps[i + 1].color})`,
                  }}
                />
              )}
            </div>
            <div className={cn("flex-1", i < steps.length - 1 ? "pb-3" : "")}>
              <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-0.5 text-2xs text-foreground/90">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <MetricDetailPanel<WeeklyPiece>
        open={showEvidence}
        onOpenChange={setShowEvidence}
        title="Untagged posts this week"
        subtitle="Real content_pieces rows with no mechanism tag"
        columns={PIECE_COLUMNS}
        rows={untaggedPieces}
        rowKey={(p) => p.id}
        cap={EVIDENCE_NOT_APPLICABLE}
        working={EVIDENCE_NOT_APPLICABLE}
        emptyRowsLabel="No untagged posts in range."
      />
    </div>
  );
}

function RecommendedMixCard({
  demand,
  weekly,
  reelTarget,
  onReelTargetChange,
  rangeLabel,
}: {
  demand?: SignalsDemand;
  weekly: SignalsWeekly;
  reelTarget: number;
  onReelTargetChange: (n: number) => void;
  rangeLabel: string;
}) {
  const [mechanismDrill, setMechanismDrill] = useState<MechanismKey | null>(null);
  const [evidenceDrill, setEvidenceDrill] = useState<EvidenceKey | null>(null);
  const split = demand ? reelSplit(demand.mix as Record<MechanismKey, number>, reelTarget) : [];

  // Deep-link from the Closer dashboard's objection instrument
  // ("View in Content Command Center", /content?mechanism=X) — scroll to the
  // matching mechanism card on arrival. Same behavior the standalone Content
  // Signals page had.
  const deepLink = useSearch({ strict: false }) as { mechanism?: string };
  useEffect(() => {
    const m = deepLink.mechanism;
    if (!m || !MECHANISM_KEYS.includes(m as MechanismKey)) return;
    const el = document.getElementById(`mechanism-${m}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [deepLink.mechanism]);

  const mechanismDrillRows = mechanismDrill
    ? (demand?.drivers ?? [])
        .filter((d) => d.mechanism === mechanismDrill)
        .sort((a, b) => b.weight - a.weight)
    : [];

  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recommended mix · {rangeLabel}
          </div>
          {demand?.insufficientData && (
            <span
              className="flex items-center gap-1 rounded bg-[color:var(--color-warning)]/15 px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide text-[color:var(--color-warning)]"
              title={`Total signal weight ${demand.totalWeight} is below the configured minimum of ${demand.minTotalWeight} — this mix is a real computed split, not a placeholder, but it's resting on thin signal.`}
            >
              <TriangleAlert className="h-3 w-3" /> Limited data
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 text-2xs text-muted-foreground">
          Weekly reel target
          <input
            type="number"
            min={1}
            max={21}
            value={reelTarget}
            onChange={(e) => onReelTargetChange(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-16 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          />
        </label>
      </div>
      {!demand ? (
        <div className="relative">
          <EmptyState
            icon={<Radar className="h-5 w-5" />}
            title="No mix yet"
            description="Waiting on demand signals to compute a mix against."
          />
        </div>
      ) : (
        <div className="relative mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MECHANISM_KEYS.map((k) => {
            const pct = demand.mix[k] ?? 0;
            const color = MECHANISM_COLORS[k];
            const reels = split.find((s) => s.mechanism === k)?.reels ?? 0;
            const posted = weekly.per?.[k]?.count ?? 0;
            const gap = reels - posted;
            const kDrivers = (demand.drivers ?? [])
              .filter((d) => d.mechanism === k)
              .sort((a, b) => b.weight - a.weight);
            const kWeight = kDrivers.reduce((s, d) => s + d.weight, 0);
            return (
              <div
                key={k}
                id={`mechanism-${k}`}
                className="scroll-mt-20 space-y-1.5 rounded-md border border-border/70 bg-background/40 p-3"
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative shrink-0">
                    <MechanismRing pct={pct} color={color} />
                    <span
                      className="absolute inset-0 flex items-center justify-center font-sans text-2xs font-semibold tabular-nums"
                      style={{ color }}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{MECHANISMS[k].label}</span>
                    <div className="text-2xs text-muted-foreground">
                      {reels} of {reelTarget} reels this week
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "text-2xs font-medium",
                    gap > 0 ? "text-destructive" : "text-[color:var(--color-success)]",
                  )}
                >
                  {gap > 0 ? `${gap} short — posted ${posted}` : `On target — posted ${posted}`}
                </div>
                <button
                  type="button"
                  disabled={kDrivers.length === 0}
                  onClick={() => setMechanismDrill(k)}
                  className="flex w-full items-center justify-between border-t border-border/60 pt-1 text-3xs text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-70 disabled:hover:text-muted-foreground"
                >
                  <span>
                    {kDrivers.length
                      ? `Why ${pct}%? ${kDrivers.length} signal${kDrivers.length === 1 ? "" : "s"} · w${Math.round(kWeight)}`
                      : "No signals yet"}
                  </span>
                  {kDrivers.length > 0 && <ArrowRight className="h-3 w-3 shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {demand?.counts && (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-1 text-2xs text-muted-foreground">
          <span>Built from</span>
          <EvidenceCountLink
            label="FAQ videos"
            count={demand.counts.faq}
            onClick={() => setEvidenceDrill("faq")}
          />
          <span>·</span>
          <EvidenceCountLink
            label="setting-call signals"
            count={demand.counts.setter_calls}
            onClick={() => setEvidenceDrill("setter_calls")}
          />
          <span>·</span>
          <EvidenceCountLink
            label="client intakes"
            count={demand.counts.intakes}
            onClick={() => setEvidenceDrill("intakes")}
          />
          <span>·</span>
          <EvidenceCountLink
            label="content pieces"
            count={demand.counts.reels}
            onClick={() => setEvidenceDrill("reels")}
          />
          <span>.</span>
        </div>
      )}
      <MetricDetailPanel<Driver>
        open={mechanismDrill != null}
        onOpenChange={(v) => !v && setMechanismDrill(null)}
        title={
          mechanismDrill
            ? `Why ${demand?.mix[mechanismDrill] ?? 0}% ${MECHANISMS[mechanismDrill].label}?`
            : ""
        }
        subtitle={`${rangeLabel} · every signal that pushed this mechanism's weight`}
        columns={DRIVER_COLUMNS}
        rows={mechanismDrillRows}
        rowKey={(d) => d.id ?? `${d.source}|${d.detail}|${d.weight}`}
        cap={EVIDENCE_NOT_APPLICABLE}
        working={EVIDENCE_NOT_APPLICABLE}
        emptyRowsLabel="No signals for this mechanism in range."
      />
      <MetricDetailPanel<DemandEvidenceRow>
        open={evidenceDrill != null}
        onOpenChange={(v) => !v && setEvidenceDrill(null)}
        title={evidenceDrill ? EVIDENCE_META[evidenceDrill].title : ""}
        subtitle={`${rangeLabel} · every real record behind this count`}
        columns={EVIDENCE_ROW_COLUMNS}
        rows={evidenceDrill ? (demand?.evidence?.[evidenceDrill] ?? []) : []}
        rowKey={(r) => r.id}
        cap={EVIDENCE_NOT_APPLICABLE}
        working={EVIDENCE_NOT_APPLICABLE}
        emptyRowsLabel={evidenceDrill ? EVIDENCE_META[evidenceDrill].empty : undefined}
      />
    </div>
  );
}

function WeeklyCheckCard({ weekly }: { weekly: SignalsWeekly }) {
  const [weeklyDrill, setWeeklyDrill] = useState<"reels" | "untagged" | null>(null);
  const reelPieces = Object.values(weekly.per ?? {})
    .flatMap((b) => b.pieces ?? [])
    .filter((p) => ["reel", "tiktok", "youtube_short"].includes(p.platform));
  const untaggedPieces = weekly.per?.["untagged"]?.pieces ?? [];

  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        <CalendarCheck className="h-3.5 w-3.5" /> Weekly check · last 7 days
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <WeeklyStat
          label="Reels posted"
          value={`${weekly.reels}`}
          sub={`target 5-7 · ${weekly.total} pieces total`}
          tone={weekly.reels >= 5 ? "success" : "danger"}
          onClick={reelPieces.length > 0 ? () => setWeeklyDrill("reels") : undefined}
        />
        <WeeklyStat
          label="All 4 categories covered?"
          value={weekly.missing.length === 0 ? "Yes" : `No — ${weekly.missing.length} missing`}
          sub={
            weekly.missing.length
              ? weekly.missing.map((k) => MECHANISMS[k as MechanismKey]?.label ?? k).join(", ")
              : "full coverage"
          }
          tone={weekly.missing.length === 0 ? "success" : "danger"}
        />
        <WeeklyStat
          label="Untagged pieces"
          value={`${weekly.per?.["untagged"]?.count ?? 0}`}
          sub="tag mechanism or it can't be measured"
          tone={(weekly.per?.["untagged"]?.count ?? 0) === 0 ? "success" : "danger"}
          onClick={() => setWeeklyDrill("untagged")}
        />
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="space-y-1 rounded-md border border-[color:var(--color-success)]/45 bg-[color:var(--color-success)]/5 p-3 text-xs">
          <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-[color:var(--color-success)]">
            <TrendingUp className="h-3.5 w-3.5" /> Drove the most DMs / calls
          </div>
          {weekly.best && (weekly.per?.[weekly.best]?.count ?? 0) > 0 ? (
            <div>
              {MECHANISMS[weekly.best as MechanismKey]?.label ?? weekly.best} —{" "}
              {weekly.per![weekly.best].dms} DMs, {weekly.per![weekly.best].calls} calls booked, $
              {Math.round(weekly.per![weekly.best].cash / 100).toLocaleString()} cash. Double down.
            </div>
          ) : (
            <div className="text-muted-foreground">No performance logged yet this week.</div>
          )}
        </div>
        <div
          className={cn(
            "space-y-1 rounded-md border p-3 text-xs",
            weekly.worstDiagnosis?.label === "Underperforming"
              ? "border-destructive/45 bg-destructive/5"
              : "border-border bg-muted/20",
          )}
        >
          <div
            className={cn(
              "flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider",
              weekly.worstDiagnosis?.label === "Underperforming"
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            <TriangleAlert className="h-3.5 w-3.5" />{" "}
            {weekly.worstDiagnosis?.label === "Underperforming"
              ? "Underperformed"
              : "Lowest this week"}
          </div>
          {weekly.worst && weekly.worstDiagnosis ? (
            <div>
              <span className="font-medium">
                {MECHANISMS[weekly.worst as MechanismKey]?.label ?? weekly.worst}
              </span>
              <span
                className={cn(
                  "ml-1.5 rounded px-1.5 py-0.5 text-3xs uppercase tracking-wide",
                  weekly.worstDiagnosis.label === "Underperforming"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {weekly.worstDiagnosis.label}
              </span>
              <div className="mt-1 text-muted-foreground">{weekly.worstDiagnosis.detail}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              Nothing posted with a mechanism tag this week.
            </div>
          )}
        </div>
      </div>
      <MetricDetailPanel<WeeklyPiece>
        open={weeklyDrill != null}
        onOpenChange={(v) => !v && setWeeklyDrill(null)}
        title={weeklyDrill === "reels" ? "Reels posted this week" : "Untagged pieces this week"}
        subtitle="Real content_pieces rows behind this count"
        columns={PIECE_COLUMNS}
        rows={
          weeklyDrill === "reels" ? reelPieces : weeklyDrill === "untagged" ? untaggedPieces : []
        }
        rowKey={(p) => p.id}
        cap={EVIDENCE_NOT_APPLICABLE}
        working={EVIDENCE_NOT_APPLICABLE}
        emptyRowsLabel="No pieces in range."
      />
    </div>
  );
}

function WeeklyStat({
  label,
  value,
  sub,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-md border border-border/70 bg-background/40 p-3 text-left",
        onClick && "cursor-pointer transition hover:border-border hover:bg-background/60",
      )}
    >
      <div className="text-3xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 font-sans text-lg font-semibold tabular-nums",
          tone === "success" && "text-[color:var(--color-success)]",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-2xs text-muted-foreground">{sub}</div>}
    </Comp>
  );
}

function DriversLogCard({ demand }: { demand?: SignalsDemand }) {
  const drivers = demand?.drivers ?? [];
  const [openDriver, setOpenDriver] = useState<Driver | null>(null);
  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Why the mix looks like this — raw signals
      </div>
      {drivers.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-5 w-5" />}
          title="No demand signals yet"
          description="Log FAQ video clicks, screen a setting call, or collect a client intake — each one moves the mix."
        />
      ) : (
        <div className="mt-2 max-h-72 divide-y divide-border overflow-y-auto">
          {drivers.map((d, i) => {
            const clickable = Boolean(d.id);
            return (
              <button
                key={i}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && setOpenDriver(d)}
                title={clickable ? undefined : "No underlying record id for this signal"}
                className={cn(
                  "flex w-full items-start gap-2 py-2 text-left text-xs",
                  clickable ? "hover:bg-muted/30" : "cursor-default",
                )}
              >
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-3xs font-medium"
                  style={{
                    color: MECHANISM_COLORS[d.mechanism as MechanismKey],
                    backgroundColor: `color-mix(in oklch, ${MECHANISM_COLORS[d.mechanism as MechanismKey]} 15%, transparent)`,
                  }}
                >
                  {MECHANISMS[d.mechanism as MechanismKey]?.label ?? d.mechanism}
                </span>
                <span className="shrink-0 text-muted-foreground">{d.source}</span>
                <span className="flex-1 truncate">{d.detail}</span>
                <span className="shrink-0 font-sans text-3xs tabular-nums text-muted-foreground">
                  w{Math.round(d.weight)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <MetricDetailPanel<Driver>
        open={openDriver != null}
        onOpenChange={(v) => !v && setOpenDriver(null)}
        title={openDriver?.source ?? ""}
        subtitle="The real record behind this driver"
        columns={DRIVER_COLUMNS}
        rows={openDriver ? [openDriver] : []}
        rowKey={(d) => d.id ?? `${d.source}|${d.detail}|${d.weight}`}
        cap={EVIDENCE_NOT_APPLICABLE}
        working={EVIDENCE_NOT_APPLICABLE}
      />
    </div>
  );
}

const CONFIDENCE_TONE: Record<string, string> = {
  high: "border-[color:var(--color-success)]/40 bg-[color:var(--color-success)]/10 text-[color:var(--color-success)]",
  medium:
    "border-[color:var(--color-warning)]/40 bg-[color:var(--color-warning)]/10 text-[color:var(--color-warning)]",
  low: "border-destructive/40 bg-destructive/10 text-destructive",
};

function AIBottleneckReadCard({
  bottleneckRead,
  onAnalyze,
  analyzing,
  rangeLabel,
}: {
  bottleneckRead?: BottleneckReadResult;
  onAnalyze: () => void;
  analyzing: boolean;
  rangeLabel: string;
}) {
  return (
    <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-spectrum-mid" /> AI bottleneck read · {rangeLabel}
        </div>
        <button
          type="button"
          disabled={analyzing}
          onClick={onAnalyze}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted/40 disabled:opacity-60"
        >
          {analyzing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…
            </>
          ) : (
            "Analyze the system"
          )}
        </button>
      </div>

      {!bottleneckRead ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Merges VSL play/drop-off, FAQ clicks, setting-call objections, intake answers, and reel
          performance into ranked, evidence-cited findings — each with the data behind it, not just
          a summary of the KPI cards above.
        </p>
      ) : bottleneckRead.status === "not_configured" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          AI is not configured for this workspace — add LOVABLE_API_KEY to enable this.
        </p>
      ) : bottleneckRead.status === "error" ? (
        <div className="mt-3 rounded-md border border-destructive/45 bg-destructive/5 p-3 text-xs text-destructive">
          {bottleneckRead.message}
        </div>
      ) : bottleneckRead.insights.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Not enough grounded data this window for a real finding — log more content, FAQ clicks, or
          setting-call signals and try again rather than trust a padded read.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {bottleneckRead.insights.map((insight, i) => (
            <div key={i} className="rounded-xl border border-border/70 bg-background/40 p-3">
              <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                Finding / bottleneck
              </div>
              <div className="mt-0.5 text-sm font-semibold leading-snug text-foreground">
                {insight.finding}
              </div>
              <dl className="mt-3 grid gap-2 text-2xs sm:grid-cols-2">
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Evidence</dt>
                  <dd className="mt-0.5 text-foreground/90">{insight.supportingData}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Why it matters</dt>
                  <dd className="mt-0.5 text-foreground/90">{insight.whyItMatters}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">
                    Recommended action
                  </dt>
                  <dd className="mt-0.5 text-foreground/90">{insight.recommendedAction}</dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Confidence</dt>
                  <dd className="mt-0.5">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-3xs font-medium uppercase tracking-wide",
                        CONFIDENCE_TONE[insight.confidence] ?? CONFIDENCE_TONE.low,
                      )}
                    >
                      {insight.confidence} confidence
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="uppercase tracking-wider text-muted-foreground">Sample size</dt>
                  <dd className="mt-0.5 text-foreground/90">{insight.sampleSize}</dd>
                </div>
              </dl>
              {insight.relevantRecords.length > 0 && (
                <div className="mt-2">
                  <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Supporting records
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {insight.relevantRecords.map((r, ri) => (
                      <span
                        key={ri}
                        className="rounded border border-border px-1.5 py-0.5 text-3xs text-muted-foreground"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {insight.attributionLimitations &&
                insight.attributionLimitations !== "Not applicable" && (
                  <div className="mt-2 text-3xs text-[color:var(--color-warning)]">
                    Attribution limitation: {insight.attributionLimitations}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContentSignalsSection({
  demand,
  weekly,
  bottleneckRead,
  onAnalyze,
  analyzing,
  rangeLabel,
  reelTarget,
  onReelTargetChange,
}: {
  demand?: SignalsDemand;
  weekly?: SignalsWeekly;
  bottleneckRead?: BottleneckReadResult;
  onAnalyze: () => void;
  analyzing: boolean;
  rangeLabel: string;
  reelTarget: number;
  onReelTargetChange: (n: number) => void;
}) {
  const safeWeekly: SignalsWeekly = weekly ?? {
    per: {},
    reels: 0,
    missing: [],
    untracked: 0,
    best: null,
    worst: null,
    worstDiagnosis: null,
    total: 0,
  };

  return (
    <div
      id="content-signals"
      className="scroll-mt-24 space-y-3 rounded-2xl border border-border/70 bg-card/30 p-4 md:p-5"
    >
      <div className="glass relative overflow-hidden rounded-xl border p-3.5">
        <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background/45 text-spectrum-mid shadow-sm">
            <Radar className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <div className="text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Content signals
            </div>
            <div className="display-serif truncate text-lg leading-tight md:text-xl">
              What to post next
            </div>
          </div>
        </div>
      </div>
      <RootCauseChain
        untaggedCount={safeWeekly.per?.["untagged"]?.count ?? 0}
        untrackedCount={safeWeekly.untracked}
        totalPosts={safeWeekly.total}
        untaggedPieces={safeWeekly.per?.["untagged"]?.pieces ?? []}
      />
      <RecommendedMixCard
        demand={demand}
        weekly={safeWeekly}
        reelTarget={reelTarget}
        onReelTargetChange={onReelTargetChange}
        rangeLabel={rangeLabel}
      />
      <WeeklyCheckCard weekly={safeWeekly} />
      <DriversLogCard demand={demand} />
      <AIBottleneckReadCard
        bottleneckRead={bottleneckRead}
        onAnalyze={onAnalyze}
        analyzing={analyzing}
        rangeLabel={rangeLabel}
      />
      <SetterSignalsPanel />
    </div>
  );
}
