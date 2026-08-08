// Client-safe definitions of the 4 Conversion Mechanisms framework.
// Used by the CopyOS Generate UI and mirrored on the server for prompt injection.

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

export const JOURNEY_STAGES = [
  { value: "new_lead", label: "New lead", hint: "Softest CTA — comment / save / follow." },
  { value: "warming", label: "Warming", hint: "Value + credibility. CTA: comment keyword, watch the long-form." },
  { value: "considering", label: "Considering", hint: "Case-study + objection handling. CTA: DM keyword." },
  { value: "ready_to_buy", label: "Ready to buy", hint: "Hard CTA — DM / apply / book." },
] as const;

export const MECHANISM_KEYS = Object.keys(MECHANISMS) as MechanismKey[];

export function variationLabel(mech: string | null | undefined, variation: string | null | undefined) {
  if (!mech || !variation) return null;
  const m = MECHANISMS[mech as MechanismKey];
  return m?.variations.find(v => v.value === variation)?.label ?? variation;
}
