import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HiringStage = "applied" | "needs_grading" | "interview_worthy" | "trial_call" | "offer_sent" | "hired" | "rejected";

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

/** Grade a video application: AI reads the Loom transcript and routes the applicant to a pipeline stage. */
export const gradeLoomFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    applicant_id: z.string().uuid(),
    loom_url: z.string().trim().url().max(500).nullable().optional(),
    transcript: z.string().trim().max(40000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as { supabase: any; userId: string };
    const { data: mem } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!mem?.org_id) throw new Error("No workspace");
    const { gradeApplicantFromTranscript } = await import("./hiring.server");
    return gradeApplicantFromTranscript({
      orgId: mem.org_id,
      applicantId: data.applicant_id,
      loomUrl: data.loom_url ?? null,
      transcript: data.transcript ?? null,
    });
  });
