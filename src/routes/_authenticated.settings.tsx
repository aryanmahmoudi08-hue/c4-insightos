import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useTheme } from "@/hooks/use-theme";
import { useDateRange } from "@/hooks/use-date-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Moon,
  Sun,
  ShieldCheck,
  Users,
  LogOut,
  Building2,
  Loader2,
  Save,
  Radar,
  ExternalLink,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, ROLE_BLURBS, type ManagedRole } from "@/lib/permissions";
import {
  getWorkspaceSettingsFn,
  updateWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceSettings,
} from "@/lib/workspace-settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: () => ({
    meta: [
      { title: "Settings · C4 InsightOS" },
      {
        name: "description",
        content:
          "Manage appearance, workspace details and team access for your C4 InsightOS workspace.",
      },
      { property: "og:title", content: "Settings · C4 InsightOS" },
      {
        property: "og:description",
        content:
          "Manage appearance, workspace details and team access for your C4 InsightOS workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
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
        <Section
          title="Appearance"
          description="Dark is the default. Black, white, and a violet → pink → light-blue spectrum that encodes funnel temperature (cold → hot) in data only — never decoration or UI chrome."
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                key: "dark" as const,
                label: "Dark",
                icon: Moon,
                swatch: ["#151515", "#232323", "#f7f7f7"],
              },
              {
                key: "light" as const,
                label: "Light",
                icon: Sun,
                swatch: ["#fcfcfc", "#ededed", "#1a1a1a"],
              },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    active ? "border-primary ring-1 ring-ring" : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" /> {opt.label}
                    {active && (
                      <span className="ml-auto text-3xs uppercase tracking-wider text-muted-foreground">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {opt.swatch.map((c) => (
                      <span
                        key={c}
                        className="h-4 w-8 rounded border border-border"
                        style={{ background: c }}
                      />
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
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5" />
                {org?.organizations?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="mt-0.5 font-medium">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="mt-0.5 font-medium">
                {role ? (ROLE_LABELS[role as ManagedRole] ?? role) : "—"}
              </dd>
              {role && (
                <dd className="text-2xs text-muted-foreground">
                  {ROLE_BLURBS[role as ManagedRole] ?? "Full owner access."}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Default reporting range</dt>
              <dd className="mt-0.5 font-medium">{range?.label ?? "Last 30 days"}</dd>
            </div>
          </dl>
        </Section>

        <ContentEngineSection orgId={org?.org_id} isAdmin={isAdmin} />

        <Section
          title="Access & team"
          description="Control what every role — and every individual rep — can view or edit."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              disabled={!isAdmin}
            >
              <Link to="/permissions">
                <ShieldCheck className="h-4 w-4" /> Role access
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start gap-2">
              <Link to="/team">
                <Users className="h-4 w-4" /> Team & per-person
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-2xs text-muted-foreground">
            Role access sets the baseline. Person-level overrides live on each team row under Team →
            Access and always win over the role default.
          </p>
        </Section>

        <Section title="Session">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </Section>
      </div>
    </>
  );
}

type NumField = { key: string; label: string; hint: string; min: number; max: number };

const CONTENT_ENGINE_FIELDS: NumField[] = [
  {
    key: "minBucketSample",
    label: "Minimum sample per bucket",
    hint: 'Below this many same-mechanism/platform pieces with metrics logged, a performance verdict isn\'t shown — "not enough data" instead.',
    min: 1,
    max: 200,
  },
  {
    key: "baselineWindowSize",
    label: "Baseline window (pieces)",
    hint: "How many past pieces per bucket the comparison baseline is computed from.",
    min: 1,
    max: 500,
  },
  {
    key: "minTotalSignalWeight",
    label: "Minimum total signal weight",
    hint: 'Below this total demand-signal weight, the recommended mix is badged "limited data."',
    min: 0,
    max: 10000,
  },
  {
    key: "weeklyReelTarget",
    label: "Weekly reel target",
    hint: "Default reel target shown on Content Signals.",
    min: 1,
    max: 50,
  },
];
const ALERT_FIELDS: NumField[] = [
  {
    key: "showRateAlertPct",
    label: "Show-rate alert threshold (%)",
    hint: "Fires when show rate drops below this — set to your own baseline, not an industry number.",
    min: 0,
    max: 100,
  },
  {
    key: "closeRateAlertPct",
    label: "Close-rate alert threshold (%)",
    hint: "Fires when close rate drops below this. Set it below your real close rate but close enough that a meaningful drop trips it — a threshold far below your actual performance never fires, and one above it fires constantly.",
    min: 0,
    max: 100,
  },
];
const CLIENT_FIELDS: NumField[] = [
  {
    key: "renewalAtRiskDays",
    label: "Renewal at-risk window (days)",
    hint: "A client is flagged at-risk when their renewal falls inside this many days with no conversation started yet, or is overdue.",
    min: 1,
    max: 365,
  },
];
function ContentEngineSection({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkspaceSettingsFn);
  const updateFn = useServerFn(updateWorkspaceSettingsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS) : getFn({ data: { orgId: orgId! } }),
  });

  const [draft, setDraft] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [seeded, setSeeded] = useState(false);
  if (data && !seeded) {
    setDraft(data);
    setSeeded(true);
  }

  const setField = <G extends keyof WorkspaceSettings>(
    group: G,
    key: keyof WorkspaceSettings[G],
    value: number,
  ) => setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));

  const save = useMutation({
    mutationFn: async () => {
      if (devBypass) return draft;
      return updateFn({
        data: {
          orgId: orgId!,
          content_engine: draft.content_engine,
          alerts: draft.alerts,
          clients: draft.clients,
          funnel_instrument: draft.funnel_instrument,
        },
      });
    },
    onSuccess: (saved) => {
      toast.success("Content engine settings saved");
      qc.setQueryData(["workspace-settings", orgId, devBypass], saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups: { title: string; group: keyof WorkspaceSettings; fields: NumField[] }[] = [
    { title: "Content Engine", group: "content_engine", fields: CONTENT_ENGINE_FIELDS },
    { title: "Alerts", group: "alerts", fields: ALERT_FIELDS },
    { title: "Clients", group: "clients", fields: CLIENT_FIELDS },
  ];

  return (
    <Section
      title="Content Engine & Alerts"
      description="Every threshold the Content Signals / Bottleneck Engine and alerting use — no buried literals. Changes apply the moment they're saved."
    >
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mx-auto animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.group} className="space-y-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Radar className="h-3.5 w-3.5" /> {g.title}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      min={f.min}
                      max={f.max}
                      value={(draft[g.group] as Record<string, number>)[f.key]}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setField(
                          g.group,
                          f.key as never,
                          Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min)),
                        )
                      }
                    />
                    <p className="text-3xs text-muted-foreground">{f.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Save
            </Button>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Only workspace owners and admins can change these.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
