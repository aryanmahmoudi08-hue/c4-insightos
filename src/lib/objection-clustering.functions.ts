import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  rawCounts: z.array(z.object({ text: z.string(), count: z.number() })),
});

export const clusterObjectionsFn = createServerFn({ method: "POST" })
  .inputValidator((d) => Input.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data }) => {
    const { clusterObjections } = await import("./objection-clustering.server");
    const clusters = await clusterObjections(data.rawCounts);
    return { clusters };
  });
