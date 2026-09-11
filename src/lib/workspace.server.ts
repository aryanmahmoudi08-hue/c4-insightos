import { supabaseAdmin } from "@/integrations/supabase/client.server";

type WorkspaceMembership = {
  org_id: string;
  role: string;
  organizations: { id: string; name: string; slug: string } | null;
};

/**
 * Resolves the caller's workspace membership. Deliberately does NOT create
 * an organization or membership when none exists — auto-provisioning here
 * was the app-code half of the self-service access hole closed alongside
 * the `handle_new_user()` trigger fix (see
 * 20260910090000_close_self_service_workspace_provisioning.sql). A signed-up
 * user with no approved membership gets `null` back; `_authenticated.tsx`
 * renders "Access Required" for that state instead of the app shell. The
 * only sanctioned way to acquire a membership is the existing
 * request-access -> admin-approval flow (submit_membership_request /
 * approve_membership_request), which inserts the row explicitly.
 */
export async function ensureWorkspaceForUser(userId: string): Promise<WorkspaceMembership | null> {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("memberships")
    .select("org_id, role, organizations(id, name, slug)")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  return (membership as WorkspaceMembership | null) ?? null;
}
