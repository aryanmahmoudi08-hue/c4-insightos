import { createServerFn } from "@tanstack/react-start";

/**
 * Today's USD -> CAD/EUR/GBP display rates, real-source (Frankfurter), cached
 * daily. Deliberately NOT gated behind requireSupabaseAuth: these are global
 * reference rates (not org- or user-scoped, computed via the service-role
 * client), so there's no identity this handler needs from the caller — and
 * gating a non-sensitive read behind auth was the actual cause of "FX
 * unavailable" persisting for real logged-in sessions (a 401 on this call
 * before/without a fully attached session token), not a genuine missing-rate
 * case.
 */
export const getDisplayFxRatesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getDisplayFxRates } = await import("./fx.server");
  return { rates: await getDisplayFxRates(), fetchedAt: new Date().toISOString() };
});
