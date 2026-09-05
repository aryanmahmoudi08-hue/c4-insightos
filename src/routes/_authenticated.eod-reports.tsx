import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/app-sidebar";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, MessageSquare, PhoneIncoming, PhoneCall } from "lucide-react";
import { EodStepFlow } from "@/components/eod-step-flow";
import {
  DM_SETTER_EOD_SCHEMA,
  INBOUND_DIALER_EOD_SCHEMA,
  CLOSER_EOD_SCHEMA,
  buildSetterActivityPayload,
  buildClosureCallPayload,
  type EodValues,
} from "@/lib/eod-reports";
import { eodAccessDeniedMessage, getEodAccessProfileFn } from "@/lib/eod-rbac";
import { toast } from "sonner";

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
    title: "Closer Post-Call",
    blurb: "Log a single call — status, cash collected, recording.",
    icon: PhoneCall,
  },
];

function EodReportsPage() {
  const { role } = Route.useSearch();
  const activeRole: EodRole = role ?? "dm_setter";
  const nav = Route.useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const getAccessProfile = useServerFn(getEodAccessProfileFn);
  const {
    data: accessProfile,
    isLoading: accessLoading,
    isError: accessError,
  } = useQuery({
    queryKey: ["eod-access-profile", orgId, devBypass],
    enabled: !devBypass && !!orgId,
    queryFn: () => getAccessProfile({ data: { orgId: orgId! } }),
  });
  const allowedRoles: EodRole[] = devBypass
    ? [...VALID_ROLES]
    : (accessProfile?.allowedRoles ?? []);
  const canAccessSelected = devBypass || allowedRoles.includes(activeRole);
  const effectiveRole = canAccessSelected ? activeRole : allowedRoles[0];
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
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${selected ? "bg-accent/15 text-foreground ring-1 ring-accent/35" : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"}`}
                >
                  <c.icon className={`h-4 w-4 shrink-0 ${selected ? "text-accent" : ""}`} />
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

        <EodFlowForRole
          key={effectiveRole}
          role={effectiveRole}
          orgId={orgId}
          devBypass={devBypass}
          onExit={() => goRole(undefined)}
        />
      </div>
    </>
  );
}

const ROLE_META: Record<EodRole, { title: string; subtitle: string }> = {
  dm_setter: { title: "DM Setter EOD", subtitle: "One question at a time" },
  inbound_dialer: { title: "Dialer EOD", subtitle: "One question at a time" },
  closer: { title: "Closer Post-Call", subtitle: "One question at a time" },
};

function EodFlowForRole({
  role,
  orgId,
  devBypass,
  onExit,
}: {
  role: EodRole;
  orgId: string | undefined;
  devBypass: boolean;
  onExit: () => void;
}) {
  const qc = useQueryClient();
  const schema =
    role === "dm_setter"
      ? DM_SETTER_EOD_SCHEMA
      : role === "inbound_dialer"
        ? INBOUND_DIALER_EOD_SCHEMA
        : CLOSER_EOD_SCHEMA;

  const onSubmit = async (values: EodValues) => {
    if (role === "closer") {
      const payload = buildClosureCallPayload(orgId ?? "", values);
      if (payload === null) {
        // "IGNORE" — the rep explicitly asked for this entry not to be
        // recorded. No calls row is written; the review/submit step still
        // completes so the rep gets a clear confirmation either way.
        toast.info("Marked IGNORE — nothing was recorded.");
        return;
      }
      if (devBypass) return;
      // eod_lead_status isn't in the generated Supabase types yet (new
      // column, see the migration comment).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("calls").insert(payload);
      if (error) throw error;
    } else {
      const payload = buildSetterActivityPayload(role, orgId ?? "", values);
      if (devBypass) return;
      const { error } = await supabase.from("setter_activity").insert(payload);
      if (error) throw error;
    }
    if (!devBypass) {
      // Broad invalidation on a rare, deliberate submit action — every rep
      // dashboard/Main Hub query that reads setter_activity/calls picks up
      // the new row on next view without needing per-page-specific keys
      // threaded through this shared form.
      qc.invalidateQueries();
    }
  };

  return (
    <EodStepFlow
      title={ROLE_META[role].title}
      subtitle={ROLE_META[role].subtitle}
      schema={schema}
      onSubmit={onSubmit}
      onExit={onExit}
    />
  );
}
