// Server-only: the proprietary 4 Conversion Mechanisms framework, injected as
// authoritative context on every Content generation.

export const CONTENT_SYSTEM_CORE = `CORE PHILOSOPHY — THE LEAD JOURNEY:
Every piece of content moves a prospect along their Lead Journey: Lead enters → ... → Lead paid.
At every stage the prospect has QUESTIONS, CONCERNS and FEARS. The entire goal of content is to make
them understand WE are the expert in our SPECIFIC industry, that we can solve their SPECIFIC problems,
and to deliver that value upfront so it subconsciously converts them. If you don't know the prospect's
Lead Journey, that's the #1 reason content doesn't convert. Write to the stated stage and pre-handle the
stated question/concern/fear INSIDE the content — never as a bolted-on disclaimer.

DISTRIBUTION LAYER (drives CTA logic):
- Reels: the CTA lives in the copy or the caption, driving to DM (keyword → DM flow).
- Macro-goal: push IG audiences → YouTube (long-form) via Story Sequences + Reels.
- Match CTA to Lead Journey stage: earlier stage = softer CTA (comment / save), later = DM / apply.`;

const MECH: Record<string, { header: string; variations: Record<string, string> }> = {
  educational: {
    header: `MECHANISM — EDUCATIONAL (Expertise + Value; this must be the biggest pull in the field).`,
    variations: {
      value: `VARIATION — VALUE: formats like a Tracking System reveal, "Copy this exact [system/process]", "The exact system of X that allowed Y to do Z". RULE: Value content dictates exactly how you are truly seen within your specific market — make it demonstrably expert. Give a real, usable asset on screen.`,
      problem_solution: `VARIATION — PROBLEM-SOLUTION: pick ONE problem your niche has (that few people have or address) and show only 1-3 solutions. HARD RULE: NEVER take one problem and give 30 solutions. ONE niche problem → 1-3 sharp solutions, each fully explained.`,
    },
  },
  credibility: {
    header: `MECHANISM — CREDIBILITY (differentiation + trust + FOMO).`,
    variations: {
      testimonial: `VARIATION — TESTIMONIAL ("proof you CAN help"): the client describes their current situation in depth, made relevant to OUR ICP; every point they raise gets explicitly labelled as an EXACT problem we solve. Needs a strong hook + caption, but the COPY matters most. Goal: maximum trust after they witness results.`,
      case_study: `VARIATION — CASE-STUDY ("proof of HOW you help"): break down deeply, step by step, exactly how a result was achieved. The viewer should start to see themselves doing the same work and think "hey, I could do this too."`,
    },
  },
  authoritative: {
    header: `MECHANISM — AUTHORITATIVE (Perceived Value + Market Differentiation; perceived value must increase every reel).`,
    variations: {
      attention_lifestyle: `VARIATION — ATTENTION-DRIVEN / LIFESTYLE: premium look that raises perceived value and status ("this guy has money / knows what he's doing", "I want a penthouse like that"). WARNING: never pure lifestyle — pure lifestyle attracts low-quality, broke buyers. ALWAYS tie the lifestyle back to the mechanism/skill that produced it.`,
      industry_leader: `VARIATION — INDUSTRY LEADER: "POV: meeting your [X] in [Y] after doing [Z]", "How one client/product got [$XYZ]", "Building an [X] from scratch". Differentiate through indirect superiority — never trash-talk directly.`,
    },
  },
  relatability: {
    header: `MECHANISM — RELATABILITY (Personality + Market Differentiation; strongest driver of loyalty and money).`,
    variations: {
      storytelling: `VARIATION — STORYTELLING: "How I went from X and got to Z", "How I used to do X and saw Y, realizing I had to do Z", "Saw X and after [time] I'm now able to live a life of Z". Pull the prospect into YOUR life so they visualise their own journey → loyalty → sales.`,
      personality: `VARIATION — PERSONALITY: how hard you work for X, the life you wanted and still want, going back to your hometown, etc. Use personality to separate from competitors and align with the ICP's values and morals.`,
    },
  },
};

export function mechanismBlock(mechanism?: string | null, variation?: string | null): string {
  if (!mechanism) return "";
  const m = MECH[mechanism];
  if (!m) return "";
  const v = variation ? m.variations[variation] : undefined;
  return `${m.header}\n${v ?? Object.values(m.variations).join("\n")}`;
}

export const PRODUCTION_BREAKDOWN_SPEC = `OUTPUT CONTRACT — you MUST return all sections below, in this order, with these exact headers:

A) STRATEGY TAG
Mechanism · Variation · the exact objection/fear this piece pre-handles (one line).

B) HOOK OPTIONS (3-5)
Scroll-stopping first-3-second hooks, matched to the mechanism.

C) FULL SCRIPT / SCENE BEATS
Hook → Body → CTA, with timestamps that add up to the target length (e.g. 0:00-0:03, 0:03-0:12 …). Spoken lines verbatim.

D) SHOT-BY-SHOT / VISUAL FORMAT
- How the video looks overall (talking-head, B-roll over VO, screen recording, lifestyle b-roll, hybrid).
- Scene list: for each beat, exactly what is on screen.
- Pacing / cut rhythm (fast cuts vs slow holds) appropriate to the mechanism.

E) ON-SCREEN TEXT & CAPTIONS
- CAPTIONS: YES or NO — state it explicitly, with the reasoning (e.g. Educational/Case-Study = captions ON for retention + silent viewing; Lifestyle/Authoritative = minimal or none for a premium cinematic feel).
- Caption style (word-by-word karaoke vs full line, placement, size).
- The exact on-screen text overlay per scene.

F) CAPTION / COPY BLOCK
The written post caption exactly as it should be pasted — this is where the CTA-to-DM lives for Reels.

G) CTA
Matched to the Lead-Journey stage + distribution layer (comment keyword / DM keyword / link / send to YouTube).

H) THUMBNAIL + TITLE
Only include this section when the requested type is a YouTube hook + title; otherwise write "H) THUMBNAIL + TITLE — n/a".

SELF-CHECK before returning (silently): Problem-Solution has at most 3 solutions to ONE problem; Lifestyle ties back to the skill; the objection is pre-handled inside the script; the CTA matches the mechanism's intent; captions call has reasoning; every scene has on-screen text specified. Fix anything that fails, then output.`;
