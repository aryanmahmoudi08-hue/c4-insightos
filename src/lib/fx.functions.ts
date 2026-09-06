import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Today's USD -> CAD/EUR/GBP display rates, real-source (Frankfurter), cached daily. */
export const getDisplayFxRatesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getDisplayFxRates } = await import("./fx.server");
    return { rates: await getDisplayFxRates(), fetchedAt: new Date().toISOString() };
  });
