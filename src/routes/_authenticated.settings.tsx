import { createFileRoute, Link } from "@tanstack/react-router";
import { TopBar } from "@/components/app-sidebar";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useTheme } from "@/hooks/use-theme";
import { useDateRange } from "@/hooks/use-date-range";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Moon, Sun, ShieldCheck, Users, Plug, LogOut, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, ROLE_BLURBS, type ManagedRole } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: () => ({
    meta: [
      { title: "Settings · C4 InsightOS" },
      { name: "description", content: "Manage appearance, workspace details and team access for your C4 InsightOS workspace." },
      { property: "og:title", content: "Settings · C4 InsightOS" },
      { property: "og:description", content: "Manage appearance, workspace details and team access for your C4 InsightOS workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Settings() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { role, isAdmin } = useRole();
  const { theme, setTheme } = useTheme();
  const { range } = useDateRange();

  return (
    <>
      <TopBar title="Settings" subtitle="Appearance, workspace and access" />
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Section title="Appearance" description="Dark is the default. Black, white, and a violet → pink → light-blue spectrum that encodes funnel temperature (cold → hot) in data only — never decoration or UI chrome.">
          <div className="grid grid-cols-2 gap-3">
            {([
              { key: "dark" as const, label: "Dark", icon: Moon, swatch: ["#151515", "#232323", "#f7f7f7"] },
              { key: "light" as const, label: "Light", icon: Sun, swatch: ["#fcfcfc", "#ededed", "#1a1a1a"] },
            ]).map(opt => {
              const Icon = opt.icon;
              const active = theme === opt.key;
              return (
                <button key={opt.key} onClick={() => setTheme(opt.key)}
                  className={cn("rounded-md border p-3 text-left transition-colors",
                    active ? "border-primary ring-1 ring-ring" : "border-border hover:bg-muted/40")}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" /> {opt.label}
                    {active && <span className="ml-auto text-3xs uppercase tracking-wider text-muted-foreground">Active</span>}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {opt.swatch.map(c => (
                      <span key={c} className="h-4 w-8 rounded border border-border" style={{ background: c }} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Workspace" description="Details of the workspace you're signed into.">
          <dl className="grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium"><Building2 className="h-3.5 w-3.5" />{org?.organizations?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="mt-0.5 font-medium">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="mt-0.5 font-medium">{role ? (ROLE_LABELS[role as ManagedRole] ?? role) : "—"}</dd>
              {role && <dd className="text-2xs text-muted-foreground">{ROLE_BLURBS[role as ManagedRole] ?? "Full owner access."}</dd>}
            </div>
            <div>
              <dt className="text-muted-foreground">Default reporting range</dt>
              <dd className="mt-0.5 font-medium">{range?.label ?? "Last 30 days"}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Access & team" description="Control what every role — and every individual rep — can view or edit.">
          <div className="grid gap-2 sm:grid-cols-3">
            <Button asChild variant="outline" size="sm" className="justify-start gap-2" disabled={!isAdmin}>
              <Link to="/permissions"><ShieldCheck className="h-4 w-4" /> Role access</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start gap-2">
              <Link to="/team"><Users className="h-4 w-4" /> Team & per-person</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start gap-2">
              <Link to="/connectors"><Plug className="h-4 w-4" /> Connectors</Link>
            </Button>
          </div>
          <p className="mt-3 text-2xs text-muted-foreground">
            Role access sets the baseline. Person-level overrides live on each team row under Team → Access and always win over the role default.
          </p>
        </Section>

        <Section title="Session">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => supabase.auth.signOut()}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </Section>
      </div>
    </>
  );
}
