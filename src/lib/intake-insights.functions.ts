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
}

export const analyzeIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { responseId: string }) => input)
  .handler(async ({ data }): Promise<IntakeInsightsResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("onboarding_responses")
      .select("responses")
      .eq("id", data.responseId)
      .maybeSingle();
    if (error || !row) throw new Error("Intake not found");
    const answers = (row.responses ?? {}) as Record<string, string>;

    const BOTTLENECK_KEYS = ["objections_before", "join_sooner", "fear", "tried_before", "biggest_bottleneck", "current_pain"];
    const DOUBLE_DOWN_KEYS = ["first_touchpoint", "pivotal_moment", "beliefs_shifted", "content_type_helped", "why_us", "wins_so_far", "desired_identity"];

    const fmt = (keys: string[]) => keys.map(k => `Q (${k}): ${answers[k] || "(no answer)"}`).join("\n");

    const sys = `You analyze client onboarding intakes for a high-ticket coaching business.
You receive answers to TWO groups of questions:

1. Bottleneck questions — what almost stopped this client from buying, their fears, what they've tried that failed, what would have made them buy sooner. These reveal friction in the sales process and offer.
2. Double-down questions — what made them discover the brand, the moment they decided to buy, beliefs that shifted, which content converted them. These reveal what's working that should be amplified.

For EACH group, produce 3-5 actionable insights. Each must reference the actual answer (quote a short phrase) and give one specific tactical recommendation (content angle, sales script tweak, offer change, automation, etc.).

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
      bottlenecks: Array.isArray(parsed.bottlenecks) ? parsed.bottlenecks.slice(0, 6) : [],
      double_down: Array.isArray(parsed.double_down) ? parsed.double_down.slice(0, 6) : [],
    };
  });
