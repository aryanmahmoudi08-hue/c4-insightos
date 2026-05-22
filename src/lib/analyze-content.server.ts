// Server-only helper: classify a transcript into hook / angle / funnel_stage
// via Lovable AI Gateway. Returns null on any failure so callers can fall back.

export type ContentClassification = {
  hook: string;
  angle: string;
  funnel_stage: string;
  rationale: string;
};

const ANGLES = ["authority","story","contrarian","tutorial","case_study","aspirational","fear","social_proof"] as const;
const STAGES = ["TOF","MOF","BOF"] as const;

export async function classifyTranscript(input: {
  transcript: string;
  hook?: string | null;
  title?: string | null;
}): Promise<ContentClassification | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey || !input.transcript?.trim()) return null;

  const sys = `You analyze short-form video content (Reels/Shorts/TikTok). Given the transcript, identify:
- hook: the literal first 3 seconds of spoken words (verbatim, short)
- angle: one of ${ANGLES.join(", ")}
- funnel_stage: one of TOF (awareness/broad), MOF (consideration/teaching), BOF (conversion/offer/CTA)
Return via the tool call.`;

  const userMsg = `Title: ${input.title ?? "(none)"}\nExisting hook field: ${input.hook ?? "(none)"}\n\nTranscript:\n${input.transcript}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify",
            description: "Return the classification of the video.",
            parameters: {
              type: "object",
              properties: {
                hook: { type: "string" },
                angle: { type: "string", enum: [...ANGLES] },
                funnel_stage: { type: "string", enum: [...STAGES] },
                rationale: { type: "string" },
              },
              required: ["hook","angle","funnel_stage","rationale"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify" } },
      }),
    });
    if (!res.ok) {
      console.error("classifyTranscript: gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args) as ContentClassification;
  } catch (e) {
    console.error("classifyTranscript: exception", e);
    return null;
  }
}
