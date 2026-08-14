import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestWorkspace, teardownTestWorkspace, daysAgo, type TestWorkspace } from "./helpers";
import { computeDemand, computeWeeklyContentCheck } from "../content-signals.server";
import { fetchBaseline } from "../content-performance.server";
import { percentiles } from "../content-performance";
import { fetchWorkspaceSettings, DEFAULT_WORKSPACE_SETTINGS } from "../workspace-settings.functions";

// These tests run the ACTUAL sb.from(...).select(...).eq(...) chains from
// computeDemand / computeWeeklyContentCheck / fetchBaseline / fetchWorkspaceSettings
// against a real, migrated, throwaway Supabase project (.env.test) — proving
// the query strings and RLS assumptions are correct, not just that hand-written
// fixtures satisfy the code. Run via `npm run test:integration`, never `npm test`.

const admin = adminClient();
let ws: TestWorkspace;
let otherWs: TestWorkspace;

beforeAll(async () => {
  ws = await createTestWorkspace(admin, "primary");
  otherWs = await createTestWorkspace(admin, "other");
}, 30000);

afterAll(async () => {
  if (ws) await teardownTestWorkspace(admin, ws);
  if (otherWs) await teardownTestWorkspace(admin, otherWs);
});

describe("RLS: the user-scoped test client is actually restricted, not silently bypassing it", () => {
  it("cannot read another workspace's content_pieces via an unfiltered select", async () => {
    const { error: seedErr } = await admin.from("content_pieces").insert({
      org_id: otherWs.orgId, platform: "reel", mechanism: "credibility", title: "other org piece",
    });
    expect(seedErr).toBeNull();

    const { data, error } = await ws.userClient.from("content_pieces").select("id, org_id");
    expect(error).toBeNull();
    expect((data ?? []).some((r) => r.org_id === otherWs.orgId)).toBe(false);
  });

  it("cannot read another workspace's organizations row", async () => {
    const { data } = await ws.userClient.from("organizations").select("id").eq("id", otherWs.orgId);
    expect(data ?? []).toEqual([]);
  });
});

describe("fetchWorkspaceSettings: real round-trip against organizations.settings", () => {
  it("returns documented defaults for a freshly-created workspace", async () => {
    const settings = await fetchWorkspaceSettings(ws.userClient, ws.orgId);
    expect(settings).toEqual(DEFAULT_WORKSPACE_SETTINGS);
  });

  it("reflects a real write to organizations.settings", async () => {
    const { error } = await admin.from("organizations").update({ settings: { content_engine: { minBucketSample: 3 } } }).eq("id", ws.orgId);
    expect(error).toBeNull();
    const settings = await fetchWorkspaceSettings(ws.userClient, ws.orgId);
    expect(settings.content_engine.minBucketSample).toBe(3);
    // Un-set fields still fall back to documented defaults, not undefined/crash.
    expect(settings.content_engine.baselineWindowSize).toBe(DEFAULT_WORKSPACE_SETTINGS.content_engine.baselineWindowSize);
    // Restore for the rest of the suite.
    await admin.from("organizations").update({ settings: {} }).eq("id", ws.orgId);
  });
});

describe("computeDemand: real driver + mix computation from seeded signals", () => {
  it("produces drivers matching seeded FAQ/setter/intake/reel signals, with a real (non-fallback) mix", async () => {
    const config = DEFAULT_WORKSPACE_SETTINGS.content_engine; // minBucketSample=6, minTotalSignalWeight=15

    // 1) FAQ clicks -> credibility, weight = clicks*2
    await admin.from("faq_videos").insert({ org_id: ws.orgId, title: "Is this a scam?", mechanism: "credibility", clicks: 8, plays: 2, active: true });

    // 2) Mechanism-tagged setter call -> authoritative, weight 3
    await admin.from("setter_call_signals").insert({ org_id: ws.orgId, setter_name: "Jordan", call_date: new Date().toISOString().slice(0, 10), mechanism: "authoritative" });

    // 3) Onboarding intake with stored mechanism_signals -> relatability, weight 5
    await admin.from("onboarding_responses").insert({ org_id: ws.orgId, responses: { decision_moment: "saw a founder story" }, mechanism_signals: { relatability: 5 } });

    // 4) A 6-reel educational/reel bucket (clears minBucketSample=6) where one
    // reel's retention (90) is far above the bucket's own p75 -> "strong" -> +2.
    const retentions = [40, 45, 50, 55, 60, 90];
    for (let i = 0; i < retentions.length; i++) {
      const { data: piece, error: pieceErr } = await admin.from("content_pieces")
        .insert({ org_id: ws.orgId, platform: "reel", mechanism: "educational", title: `reel ${i}`, posted_at: daysAgo(10 - i) })
        .select("id").single();
      expect(pieceErr).toBeNull();
      const { error: metricErr } = await admin.from("content_metrics").insert({
        org_id: ws.orgId, content_id: piece!.id, views: 500, hook_retention_pct: retentions[i], engagement_rate_pct: 1, drop_off_rate_pct: 20,
      });
      expect(metricErr).toBeNull();
    }

    const result = await computeDemand(ws.userClient, ws.orgId, 30, config);

    expect(result.counts.faq).toBe(1);
    expect(result.counts.setter_calls).toBe(1);
    expect(result.counts.intakes).toBe(1);
    expect(result.counts.reels).toBe(6);

    const faqDriver = result.drivers.find((d) => d.source === "FAQ clicks");
    expect(faqDriver?.mechanism).toBe("credibility");
    expect(faqDriver?.weight).toBe(20); // (clicks + plays) * 2 = (8+2)*2

    const setterDriver = result.drivers.find((d) => d.source === "Setting call");
    expect(setterDriver?.mechanism).toBe("authoritative");
    expect(setterDriver?.weight).toBe(3);

    const intakeDriver = result.drivers.find((d) => d.source === "Client intake");
    expect(intakeDriver?.mechanism).toBe("relatability");
    expect(intakeDriver?.weight).toBe(5);

    // retentions=[40,45,50,55,60,90], n=6 -> p75 interpolates between the 4th
    // and 5th sorted values (55, 60) at 75% -> 58.75, which the 5th value
    // (60) itself always clears for 6 strictly-ascending points at this
    // percentile method (R-7) — so BOTH 60 and 90 classify "strong", not
    // just the obvious top one. Real end-to-end confirmation of the same
    // inclusive->=p75 boundary the pure unit suite already covers.
    const reelDrivers = result.drivers.filter((d) => d.source === "Reel performance");
    expect(reelDrivers).toHaveLength(2);
    expect(reelDrivers.every((d) => d.mechanism === "educational")).toBe(true);
    expect(reelDrivers.every((d) => /strong vs\. its own baseline \(n=6\)/.test(d.detail))).toBe(true);
    const reelWeight = reelDrivers.reduce((s, d) => s + d.weight, 0);
    expect(reelWeight).toBe(4); // 2 strong reels * weight 2 each (held-attention, not converted)

    // Total weight 20(faq)+3(setter)+5(intake)+4(reel)=32 >= minTotalSignalWeight(15) -> a real mix, not the flagged fallback.
    expect(result.totalWeight).toBe(32);
    expect(result.insufficientData).toBe(false);
    const mixSum = Object.values(result.mix).reduce((s, v) => s + v, 0);
    expect(mixSum).toBe(100);
  }, 30000);
});

describe("computeWeeklyContentCheck: cold-start honesty on a sparse bucket", () => {
  it("returns 'Not enough data' — never a confident wrong verdict — below minBucketSample", async () => {
    // Isolated workspace: exactly 1 reel this week, nothing else.
    const sparse = await createTestWorkspace(admin, "sparse");
    try {
      const { data: piece } = await admin.from("content_pieces")
        .insert({ org_id: sparse.orgId, platform: "story_sequence", mechanism: "authoritative", title: "lone piece", posted_at: daysAgo(1) })
        .select("id").single();
      await admin.from("content_metrics").insert({ org_id: sparse.orgId, content_id: piece!.id, views: 100, hook_retention_pct: 30, engagement_rate_pct: 1, drop_off_rate_pct: 50 });

      const result = await computeWeeklyContentCheck(sparse.userClient, sparse.orgId, DEFAULT_WORKSPACE_SETTINGS.content_engine);
      expect(result.worst).toBe("authoritative");
      expect(result.worstDiagnosis?.label).toBe("Not enough data");
      expect(result.worstDiagnosis?.detail).toMatch(/1 posted, need at least 6/);
    } finally {
      await teardownTestWorkspace(admin, sparse);
    }
  }, 30000);
});

describe("computeWeeklyContentCheck: populated bucket — a real 'underperforming' verdict, not just cold-start", () => {
  it("states the metric, its value, the percentile compared against, and the bucket sample size", async () => {
    const populated = await createTestWorkspace(admin, "populated");
    try {
      // 5 strong OLDER reels (outside the 7-day weekly window, but inside the
      // baseline window) + 1 weak NEW reel (posted this week) in the same
      // (educational, reel) bucket -> baseline n=6 clears minBucketSample.
      const older = [
        { retention: 70, engagement: 5 },
        { retention: 75, engagement: 6 },
        { retention: 80, engagement: 7 },
        { retention: 85, engagement: 8 },
        { retention: 90, engagement: 9 },
      ];
      for (let i = 0; i < older.length; i++) {
        const { data: piece } = await admin.from("content_pieces")
          .insert({ org_id: populated.orgId, platform: "reel", mechanism: "educational", title: `old reel ${i}`, posted_at: daysAgo(20 + i), created_at: daysAgo(20 + i) })
          .select("id").single();
        await admin.from("content_metrics").insert({
          org_id: populated.orgId, content_id: piece!.id, views: 500 + i * 10,
          hook_retention_pct: older[i].retention, engagement_rate_pct: older[i].engagement, drop_off_rate_pct: 30,
        });
      }
      const { data: weakPiece } = await admin.from("content_pieces")
        .insert({ org_id: populated.orgId, platform: "reel", mechanism: "educational", title: "this week's weak reel", posted_at: daysAgo(2), created_at: daysAgo(2) })
        .select("id").single();
      await admin.from("content_metrics").insert({
        org_id: populated.orgId, content_id: weakPiece!.id, views: 300, hook_retention_pct: 38, engagement_rate_pct: 1, drop_off_rate_pct: 30,
      });

      // Cross-check the expected baseline math against the same pure percentiles()
      // function the unit suite already covers, so this test doesn't hand-assert
      // a number that isn't actually derived from the shared logic.
      const expectedRetentionP25 = percentiles([38, 70, 75, 80, 85, 90]).p25;
      expect(Math.round(expectedRetentionP25)).toBe(71);

      const result = await computeWeeklyContentCheck(populated.userClient, populated.orgId, DEFAULT_WORKSPACE_SETTINGS.content_engine);

      expect(result.worst).toBe("educational");
      expect(result.worstDiagnosis?.label).toBe("Underperforming");
      expect(result.worstDiagnosis?.verdictsSampled).toBe(1);

      const detail = result.worstDiagnosis?.detail ?? "";
      // The four things the prose must carry: metric, value, percentile
      // compared against, and the bucket's sample size.
      expect(detail).toMatch(/retention/i);
      expect(detail).toMatch(/38/);
      expect(detail).toMatch(/71/);
      expect(detail).toMatch(/bottom-quartile/i);
      expect(detail).toMatch(/last 6 posted/);

      // Directly confirm fetchBaseline's own real-DB percentile math agrees.
      const baseline = await fetchBaseline(populated.userClient, populated.orgId, { mechanism: "educational", platform: "reel" }, DEFAULT_WORKSPACE_SETTINGS.content_engine.baselineWindowSize);
      expect(baseline.sampleSize).toBe(6);
      expect(Math.round(baseline.retention.p25)).toBe(71);
    } finally {
      await teardownTestWorkspace(admin, populated);
    }
  }, 30000);
});
