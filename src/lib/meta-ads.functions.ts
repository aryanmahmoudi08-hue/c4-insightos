import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SyncInput = z.object({
  /** Inclusive ISO dates. Meta interprets these in the ad account's own
   * timezone, not UTC — worth knowing when a boundary day looks off. */
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "since must be an ISO date"),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "until must be an ISO date"),
});

/**
 * Pull Meta campaign spend into `acquisition_spend` for the caller's org.
 *
 * Manual rather than scheduled: this repo has no cron, and a button the user
 * presses is honest about that, where a "sync" that silently never runs
 * wouldn't be. The token is refreshed lazily inside syncMetaSpend.
 */
export const syncMetaSpendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SyncInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { syncMetaSpend } = await import("./meta-ads.server");

    const { data: membership, error } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const orgId = membership?.org_id as string | undefined;
    if (!orgId) throw new Error("No workspace — access not yet approved");

    return syncMetaSpend({ orgId, since: data.since, until: data.until });
  });
