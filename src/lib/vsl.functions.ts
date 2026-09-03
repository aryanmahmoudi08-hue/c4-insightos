import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VslKind = "main" | "webinar" | "post_booking" | "testimonial";

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

    const sys = `You analyze a Video Sales Letter's performance. Return JSON:
{
  "headline": "1-sentence verdict",
  "bottlenecks": [{"title":"...", "body":"where in the video & why (quote transcript if useful)", "recommendation":"1 imperative sentence"}],
  "double_down": [{"title":"...", "body":"what's working", "recommendation":"..."}],
  "drop_off_moments": [{"timestamp":"m:ss", "why":"..."}]
}
3-5 items per list. Be specific to this VSL, not generic.`;

    const userMsg = `VSL kind: ${vsl.kind}
Name: ${vsl.name}

Latest metrics:
- Plays: ${latest.total_plays} (${trend("total_plays")} vs first snapshot)
- Unique viewers: ${latest.unique_viewers} (${trend("unique_viewers")})
- Play rate: ${latest.play_rate}% (${trend("play_rate")})
- Avg % watched: ${latest.avg_percent_watched}% (${trend("avg_percent_watched")})
- Page loads: ${latest.page_loads} (${trend("page_loads")})

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
