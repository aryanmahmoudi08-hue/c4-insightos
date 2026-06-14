import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { Fragment } from "react";

export const Route = createFileRoute("/_authenticated/permissions")({ component: Permissions });

const RESOURCES = [
  { key: "dashboard", label: "Main Hub" },
  { key: "leads", label: "Leads CRM" },
  { key: "outreach", label: "Email / SMS" },
  { key: "team", label: "Team Members" },
  { key: "hiring", label: "Hiring" },
  { key: "attribution", label: "Attribution" },
  { key: "traffic", label: "Traffic" },
  { key: "dm_setter", label: "DM Setter" },
  { key: "inbound_dialer", label: "Inbound Dialer" },
  { key: "closer", label: "Closer" },
  { key: "copy", label: "CopyOS" },
  { key: "content", label: "Content Tracker" },
  { key: "sequences", label: "Story Sequences" },
  { key: "clients", label: "Clients" },
  { key: "onboarding", label: "Onboarding" },
  { key: "fulfillment", label: "Client Results / Wins" },
  { key: "insights", label: "AI Insights" },
  { key: "events", label: "Event Bus" },
  { key: "connectors", label: "Connectors" },
];

const ROLES = ["admin", "sales_manager", "growth_ops", "setter", "closer", "viewer"] as const;

type Perm = { id?: string; role: string; resource: string; can_view: boolean; can_edit: boolean };

function Permissions() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const orgId = org?.org_id;
  const qc = useQueryClient();

  const { data: perms } = useQuery({
    queryKey: ["role-permissions", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("role_permissions").select("id, role, resource, can_view, can_edit").eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Perm[];
    },
  });

  const findPerm = (role: string, resource: string): Perm => {
    const found = (perms ?? []).find(p => p.role === role && p.resource === resource);
    return found ?? {
      role, resource,
      can_view: !(role === "viewer" || role === "setter" || role === "closer"),
      can_edit: role === "admin" || role === "sales_manager",
    };
  };

  const setPerm = useMutation({
    mutationFn: async (p: Perm) => {
      const payload = { org_id: orgId!, role: p.role, resource: p.resource, can_view: p.can_view, can_edit: p.can_edit };
      const { error } = await (supabase as any).from("role_permissions").upsert(payload, { onConflict: "org_id,role,resource" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["role-permissions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <>
        <TopBar title="Permissions" subtitle="Admin only" />
        <div className="p-6">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldAlert className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <div className="text-sm text-muted-foreground">Only owners and admins can manage role permissions.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Permissions" subtitle="Control what each role can view and edit" />
      <div className="p-6 space-y-3">
        <div className="text-xs text-muted-foreground">Owners always have full access. Changes save instantly.</div>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
              <tr>
                <th className="text-left p-2.5 sticky left-0 bg-muted/40 z-10 min-w-[180px]">Resource</th>
                {ROLES.map(r => <th key={r} className="text-center p-2.5 min-w-[160px]" colSpan={2}>{r.replace(/_/g, " ")}</th>)}
              </tr>
              <tr className="border-t border-border">
                <th className="sticky left-0 bg-muted/40 z-10" />
                {ROLES.map(r => (
                  <Fragment key={`h-${r}`}>
                    <th className="text-center p-1.5 font-normal text-muted-foreground">View</th>
                    <th className="text-center p-1.5 font-normal text-muted-foreground">Edit</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map(res => (
                <tr key={res.key} className="border-t border-border hover:bg-muted/20">
                  <td className="p-2.5 font-medium sticky left-0 bg-card z-10">{res.label}</td>
                  {ROLES.map(r => {
                    const p = findPerm(r, res.key);
                    return (
                      <Fragment key={`${r}-${res.key}`}>
                        <td className="text-center p-1.5">
                          <Checkbox checked={p.can_view} onCheckedChange={(c) => setPerm.mutate({ ...p, can_view: !!c, can_edit: !c ? false : p.can_edit })} />
                        </td>
                        <td className="text-center p-1.5">
                          <Checkbox checked={p.can_edit} disabled={!p.can_view} onCheckedChange={(c) => setPerm.mutate({ ...p, can_edit: !!c })} />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
