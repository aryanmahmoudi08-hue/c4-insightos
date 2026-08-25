// Client-safe definitions of the 4 Conversion Mechanisms framework.
// Used by the CopyOS Generate UI, the Content Signals engine, and mirrored on
// the server for prompt injection.

export type MechanismKey = "educational" | "credibility" | "authoritative" | "relatability";

export type VariationDef = { value: string; label: string; hint: string };

export const MECHANISMS: Record<MechanismKey, {
  label: string;
  purpose: string;
  variations: VariationDef[];
}> = {
  educational: {
    label: "Educational",
    purpose: "Increase Expertise + Value. The biggest pull in your field.",
    variations: [
      { value: "value", label: "Value", hint: "Tracking system reveal · \"Copy this exact system\" · \"The exact system of X that let Y do Z.\"" },
      { value: "problem_solution", label: "Problem-Solution", hint: "ONE niche problem → 1-3 sharp solutions. Never 30 solutions." },
    ],
  },
  credibility: {
    label: "Credibility",
    purpose: "Differentiate + build trust/FOMO so leads believe you.",
    variations: [
      { value: "testimonial", label: "Testimonial", hint: "Proof you CAN help — client's situation in depth, every point labelled as a problem we solve." },
      { value: "case_study", label: "Case-Study", hint: "Proof of HOW you help — step-by-step so the viewer thinks \"I could do this too.\"" },
    ],
  },
  authoritative: {
    label: "Authoritative",
    purpose: "Raise Perceived Value + Market Differentiation. Premium positioning.",
    variations: [
      { value: "attention_lifestyle", label: "Attention-Driven (Lifestyle)", hint: "Premium look that raises status — always tied back to the skill/mechanism." },
      { value: "industry_leader", label: "Industry Leader", hint: "\"POV: meeting your X in Y after doing Z\" · \"Building an X from scratch.\"" },
    ],
  },
  relatability: {
    label: "Relatability",
    purpose: "Personality + Market Differentiation. The strongest driver of loyalty + sales.",
    variations: [
      { value: "storytelling", label: "Storytelling", hint: "\"How I went from X to Z\" — pull them into your life so they visualise their own." },
      { value: "personality", label: "Personality", hint: "How hard you work, the life you wanted, going back to your hometown — align with ICP values." },
    ],
  },
};

export const MECHANISM_KEYS = Object.keys(MECHANISMS) as MechanismKey[];

export function variationLabel(mech: string | null | undefined, variation: string | null | undefined) {
  if (!mech || !variation) return null;
  const m = MECHANISMS[mech as MechanismKey];
  return m?.variations.find(v => v.value === variation)?.label ?? variation;
}

/* ------------------------------------------------------------------ *
 * Per-variation tailored question packs.
 * Each of the 8 variations asks only what THAT format needs, so the
 * generated script is specific instead of generically prompted.
 * ------------------------------------------------------------------ */

export type VariationQuestion = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
};

export const VARIATION_QUESTIONS: Record<string, VariationQuestion[]> = {
  // Educational
  value: [
    { key: "system_name", label: "What's the system / framework being revealed?", type: "text", placeholder: "e.g. The 3-touch DM tracking sheet" },
    { key: "who_got_result", label: "Who used it and what exact result did they get?", type: "text", placeholder: "e.g. Jayden — 4 calls booked in 6 days" },
    { key: "steps", label: "The 1-3 steps of the system (in order)", type: "textarea", placeholder: "1. …\n2. …\n3. …" },
    { key: "giveaway_depth", label: "How much do we give away?", type: "select", options: ["Full system (max trust)", "Steps but not the exact scripts", "Overview only (tease the how)"] },
  ],
  problem_solution: [
    { key: "one_problem", label: "The ONE niche problem (nothing broader)", type: "text", placeholder: "e.g. Leads reply then ghost after the price" },
    { key: "why_it_happens", label: "Why it actually happens (the real cause)", type: "textarea" },
    { key: "solutions", label: "1-3 sharp solutions — no more", type: "textarea", placeholder: "1. …\n2. …" },
    { key: "cost_of_inaction", label: "What it costs them to keep doing it wrong", type: "text" },
  ],
  // Credibility
  testimonial: [
    { key: "client_name", label: "Client name / handle", type: "text" },
    { key: "before_state", label: "Their BEFORE in detail (numbers, feelings, situation)", type: "textarea" },
    { key: "after_state", label: "Their AFTER (hard numbers + timeframe)", type: "textarea" },
    { key: "problems_solved", label: "Every problem we solved (each becomes a labelled beat)", type: "textarea", placeholder: "no offer clarity, no tracking, low show rate…" },
    { key: "proof_asset", label: "Proof asset we can show on screen", type: "select", options: ["Screen recording of their dashboard", "Payment / Stripe screenshot", "Voice note or clip of the client", "DM screenshots", "None — spoken only"] },
  ],
  case_study: [
    { key: "outcome", label: "The headline outcome", type: "text", placeholder: "e.g. $18k month from 5 reels/week" },
    { key: "starting_point", label: "Starting point (so it feels replicable)", type: "textarea" },
    { key: "steps_taken", label: "Step-by-step of exactly what we did", type: "textarea", placeholder: "Step 1 … Step 2 … Step 3 …" },
    { key: "timeframe", label: "Timeframe", type: "text", placeholder: "e.g. 47 days" },
    { key: "replicability", label: "How replicable should it feel?", type: "select", options: ["\"You could do this today\"", "\"You could do this with help\"", "\"This is why you need the system\""] },
  ],
  // Authoritative
  attention_lifestyle: [
    { key: "visual_hook", label: "The premium visual that stops the scroll", type: "text", placeholder: "e.g. Balcony setup in Dubai, laptop open on the tracker" },
    { key: "status_signal", label: "What status signal are we showing?", type: "select", options: ["Location / travel", "Environment / office", "Time freedom", "Money / receipts", "Physique / discipline"] },
    { key: "tie_back", label: "How does it tie back to the skill / mechanism? (non-negotiable)", type: "textarea", placeholder: "This exists because of X system, not luck" },
    { key: "voiceover", label: "Voiceover or on-screen text only?", type: "select", options: ["Voiceover", "On-screen text only", "Both"] },
  ],
  industry_leader: [
    { key: "pov_line", label: "The POV / positioning line", type: "text", placeholder: "POV: meeting your mentor after 12 months of daily reels" },
    { key: "authority_proof", label: "What proves you lead the space?", type: "textarea", placeholder: "clients, volume, results, rooms you're in" },
    { key: "industry_take", label: "The take the industry is getting wrong", type: "textarea" },
    { key: "tone", label: "Tone", type: "select", options: ["Calm authority", "Contrarian / blunt", "Mentor teaching down", "Behind-the-scenes builder"] },
  ],
  // Relatability
  storytelling: [
    { key: "from_to", label: "From X → to Z (the arc)", type: "text", placeholder: "e.g. Broke in a basement → $40k/mo at 19" },
    { key: "lowest_moment", label: "The lowest moment — be specific and human", type: "textarea" },
    { key: "turning_point", label: "The turning point / decision", type: "textarea" },
    { key: "lesson", label: "The lesson the viewer should steal", type: "text" },
    { key: "arc_length", label: "Arc length", type: "select", options: ["Single reel (30-45s)", "Long-form (90s+)", "Multi-part sequence"] },
  ],
  personality: [
    { key: "trait", label: "Which trait are we showing?", type: "select", options: ["Work ethic / obsession", "Loyalty to where you're from", "Discipline / routine", "Humour / unfiltered takes", "Family / why you started"] },
    { key: "scene", label: "The real scene / moment we're filming", type: "textarea", placeholder: "e.g. 4:50am gym before calls, hometown drive" },
    { key: "icp_value", label: "Which ICP value does this align with?", type: "text", placeholder: "e.g. they want to prove people wrong" },
    { key: "vulnerability", label: "How raw do we go?", type: "select", options: ["Very raw / unfiltered", "Honest but composed", "Light and funny"] },
  ],
};

export function questionsFor(variation: string | null | undefined): VariationQuestion[] {
  if (!variation) return [];
  return VARIATION_QUESTIONS[variation] ?? [];
}

/* ------------------------------------------------------------------ *
 * Signal → mechanism mapping.
 * Turns onboarding answers, FAQ questions, and setter-call language into
 * "which of the 4 content types do we need more of".
 * ------------------------------------------------------------------ */

const KEYWORDS: Record<MechanismKey, RegExp> = {
  credibility: /(scam|trust|real|legit|fake|proof|believe|guru|burn|ripped off|refund|guarantee|testimonial|results? (are|were)? ?real|does it (actually )?work|risk)/i,
  educational: /(how|didn'?t know|confus|unclear|understand|learn|system|process|strategy|steps|taught|explain|knowledge|value|tactic)/i,
  authoritative: /(best|top|authority|leader|premium|expensive|price|worth it|cheaper|competitor|why you|status|level|serious)/i,
  relatability: /(relat|like me|my situation|same as|story|felt|struggl|alone|young|age|from where|background|understand me|personality|vibe)/i,
};

export type MechanismWeights = Record<MechanismKey, number>;

export function emptyWeights(): MechanismWeights {
  return { educational: 0, credibility: 0, authoritative: 0, relatability: 0 };
}

/** Score free text against the 4 mechanisms. Returns raw hit counts. */
export function scoreText(text: string | null | undefined, weight = 1): MechanismWeights {
  const out = emptyWeights();
  if (!text?.trim()) return out;
  for (const k of MECHANISM_KEYS) {
    const matches = text.match(new RegExp(KEYWORDS[k].source, "gi"));
    if (matches) out[k] += matches.length * weight;
  }
  return out;
}

/** The single highest-scoring mechanism, or null when nothing matched — never guesses a mechanism from zero signal. */
export function pickTop(w: MechanismWeights): MechanismKey | null {
  let best: MechanismKey | null = null;
  for (const k of MECHANISM_KEYS) if (w[k] > 0 && (!best || w[k] > w[best])) best = k;
  return best;
}

/**
 * Defends against a partial input (missing keys, not just zero-valued ones):
 * `a[k] + b[k]` with an absent key is `n + undefined = NaN`, which then
 * poisons every future accumulation into that mechanism for the rest of the
 * caller's run — found via the step-8 integration tests seeding a
 * mechanism_signals value with only one key set, exactly the shape a
 * "legacy row" (computeDemand's own fallback comment) could realistically
 * have even though the current Onboarding UI always writes all 4 keys.
 */
export function addWeights(a: MechanismWeights, b: MechanismWeights): MechanismWeights {
  const out = emptyWeights();
  for (const k of MECHANISM_KEYS) out[k] = (a[k] ?? 0) + (b[k] ?? 0);
  return out;
}

/** Weekly reel target split across the 4 categories from the mix. */
export function reelSplit(mix: Record<MechanismKey, number>, totalReels: number) {
  return MECHANISM_KEYS.map(k => ({ mechanism: k, reels: Math.max(1, Math.round((mix[k] / 100) * totalReels)) }));
}

/** The onboarding questions that feed the content engine. */
export const ONBOARDING_CONTENT_QUESTIONS = [
  { key: "first_touch", label: "What was your first touchpoint?" },
  { key: "decision_moment", label: "What made you decide to join?" },
  { key: "join_earlier", label: "What would have made you join EARLIER?" },
] as const;
