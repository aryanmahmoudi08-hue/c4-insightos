import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ensureCurrentWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("memberships")
      .select("org_id, role, organizations(id, name, slug)")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (membership) return membership;

    await supabaseAdmin.from("profiles").upsert({ id: userId, display_name: "Owner" });

    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "My Workspace", slug: `workspace-${userId.slice(0, 8)}` })
      .select("id, name, slug")
      .maybeSingle();
    if (orgError) throw new Error(orgError.message);
    if (!org?.id) throw new Error("Workspace could not be created");

    const { error: memberError } = await supabaseAdmin
      .from("memberships")
      .insert({ org_id: org.id, user_id: userId, role: "owner" });
    if (memberError) throw new Error(memberError.message);

    return { org_id: org.id, role: "owner", organizations: org };
  });