import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FlaskConical, Sparkles } from "lucide-react";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useDevPreviewRole, DEV_PREVIEW_ROLES } from "@/hooks/use-dev-preview-role";
import { ROLE_LABELS, type ManagedRole } from "@/lib/permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHero } from "@/components/page-hero";
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
/** The role accent, as a PageHero status-pill spectrum position. The two
 *  non-spectrum tones (success/warning) have no funnel position, so they
 *  fall through to undefined and the pill renders in its neutral tone
 *  rather than borrowing a colour that would claim a stage. */
const ROLE_PILL_SPECTRUM: Record<string, "cold" | "mid" | "hot" | undefined> = {
  cold: "cold",
  mid: "mid",
  hot: "hot",
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
    <main className="space-y-6 p-4 md:p-6">
      {/* Home is the one page with no TopBar, so it renders its own hero
          rather than going without the one piece of furniture every other
          page in the app now opens on. The greeting IS the title, which
          means PageHero's accent-on-the-last-word lands on the person's
          name, and the role becomes a status pill — the same slot every
          other hero uses for "what is true right now". */}
      <PageHero
        eyebrow="Your workspace"
        title={`${timeGreeting}, ${firstName}`}
        subtitle="What moved today, and what needs you."
        icon={<Sparkles className="h-6 w-6" />}
        status={
          roleLabel ? [{ label: roleLabel, spectrum: ROLE_PILL_SPECTRUM[roleTone] }] : undefined
        }
      />

      {devPreviewActive && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[color:var(--color-warning)]/50 bg-[color:var(--color-warning)]/[0.06] px-3 py-2">
          <FlaskConical className="h-3.5 w-3.5 shrink-0 text-[color:var(--color-warning)]" />
          <span className="text-2xs font-bold uppercase tracking-wider text-[color:var(--color-warning)]">
            Dev Preview — Role
          </span>
          <Select
            value={previewKey ?? "__real__"}
            onValueChange={(v) => setPreviewKey(v === "__real__" ? null : (v as never))}
          >
            <SelectTrigger className="h-7 w-[190px] border-[color:var(--color-warning)]/40 bg-transparent text-xs text-foreground">
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
          <span className="text-2xs text-muted-foreground">
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
