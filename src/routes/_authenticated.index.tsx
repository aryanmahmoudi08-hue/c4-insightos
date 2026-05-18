import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
export const Route = createFileRoute("/_authenticated/")({ component: Index });
function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">…</div>;
  return <Navigate to={user ? "/dashboard" : "/login"} />;
}
