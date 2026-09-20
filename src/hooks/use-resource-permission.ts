import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { defaultPerm } from "@/lib/permissions";

type Perm = { can_view: boolean; can_edit: boolean };
type PermRow = { resource: string; can_view: boolean; can_edit: boolean };

const ROLE_MOCK_KEY = "c4-dev-bypass-role-permissions";
const mockMemberKey = (userId: string) => `c4-dev-bypass-member-permissions:${userId}`;

function loadMockRows(key: string): PermRow[] {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PermRow[]) : [];
  } catch {
    return [];
  }
}

/**
 * Resolves the CURRENTLY SIGNED-IN user's effective permission for a
 * resource — member-level override (if any) beats the role-level default
 * (if any) beats defaultPerm(). This is the one real enforcement point:
 * the sidebar (which nav items to show) and RouteAccessGate (whether to
 * actually render a page) both call this instead of each hand-rolling
 * their own role check, so what Access Control says and what the app does
 * can never drift apart again. Reads the exact same role_permissions/
 * member_permissions tables (and, under dev bypass, the exact same
 * sessionStorage-backed mock store) that the Access Control page itself
 * writes to.
 */
export function useResourcePermissions() {
  const { data: org } = useCurrentOrg();
  const { user, devBypass } = useAuth();
  const orgId = org?.org_id;
  const role = org?.role ?? null;

  const { data: rolePermsRaw } = useQuery({
    queryKey: ["role-permissions-effective", orgId, role, devBypass],
    enabled: !!orgId && !!role && !devBypass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("resource, can_view, can_edit")
        .eq("org_id", orgId!)
        .eq("role", role!);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const { data: memberPermsRaw } = useQuery({
    queryKey: ["member-permissions-effective", orgId, user?.id, devBypass],
    enabled: !!orgId && !!user?.id && !devBypass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("member_permissions")
        .select("resource, can_view, can_edit")
        .eq("org_id", orgId!)
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });

  const roleMap = useMemo(() => {
    const rows = devBypass
      ? loadMockRows(ROLE_MOCK_KEY).filter((r: PermRow & { role?: string }) => r.role === role)
      : (rolePermsRaw ?? []);
    return new Map(rows.map((r) => [r.resource, { can_view: r.can_view, can_edit: r.can_edit }]));
  }, [rolePermsRaw, devBypass, role]);

  const memberMap = useMemo(() => {
    const rows =
      devBypass && user?.id ? loadMockRows(mockMemberKey(user.id)) : (memberPermsRaw ?? []);
    return new Map(rows.map((r) => [r.resource, { can_view: r.can_view, can_edit: r.can_edit }]));
  }, [memberPermsRaw, devBypass, user?.id]);

  const getPerm = (resource: string): Perm => {
    // Role hasn't resolved yet (still loading) — default open rather than
    // flashing a false "access restricted" before we actually know.
    if (!role) return { can_view: true, can_edit: true };
    const overridden = memberMap.get(resource);
    if (overridden) return overridden;
    const roleRow = roleMap.get(resource);
    if (roleRow) return roleRow;
    return defaultPerm(role, resource);
  };

  return { getPerm, role, ready: !!role };
}
