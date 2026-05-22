import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  transcript: z.string().min(1).max(20000),
  hook: z.string().max(2000).optional().nullable(),
  title: z.string().max(500).optional().nullable(),
});

export const analyzeContent = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const sys = `You analyze short-form video content (Reels/Shorts/TikTok). Given the transcript, identify:
- hook: the literal first 3 seconds of spoken words (verbatim, short)
- angle: one of authority, story, contrarian, tutorial, case_study, aspirational, fear, social_proof
- funnel_stage: one of TOF (awareness/broad), MOF (consideration/teaching), BOF (conversion/offer/CTA)
Return via the tool call.`;

    const userMsg = `Title: ${data.title ?? "(none)"}\nExisting hook field: ${data.hook ?? "(none)"}\n\nTranscript:\n${data.transcript}`;

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
                hook: { type: "string", description: "Verbatim first ~3 seconds." },
                angle: { type: "string", enum: ["authority","story","contrarian","tutorial","case_study","aspirational","fear","social_proof"] },
                funnel_stage: { type: "string", enum: ["TOF","MOF","BOF"] },
                rationale: { type: "string", description: "1-sentence why for the funnel + angle." },
              },
              required: ["hook","angle","funnel_stage","rationale"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "classify" } },
      }),
    });

    if (res.status === 429) throw new Error("Rate limit — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    if (!res.ok) throw new Error(`AI error: ${res.status}`);

    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No classification returned");
    return JSON.parse(args) as { hook: string; angle: string; funnel_stage: string; rationale: string };
  });
