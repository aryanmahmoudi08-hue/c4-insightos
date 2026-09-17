import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Sparkles } from "lucide-react";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDevPreviewRole, DEV_PREVIEW_ROLES } from "@/hooks/use-dev-preview-role";
import { ROLE_LABELS, type ManagedRole } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HomeRepDashboard } from "@/components/home/home-rep-dashboard";
import { HomeCloser } from "@/components/home/home-closer";
import { HomeManager } from "@/components/home/home-manager";
import { HomeAdmin } from "@/components/home/home-admin";
import { HomeGrowth } from "@/components/home/home-growth";

export const Route = createFileRoute("/_authenticated/home")({ component: HomePage });

// A signature accent per role — reuses the app's existing spectrum/semantic
// tone tokens (src/lib/spectrum.ts), never a new color. Purely for the
// greeting's badge/avatar so each role's Home reads as visually distinct
// from the moment it loads, before any content below even renders.
const ROLE_ACCENT: Record<string, "cold" | "mid" | "hot" | "success" | "warning"> = {
  setter: "cold",
  inbound_dialer: "cold",
  closer: "hot",
  sales_manager: "mid",
  growth_ops: "success",
  admin: "warning",
  owner: "warning",
};
const ROLE_BADGE_CLASS: Record<string, string> = {
  cold: "bg-spectrum-cold/15 text-spectrum-cold",
  mid: "bg-spectrum-mid/15 text-spectrum-mid",
  hot: "bg-spectrum-hot/15 text-spectrum-hot",
  success: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
  warning: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
  neutral: "bg-muted text-muted-foreground",
};

function HomePage() {
  const { user, devBypass } = useAuth();
  const { data: org } = useCurrentOrg();
  const { role: realRole } = useRole();
  const { previewKey, setPreviewKey, previewRole, active: devPreviewActive } = useDevPreviewRole();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;

  // Dev Bypass-only override — see use-dev-preview-role.ts. `effectiveRole`
  // never affects real permissions/RLS/useRole() elsewhere in the app; it
  // only changes which Home content this one component renders.
  const effectiveRole = devPreviewActive && previewRole ? previewRole : realRole;

  // Same identity lookup the sidebar footer already uses (display_name →
  // email local-part → "there") — not a new query shape, just reused here.
  const { data: identity } = useQuery({
    queryKey: ["home-greeting-identity", user?.id, devBypass],
    enabled: !!user,
    queryFn: async () => {
      if (devBypass) return { displayName: "Dev User" };
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      return { displayName: data?.display_name ?? user!.email?.split("@")[0] ?? "there" };
    },
  });
  const firstName = (identity?.displayName ?? "there").split(" ")[0];
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 5
      ? "Good night"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";

  // Dev Preview's "DM Setter" and "Inbound Dialer" both carry the same real
  // `previewRole` ("setter" — see use-dev-preview-role.ts's own doc comment
  // on why), so the greeting badge must read the preview key's own label
  // here rather than deriving it from `effectiveRole`, or both flavors would
  // show the same "DM Setter" text.
  const previewEntry =
    devPreviewActive && previewKey
      ? DEV_PREVIEW_ROLES.find((r) => r.value === previewKey)
      : undefined;
  const roleLabel = previewEntry
    ? previewEntry.label
    : effectiveRole
      ? (ROLE_LABELS[effectiveRole as ManagedRole] ??
        effectiveRole
          .split("_")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" "))
      : null;
  const roleTone = ROLE_ACCENT[effectiveRole ?? ""] ?? "neutral";

  return (
    <main className="space-y-5 p-4 md:p-6">
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:flex",
            ROLE_BADGE_CLASS[roleTone],
          )}
        >
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="display-serif text-2xl leading-none md:text-3xl">
              {timeGreeting}, {firstName}
            </h1>
            {roleLabel && (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-3xs font-bold uppercase tracking-wider",
                  ROLE_BADGE_CLASS[roleTone],
                )}
              >
                {roleLabel}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">How can I help you today</p>
        </div>
      </div>

      {devPreviewActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 px-3 py-2">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="text-2xs font-bold uppercase tracking-wider text-amber-500">
            Dev Preview — Role
          </span>
          <Select
            value={previewKey ?? "__real__"}
            onValueChange={(v) => setPreviewKey(v === "__real__" ? null : (v as never))}
          >
            <SelectTrigger className="h-7 w-[190px] border-amber-500/40 bg-transparent text-xs text-amber-200">
              <SelectValue placeholder="Real role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__real__">Real role ({realRole ?? "none"})</SelectItem>
              {DEV_PREVIEW_ROLES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-2xs text-amber-500/70">
            Dev-only — simulates Home content, never real permissions.
          </span>
        </div>
      )}

      {!orgId ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading workspace…
        </div>
      ) : effectiveRole === "setter" || effectiveRole === "inbound_dialer" ? (
        <HomeRepDashboard
          orgId={orgId}
          knownFlavor={
            previewKey === "dm_setter" || previewKey === "inbound_dialer"
              ? previewKey
              : effectiveRole === "inbound_dialer"
                ? "inbound_dialer"
                : undefined
          }
        />
      ) : effectiveRole === "closer" ? (
        <HomeCloser orgId={orgId} />
      ) : effectiveRole === "sales_manager" ? (
        <HomeManager orgId={orgId} />
      ) : effectiveRole === "growth_ops" ? (
        <HomeGrowth orgId={orgId} />
      ) : (
        // admin / owner / viewer / va / unrecognized — a broader business-
        // operations overview is the only honest default when the account's
        // real role doesn't map to a specific rep/manager/growth persona.
        <HomeAdmin orgId={orgId} />
      )}
    </main>
  );
}
