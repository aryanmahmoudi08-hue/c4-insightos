import { useCurrentOrg } from "./use-auth";

export type Role = "owner" | "admin" | "viewer" | "setter" | "closer" | "sales_manager" | "growth_ops";

export function useRole(): { role: Role | null; isAdmin: boolean; canManage: boolean; canEdit: boolean } {
  const { data: org } = useCurrentOrg();
  const role = (org?.role as Role | undefined) ?? null;
  const isAdmin = role === "owner" || role === "admin";
  const canManage = isAdmin || role === "sales_manager" || role === "growth_ops";
  const canEdit = canManage; // setter/closer are read-only on sales sections
  return { role, isAdmin, canManage, canEdit };
}
