import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WorkspaceMembership = {
  org_id: string;
  role: string;
  organizations: { id: string; name: string; slug: string } | null;
};

export async function ensureWorkspaceForUser(userId: string): Promise<WorkspaceMembership> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("memberships")
    .select("org_id, role, organizations(id, name, slug)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (membership) return membership as WorkspaceMembership;

  await supabaseAdmin.from("profiles").upsert({ id: userId, display_name: "Owner" });

  const slug = `workspace-${userId.slice(0, 8)}`;
  const { data: existingOrg, error: existingOrgError } = await supabaseAdmin
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", slug)
    .limit(1)
    .maybeSingle();
  if (existingOrgError) throw new Error(existingOrgError.message);

  let org = existingOrg;
  if (!org) {
    const { data: insertedOrg, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "My Workspace", slug })
      .select("id, name, slug")
      .maybeSingle();
    if (orgError) throw new Error(orgError.message);
    org = insertedOrg;
  }

  if (!org?.id) throw new Error("Workspace could not be created");

  const { error: memberError } = await supabaseAdmin
    .from("memberships")
    .insert({ org_id: org.id, user_id: userId, role: "owner" });
  if (memberError) throw new Error(memberError.message);

  return { org_id: org.id, role: "owner", organizations: org };
}