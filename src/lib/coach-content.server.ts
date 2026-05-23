// Server-only helper: produce an in-depth coaching review of a video
// using its transcript + metrics via Lovable AI Gateway.

export type ContentCoaching = {
  summary: string;
  strengths: string[];
  improvements: string[];
  next_hook_ideas: string[];
};

export async function coachContent(input: {
  title?: string | null;
  hook?: string | null;
  transcript?: string | null;
  angle?: string | null;
  funnel_stage?: string | null;
  platform?: string | null;
  views?: number | null;
  leads?: number | null;
  closes?: number | null;
  cash_cents?: number | null;
  retention_pct?: number | null;
}): Promise<ContentCoaching | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;

  const sys = `You are a short-form video coach for a coaching/info business. Given a video transcript and its performance, produce:
- summary: 2-3 sentence diagnosis (what worked, what didn't)
- strengths: 2-4 bullets, concrete
- improvements: 3-5 bullets, prescriptive ("Cut the 7-second intro and open on the result")
- next_hook_ideas: 3 alternate first-3-second hooks the creator could use to repost this idea
Be blunt, specific, no fluff. Reference numbers when relevant.`;

  const user = `Title: ${input.title ?? "(none)"}
Platform: ${input.platform ?? "(none)"}
Hook (first 3s): ${input.hook ?? "(none)"}
Angle: ${input.angle ?? "(none)"}
Funnel: ${input.funnel_stage ?? "(none)"}

Metrics:
- Views: ${input.views ?? 0}
- Leads: ${input.leads ?? 0}
- Closes: ${input.closes ?? 0}
- Cash collected: $${Math.round((input.cash_cents ?? 0) / 100)}
- Hook retention: ${input.retention_pct ?? 0}%

Transcript:
${input.transcript ?? "(no transcript provided)"}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        tools: [{
          type: "function",
          function: {
            name: "coach",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                strengths: { type: "array", items: { type: "string" } },
                improvements: { type: "array", items: { type: "string" } },
                next_hook_ideas: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "strengths", "improvements", "next_hook_ideas"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "coach" } },
      }),
    });
    if (!res.ok) {
      console.error("coachContent: gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args) as ContentCoaching;
  } catch (e) {
    console.error("coachContent: exception", e);
    return null;
  }
}
