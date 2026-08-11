import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitSchema = z.object({
  org_id: z.string().uuid(),
  student_name: z.string().trim().min(2).max(120),
  win_date: z.string().max(20).nullable().optional(),
  yesterday_commitment: z.string().trim().max(500).nullable().optional(),
  yesterday_status: z.enum(["done", "partial", "no"]),
  work_done: z.string().trim().max(2000).nullable().optional(),
  win_types: z.array(z.enum(["financial", "mental", "physical"])).min(1).max(3),
  win_description: z.string().trim().min(3).max(2000),
  financial_amount_cents: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  financial_source: z.string().trim().max(300).nullable().optional(),
  proof_url: z.string().trim().max(1000).nullable().optional(),
  energy_score: z.number().int().min(1).max(10).nullable().optional(),
  blocker: z.string().trim().max(2000).nullable().optional(),
  tomorrow_needle_mover: z.string().trim().max(500).nullable().optional(),
  source: z.enum(["manual", "typeform"]).optional(),
});

/** Public — students submit The Daily W without an account, via a workspace link. */
export const submitDailyWinFn = createServerFn({ method: "POST" })
  .inputValidator((d) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const { insertDailyWin } = await import("./daily-wins.server");
    return insertDailyWin(data as never);
  });

/** Public — pre-fills yesterday's stated needle-mover so the loop closes on itself. */
export const lastNeedleMoverFn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ org_id: z.string().uuid(), student_name: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const { lastNeedleMover } = await import("./daily-wins.server");
    return { commitment: await lastNeedleMover(data.org_id, data.student_name) };
  });

export const analyzeDailyWinsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(365).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as { supabase: any; userId: string };
    const { data: mem } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!mem?.org_id) throw new Error("No workspace");
    const days = data.days ?? 30;
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data: rows } = await supabase
      .from("daily_wins")
      .select("student_name, win_date, yesterday_status, win_types, win_description, financial_amount_cents, financial_source, energy_score, blocker, tomorrow_needle_mover")
      .eq("org_id", mem.org_id)
      .gte("win_date", since)
      .order("win_date", { ascending: false })
      .limit(400);
    const { analyzeWins } = await import("./daily-wins.server");
    return analyzeWins(rows ?? [], days);
  });
