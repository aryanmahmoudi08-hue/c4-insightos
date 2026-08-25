import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  adminClient,
  createTestWorkspace,
  teardownTestWorkspace,
  daysAgo,
  type TestWorkspace,
} from "./helpers";
import { computeDemand, computeWeeklyContentCheck } from "../content-signals.server";
import {
  fetchBaseline,
  fetchBaselines,
  toPieceMetrics,
  bucketKey,
} from "../content-performance.server";
import { classifyPerformance, type PieceMetrics } from "../content-performance";
import { DEFAULT_WORKSPACE_SETTINGS } from "../workspace-settings.functions";
import {
  MECHANISM_KEYS,
  emptyWeights,
  type MechanismKey,
  type MechanismWeights,
} from "../content-mechanisms";

/**
 * Step 9 — before/after report. Runs the CURRENT (NEW) scoring code for real
 * against a throwaway Supabase project (same infra as the step-8 integration
 * suite), and compares it against the OLD scoring logic exactly as it existed
 * at commit 242341d (the last commit before step 5's rewiring) — reimplemented
 * here verbatim since it no longer exists in the working tree. The OLD code's
 * queries are re-issued against the SAME live rows using the OLD select
 * strings (not just old logic over new data), so the "old select never
 * fetched X column" claims are demonstrated, not just asserted.
 *
 * Every changed recommendation below is tagged with why it changed:
 *   (a) cold-start / sample-size gate — a check that plain didn't exist before
 *   (b) bucket-relative comparison — same *kind* of check, different (correct) bar
 *   (c) query-selection fix — the old query never fetched the column needed
 *       to make this comparison at all
 *
 * Run via `npm run test:integration` (opt-in, never part of `npm test`).
 */

const admin = adminClient();
let ws: TestWorkspace;

beforeAll(async () => {
  ws = await createTestWorkspace(admin, "before-after");
}, 30000);

afterAll(async () => {
  if (ws) await teardownTestWorkspace(admin, ws);
});

/* ------------------------------------------------------------------ *
 * OLD logic, reimplemented verbatim from commit 242341d for comparison
 * only. Not exported, not used by the app — dead once this report runs.
 * ------------------------------------------------------------------ */

function oldToMix(w: MechanismWeights, minPct = 10): Record<MechanismKey, number> {
  const total = MECHANISM_KEYS.reduce((s, k) => s + w[k], 0);
  if (!total) return { educational: 25, credibility: 25, authoritative: 25, relatability: 25 };
  const floor = minPct * MECHANISM_KEYS.length;
  const scaled = MECHANISM_KEYS.map((k) => ({
    k,
    v: Math.round((w[k] / total) * (100 - floor) + minPct),
  }));
  const diff = 100 - scaled.reduce((s, x) => s + x.v, 0);
  scaled.sort((a, b) => b.v - a.v);
  if (scaled[0]) scaled[0].v += diff;
  const out = {} as Record<MechanismKey, number>;
  for (const x of scaled) out[x.k] = x.v;
  return out;
}

/** Old computeDemand's per-reel gate. Returns the weight it would have
 * contributed (0 = silently skipped, exactly as the old code did — no
 * "underperforming" concept existed on this path at all). */
function oldReelDriverWeight(m: {
  leads_generated?: number | null;
  cash_collected_cents?: number | null;
  hook_retention_pct?: number | null;
  engagement_rate_pct?: number | null;
  drop_off_rate_pct?: number | null;
}): number {
  const converted = Number(m.leads_generated ?? 0) > 0 || Number(m.cash_collected_cents ?? 0) > 0;
  const heldAttention =
    Number(m.hook_retention_pct ?? 0) >= 45 || Number(m.engagement_rate_pct ?? 0) >= 6;
  const lowDropOff = m.drop_off_rate_pct == null || Number(m.drop_off_rate_pct) < 40;
  if (!converted && !(heldAttention && lowDropOff)) return 0;
  return (converted ? 3 : 0) + (heldAttention ? 2 : 0);
}

type OldWorstReason = { label: string; detail: string } | null;

/** Old content-signals.tsx's client-side weekly worst-mechanism diagnosis. */
function oldWorstReason(
  pieces: { id: string; mechanism: string | null }[],
  metricsById: Map<
    string,
    {
      dms_generated?: number | null;
      calls_booked?: number | null;
      cash_collected_cents?: number | null;
      views?: number | null;
      engagement_rate_pct?: number | null;
      hook_retention_pct?: number | null;
    }
  >,
) {
  const per: Record<
    string,
    {
      count: number;
      dms: number;
      calls: number;
      cash: number;
      views: number;
      eng: number[];
      retention: number[];
      withMetrics: number;
    }
  > = {};
  for (const k of [...MECHANISM_KEYS, "untagged"])
    per[k] = {
      count: 0,
      dms: 0,
      calls: 0,
      cash: 0,
      views: 0,
      eng: [],
      retention: [],
      withMetrics: 0,
    };
  for (const p of pieces) {
    const k = p.mechanism ?? "untagged";
    const bucket = per[k] ?? per.untagged;
    bucket.count += 1;
    const m = metricsById.get(p.id);
    if (m) {
      bucket.dms += Number(m.dms_generated ?? 0);
      bucket.calls += Number(m.calls_booked ?? 0);
      bucket.cash += Number(m.cash_collected_cents ?? 0);
      bucket.views += Number(m.views ?? 0);
      if (m.engagement_rate_pct) bucket.eng.push(Number(m.engagement_rate_pct));
      if (m.hook_retention_pct) bucket.retention.push(Number(m.hook_retention_pct));
      if (
        m.views ||
        m.dms_generated ||
        m.calls_booked ||
        m.engagement_rate_pct ||
        m.hook_retention_pct
      )
        bucket.withMetrics += 1;
    }
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const overallAvgViews = pieces.length
    ? MECHANISM_KEYS.reduce((s, k) => s + per[k].views, 0) /
      Math.max(1, pieces.filter((p) => metricsById.has(p.id)).length)
    : 0;
  const worst =
    MECHANISM_KEYS.filter((k) => per[k].count > 0).sort(
      (a, b) => per[a].dms + per[a].calls * 3 - (per[b].dms + per[b].calls * 3),
    )[0] ?? null;

  let worstReason: OldWorstReason = null;
  if (worst && per[worst].count > 0) {
    const b = per[worst];
    const avgViews = b.withMetrics ? b.views / b.withMetrics : 0;
    const avgRetention = avg(b.retention);
    const avgEng = avg(b.eng);
    const converted = b.dms + b.calls > 0;
    if (b.withMetrics === 0) {
      worstReason = {
        label: "Untracked",
        detail: `${b.count} posts with no metrics logged — can't diagnose without data.`,
      };
    } else if (avgViews < overallAvgViews * 0.5) {
      worstReason = {
        label: "Low reach",
        detail: `Avg ${Math.round(avgViews)} views vs ${Math.round(overallAvgViews)} org avg — it barely got seen.`,
      };
    } else if (avgRetention > 0 && avgRetention < 40) {
      worstReason = {
        label: "Low retention",
        detail: `Avg ${Math.round(avgRetention)}% hook retention — reached people but lost them fast.`,
      };
    } else if (!converted && (avgViews >= overallAvgViews * 0.5 || avgEng >= 3)) {
      worstReason = {
        label: "Wrong mechanism",
        detail: `Reached fine (${Math.round(avgViews)} views) but drove 0 DMs/calls.`,
      };
    } else {
      worstReason = {
        label: "Underperforming",
        detail: `${b.count} posts, ${b.dms} DMs, ${b.calls} calls booked — below the mix's other mechanisms this week.`,
      };
    }
  }
  return {
    per,
    worst,
    worstReason,
    missing: MECHANISM_KEYS.filter((k) => per[k].count === 0),
    total: pieces.length,
  };
}

/* ------------------------------------------------------------------ *
 * Seeding helpers
 * ------------------------------------------------------------------ */

async function seedPiece(
  mechanism: MechanismKey,
  platform: string,
  title: string,
  ageDays: number,
  metrics: {
    views: number;
    retention: number;
    engagement: number;
    dropOff: number;
    leads?: number;
    cashCents?: number;
  },
) {
  const ts = daysAgo(ageDays);
  const { data: piece, error: pErr } = await admin
    .from("content_pieces")
    .insert({ org_id: ws.orgId, platform, mechanism, title, posted_at: ts, created_at: ts })
    .select("id")
    .single();
  if (pErr) throw new Error(`seed piece failed: ${pErr.message}`);
  const { error: mErr } = await admin.from("content_metrics").insert({
    org_id: ws.orgId,
    content_id: piece!.id,
    views: metrics.views,
    hook_retention_pct: metrics.retention,
    engagement_rate_pct: metrics.engagement,
    drop_off_rate_pct: metrics.dropOff,
    leads_generated: metrics.leads ?? 0,
    cash_collected_cents: metrics.cashCents ?? 0,
  });
  if (mErr) throw new Error(`seed metrics failed: ${mErr.message}`);
  return piece!.id as string;
}

describe("Step 9 — before/after report on a synthetic dataset shaped like the real distribution", () => {
  it("produces the report", async () => {
    const config = DEFAULT_WORKSPACE_SETTINGS.content_engine; // minBucketSample=6, baselineWindowSize=20, minTotalSignalWeight=15

    /* ---- FAQ videos (6), setter calls (14), onboarding intakes (9) — ---- *
     * identical scoring formula old vs new, included so the mix comparison
     * is realistic, not just the reel-driver delta in isolation. */
    const faqSeed: { title: string; mechanism: MechanismKey; clicks: number; plays: number }[] = [
      { title: "Is this a scam?", mechanism: "credibility", clicks: 14, plays: 5 },
      {
        title: "How does the tracking system work?",
        mechanism: "educational",
        clicks: 9,
        plays: 3,
      },
      { title: "Why is it $8k, not $2k?", mechanism: "authoritative", clicks: 6, plays: 2 },
      { title: "Are your results actually real?", mechanism: "credibility", clicks: 4, plays: 1 },
      {
        title: "What if I'm not like your other clients?",
        mechanism: "relatability",
        clicks: 3,
        plays: 1,
      },
      { title: "Do you work with total beginners?", mechanism: "educational", clicks: 2, plays: 0 },
    ];
    for (const f of faqSeed)
      await admin.from("faq_videos").insert({
        org_id: ws.orgId,
        title: f.title,
        mechanism: f.mechanism,
        clicks: f.clicks,
        plays: f.plays,
        active: true,
      });

    const setterMechs: MechanismKey[] = [
      "credibility",
      "credibility",
      "credibility",
      "credibility",
      "educational",
      "educational",
      "educational",
      "educational",
      "authoritative",
      "authoritative",
      "authoritative",
      "relatability",
      "relatability",
      "relatability",
    ];
    for (let i = 0; i < setterMechs.length; i++) {
      await admin.from("setter_call_signals").insert({
        org_id: ws.orgId,
        setter_name: `Rep ${i}`,
        call_date: daysAgo(3 + i).slice(0, 10),
        mechanism: setterMechs[i],
      });
    }

    const intakeMechs: MechanismKey[] = [
      "credibility",
      "credibility",
      "educational",
      "educational",
      "educational",
      "authoritative",
      "relatability",
      "relatability",
      "relatability",
    ];
    for (const mech of intakeMechs) {
      await admin.from("onboarding_responses").insert({
        org_id: ws.orgId,
        responses: { decision_moment: "saw a real result" },
        mechanism_signals: { [mech]: 5 },
      });
    }

    /* ---- Moment A: educational/reel, n=8 — OLD showers "strong" on nearly ----
     * everything above a generic 45%/6% floor; NEW is selective against this
     * account's OWN top quartile. */
    for (const [i, r] of [74, 75, 76, 77, 78, 79, 80].entries()) {
      await seedPiece("educational", "reel", `edu baseline ${i}`, 10 + i, {
        views: [900, 950, 920, 980, 1000, 940, 970][i],
        retention: r,
        engagement: 5,
        dropOff: 20,
      });
    }
    const momentAId = await seedPiece("educational", "reel", "edu moment (46% retention)", 9, {
      views: 950,
      retention: 46,
      engagement: 3,
      dropOff: 25,
    });

    /* ---- Moment B: authoritative/reel, n=3 — below minBucketSample(6). ---- *
     * OLD confidently scores all 3; NEW correctly withholds judgment. */
    for (const [i, r] of [50, 55, 60].entries()) {
      await seedPiece("authoritative", "reel", `auth cold-start ${i}`, 8 + i, {
        views: 600 + i * 50,
        retention: r,
        engagement: 3 + i * 0.5,
        dropOff: 30 - i * 2,
      });
    }

    /* ---- Moment C: relatability/reel, n=6 — a piece with typical retention/ ----
     * engagement but catastrophically low views. OLD's reel query never
     * selected `views` at all, so it can't see this; NEW can. */
    const relBase = [
      { r: 55, e: 4.0, v: 1200 },
      { r: 58, e: 4.2, v: 1300 },
      { r: 56, e: 4.1, v: 1250 },
      { r: 60, e: 4.5, v: 1400 },
      { r: 57, e: 4.0, v: 1350 },
    ];
    for (const [i, p] of relBase.entries()) {
      await seedPiece("relatability", "reel", `rel baseline ${i}`, 11 + i * 2, {
        views: p.v,
        retention: p.r,
        engagement: p.e,
        dropOff: 28,
      });
    }
    const momentCId = await seedPiece("relatability", "reel", "rel moment (low views)", 9, {
      views: 400,
      retention: 56,
      engagement: 4.1,
      dropOff: 28,
    });

    /* ---- Moment D: credibility/reel, n=6 — 5 strong OLDER pieces (outside ----
     * the 7-day weekly window) + 1 weak piece posted this week. The only
     * bucket with any pieces in the last 7 days, so it's unambiguously
     * "worst" under both old and new weekly logic. */
    for (const [i, r] of [70, 75, 80, 85, 90].entries()) {
      await seedPiece("credibility", "reel", `cred baseline ${i}`, 15 + i * 2, {
        views: 900 + i * 20,
        retention: r,
        engagement: 5 + i,
        dropOff: 30,
      });
    }
    await seedPiece("credibility", "reel", "cred moment (weak, this week)", 2, {
      views: 300,
      retention: 38,
      engagement: 1,
      dropOff: 30,
    });

    /* ================= NEW: run the real, current code ================= */
    const newDemand = await computeDemand(ws.userClient, ws.orgId, { from: daysAgo(30).slice(0, 10), to: new Date().toISOString().slice(0, 10) }, config);
    const newWeekly = await computeWeeklyContentCheck(ws.userClient, ws.orgId, config);

    // newDemand.drivers is sorted-by-weight and sliced to the top 24 for
    // display (computeDemand's own return statement — true in OLD too,
    // unchanged by this project). That truncation drops our deliberately
    // low-weight (2) synthetic reel signals before the FAQ/setter/intake
    // entries (weight 4-38), even though they're fully counted in
    // newDemand.weights (the numbers that actually drive the mix %). So the
    // "how many reels register as strong" count below is computed directly
    // via classifyPerformance over every reel piece, not via the truncated
    // drivers list, to avoid measuring the truncation instead of the score.
    const { data: allReelRows } = await ws.userClient
      .from("content_pieces")
      .select(
        "id, mechanism, platform, content_metrics(leads_generated, cash_collected_cents, hook_retention_pct, engagement_rate_pct, drop_off_rate_pct, views)",
      )
      .eq("org_id", ws.orgId)
      .gte("created_at", daysAgo(30))
      .limit(400);
    const reelsForVerdicts = ((allReelRows ?? []) as any[]).filter(
      (p) => p.mechanism && p.platform,
    );
    const verdictBuckets = reelsForVerdicts.map((p) => ({
      mechanism: p.mechanism,
      platform: p.platform,
    }));
    const verdictBaselines = await fetchBaselines(
      ws.userClient,
      ws.orgId,
      verdictBuckets,
      config.baselineWindowSize,
    );
    const allVerdicts = reelsForVerdicts.map((p) => {
      const metrics = Array.isArray(p.content_metrics)
        ? p.content_metrics
        : p.content_metrics
          ? [p.content_metrics]
          : [];
      const m = metrics[0];
      const baseline = verdictBaselines.get(
        bucketKey({ mechanism: p.mechanism, platform: p.platform }),
      );
      const verdict = baseline
        ? classifyPerformance(toPieceMetrics(m), baseline, config.minBucketSample)
        : null;
      return {
        mechanism: p.mechanism as MechanismKey,
        retention: m?.hook_retention_pct,
        verdict: verdict?.verdict,
      };
    });
    const newStrongReels = allVerdicts.filter((v) => v.verdict === "strong");

    const momentABaseline = await fetchBaseline(
      ws.userClient,
      ws.orgId,
      { mechanism: "educational", platform: "reel" },
      config.baselineWindowSize,
    );
    const momentAPiece: PieceMetrics = {
      converted: false,
      views: 950,
      retentionPct: 46,
      engagementPct: 3,
      dropOffPct: 25,
    };
    const momentAVerdict = classifyPerformance(
      momentAPiece,
      momentABaseline,
      config.minBucketSample,
    );

    const momentBBaseline = await fetchBaseline(
      ws.userClient,
      ws.orgId,
      { mechanism: "authoritative", platform: "reel" },
      config.baselineWindowSize,
    );
    const momentBPiece: PieceMetrics = {
      converted: false,
      views: 600,
      retentionPct: 50,
      engagementPct: 3,
      dropOffPct: 30,
    };
    const momentBVerdict = classifyPerformance(
      momentBPiece,
      momentBBaseline,
      config.minBucketSample,
    );

    const momentCBaseline = await fetchBaseline(
      ws.userClient,
      ws.orgId,
      { mechanism: "relatability", platform: "reel" },
      config.baselineWindowSize,
    );
    const momentCPiece: PieceMetrics = {
      converted: false,
      views: 400,
      retentionPct: 56,
      engagementPct: 4.1,
      dropOffPct: 28,
    };
    const momentCVerdict = classifyPerformance(
      momentCPiece,
      momentCBaseline,
      config.minBucketSample,
    );

    /* ================= OLD: re-issue the OLD select strings against the SAME live rows ================= */
    const since30 = daysAgo(30);
    const { data: oldReelRows, error: oldReelErr } = await ws.userClient
      .from("content_pieces")
      .select(
        "id, mechanism, variation, posted_at, pipeline_status, content_metrics(leads_generated, cash_collected_cents, hook_retention_pct, engagement_rate_pct, drop_off_rate_pct)",
      )
      .eq("org_id", ws.orgId)
      .gte("created_at", since30)
      .limit(400);
    expect(oldReelErr).toBeNull();

    const oldWeights = emptyWeights();
    const oldReelDrivers: { mechanism: string; weight: number; retention: number | null }[] = [];
    for (const p of (oldReelRows ?? []) as any[]) {
      if (!p.mechanism) continue;
      const metrics = Array.isArray(p.content_metrics)
        ? p.content_metrics
        : p.content_metrics
          ? [p.content_metrics]
          : [];
      const m = metrics[0];
      if (!m) continue;
      const w = oldReelDriverWeight(m);
      if (w > 0) {
        oldWeights[p.mechanism as MechanismKey] += w;
        oldReelDrivers.push({ mechanism: p.mechanism, weight: w, retention: m.hook_retention_pct });
      }
    }
    const { data: faqRows } = await ws.userClient
      .from("faq_videos")
      .select("mechanism, clicks, plays")
      .eq("org_id", ws.orgId)
      .eq("active", true);
    for (const f of (faqRows ?? []) as any[])
      if (f.mechanism)
        oldWeights[f.mechanism as MechanismKey] +=
          (Number(f.clicks ?? 0) + Number(f.plays ?? 0)) * 2;
    const { data: setterRows } = await ws.userClient
      .from("setter_call_signals")
      .select("mechanism")
      .eq("org_id", ws.orgId)
      .gte("call_date", since30.slice(0, 10))
      .limit(300);
    for (const s of (setterRows ?? []) as any[])
      if (s.mechanism) oldWeights[s.mechanism as MechanismKey] += 3;
    const { data: intakeRows } = await ws.userClient
      .from("onboarding_responses")
      .select("mechanism_signals")
      .eq("org_id", ws.orgId)
      .gte("created_at", since30)
      .limit(200);
    for (const i of (intakeRows ?? []) as any[]) {
      const stored = (i.mechanism_signals ?? {}) as Partial<MechanismWeights>;
      for (const k of MECHANISM_KEYS) oldWeights[k] += Number(stored[k] ?? 0);
    }
    const oldMix = oldToMix(oldWeights);

    // OLD weekly: content_pieces same shape, content_metrics WITHOUT leads_generated.
    const since7 = daysAgo(7);
    const { data: oldWeeklyPieces } = await ws.userClient
      .from("content_pieces")
      .select("id, mechanism, variation, platform, posted_at, pipeline_status")
      .eq("org_id", ws.orgId)
      .gte("created_at", since7)
      .limit(200);
    const weeklyIds = ((oldWeeklyPieces ?? []) as any[]).map((p) => p.id);
    const oldMetricsById = new Map<string, any>();
    if (weeklyIds.length) {
      const { data: oldMetricsRows } = await ws.userClient
        .from("content_metrics")
        .select(
          "content_id, views, dms_generated, calls_booked, cash_collected_cents, engagement_rate_pct, drop_off_rate_pct, hook_retention_pct",
        )
        .in("content_id", weeklyIds);
      for (const m of (oldMetricsRows ?? []) as any[]) oldMetricsById.set(m.content_id, m);
    }
    const oldWeekly = oldWorstReason(oldWeeklyPieces ?? [], oldMetricsById);

    /* ================= Report ================= */
    const report = `# Content Signals — before/after report (Step 9)

Synthetic dataset shaped like the real distribution: 6 FAQ videos, 14 setter-call signals, 9 onboarding intakes, 21 content pieces across 4 mechanism×platform buckets of varying sample size (matching the real account's mix of well-populated and cold-start buckets, "0 reels some weeks" included via Moments A-C sitting entirely outside the last-7-day window).

OLD = commit 242341d (last commit before step 5's rewiring), reimplemented verbatim and re-run against these same live rows using the OLD select strings. NEW = current \`computeDemand\`/\`computeWeeklyContentCheck\`, run for real against the throwaway Supabase project.

## Recommended mix: OLD vs NEW

| Mechanism | OLD % | NEW % | Old total driver weight | New total driver weight |
|---|---|---|---|---|
${MECHANISM_KEYS.map((k) => `| ${k} | ${oldMix[k]}% | ${newDemand.mix[k]}% | ${Math.round(oldWeights[k])} | ${Math.round(newDemand.weights[k])} |`).join("\n")}

NEW insufficientData: **${newDemand.insufficientData}** (total weight ${newDemand.totalWeight} vs configured minimum ${newDemand.minTotalWeight}). OLD has no equivalent flag — a thin week and a well-populated one render with identical visual confidence.

(Both OLD and NEW sort their displayed \`drivers\` list by weight and slice it to the top 24 — unchanged by this project — so counts below are measured directly against every reel piece's classification, not the truncated display list, to compare the scoring itself rather than the UI's display cap.)

Old reel signals counted positive (all positive, no "underperforming" concept exists on this path): ${oldReelDrivers.length} of ${oldReelRows?.length ?? 0} reels
${oldReelDrivers.map((d) => `  - ${d.mechanism} · retention ${d.retention}% · weight ${d.weight}`).join("\n")}

New reel signals classified "strong": ${newStrongReels.length} of ${allVerdicts.length} reels
${newStrongReels.map((d) => `  - ${d.mechanism} · retention ${d.retention}%`).join("\n")}
New reel signals classified "underperforming": ${allVerdicts.filter((v) => v.verdict === "underperforming").length} — a verdict OLD's reel-driver check has no concept of at all (it only ever adds positive drivers or stays silent).
New reel signals classified "insufficient_data" (cold-start, correctly withheld): ${allVerdicts.filter((v) => v.verdict === "insufficient_data").length}

## Moment A — educational/reel (n=${momentABaseline.sampleSize}): the 46%-retention piece
- OLD: retention 46% >= fixed bar 45% → counted as a "strong" driver, weight ${oldReelDriverWeight({ hook_retention_pct: 46, engagement_rate_pct: 3, drop_off_rate_pct: 25 })}. Same treatment as every baseline piece (74-80% retention) — no differentiation between this account's actual best content and merely-mediocre content.
- NEW: verdict **${momentAVerdict.verdict}** vs this bucket's own baseline (p25=${momentABaseline.retention.p25.toFixed(1)}, p75=${momentABaseline.retention.p75.toFixed(1)}, n=${momentABaseline.sampleSize}). ${momentAVerdict.verdict === "strong" ? "Still counted." : "Excluded from drivers — 46% is below-average for THIS account's educational reels, not exceptional."}
- **Attribution: (b) bucket-relative comparison.** Same kind of check (a retention floor), but the floor is now this account's own top quartile instead of an invented universal number.

## Moment B — authoritative/reel (n=${momentBBaseline.sampleSize}, below minBucketSample=${config.minBucketSample})
- OLD: all 3 pieces (retention 50/55/60%) clear the fixed 45% bar → all 3 counted as "strong" drivers, despite this being the entire lifetime volume of this bucket.
- NEW: verdict **${momentBVerdict.verdict}** (sample size ${momentBBaseline.sampleSize} < minimum ${momentBVerdict.minSample}) — no verdict rendered at all.
- **Attribution: (a) cold-start / sample-size gate.** Not a recalibration of an existing check — this check didn't exist before at all.

## Moment C — relatability/reel (n=${momentCBaseline.sampleSize}): the low-views piece
- OLD: retention 56% >= 45% → \`heldAttention\` true; drop-off 28% < 40% → \`lowDropOff\` true → counted as a "strong" driver, weight 2. The OLD reel query (content-signals.server.ts, pre-step-5) selected \`leads_generated, cash_collected_cents, hook_retention_pct, engagement_rate_pct, drop_off_rate_pct\` — **no \`views\` column at all** — so this piece's real problem (400 views vs a bucket that otherwise runs ${Math.round(momentCBaseline.views.p25)}-${Math.round(momentCBaseline.views.p75)}) was structurally invisible to this code path, not merely mis-weighted.
- NEW: verdict **${momentCVerdict.verdict}** — ${momentCVerdict.reasons.map((r) => `${r.metric} ${Math.round(r.value)} vs bucket ${r.comparisonType} ${Math.round(r.comparedTo)}`).join("; ")} (bucket n=${momentCBaseline.sampleSize}).
- **Attribution: (c) query-selection fix.** The step-5 query change (adding \`views\` to computeDemand's reel select) is what makes this comparison possible at all — this is not a threshold change, the old code could not have made this check with the columns it fetched.

## Moment D — credibility/reel (n=6): this week's weekly diagnosis, verdict unchanged but derivation transformed
OLD weekly worst mechanism: **${oldWeekly.worst}**, reason: **${oldWeekly.worstReason?.label}** — "${oldWeekly.worstReason?.detail}"
NEW weekly worst mechanism: **${newWeekly.worst}**, diagnosis: **${newWeekly.worstDiagnosis?.label}** — "${newWeekly.worstDiagnosis?.detail}"

Both flag the same piece as a problem — but OLD's "Low retention" is a guessed universal 40% floor with zero connection to sample size (it would fire identically at n=1 or n=100, forever, for any account); NEW's "${newWeekly.worstDiagnosis?.label}" states the exact metric, its value, the percentile it's compared against, and the bucket's own sample size, and would have degraded to "Not enough data" instead if this bucket were thin (as demonstrated directly in the step-8 integration suite's cold-start test). **Attribution: no verdict change — a derivation/explainability upgrade (Part 5), not a scoring disagreement.**

## Full weekly check comparison
OLD: worst=${oldWeekly.worst}, missing=${oldWeekly.missing.join(", ") || "none"}, total pieces this week=${oldWeekly.total}
NEW: worst=${newWeekly.worst}, missing=${newWeekly.missing.join(", ") || "none"}, total pieces this week=${newWeekly.total}
`;

    const outDir = process.env.REPORT_OUT_DIR ?? "/tmp";
    const outPath = path.join(outDir, "content-engine-before-after-report.md");
    fs.writeFileSync(outPath, report, "utf-8");
    console.log(report);

    // Sanity invariants — the report must be real, not vacuous.
    expect(newDemand.totalWeight).toBeGreaterThan(0);
    expect(momentAVerdict.verdict).not.toBe("strong");
    expect(momentBVerdict.verdict).toBe("insufficient_data");
    expect(momentCVerdict.verdict).toBe("underperforming");
    expect(
      oldReelDriverWeight({
        hook_retention_pct: 56,
        engagement_rate_pct: 4.1,
        drop_off_rate_pct: 28,
      }),
    ).toBeGreaterThan(0);
    expect(newWeekly.worstDiagnosis?.label).toBe("Underperforming");
    expect(newWeekly.worstDiagnosis?.detail).toMatch(/38/);
    // NEW correctly counts far fewer "strong" reels than OLD counted positive
    // signals overall — selectivity is the whole point of bucket-relative
    // comparison vs. a low universal floor.
    expect(newStrongReels.length).toBeGreaterThan(0);
    expect(newStrongReels.length).toBeLessThan(oldReelDrivers.length);
  }, 60000);
});
