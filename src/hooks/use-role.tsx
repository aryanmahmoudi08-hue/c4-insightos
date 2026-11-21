import { useCurrentOrg } from "./use-auth";

export type Role =
  | "owner"
  | "admin"
  | "viewer"
  | "setter"
  | "inbound_dialer"
  | "closer"
  | "sales_manager"
  | "growth_ops";

export function useRole(): {
  /** The primary role — what Home and single-role screens go by. */
  role: Role | null;
  /** Every role held: the primary plus extra rep roles (a closer who also dials). */
  roles: Role[];
  hasRole: (r: Role) => boolean;
  isAdmin: boolean;
  canManage: boolean;
  canEdit: boolean;
} {
  const { data: org } = useCurrentOrg();
  const role = (org?.role as Role | undefined) ?? null;
  const extra = ((org as { additional_roles?: string[] } | null | undefined)?.additional_roles ??
    []) as Role[];
  const roles = role ? [role, ...extra.filter((r) => r !== role)] : [];
  const hasRole = (r: Role) => roles.includes(r);
  // Extra roles are rep roles only, so they never change these.
  const isAdmin = role === "owner" || role === "admin";
  const canManage = isAdmin || role === "sales_manager" || role === "growth_ops";
  const canEdit = canManage; // setter/closer are read-only on sales sections
  return { role, roles, hasRole, isAdmin, canManage, canEdit };
}
