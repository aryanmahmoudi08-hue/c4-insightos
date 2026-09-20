import type { ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useResourcePermissions } from "@/hooks/use-resource-permission";
import { PATH_TO_RESOURCE, RESOURCES } from "@/lib/permissions";

/**
 * The one real enforcement point for "can this signed-in user even see this
 * page" — wraps every authenticated route's <Outlet/> once (in
 * _authenticated.tsx) rather than each of the ~24 route files re-deriving
 * its own access check. A path with no entry in PATH_TO_RESOURCE (settings,
 * permissions, unmapped routes) always renders — deliberately not
 * resource-gated (see that map's own comment for why).
 */
export function RouteAccessGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { getPerm, ready } = useResourcePermissions();
  const resourceKey = PATH_TO_RESOURCE[location.pathname];

  // No mapping for this path, or permissions haven't resolved yet — never
  // flash a false block while the role/permission queries are in flight.
  if (!resourceKey || !ready) return <>{children}</>;

  const { can_view } = getPerm(resourceKey);
  if (can_view) return <>{children}</>;

  const label = RESOURCES.find((r) => r.key === resourceKey)?.label ?? "This page";
  return (
    <div className="p-6">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <div className="text-sm font-medium">You don't have access to {label}.</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Ask an admin or growth ops to grant it in Access Control.
        </div>
      </div>
    </div>
  );
}
