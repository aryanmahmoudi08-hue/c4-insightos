import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, MessageSquare, PhoneIncoming, PhoneCall, Link2 } from "lucide-react";
import { EodWorkflowStatus } from "@/components/eod-workflow-status";
import { readDevEodSettings } from "@/lib/workspace-settings.functions";
import {
  eodAccessDeniedMessage,
  getAuthorizedEodSettingsFn,
  getEodAccessProfileFn,
} from "@/lib/eod-rbac";

type EodRole = "dm_setter" | "inbound_dialer" | "closer";
const VALID_ROLES: EodRole[] = ["dm_setter", "inbound_dialer", "closer"];

export const Route = createFileRoute("/_authenticated/eod-reports")({
  component: EodReportsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    role: VALID_ROLES.includes(s.role as EodRole) ? (s.role as EodRole) : undefined,
  }),
});

const ROLE_CARDS: { role: EodRole; title: string; blurb: string; icon: typeof MessageSquare }[] = [
  {
    role: "dm_setter",
    title: "DM Setter EOD",
    blurb: "Outreach, qualified convos, sets and cash for the day.",
    icon: MessageSquare,
  },
  {
    role: "inbound_dialer",
    title: "Dialer EOD",
    blurb: "Dials, connections, sets and cash for the day.",
    icon: PhoneIncoming,
  },
  {
    role: "closer",
    title: "Closer EOD",
    blurb: "Log a single call — status, cash collected, objections.",
    icon: PhoneCall,
  },
];

function EodReportsPage() {
  const { role } = Route.useSearch();
  const activeRole: EodRole = role ?? "dm_setter";
  const nav = Route.useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass, user } = useAuth();
  const getSettings = useServerFn(getAuthorizedEodSettingsFn);
  const getAccessProfile = useServerFn(getEodAccessProfileFn);
  const {
    data: accessProfile,
    isLoading: accessLoading,
    isError: accessError,
  } = useQuery({
    queryKey: ["eod-access-profile", orgId, user?.id, devBypass],
    enabled: !devBypass && !!orgId,
    queryFn: () => getAccessProfile({ data: { orgId: orgId! } }),
  });
  const allowedRoles: EodRole[] = devBypass
    ? [...VALID_ROLES]
    : (accessProfile?.allowedRoles ?? []);
  const canAccessSelected = devBypass || allowedRoles.includes(activeRole);
  const effectiveRole = canAccessSelected ? activeRole : allowedRoles[0];
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass, effectiveRole],
    enabled: (devBypass || (!!orgId && canAccessSelected)) && !!effectiveRole,
    queryFn: () =>
      devBypass
        ? Promise.resolve(readDevEodSettings())
        : getSettings({ data: { orgId: orgId!, eodRole: effectiveRole! } }),
  });
  const goRole = (r: EodRole | undefined) => nav({ search: { role: r }, replace: true });

  if (!devBypass && (accessLoading || (!accessProfile && !accessError))) {
    return <div className="p-6 text-sm text-muted-foreground">Checking EOD access…</div>;
  }
  if (!canAccessSelected || !effectiveRole) {
    return (
      <>
        <TopBar title="EOD Reports" subtitle="Role-restricted daily reporting workflows." />
        <div className="p-4 md:p-6">
          <PageHero
            icon={<ClipboardCheck className="h-5 w-5" />}
            eyebrow="Access restricted"
            title="EOD access restricted"
            subtitle={eodAccessDeniedMessage()}
          />
          {allowedRoles[0] && (
            <Button className="mt-4" onClick={() => goRole(allowedRoles[0])}>
              Open permitted EOD
            </Button>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="EOD Reports"
        subtitle="One question at a time — DM Setter, Dialer and Closer daily logs."
      />
      <div className="p-4 md:p-6 space-y-4">
        <PageHero
          icon={<ClipboardCheck className="h-5 w-5" />}
          eyebrow="Sales Tracking"
          title="EOD Reports"
          subtitle="Pick your role, then answer one question at a time — this is the primary way to log your day."
        />

        <div className="rounded-2xl border border-border/80 bg-card/70 p-2 shadow-sm">
          <div
            className={`grid gap-2 ${allowedRoles.length === 1 ? "sm:grid-cols-1" : allowedRoles.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
          >
            {ROLE_CARDS.filter((c) => allowedRoles.includes(c.role)).map((c) => {
              const selected = c.role === activeRole;
              return (
                <button
                  key={c.role}
                  type="button"
                  onClick={() => goRole(c.role)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${selected ? "bg-spectrum-mid/15 text-foreground ring-1 ring-spectrum-mid/35" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}
                >
                  <c.icon className={`h-4 w-4 shrink-0 ${selected ? "text-spectrum-mid" : ""}`} />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-[0.12em]">
                      {c.title}
                    </span>
                    <span className="mt-0.5 block truncate text-2xs">{c.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <TypeformPlaceholder
          url={
            workspaceSettings?.eod?.userUrls?.[user?.id ?? ""] ||
            workspaceSettings?.eod?.roleUrls?.[effectiveRole] ||
            workspaceSettings?.eod?.defaultUrl ||
            ""
          }
          role={effectiveRole}
        />
        <EodWorkflowStatus
          connected={Boolean(
            workspaceSettings?.eod?.userUrls?.[user?.id ?? ""] ||
            workspaceSettings?.eod?.roleUrls?.[effectiveRole] ||
            workspaceSettings?.eod?.defaultUrl,
          )}
          role={effectiveRole}
        />
      </div>
    </>
  );
}

function TypeformPlaceholder({ url, role }: { url: string; role: EodRole }) {
  const external = Boolean(url);

  return (
    <div className="rounded-2xl border border-dashed border-spectrum-mid/35 bg-card/60 p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-spectrum-mid/15 text-spectrum-mid">
            <Link2 className="h-4 w-4" />
          </div>
          <div>
            <div className="text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Typeform placeholder
            </div>
            <div className="mt-1 text-base font-semibold text-foreground">
              {role.replace(/_/g, " ")} EOD
            </div>
            <div className="mt-1 text-2xs text-muted-foreground">
              Your linked Typeform will appear here when this role is configured.
            </div>
          </div>
        </div>
        {external ? (
          <Button asChild size="sm" className="h-8 text-2xs">
            <a href={url} target="_blank" rel="noopener noreferrer">
              Open Typeform <Link2 className="ml-1 h-3 w-3" />
            </a>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline" className="h-8 text-2xs">
            <a href="/settings">Configure Typeform</a>
          </Button>
        )}
      </div>
      <div className="mt-4 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border bg-background/40 text-center text-2xs text-muted-foreground">
        Typeform will be displayed here
      </div>
    </div>
  );
}
