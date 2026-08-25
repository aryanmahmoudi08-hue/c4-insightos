import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { PageHero } from "@/components/page-hero";
import { EodStepFlow, type EodLeadOption } from "@/components/eod-step-flow";
import { autoIngestCallSignalFn } from "@/lib/content-signals.functions";
import {
  DM_SETTER_EOD_SCHEMA, INBOUND_DIALER_EOD_SCHEMA, CLOSER_EOD_SCHEMA,
  buildSetterActivityPayload, buildCallPayload, buildObjectionRows,
  type EodValues,
} from "@/lib/eod-reports";
import type { ActivityRole } from "@/components/activity-module";
import { ClipboardCheck, MessageSquare, PhoneIncoming, PhoneCall, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type EodRole = "dm_setter" | "inbound_dialer" | "closer";
const VALID_ROLES: EodRole[] = ["dm_setter", "inbound_dialer", "closer"];

export const Route = createFileRoute("/_authenticated/eod-reports")({
  component: EodReportsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    role: (VALID_ROLES.includes(s.role as EodRole) ? (s.role as EodRole) : undefined),
  }),
});

const ROLE_CARDS: { role: EodRole; title: string; blurb: string; icon: typeof MessageSquare }[] = [
  { role: "dm_setter", title: "DM Setter EOD", blurb: "Outreach, qualified convos, sets and cash for the day.", icon: MessageSquare },
  { role: "inbound_dialer", title: "Dialer EOD", blurb: "Dials, connections, sets and cash for the day.", icon: PhoneIncoming },
  { role: "closer", title: "Closer EOD", blurb: "Log a single call — status, cash collected, objections.", icon: PhoneCall },
];

function EodReportsPage() {
  const { role } = Route.useSearch();
  const nav = Route.useNavigate();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const autoIngest = useServerFn(autoIngestCallSignalFn);

  const { data: leadListRaw } = useQuery({
    queryKey: ["leads-min", orgId],
    enabled: !!orgId && role === "closer",
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("id, full_name, handle, email").eq("org_id", orgId!).limit(200);
      return data ?? [];
    },
  });
  const leadOptions: EodLeadOption[] = (leadListRaw ?? []).map((l) => ({ id: l.id, label: l.full_name || l.handle || l.id.slice(0, 6), email: l.email }));

  const goRole = (r: EodRole | undefined) => nav({ search: { role: r }, replace: true });

  const submitActivity = async (activityRole: ActivityRole, values: EodValues) => {
    if (!orgId) throw new Error("No workspace");
    const payload = buildSetterActivityPayload(activityRole, orgId, values);
    if (!payload.team_member_name) { toast.error("Team member name required"); throw new Error("Team member name required"); }
    const { error } = await supabase.from("setter_activity").insert(payload);
    if (error) { toast.error(error.message); throw error; }
    toast.success("Activity logged");
    qc.invalidateQueries({ queryKey: ["activity", activityRole] });
  };

  const submitCall = async (values: EodValues) => {
    if (!orgId) throw new Error("No workspace");
    const payload = buildCallPayload(orgId, values);
    const { data: callRow, error } = await supabase.from("calls").insert(payload).select("id").single();
    if (error) { toast.error(error.message); throw error; }

    const objRows = buildObjectionRows(orgId, callRow.id, values.objections, payload.closed);
    if (objRows.length) await supabase.from("call_objections").insert(objRows);

    // Same best-effort AI screening the "Log call" dialog runs — never blocks
    // "call logged" if it fails or isn't configured.
    if (payload.call_summary && !devBypass) {
      autoIngest({ data: {
        call_id: callRow?.id ?? null,
        closer_name: payload.closer_name || "Unknown",
        call_date: payload.scheduled_for ? payload.scheduled_for.slice(0, 10) : undefined,
        call_summary: payload.call_summary,
        lead_id: payload.lead_id,
      } }).catch((e) => console.warn("Auto setter-signal screening failed", e));
    }

    toast.success("Call logged");
    qc.invalidateQueries({ queryKey: ["calls"] });
    qc.invalidateQueries({ queryKey: ["call-objections"] });
  };

  const schemaFor = (r: EodRole) => (r === "dm_setter" ? DM_SETTER_EOD_SCHEMA : r === "inbound_dialer" ? INBOUND_DIALER_EOD_SCHEMA : CLOSER_EOD_SCHEMA);
  const titleFor = (r: EodRole) => ROLE_CARDS.find((c) => c.role === r)!.title;

  return (
    <>
      <TopBar title="EOD Reports" subtitle="One question at a time — DM Setter, Dialer and Closer daily logs." />
      <div className="p-4 md:p-6 space-y-4">
        <PageHero
          icon={<ClipboardCheck className="h-5 w-5" />}
          eyebrow="Sales Tracking"
          title="EOD Reports"
          subtitle="Pick your role, then answer one question at a time — this is the primary way to log your day."
        />

        {!role ? (
          <div className="grid gap-4 sm:grid-cols-3">
            {ROLE_CARDS.map((c) => (
              <button
                key={c.role}
                type="button"
                onClick={() => goRole(c.role)}
                className="hover-lift group relative overflow-hidden rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/20"
              >
                <div className="glass-highlight pointer-events-none absolute inset-0 rounded-xl" />
                <div className="relative">
                  <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background/40">
                    <c.icon className="h-5 w-5 text-accent" />
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-base font-semibold">
                    {c.title}
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.blurb}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EodStepFlow
            key={role}
            title={titleFor(role)}
            subtitle={titleFor(role)}
            schema={schemaFor(role)}
            leadOptions={role === "closer" ? leadOptions : undefined}
            onSubmit={role === "closer" ? submitCall : (values) => submitActivity(role, values)}
            onExit={() => goRole(undefined)}
          />
        )}
      </div>
    </>
  );
}
