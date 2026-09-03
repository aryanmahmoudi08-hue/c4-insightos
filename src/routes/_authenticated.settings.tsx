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
  DEV_EOD_SETTINGS_STORAGE_KEY,
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
        <EodSettingsSection orgId={org?.org_id} isAdmin={isAdmin} />

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

const EOD_ROLE_KEYS = ["dm_setter", "inbound_dialer", "closer"] as const;

function withVisibleEodRoleRows(settings: WorkspaceSettings): WorkspaceSettings {
  return {
    ...settings,
    eod: {
      ...settings.eod,
      roleUrls: Object.fromEntries(
        EOD_ROLE_KEYS.map((key) => [key, settings.eod.roleUrls[key] ?? ""]),
      ),
    },
  };
}

function EodSettingsSection({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkspaceSettingsFn);
  const updateFn = useServerFn(updateWorkspaceSettingsFn);
  const { data, isLoading } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () => {
      if (!devBypass) return getFn({ data: { orgId: orgId! } });
      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem(DEV_EOD_SETTINGS_STORAGE_KEY);
          if (stored)
            return Promise.resolve(withVisibleEodRoleRows(JSON.parse(stored) as WorkspaceSettings));
        } catch {
          // Ignore malformed local preview state and use documented defaults.
        }
      }
      return Promise.resolve(withVisibleEodRoleRows(DEFAULT_WORKSPACE_SETTINGS));
    },
  });
  const [draft, setDraft] = useState<WorkspaceSettings>(
    withVisibleEodRoleRows(DEFAULT_WORKSPACE_SETTINGS),
  );
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!data || seeded) return;
    setDraft(withVisibleEodRoleRows(data));
    setSeeded(true);
  }, [data, seeded]);

  const updateEod = (patch: Partial<WorkspaceSettings["eod"]>) =>
    setDraft((prev) => ({ ...prev, eod: { ...prev.eod, ...patch } }));
  const updateRole = (oldKey: string, key: string, url: string) =>
    setDraft((prev) => {
      const next = { ...prev.eod.roleUrls };
      if (oldKey !== key) delete next[oldKey];
      if (key.trim()) next[key.trim()] = url;
      return { ...prev, eod: { ...prev.eod, roleUrls: next } };
    });
  const updateUser = (oldKey: string, key: string, url: string) =>
    setDraft((prev) => {
      const next = { ...prev.eod.userUrls };
      if (oldKey !== key) delete next[oldKey];
      if (key.trim()) next[key.trim()] = url;
      return { ...prev, eod: { ...prev.eod, userUrls: next } };
    });
  const addRole = () =>
    setDraft((prev) => ({
      ...prev,
      eod: {
        ...prev.eod,
        roleUrls: {
          ...prev.eod.roleUrls,
          [`role-${Object.keys(prev.eod.roleUrls).length + 1}`]: "",
        },
      },
    }));
  const addUser = () =>
    setDraft((prev) => ({
      ...prev,
      eod: {
        ...prev.eod,
        userUrls: {
          ...prev.eod.userUrls,
          [`user-${Object.keys(prev.eod.userUrls).length + 1}`]: "",
        },
      },
    }));
  const removeRole = (key: string) =>
    setDraft((prev) => {
      const next = { ...prev.eod.roleUrls };
      delete next[key];
      return { ...prev, eod: { ...prev.eod, roleUrls: next } };
    });
  const removeUser = (key: string) =>
    setDraft((prev) => {
      const next = { ...prev.eod.userUrls };
      delete next[key];
      return { ...prev, eod: { ...prev.eod, userUrls: next } };
    });

  const save = useMutation({
    mutationFn: async () => {
      if (devBypass) {
        sessionStorage.setItem(DEV_EOD_SETTINGS_STORAGE_KEY, JSON.stringify(draft));
        return draft;
      }
      return updateFn({ data: { orgId: orgId!, eod: draft.eod } });
    },
    onSuccess: (saved) => {
      toast.success("EOD form assignments saved");
      qc.setQueryData(["workspace-settings", orgId, devBypass], saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="EOD Form Configuration"
      description="Route each role’s end-of-day report to the right Typeform without editing JSON. User overrides win over role assignments, which win over the default."
    >
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-spectrum-mid/30 bg-spectrum-mid/5 px-4 py-3">
            <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-spectrum-mid">
              Routing precedence
            </div>
            <div className="mt-1 text-sm font-semibold">
              User assignment → Role assignment → Default form
            </div>
            <p className="mt-1 text-2xs text-muted-foreground">
              Leave any URL blank to continue using the next matching level, then the native
              InsightOS flow if no Typeform is assigned.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Default Typeform URL{" "}
              <span className="font-normal text-muted-foreground">(fallback)</span>
            </Label>
            <div className="flex gap-2">
              <Link2 className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={draft.eod.defaultUrl}
                disabled={!isAdmin}
                placeholder="https://form.typeform.com/to/..."
                onChange={(e) => updateEod({ defaultUrl: e.target.value })}
              />
            </div>
            <p className="text-3xs text-muted-foreground">
              HTTPS only. This is used when no role or user-specific form matches.
            </p>
          </div>

          <AssignmentList
            title="Role-specific Typeforms"
            hint="Assign forms for DM Setter, Inbound Dialer, and Closer. These are visible starter rows; blank means no role override."
            rows={draft.eod.roleUrls}
            suggestedKeys={EOD_ROLE_KEYS}
            disabled={!isAdmin}
            onAdd={addRole}
            onRemove={removeRole}
            onUpdate={updateRole}
          />
          <AssignmentList
            title="User-specific overrides"
            hint="Use an authenticated Supabase user ID as the key. These assignments take priority over role and default URLs."
            rows={draft.eod.userUrls}
            disabled={!isAdmin}
            onAdd={addUser}
            onRemove={removeUser}
            onUpdate={updateUser}
          />

          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-4">
            <div className="flex items-center gap-2 text-3xs text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" />
              Private Typeform/API credentials stay out of the browser and repository.
            </div>
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
                Save assignments
              </Button>
            ) : (
              <span className="text-2xs text-muted-foreground">
                Only workspace owners and admins can change these.
              </span>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function AssignmentList({
  title,
  hint,
  rows,
  suggestedKeys = [],
  disabled,
  onAdd,
  onRemove,
  onUpdate,
}: {
  title: string;
  hint: string;
  rows: Record<string, string>;
  suggestedKeys?: readonly string[];
  disabled: boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onUpdate: (oldKey: string, key: string, url: string) => void;
}) {
  const visibleRows = {
    ...Object.fromEntries(suggestedKeys.map((key) => [key, rows[key] ?? ""])),
    ...rows,
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </div>
          <p className="mt-0.5 text-3xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-2xs"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>
      {Object.entries(visibleRows).length === 0 && (
        <div className="rounded-md border border-dashed border-border p-3 text-2xs italic text-muted-foreground">
          No assignments configured.
        </div>
      )}
      <div className="space-y-2">
        {Object.entries(visibleRows).map(([key, url]) => (
          <div key={key} className="grid gap-2 sm:grid-cols-[0.65fr_1.35fr_auto]">
            {suggestedKeys.includes(key) ? (
              <div className="flex min-h-9 items-center rounded-md border border-border bg-muted/20 px-3 text-sm font-medium">
                {key === "dm_setter"
                  ? "DM Setter"
                  : key === "inbound_dialer"
                    ? "Inbound Dialer"
                    : key === "closer"
                      ? "Closer"
                      : key}
              </div>
            ) : (
              <Input
                value={key}
                disabled={disabled}
                aria-label={`${title} key`}
                onChange={(e) => onUpdate(key, e.target.value, url)}
              />
            )}
            <Input
              value={url}
              disabled={disabled}
              aria-label={`${title} URL`}
              placeholder="https://form.typeform.com/to/..."
              onChange={(e) => onUpdate(key, key, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-destructive"
              disabled={disabled}
              onClick={() => onRemove(key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
