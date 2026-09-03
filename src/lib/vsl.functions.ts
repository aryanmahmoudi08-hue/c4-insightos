import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  VIDEO_ACTION_STATUSES,
  buildVslMetricSnapshot,
  deriveVideoActionQueue,
  type VideoActionStatus,
  type VslCategory,
} from "@/lib/media-intelligence";

export type VslKind = "main" | "webinar" | "post_booking" | "testimonial";

const KIND_TO_CATEGORY: Record<VslKind, VslCategory> = {
  main: "Main VSL",
  webinar: "Webinar VSL",
  post_booking: "Post-booking Confirmation",
  testimonial: "Testimonial Videos",
};

async function getOrgId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return data.org_id as string;
}

export const listVsls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const { data, error } = await supabase
      .from("vsls")
      .select("*")
      .eq("org_id", org_id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const upsertVsl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string;
      kind: VslKind;
      name: string;
      wistia_video_id?: string;
      sheet_url?: string;
      script?: string;
      transcript_json?: Array<{ t: number; text: string }>;
      notes?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const row: any = {
      org_id,
      kind: data.kind,
      name: data.name,
      wistia_video_id: data.wistia_video_id ?? null,
      sheet_url: data.sheet_url ?? null,
      script: data.script ?? "",
      transcript_json: data.transcript_json ?? [],
      notes: data.notes ?? "",
    };
    if (data.id) row.id = data.id;
    const { data: saved, error } = await supabase.from("vsls").upsert(row).select().single();
    if (error) throw error;
    return saved;
  });

export const deleteVsl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).from("vsls").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vsl_id: string; limit?: number; from?: string; to?: string }) => input)
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("vsl_metric_snapshots")
      .select("*")
      .eq("vsl_id", data.vsl_id)
      .order("captured_at", { ascending: false })
      .limit(data.limit ?? 60);
    if (data.from) q = q.gte("captured_at", data.from);
    if (data.to) q = q.lte("captured_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const addSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      vsl_id: string;
      video_name?: string;
      total_plays?: number;
      unique_viewers?: number;
      play_rate?: number;
      avg_percent_watched?: number;
      page_loads?: number;
      engagement_json?: Array<{ sec: number; pct: number }>;
      source?: string;
      pct_25_reached?: number;
      pct_50_reached?: number;
      pct_75_reached?: number;
      pct_90_reached?: number;
      pct_100_reached?: number;
      cta_clicks?: number;
      cta_click_rate?: number;
      rewatches?: number;
      skips?: number;
      referrer?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      device?: string;
      embed_location?: string;
      new_vs_returning?: string;
      identified_viewer_id?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const { data: saved, error } = await (supabase as any)
      .from("vsl_metric_snapshots")
      .insert({
        vsl_id: data.vsl_id,
        org_id,
        video_name: data.video_name ?? null,
        total_plays: data.total_plays ?? 0,
        unique_viewers: data.unique_viewers ?? 0,
        play_rate: data.play_rate ?? 0,
        avg_percent_watched: data.avg_percent_watched ?? 0,
        page_loads: data.page_loads ?? 0,
        engagement_json: data.engagement_json ?? null,
        source: data.source ?? "manual",
        pct_25_reached: data.pct_25_reached ?? null,
        pct_50_reached: data.pct_50_reached ?? null,
        pct_75_reached: data.pct_75_reached ?? null,
        pct_90_reached: data.pct_90_reached ?? null,
        pct_100_reached: data.pct_100_reached ?? null,
        cta_clicks: data.cta_clicks ?? null,
        cta_click_rate: data.cta_click_rate ?? null,
        rewatches: data.rewatches ?? null,
        skips: data.skips ?? null,
        referrer: data.referrer ?? null,
        utm_source: data.utm_source ?? null,
        utm_medium: data.utm_medium ?? null,
        utm_campaign: data.utm_campaign ?? null,
        device: data.device ?? null,
        embed_location: data.embed_location ?? null,
        new_vs_returning: data.new_vs_returning ?? null,
        identified_viewer_id: data.identified_viewer_id ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return saved;
  });

// ------ CSV parse for the Wistia sheet paste ------
function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}
const num = (v: string) => {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[%,]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};

export const importCsvRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vsl_id: string; csv: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const lines = data.csv.split(/\r?\n/).filter((l) => l.trim().length);
    if (lines.length < 2) throw new Error("Need a header row + at least one data row");
    const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
    const idx = (keys: string[]) =>
      header.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
    const iName = idx(["video_name", "name", "title"]);
    const iPlays = idx(["plays", "total_plays"]);
    const iVis = idx(["unique_visitors", "unique_viewers", "viewers"]);
    const iRate = idx(["play_rate"]);
    const iAvg = idx(["avg_percent_watched", "average_watched", "avg_watched", "engagement"]);
    const iLoads = idx(["page_loads", "loads", "impressions"]);
    const iUpdated = idx(["last_updated", "updated", "date"]);
    const i25 = idx(["pct_25_reached", "25_reached", "milestone_25"]);
    const i50 = idx(["pct_50_reached", "50_reached", "milestone_50"]);
    const i75 = idx(["pct_75_reached", "75_reached", "milestone_75"]);
    const i90 = idx(["pct_90_reached", "90_reached", "milestone_90"]);
    const i100 = idx(["pct_100_reached", "100_reached", "milestone_100"]);
    const iCta = idx(["cta_clicks"]);
    const iCtaRate = idx(["cta_click_rate", "cta_rate"]);
    const iRewatch = idx(["rewatches"]);
    const iSkips = idx(["skips"]);
    const iReferrer = idx(["referrer"]);
    const iUtmSource = idx(["utm_source"]);
    const iUtmMedium = idx(["utm_medium"]);
    const iUtmCampaign = idx(["utm_campaign"]);
    const iDevice = idx(["device"]);
    const iEmbed = idx(["embed_location"]);
    const iNewReturning = idx(["new_vs_returning"]);
    const iIdentified = idx(["identified_viewer_id"]);

    const optionalNum = (rowCells: string[], colIndex: number) =>
      colIndex >= 0 && rowCells[colIndex] ? num(rowCells[colIndex]) : null;
    const optionalStr = (rowCells: string[], colIndex: number) =>
      colIndex >= 0 && rowCells[colIndex] ? rowCells[colIndex] : null;

    const rows: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = parseCSVLine(lines[i]);
      if (!c.length || !c.some((x) => x)) continue;
      const captured = iUpdated >= 0 && c[iUpdated] ? new Date(c[iUpdated]) : new Date();
      rows.push({
        vsl_id: data.vsl_id,
        org_id,
        video_name: iName >= 0 ? c[iName] : null,
        total_plays: iPlays >= 0 ? num(c[iPlays]) : 0,
        unique_viewers: iVis >= 0 ? num(c[iVis]) : 0,
        play_rate: iRate >= 0 ? num(c[iRate]) : 0,
        avg_percent_watched: iAvg >= 0 ? num(c[iAvg]) : 0,
        page_loads: iLoads >= 0 ? num(c[iLoads]) : 0,
        captured_at: isNaN(captured.getTime()) ? new Date().toISOString() : captured.toISOString(),
        source: "csv",
        pct_25_reached: optionalNum(c, i25),
        pct_50_reached: optionalNum(c, i50),
        pct_75_reached: optionalNum(c, i75),
        pct_90_reached: optionalNum(c, i90),
        pct_100_reached: optionalNum(c, i100),
        cta_clicks: optionalNum(c, iCta),
        cta_click_rate: optionalNum(c, iCtaRate),
        rewatches: optionalNum(c, iRewatch),
        skips: optionalNum(c, iSkips),
        referrer: optionalStr(c, iReferrer),
        utm_source: optionalStr(c, iUtmSource),
        utm_medium: optionalStr(c, iUtmMedium),
        utm_campaign: optionalStr(c, iUtmCampaign),
        device: optionalStr(c, iDevice),
        embed_location: optionalStr(c, iEmbed),
        new_vs_returning: optionalStr(c, iNewReturning),
        identified_viewer_id: optionalStr(c, iIdentified),
      });
    }
    if (!rows.length) throw new Error("No rows parsed");
    const { error } = await (supabase as any).from("vsl_metric_snapshots").insert(rows);
    if (error) throw error;
    return { inserted: rows.length };
  });

// ------ AI bottleneck / double-down analysis for a VSL ------
async function callGemini(sys: string, userMsg: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userMsg },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limit — try again in a moment");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in workspace billing");
    throw new Error(`AI Gateway [${res.status}]`);
  }
  const j = await res.json();
  try {
    return JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  } catch {
    throw new Error("AI returned invalid JSON");
  }
}

export const analyzeVsl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vsl_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: vsl } = await (supabase as any)
      .from("vsls")
      .select("*")
      .eq("id", data.vsl_id)
      .maybeSingle();
    if (!vsl) throw new Error("VSL not found");
    const { data: snaps } = await (supabase as any)
      .from("vsl_metric_snapshots")
      .select("*")
      .eq("vsl_id", data.vsl_id)
      .order("captured_at", { ascending: false })
      .limit(20);
    if (!snaps?.length) throw new Error("No metric snapshots yet — import Wistia data first");

    const latest = snaps[0];
    const first = snaps[snaps.length - 1];
    const trend = (k: string) => {
      const a = Number((first as any)[k] ?? 0),
        b = Number((latest as any)[k] ?? 0);
      if (!a) return b > 0 ? "+new" : "flat";
      const pct = ((b - a) / a) * 100;
      return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
    };
    const transcript = Array.isArray(vsl.transcript_json) ? vsl.transcript_json : [];
    const transcriptBlock = transcript.length
      ? transcript
          .map(
            (l: any) =>
              `[${Math.floor(l.t / 60)}:${String(Math.floor(l.t % 60)).padStart(2, "0")}] ${l.text}`,
          )
          .join("\n")
      : vsl.script || "(no script provided)";
    const engagement = Array.isArray(latest.engagement_json) ? latest.engagement_json : null;
    const engagementBlock = engagement
      ? engagement.map((e: any) => `${e.sec}s: ${e.pct}%`).join(", ")
      : "(no per-second retention available)";

    const milestoneBlock =
      [
        latest.pct_25_reached != null && `25%: ${latest.pct_25_reached}`,
        latest.pct_50_reached != null && `50%: ${latest.pct_50_reached}`,
        latest.pct_75_reached != null && `75%: ${latest.pct_75_reached}`,
        latest.pct_90_reached != null && `90%: ${latest.pct_90_reached}`,
        latest.pct_100_reached != null && `100%: ${latest.pct_100_reached}`,
      ]
        .filter(Boolean)
        .join(", ") || "(no milestone data in the imported sheet)";

    const sys = `You analyze a Video Sales Letter's performance. Every finding must cite the
specific metric or transcript line it is based on, and carry a confidence score reflecting how
much real evidence supports it (low confidence with sparse data, e.g. one snapshot or no
transcript; high confidence only with multiple snapshots and matching transcript evidence).
Return JSON:
{
  "headline": "1-sentence verdict",
  "bottlenecks": [{"title":"...", "body":"where in the video & why (quote transcript if useful)", "recommendation":"1 imperative sentence", "evidence":"the specific metric/transcript line this is based on", "confidence": 0.0-1.0}],
  "double_down": [{"title":"...", "body":"what's working", "recommendation":"...", "evidence":"...", "confidence": 0.0-1.0}],
  "drop_off_moments": [{"timestamp":"m:ss", "why":"...", "confidence": 0.0-1.0}],
  "largest_leak": {"stage":"e.g. 25%->50% watched", "why":"...", "recommendation":"1 imperative sentence", "confidence": 0.0-1.0} or null if data is too sparse to identify one
}
3-5 items per list. Be specific to this VSL, not generic. Never claim high confidence from a single snapshot.`;

    const userMsg = `VSL kind: ${vsl.kind}
Name: ${vsl.name}

Latest metrics (based on ${snaps.length} snapshot${snaps.length === 1 ? "" : "s"}):
- Plays: ${latest.total_plays} (${trend("total_plays")} vs first snapshot)
- Unique viewers: ${latest.unique_viewers} (${trend("unique_viewers")})
- Play rate: ${latest.play_rate}% (${trend("play_rate")})
- Avg % watched: ${latest.avg_percent_watched}% (${trend("avg_percent_watched")})
- Page loads: ${latest.page_loads} (${trend("page_loads")})
- Retention milestones reached: ${milestoneBlock}

Per-second retention: ${engagementBlock}

Transcript / script (with timestamps if available):
${transcriptBlock}

Produce the JSON.`;
    const result = await callGemini(sys, userMsg);
    // A minor version of the same cold-start problem as the content engine:
    // this can run with as few as 1 snapshot (a=0 above just reads "flat"/"+new"
    // rather than crashing, but a single-snapshot trend isn't a trend). Surface
    // the real sample size rather than let the AI's confident prose imply more
    // history than exists — the UI renders this as a footnote.
    return { ...(result as Record<string, unknown>), snapshotCount: snaps.length };
  });

// ------ VSL funnel: real joins only (no fabricated stage values) ------
export const getVslFunnelData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { vsl_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const db = supabase as any;
    const [{ data: latestSnap }, { data: leads }, { data: calls }] = await Promise.all([
      db
        .from("vsl_metric_snapshots")
        .select("*")
        .eq("vsl_id", data.vsl_id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from("leads").select("id").eq("org_id", org_id).eq("source_vsl_id", data.vsl_id),
      db
        .from("calls")
        .select("id, showed, closed, cash_collected_cents")
        .eq("org_id", org_id)
        .eq("source_vsl_id", data.vsl_id),
    ]);
    const callRows: Array<{
      showed: boolean | null;
      closed: boolean | null;
      cash_collected_cents: number | null;
    }> = calls ?? [];
    return {
      pageLoads: latestSnap?.page_loads ?? null,
      totalPlays: latestSnap?.total_plays ?? null,
      pct25Reached: latestSnap?.pct_25_reached ?? null,
      pct50Reached: latestSnap?.pct_50_reached ?? null,
      pct75Reached: latestSnap?.pct_75_reached ?? null,
      pct90Reached: latestSnap?.pct_90_reached ?? null,
      pct100Reached: latestSnap?.pct_100_reached ?? null,
      ctaClicks: latestSnap?.cta_clicks ?? null,
      applicationCount: (leads ?? []).length || null,
      showCount: callRows.filter((c) => c.showed).length || null,
      closeCount: callRows.filter((c) => c.closed).length || null,
      cashCents:
        callRows
          .filter((c) => c.closed)
          .reduce((sum, c) => sum + (c.cash_collected_cents ?? 0), 0) || null,
    };
  });

// ------ VSL Action Queue: real per-video actions from deriveVideoActionQueue ------
export const listVslActionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const db = supabase as any;
    const { data: vsls, error: vslError } = await db
      .from("vsls")
      .select("id, name, kind, wistia_video_id")
      .eq("org_id", org_id);
    if (vslError) throw vslError;
    if (!vsls?.length) return [];
    const vslIds = vsls.map((v: any) => v.id);
    const [{ data: snaps }, { data: leads }, { data: calls }, { data: recs }] = await Promise.all([
      db
        .from("vsl_metric_snapshots")
        .select("*")
        .in("vsl_id", vslIds)
        .order("captured_at", { ascending: false }),
      db.from("leads").select("id, source_vsl_id").eq("org_id", org_id).in("source_vsl_id", vslIds),
      db
        .from("calls")
        .select("id, source_vsl_id, showed, closed, cash_collected_cents")
        .eq("org_id", org_id)
        .in("source_vsl_id", vslIds),
      db.from("vsl_recommendations").select("*").eq("org_id", org_id).in("vsl_id", vslIds),
    ]);

    const latestByVsl = new Map<string, any>();
    for (const snap of snaps ?? []) {
      if (!latestByVsl.has(snap.vsl_id)) latestByVsl.set(snap.vsl_id, snap);
    }
    const leadCountByVsl = new Map<string, number>();
    for (const lead of leads ?? []) {
      if (!lead.source_vsl_id) continue;
      leadCountByVsl.set(lead.source_vsl_id, (leadCountByVsl.get(lead.source_vsl_id) ?? 0) + 1);
    }
    const callsByVsl = new Map<string, any[]>();
    for (const call of calls ?? []) {
      if (!call.source_vsl_id) continue;
      const arr = callsByVsl.get(call.source_vsl_id) ?? [];
      arr.push(call);
      callsByVsl.set(call.source_vsl_id, arr);
    }
    const recByKey = new Map<string, any>();
    for (const rec of recs ?? []) recByKey.set(`${rec.vsl_id}:${rec.action}`, rec);

    const out: Array<{
      vsl_id: string;
      vsl_name: string;
      action: string;
      reason: string;
      status: VideoActionStatus;
      recommendation_id: string | null;
    }> = [];
    for (const vsl of vsls) {
      const snap = latestByVsl.get(vsl.id);
      const callRows = callsByVsl.get(vsl.id) ?? [];
      const closedCalls = callRows.filter((c) => c.closed);
      const snapshot = buildVslMetricSnapshot({
        mediaId: vsl.id,
        category: KIND_TO_CATEGORY[vsl.kind as VslKind] ?? "Main VSL",
        wistiaConnected: Boolean(vsl.wistia_video_id),
        totalPlays: snap?.total_plays ?? null,
        uniqueViewers: snap?.unique_viewers ?? null,
        playRate: snap?.play_rate ?? null,
        pct100Reached: snap?.pct_100_reached ?? null,
        ctaClicks: snap?.cta_clicks ?? null,
        ctaClickRate: snap?.cta_click_rate ?? null,
        taggedLeads: leadCountByVsl.get(vsl.id) ?? null,
        taggedBookings: callRows.length || null,
        taggedCloses: closedCalls.length || null,
        taggedCashCents:
          closedCalls.reduce((sum, c) => sum + (c.cash_collected_cents ?? 0), 0) || null,
      });
      for (const item of deriveVideoActionQueue(snapshot)) {
        const rec = recByKey.get(`${vsl.id}:${item.action}`);
        out.push({
          vsl_id: vsl.id,
          vsl_name: vsl.name,
          action: item.action,
          reason: item.reason,
          status: (rec?.status as VideoActionStatus) ?? "queued",
          recommendation_id: rec?.id ?? null,
        });
      }
    }
    return out;
  });

// ------ VSL Action Queue recommendation status (queued/running/won/lost/dismissed) ------
export const listVslRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    const { data, error } = await (supabase as any)
      .from("vsl_recommendations")
      .select("*")
      .eq("org_id", org_id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertVslRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      vsl_id: string;
      action: string;
      reason: string;
      status?: VideoActionStatus;
      confidence?: number | null;
      evidence_json?: Record<string, unknown>;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org_id = await getOrgId(supabase, userId);
    if (data.status && !VIDEO_ACTION_STATUSES.includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }
    const { data: saved, error } = await (supabase as any)
      .from("vsl_recommendations")
      .upsert(
        {
          org_id,
          vsl_id: data.vsl_id,
          action: data.action,
          reason: data.reason,
          status: data.status ?? "queued",
          confidence: data.confidence ?? null,
          evidence_json: data.evidence_json ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: "vsl_id,action" },
      )
      .select()
      .single();
    if (error) throw error;
    return saved;
  });

export const setVslRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: VideoActionStatus }) => input)
  .handler(async ({ data, context }) => {
    if (!VIDEO_ACTION_STATUSES.includes(data.status)) {
      throw new Error(`Invalid status: ${data.status}`);
    }
    const { data: saved, error } = await (context.supabase as any)
      .from("vsl_recommendations")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return saved;
  });

// ------ Transcribe from audio file (base64) ------
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { vsl_id: string; filename: string; mime: string; base64: string }) => input,
  )
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bin], { type: data.mime });
    const form = new FormData();
    form.append("file", blob, data.filename);
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("response_format", "verbose_json");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription failed [${res.status}]`);
    const j = await res.json();
    const segs = Array.isArray(j.segments) ? j.segments : null;
    const transcript = segs
      ? segs.map((s: any) => ({ t: Number(s.start) || 0, text: String(s.text || "").trim() }))
      : [{ t: 0, text: String(j.text || "") }];
    const { error } = await (context.supabase as any)
      .from("vsls")
      .update({ transcript_json: transcript })
      .eq("id", data.vsl_id);
    if (error) throw error;
    return { lines: transcript.length };
  });
