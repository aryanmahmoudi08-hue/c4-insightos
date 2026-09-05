import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const EOD_ROLES = ["dm_setter", "inbound_dialer", "closer"] as const;
export type EodRole = (typeof EOD_ROLES)[number];
export type CanonicalAppRole = Database["public"]["Enums"]["app_role"] | "inbound_dialer";

const EodAccessInput = z.object({
  orgId: z.string().uuid(),
  eodRole: z.enum(EOD_ROLES),
});

/** Single canonical mapping from the existing application role system to EOD workflows. */
export function allowedEodRolesForAppRole(role: string): readonly EodRole[] {
  switch (role) {
    case "owner":
    case "admin":
    case "sales_manager":
      return EOD_ROLES;
    case "setter":
      return ["dm_setter"];
    case "inbound_dialer":
      return ["inbound_dialer"];
    case "closer":
      return ["closer"];
    default:
      return [];
  }
}

export function canAccessEodRole({
  appRole,
  eodRole,
  canViewEodResource = true,
}: {
  appRole: string;
  eodRole: EodRole;
  canViewEodResource?: boolean;
}): boolean {
  return canViewEodResource && allowedEodRolesForAppRole(appRole).includes(eodRole);
}

type EodAuthorization = {
  allowed: boolean;
  appRole: string | null;
  eodRole: EodRole;
  reason?: "not_a_member" | "eod_resource_denied" | "role_not_allowed";
};

type Sb = SupabaseClient<Database>;

/** Resolve authorization from the authenticated database identity, never from client role input. */
export async function resolveEodAuthorization(
  supabase: Sb,
  orgId: string,
  userId: string,
  eodRole: EodRole,
): Promise<EodAuthorization> {
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) return { allowed: false, appRole: null, eodRole, reason: "not_a_member" };

  const { data: override, error: overrideError } = await supabase
    .from("member_permissions")
    .select("can_view")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("resource", "eod_reports")
    .maybeSingle();
  if (overrideError) throw new Error(overrideError.message);

  const canView = override?.can_view ?? true;
  if (!canView)
    return { allowed: false, appRole: membership.role, eodRole, reason: "eod_resource_denied" };
  if (!canAccessEodRole({ appRole: membership.role, eodRole, canViewEodResource: canView })) {
    return { allowed: false, appRole: membership.role, eodRole, reason: "role_not_allowed" };
  }
  return { allowed: true, appRole: membership.role, eodRole };
}

export const getEodAccessProfileFn = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ orgId: z.string().uuid() }).parse(input))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: membership, error: membershipError } = await context.supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (membershipError) throw new Error(membershipError.message);
    if (!membership) return { appRole: null, allowedRoles: [] as EodRole[] };
    const { data: override, error: overrideError } = await context.supabase
      .from("member_permissions")
      .select("can_view")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .eq("resource", "eod_reports")
      .maybeSingle();
    if (overrideError) throw new Error(overrideError.message);
    return {
      appRole: membership.role,
      allowedRoles:
        override?.can_view === false ? [] : [...allowedEodRolesForAppRole(membership.role)],
    };
  });

export async function requireEodAuthorization(
  supabase: Sb,
  orgId: string,
  userId: string,
  eodRole: EodRole,
): Promise<EodAuthorization & { allowed: true }> {
  const authorization = await resolveEodAuthorization(supabase, orgId, userId, eodRole);
  if (!authorization.allowed) throw new Error("EOD access restricted");
  return authorization as EodAuthorization & { allowed: true };
}

export function eodAccessDeniedMessage(): string {
  return "You don't have permission to access this EOD workflow.";
}
