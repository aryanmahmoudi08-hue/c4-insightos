import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { coachContent } from "./coach-content.server";

const Input = z.object({
  title: z.string().max(500).optional().nullable(),
  hook: z.string().max(2000).optional().nullable(),
  transcript: z.string().max(20000).optional().nullable(),
  angle: z.string().max(120).optional().nullable(),
  funnel_stage: z.string().max(120).optional().nullable(),
  platform: z.string().max(120).optional().nullable(),
  views: z.number().nullable().optional(),
  leads: z.number().nullable().optional(),
  closes: z.number().nullable().optional(),
  cash_cents: z.number().nullable().optional(),
  retention_pct: z.number().nullable().optional(),
});

export const coachContentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data }) => {
    const r = await coachContent(data);
    if (!r) throw new Error("AI coach unavailable. Check credits or try again.");
    return r;
  });
