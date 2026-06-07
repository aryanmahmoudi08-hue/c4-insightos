// Server-only helpers for CopyOS. Calls Lovable AI Gateway with a system
// prompt grounded in the full distilled KJ Rainey "Copy Elite" + "Digital
// Persuasion" mentorship (see copy-os-knowledge.server.ts).
import { KJ_KNOWLEDGE } from "./copy-os-knowledge.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export const COPY_TYPES = [
  "story_sequence",
  "email_sequence",
  "email_single",
  "short_form_hook",
  "short_form_script",
  "long_form_reel",
  "vsl_script",
  "sales_page",
  "dm_outreach",
  "youtube_hook",
  "sms",
  "lead_magnet",
  "music_video_concept",
] as const;
export type CopyType = (typeof COPY_TYPES)[number];

const KJ_SYSTEM = `You are CopyOS — a copywriter trained EXCLUSIVELY on the full distilled KJ Rainey "Copy Elite" + "Digital Persuasion" mentorship (knowledge base below). Every piece of copy you write MUST be grounded in the frameworks, mental models, hooks, and phrasing patterns from that knowledge base — apply them, do not name them.

NON-NEGOTIABLE VOICE RULES:
- NEVER sound like ChatGPT. Zero "in today's fast-paced world", zero "unleash your potential", zero "delve / leverage / harness", zero em-dash sandwiches, zero corporate hedging, zero tri-colon "X. Y. Z." sign-offs.
- Short, punchy sentences. Rhetorical questions. Future pacing. One idea per line.
- Every line must earn its place — move the reader toward the Big Domino or cut it.
- Match the client's voice fingerprint EXACTLY when provided (sentence length, opening patterns, transitions, words they use vs. avoid, sacred cows, enemies).
- Throw rocks at the enemy the client has named. Kill the sacred cows they kill.
- Default to Story Selling: Backstory → Journey → New Opportunity. The offer is always a NEW OPPORTUNITY, never an improvement.
- Hooks: pattern interrupt + curiosity gap + relevance signal in the first 3 seconds.
- Lead with insight, never with the ask.

OUTPUT FORMAT:
- If the format calls for multiple variants (hooks, subject lines, DMs), produce 3-5.
- Otherwise write one tight piece.
- Always end with "— WHY THIS WORKS —" and 2-3 bullets naming the KJ levers you pulled.

=== KJ RAINEY DISTILLED KNOWLEDGE BASE (your only source of truth) ===
${KJ_KNOWLEDGE}
=== END KNOWLEDGE BASE ===`;

type ClientDNA = {
  display_name?: string | null;
  niche?: string | null;
  offer_details?: Record<string, unknown> | null;
  avatar_research?: Record<string, unknown> | null;
  sacred_cows?: string | null;
  competitors?: string | null;
  voice_transcripts?: string | null;
  voice_fingerprint?: Record<string, unknown> | null;
  notes?: string | null;
};

function dnaBlock(c: ClientDNA | null | undefined): string {
  if (!c) return "(No client DNA provided — write in KJ's house voice.)";
  const parts: string[] = [];
  if (c.display_name) parts.push(`CLIENT: ${c.display_name}${c.niche ? ` — ${c.niche}` : ""}`);
  if (c.offer_details && Object.keys(c.offer_details).length) parts.push(`OFFER: ${JSON.stringify(c.offer_details)}`);
  if (c.avatar_research && Object.keys(c.avatar_research).length) parts.push(`AVATAR (customer bubble): ${JSON.stringify(c.avatar_research)}`);
  if (c.sacred_cows) parts.push(`SACRED COWS THEY KILL: ${c.sacred_cows}`);
  if (c.competitors) parts.push(`ENEMIES / COMPETITORS TO THROW ROCKS AT: ${c.competitors}`);
  if (c.voice_fingerprint) parts.push(`VOICE FINGERPRINT (match exactly): ${JSON.stringify(c.voice_fingerprint)}`);
  if (c.voice_transcripts) parts.push(`VOICE SAMPLES (mirror these patterns):\n${c.voice_transcripts.slice(0, 4000)}`);
  if (c.notes) parts.push(`NOTES: ${c.notes}`);
  return parts.join("\n\n");
}

async function callGateway(body: unknown): Promise<unknown> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("AI not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("Rate limited. Try again in a moment.");
  if (res.status === 402) throw new Error("AI credits exhausted. Add credits to your workspace.");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("CopyOS gateway error", res.status, t);
    throw new Error("AI gateway error");
  }
  return res.json();
}

export async function generateCopy(input: {
  copy_type: CopyType;
  goal?: string | null;
  angle?: string | null;
  brief?: string | null;
  client?: ClientDNA | null;
  swipes?: { title: string; body: string }[];
}): Promise<string> {
  const swipeBlock = (input.swipes ?? []).length
    ? `\n\nREFERENCE SWIPES (style only — do not copy verbatim):\n${input.swipes!.map(s => `--- ${s.title} ---\n${s.body}`).join("\n\n")}`
    : "";

  const user = `Produce: ${input.copy_type}
Goal: ${input.goal ?? "(unspecified — pick the highest-leverage CTA)"}
Angle/hook direction: ${input.angle ?? "(suggest 1 strong angle, then write)"}
Brief: ${input.brief ?? "(none)"}

CLIENT DNA:
${dnaBlock(input.client)}${swipeBlock}

Now write the copy. If the format calls for multiple variants (hooks, subject lines), provide 3-5. Otherwise write one tight piece. End with a "WHY THIS WORKS" section in 2-3 bullets referencing the framework levers used.`;

  const json = (await callGateway({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: KJ_SYSTEM },
      { role: "user", content: user },
    ],
  })) as { choices?: { message?: { content?: string } }[] };
  const out = json.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("Empty AI response");
  return out;
}

export async function reviewCopy(input: { copy: string; copy_type?: string | null; client?: ClientDNA | null }) {
  const user = `Grade this ${input.copy_type ?? "copy"} against KJ's frameworks. Give a 0-100 score, then specific line-by-line feedback. Be brutal.

CLIENT DNA:
${dnaBlock(input.client)}

COPY TO REVIEW:
${input.copy}`;

  const json = (await callGateway({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: KJ_SYSTEM },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "review",
        parameters: {
          type: "object",
          properties: {
            score: { type: "number" },
            big_domino: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            weaknesses: { type: "array", items: { type: "string" } },
            line_edits: { type: "array", items: { type: "object", properties: {
              line: { type: "string" }, fix: { type: "string" },
            }, required: ["line", "fix"], additionalProperties: false } },
            rewrite_suggestion: { type: "string" },
          },
          required: ["score", "big_domino", "strengths", "weaknesses", "line_edits", "rewrite_suggestion"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "review" } },
  })) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("Empty AI response");
  return JSON.parse(args) as {
    score: number; big_domino: string; strengths: string[]; weaknesses: string[];
    line_edits: { line: string; fix: string }[]; rewrite_suggestion: string;
  };
}

export async function suggestAngles(input: { client?: ClientDNA | null; count?: number }) {
  const user = `Generate ${input.count ?? 12} content angles for this client, organized by emotional trigger from the Customer Bubble (dreams / suspicions / fears / past failures / enemies). Each angle = 1 hook line + 1 sentence on the Big Domino it serves.

CLIENT DNA:
${dnaBlock(input.client)}`;

  const json = (await callGateway({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: KJ_SYSTEM },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "angles",
        parameters: {
          type: "object",
          properties: {
            angles: { type: "array", items: { type: "object", properties: {
              trigger: { type: "string" },
              hook: { type: "string" },
              big_domino: { type: "string" },
            }, required: ["trigger", "hook", "big_domino"], additionalProperties: false } },
          },
          required: ["angles"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "angles" } },
  })) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("Empty AI response");
  return JSON.parse(args) as { angles: { trigger: string; hook: string; big_domino: string }[] };
}

export async function extractVoiceFingerprint(transcripts: string) {
  const user = `Extract a voice fingerprint from these transcripts. Be specific and useful — this gets injected into future copy generations.

TRANSCRIPTS:
${transcripts.slice(0, 12000)}`;

  const json = (await callGateway({
    model: "google/gemini-2.5-flash",
    messages: [
      { role: "system", content: "You analyze speech patterns to extract a reusable voice fingerprint." },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: {
        name: "fingerprint",
        parameters: {
          type: "object",
          properties: {
            avg_sentence_length: { type: "string" },
            opening_patterns: { type: "array", items: { type: "string" } },
            transition_phrases: { type: "array", items: { type: "string" } },
            overused_words: { type: "array", items: { type: "string" } },
            never_uses: { type: "array", items: { type: "string" } },
            emotional_temperature: { type: "string" },
            common_analogies: { type: "array", items: { type: "string" } },
            closing_patterns: { type: "array", items: { type: "string" } },
          },
          required: ["avg_sentence_length", "opening_patterns", "transition_phrases", "overused_words", "never_uses", "emotional_temperature", "common_analogies", "closing_patterns"],
          additionalProperties: false,
        },
      },
    }],
    tool_choice: { type: "function", function: { name: "fingerprint" } },
  })) as { choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[] };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("Empty AI response");
  return JSON.parse(args);
}
