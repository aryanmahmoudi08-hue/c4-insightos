import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HiringStage =
  | "applied"
  | "needs_grading"
  | "interview_worthy"
  | "trial_call"
  | "offer_sent"
  | "hired"
  | "rejected";

/** Candidate region/location — a single source of truth for the option list
 *  used by both the application form (what a candidate can pick) and the
 *  Hiring dashboard's region filter, so the two can never drift apart. The
 *  DB column (`hiring_applicants.region`) is a plain text field with no
 *  check constraint, matching this table's existing role_applied/stage
 *  convention — adding a region here never requires a migration. */
export const HIRING_REGIONS = [
  "North America",
  "Latin America",
  "Europe",
  "Middle East",
  "Africa",
  "Asia",
  "Oceania",
  "Other",
] as const;
export type HiringRegion = (typeof HIRING_REGIONS)[number];

/** Single source of truth for how a 0-10 transcript-quality score maps to a
 * recommended pipeline stage — computed here in code (not left to the LLM to
 * self-apply its own instructed thresholds), and used both to set
 * `ai_recommended_stage` server-side and to color the score chip client-side,
 * so the two can never disagree with each other again. This is a
 * RECOMMENDATION only — nothing in this file writes an applicant's real
 * `stage`; that only ever changes on an explicit human click. */
export const SCORE_STAGE_BREAKPOINTS: { min: number; stage: HiringStage }[] = [
  { min: 8.5, stage: "trial_call" },
  { min: 7, stage: "interview_worthy" },
  { min: 5, stage: "needs_grading" },
];
export function recommendStageFromScore(score: number): HiringStage {
  for (const b of SCORE_STAGE_BREAKPOINTS) if (score >= b.min) return b.stage;
  return "rejected";
}

/** Heuristic applicant scorer. Lived inside the Hiring route until the public
 * ingest endpoint became a second entry point (a Google/Typeform application
 * form posting straight into the pipeline) — one scoring rule for both, so a
 * form-submitted candidate and a hand-entered one are graded identically.
 *
 * Like recommendStageFromScore above, this only ever produces a
 * RECOMMENDATION: a new applicant's real `stage` is always the neutral
 * "applied" until a human moves them. */
export function scoreApplicant(a: {
  years_experience?: number | null;
  niche?: string | null;
  role_applied?: string | null;
  notes?: string | null;
}): { score: number; reasoning: string } {
  let score = 5;
  const r: string[] = [];
  const yrs = Number(a.years_experience ?? 0);
  if (yrs >= 5) {
    score += 2.5;
    r.push(`${yrs}y experience (strong)`);
  } else if (yrs >= 2) {
    score += 1.5;
    r.push(`${yrs}y experience (solid)`);
  } else if (yrs >= 1) {
    score += 0.5;
    r.push(`${yrs}y experience (entry)`);
  } else r.push("limited experience");
  const niche = (a.niche || "").toLowerCase();
  if (/coach|info|course|consult|agency|saas/.test(niche)) {
    score += 1.5;
    r.push("niche fit");
  }
  const notes = (a.notes || "").toLowerCase();
  if (/closed|quota|commission|hit|exceed/.test(notes)) {
    score += 1;
    r.push("perf signals in notes");
  }
  if (/remote|full.?time|available/.test(notes)) {
    score += 0.5;
    r.push("availability");
  }
  score = Math.max(0, Math.min(10, score));
  return { score: Math.round(score * 10) / 10, reasoning: r.join(" · ") };
}

/** Grade a video application: AI reads the Loom transcript and routes the applicant to a pipeline stage. */
export const gradeLoomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        applicant_id: z.string().uuid(),
        loom_url: z.string().trim().url().max(500).nullable().optional(),
        transcript: z.string().trim().max(40000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- request-scoped client from requireSupabaseAuth's context, typed loosely like every other .functions.ts file's equivalent helper.
    const { supabase, userId } = context as never as { supabase: any; userId: string };
    const { data: mem } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!mem?.org_id) throw new Error("No workspace");
    const { gradeApplicantFromTranscript } = await import("./hiring.server");
    return gradeApplicantFromTranscript({
      orgId: mem.org_id,
      applicantId: data.applicant_id,
      loomUrl: data.loom_url ?? null,
      transcript: data.transcript ?? null,
    });
  });
