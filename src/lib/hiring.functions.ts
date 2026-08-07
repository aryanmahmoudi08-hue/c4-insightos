import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
