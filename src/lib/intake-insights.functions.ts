import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface IntakeInsight {
  title: string;
  body: string;
  recommendation: string;
}

interface IntakeInsightsResult {
  bottlenecks: IntakeInsight[];
  double_down: IntakeInsight[];
  sampleSize?: number;
}

const BOTTLENECK_KEYS = ["objections_before", "join_sooner", "fear"] as const;
const DOUBLE_DOWN_KEYS = ["first_touchpoint", "pivotal_moment", "beliefs_shifted", "content_type_helped"] as const;

const QUESTION_TEXT: Record<string, string> = {
  objections_before: "What hesitations or doubts almost stopped you from joining?",
  join_sooner: "What could we have done to make you join 30 days sooner?",
  fear: "What's your biggest fear about this not working?",
  first_touchpoint: "What was the first piece of content / touchpoint that made you discover us?",
  pivotal_moment: "What was the moment you decided 'I have to work with them'?",
  beliefs_shifted: "What belief [income wise] shifted when you saw our content?",
  content_type_helped: "Which content type helped most?",
};

async function callGemini(sys: string, userMsg: string): Promise<IntakeInsightsResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: sys }, { role: "user", content: userMsg }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("Rate limit — try again in a moment");
    if (res.status === 402) throw new Error("AI credits exhausted — top up in workspace billing");
    throw new Error(`AI Gateway [${res.status}]: ${txt.slice(0, 160)}`);
  }
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: IntakeInsightsResult;
  try { parsed = JSON.parse(content); } catch { throw new Error("AI returned invalid JSON"); }
  return {
    bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks.slice(0, 8) : [],
    double_down: Array.isArray(parsed.double_down) ? parsed.double_down.slice(0, 8) : [],
  };
}

export const analyzeIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { responseId: string }) => input)
  .handler(async ({ data }): Promise<IntakeInsightsResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("onboarding_responses")
      .select("responses")
      .eq("id", data.responseId)
      .maybeSingle();
    if (error || !row) throw new Error("Intake not found");
    const answers = (row.responses ?? {}) as Record<string, string>;

    const fmt = (keys: readonly string[]) => keys.map(k => `Q: ${QUESTION_TEXT[k]}\nA: ${answers[k] || "(no answer)"}`).join("\n\n");

    const sys = `You analyze a single client onboarding intake for a high-ticket coaching business.
Two question groups:
1. Bottleneck questions — friction that almost stopped the sale.
2. Double-down questions — what made them buy / what converted.

For EACH group, produce 2-4 actionable insights. Quote a short phrase from the answer. End each with one specific tactical recommendation (content angle, sales script tweak, offer change, automation).

Respond ONLY with valid JSON:
{
  "bottlenecks": [{ "title": "string (max 70 chars)", "body": "string with quoted phrase + why it matters", "recommendation": "1 imperative sentence" }],
  "double_down": [{ "title": "...", "body": "...", "recommendation": "..." }]
}`;

    const userMsg = `=== Bottleneck answers ===
${fmt(BOTTLENECK_KEYS)}

=== Double-down answers ===
${fmt(DOUBLE_DOWN_KEYS)}

Produce the JSON now.`;
    return callGemini(sys, userMsg);
  });

export const analyzeIntakesAggregate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number; from?: string; to?: string }) => input ?? {})
  .handler(async ({ data, context }): Promise<IntakeInsightsResult> => {
    const { supabase, userId } = context;
    const { data: m } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!m) throw new Error("No workspace");

    let fromISO: string;
    let toISO: string;
    let windowLabel: string;
    if (data?.from && data?.to) {
      fromISO = `${data.from}T00:00:00`;
      toISO = `${data.to}T23:59:59`;
      windowLabel = `${data.from} → ${data.to}`;
    } else {
      const days = data?.days ?? 30;
      fromISO = new Date(Date.now() - days * 86400e3).toISOString();
      toISO = new Date().toISOString();
      windowLabel = `last ${days} days`;
    }

    const { data: rows, error } = await supabase
      .from("onboarding_responses")
      .select("responses, created_at")
      .eq("org_id", m.org_id)
      .gte("created_at", fromISO)
      .lte("created_at", toISO);
    if (error) throw error;
    if (!rows || rows.length === 0) {
      return { bottlenecks: [], double_down: [], sampleSize: 0 };
    }


    const collect = (key: string) => rows
      .map(r => ((r.responses ?? {}) as Record<string, string>)[key])
      .filter(Boolean)
      .map(s => `- ${s}`)
      .join("\n");

    const bottleneckBlock = BOTTLENECK_KEYS.map(k =>
      `--- ${QUESTION_TEXT[k]} ---\n${collect(k) || "(no answers)"}`
    ).join("\n\n");
    const doubleDownBlock = DOUBLE_DOWN_KEYS.map(k =>
      `--- ${QUESTION_TEXT[k]} ---\n${collect(k) || "(no answers)"}`
    ).join("\n\n");

    const sys = `You analyze the last ${days} days of client onboarding intakes for a high-ticket coaching business.
You will receive grouped answers across ALL clients in the window. Find PATTERNS — repeated objections, common touchpoints, recurring beliefs that shifted, content types that keep showing up.

Output two lists:
1. "bottlenecks" — the most common friction patterns we should fix (with frequency / quoted phrases that recur).
2. "double_down" — the most common winning patterns we should amplify.

Each item: title (max 70 chars), body (2-3 sentences with quoted phrases + how many clients said something similar), recommendation (1 imperative sentence — concrete content/script/offer/automation move).

3-6 items per list. Empty array if a list is genuinely empty.

Respond ONLY with valid JSON:
{
  "bottlenecks": [{ "title": "...", "body": "...", "recommendation": "..." }],
  "double_down": [{ "title": "...", "body": "...", "recommendation": "..." }]
}`;

    const userMsg = `Sample size: ${rows.length} intakes in the last ${days} days.

=== BOTTLENECK QUESTIONS ===
${bottleneckBlock}

=== DOUBLE-DOWN QUESTIONS ===
${doubleDownBlock}

Produce the JSON now.`;
    const result = await callGemini(sys, userMsg);
    return { ...result, sampleSize: rows.length };
  });
