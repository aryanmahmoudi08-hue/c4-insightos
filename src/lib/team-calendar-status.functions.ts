import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  calendar_id: z.string().trim().max(300).nullable().optional(),
  ical_url: z.string().trim().max(1000).nullable().optional(),
});

/**
 * The Google Calendar iframe embed is cross-origin, so the app has no way to tell
 * from JS whether a rep's calendar actually renders or silently shows Google's own
 * "not available" page. This checks the calendar's public ICS feed server-side
 * (no CORS restriction there) so a real reachable/unreachable status can be shown
 * next to each rep instead of the iframe failing silently.
 */
export const checkCalendarStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { checkCalendarStatus } = await import("./team-calendar-status.server");
    return checkCalendarStatus(data);
  });
