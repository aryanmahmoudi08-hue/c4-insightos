import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function orgOf(context: unknown) {
  const { supabase, userId } = context as { supabase: any; userId: string };
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return { supabase, orgId: data.org_id as string };
}

/** Builds the report without sending it — powers the /weekly-report page's
 * preview, separate from the "Send to Discord" action below. */
export const getWeeklyReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { buildWeeklyReport, fetchWorkspaceSettings } = await import("./weekly-report.server");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    return buildWeeklyReport(supabase, orgId, settings);
  });

export const sendWeeklyReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { buildWeeklyReport, sendWeeklyReportToDiscord, fetchWorkspaceSettings } = await import("./weekly-report.server");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    const report = await buildWeeklyReport(supabase, orgId, settings);
    await sendWeeklyReportToDiscord(supabase, orgId, report);
    return { ok: true, report };
  });
