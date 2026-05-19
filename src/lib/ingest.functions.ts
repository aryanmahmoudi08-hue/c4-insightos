import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function genToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const getOrCreateIngestToken = createServerFn({ method: "POST" })
  .inputValidator((data: { orgId: string }) => data)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: org, error } = await supabase
      .from("organizations")
      .select("id, settings")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    let token = typeof settings.ingest_token === "string" ? (settings.ingest_token as string) : "";
    if (!token) {
      token = genToken();
      const { error: upErr } = await supabase
        .from("organizations")
        .update({ settings: { ...settings, ingest_token: token } })
        .eq("id", data.orgId);
      if (upErr) throw new Error(upErr.message);
    }
    return { token };
  });

export const rotateIngestToken = createServerFn({ method: "POST" })
  .inputValidator((data: { orgId: string }) => data)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: org, error } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", data.orgId)
      .single();
    if (error) throw new Error(error.message);
    const settings = (org.settings ?? {}) as Record<string, unknown>;
    const token = genToken();
    const { error: upErr } = await supabase
      .from("organizations")
      .update({ settings: { ...settings, ingest_token: token } })
      .eq("id", data.orgId);
    if (upErr) throw new Error(upErr.message);
    return { token };
  });
