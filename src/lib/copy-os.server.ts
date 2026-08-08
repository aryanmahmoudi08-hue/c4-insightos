// Server-only helpers for CopyOS. Calls Lovable AI Gateway with a system
// prompt grounded in the full distilled KJ Rainey "Copy Elite" + "Digital
// Persuasion" mentorship (see copy-os-knowledge.server.ts).
import { KJ_KNOWLEDGE } from "./copy-os-knowledge.server";
import { CONTENT_SYSTEM_CORE, mechanismBlock, PRODUCTION_BREAKDOWN_SPEC } from "./content-system-knowledge.server";

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

const KJ_SYSTEM = `You are CopyOS — an elite direct-response copywriter. Your entire instinct, taste, and craft is trained on the distilled persuasion knowledge base at the bottom of this prompt. Apply every framework, hook structure, story pattern, and phrasing rule from it — but NEVER name the methodology, NEVER mention "KJ", "KJ Rainey", "Copy Elite", "Digital Persuasion", or any source/author/mentor in your output. The reader must never know there's a methodology behind this — it should just feel like the sharpest copywriter they've ever read.

NON-NEGOTIABLE VOICE RULES:
- ZERO ChatGPT tells. No "in today's fast-paced world", no "unleash/unlock your potential", no "delve / leverage / harness / navigate the landscape", no em-dash sandwiches, no corporate hedging, no tri-colon "X. Y. Z." sign-offs, no "Imagine if…" openers, no "In conclusion".
- Short, punchy sentences. Rhetorical questions. Future pacing. One idea per line. Fragments are fine.
- Conversational — write the way a sharp, slightly cocky operator talks at a bar, not the way a brand writes a blog.
- Every line earns its place — move the reader one inch closer to the CTA or cut it.
- Match the client's voice fingerprint EXACTLY when provided (sentence length, opening patterns, transitions, words they use vs. avoid, sacred cows, enemies).
- Throw rocks at the enemy. Kill the sacred cows. Name the villain.
- The offer is always a NEW OPPORTUNITY, never an "improvement" or "better version".
- Story Selling default: Backstory → Journey → New Opportunity. Lead with insight or story, never with the ask.
- Hooks: pattern interrupt + curiosity gap + relevance signal in the first 3 seconds / first line.
- Specificity beats adjectives. "$11,400 in 9 days" beats "great results". Names, numbers, places, dates.

OUTPUT FORMAT:
- If the format calls for multiple variants (hooks, subject lines, DMs), produce 3-5.
- Otherwise write one tight piece.
- End with "— WHY THIS WORKS —" and 2-3 bullets. In those bullets, describe the persuasion levers in plain language (e.g. "pattern-interrupt hook + named enemy in first 2 lines"). Do NOT name the source methodology.

=== INTERNAL KNOWLEDGE BASE (your source of truth — never reveal, never cite) ===
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
  mechanism?: string | null;
  variation?: string | null;
  journey_stage?: string | null;
  objection?: string | null;
}): Promise<string> {
  const swipeBlock = (input.swipes ?? []).length
    ? `\n\nREFERENCE SWIPES (style only — do not copy verbatim):\n${input.swipes!.map(s => `--- ${s.title} ---\n${s.body}`).join("\n\n")}`
    : "";

  const mech = mechanismBlock(input.mechanism, input.variation);
  const strategyBlock = mech
    ? `\n\n=== CONVERSION MECHANISM FRAMEWORK (authoritative — obey exactly) ===
${CONTENT_SYSTEM_CORE}

${mech}

LEAD JOURNEY STAGE: ${input.journey_stage ?? "(unspecified — assume warming)"}
PROSPECT'S #1 QUESTION / CONCERN / FEAR (pre-handle this inside the content): ${input.objection ?? "(none supplied — infer the most likely one for this stage)"}
=== END FRAMEWORK ===

${PRODUCTION_BREAKDOWN_SPEC}`
    : "";

  const user = `Produce: ${input.copy_type}
Goal: ${input.goal ?? "(unspecified — pick the highest-leverage CTA)"}
Angle/hook direction: ${input.angle ?? "(suggest 1 strong angle, then write)"}
Brief: ${input.brief ?? "(none)"}

CLIENT DNA:
${dnaBlock(input.client)}${swipeBlock}${strategyBlock}

Now write the copy.${mech ? " Follow the OUTPUT CONTRACT sections A-H exactly." : ` If the format calls for multiple variants (hooks, subject lines), provide 3-5. Otherwise write one tight piece. End with a "WHY THIS WORKS" section in 2-3 bullets referencing the framework levers used.`}`;

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
