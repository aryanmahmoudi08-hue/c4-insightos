import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/hooks/use-role";

/**
 * Dev Bypass-only role preview for Home. This never touches the real
 * permission system (`useRole()`, `memberships.role`, RLS) — it's a purely
 * local, in-memory choice that only `_authenticated.home.tsx` reads to
 * decide which role-flavored Home content (and, for the combined rep
 * dashboard, which mock rep) to render. Outside Dev Bypass this hook always
 * returns `null` and is a no-op — nothing about it can reach a real
 * authenticated session or production data.
 *
 * "DM Setter" previews under the real `"setter"` membership role and
 * "Inbound Dialer" previews under the real `"inbound_dialer"` role (split
 * out from "setter" in migration 20260916150000_inbound_dialer_role.sql so
 * Access Control can manage them independently — see src/lib/permissions.ts).
 * The preview key still carries its own identity beyond the role so Home can
 * auto-pick the right mock rep for whichever flavor is being previewed.
 */
const STORAGE_KEY = "c4-dev-preview-role";

export type DevPreviewKey =
  | "dm_setter"
  | "inbound_dialer"
  | "closer"
  | "sales_manager"
  | "admin"
  | "growth_ops";

export const DEV_PREVIEW_ROLES: { value: DevPreviewKey; label: string; role: Role }[] = [
  { value: "dm_setter", label: "DM Setter", role: "setter" },
  { value: "inbound_dialer", label: "Inbound Dialer", role: "inbound_dialer" },
  { value: "closer", label: "Closer", role: "closer" },
  { value: "sales_manager", label: "Sales Manager", role: "sales_manager" },
  { value: "admin", label: "Admin", role: "admin" },
  { value: "growth_ops", label: "Growth Operator", role: "growth_ops" },
];

export function useDevPreviewRole() {
  const { devBypass } = useAuth();
  const [previewKey, setPreviewKeyState] = useState<DevPreviewKey | null>(() => {
    if (!devBypass) return null;
    try {
      return (sessionStorage.getItem(STORAGE_KEY) as DevPreviewKey | null) ?? null;
    } catch {
      return null;
    }
  });
  const setPreviewKey = (key: DevPreviewKey | null) => {
    setPreviewKeyState(key);
    try {
      if (key) sessionStorage.setItem(STORAGE_KEY, key);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Private-browsing/storage-blocked — in-memory state still works for
      // the current session.
    }
  };
  const active = devBypass;
  const key = active ? previewKey : null;
  const entry = key ? DEV_PREVIEW_ROLES.find((r) => r.value === key) : undefined;
  return { previewKey: key, setPreviewKey, previewRole: entry?.role ?? null, active };
}
