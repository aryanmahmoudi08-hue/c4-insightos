import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function orgOf(context: unknown) {
  const { supabase, userId } = context as { supabase: any; userId: string };
  const { data } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data?.org_id) throw new Error("No workspace");
  return { supabase, orgId: data.org_id as string };
}

const MessageSchema = z.object({ role: z.enum(["user", "assistant"]), content: z.string() });
const AskInput = z.object({ messages: z.array(MessageSchema).min(1) });

export const askSentinelFn = createServerFn({ method: "POST" })
  .inputValidator((d) => AskInput.parse(d))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, orgId } = await orgOf(context);
    const { askSentinel } = await import("./sentinel.server");
    const { fetchWorkspaceSettings } = await import("./workspace-settings.functions");
    const settings = await fetchWorkspaceSettings(supabase, orgId);
    return askSentinel(supabase, orgId, settings, data.messages);
  });
