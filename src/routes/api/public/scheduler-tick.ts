import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * The scheduler's clock input. pg_cron POSTs here every minute with a bearer
 * token that was generated inside the database and is checked against it
 * (see 20261113090000_event_scheduler.sql) — this endpoint never holds a
 * copy of the secret.
 *
 * Everything it triggers is deduplicated, so a stray or replayed call can at
 * worst make something due fire a few seconds early, never twice.
 */
export const Route = createFileRoute("/api/public/scheduler-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ok, error } = await (supabaseAdmin as any).rpc("verify_scheduler_secret", {
          p_secret: token,
        });
        if (error) {
          console.error("[scheduler-tick] verify", error);
          return Response.json({ error: "Verification failed" }, { status: 500 });
        }
        if (ok !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { runSchedulerTick } = await import("@/lib/scheduler.server");
        const result = await runSchedulerTick();
        return Response.json(result);
      },
    },
  },
});
