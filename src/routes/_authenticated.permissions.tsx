import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { PermissionEditor, type PermValue } from "@/components/permission-editor";
import { RESOURCES, ROLES, ROLE_LABELS, ROLE_BLURBS, defaultPerm, type ManagedRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/permissions")({ component: Permissions });

type Perm = { role: string; resource: string; can_view: boolean; can_edit: boolean };

function Permissions() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const { isAdmin } = useRole();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [role, setRole] = useState<ManagedRole>("setter");

  // Dev bypass has no real membership row, so any write to role_permissions gets rejected by
  // RLS ("new row violates row-level security policy"). Keep edits in local state instead —
  // getPerm/setPerm below already fall back to defaultPerm() for anything not in this list.
  const [mockPerms, setMockPerms] = useState<Perm[]>([]);

  const { data: perms } = useQuery({
    queryKey: ["role-permissions", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions").select("role, resource, can_view, can_edit").eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Perm[];
    },
  });

  const effectivePerms = devBypass ? mockPerms : perms;

  const getPerm = (resource: string): PermValue => {
    const found = (effectivePerms ?? []).find(p => p.role === role && p.resource === resource);
    return found ? { can_view: found.can_view, can_edit: found.can_edit } : defaultPerm(role, resource);
  };

  const setPerm = useMutation({
    mutationFn: async (rows: { resource: string; can_view: boolean; can_edit: boolean }[]) => {
      if (devBypass) {
        setMockPerms(prev => {
          const next = [...prev];
          for (const p of rows) {
            const idx = next.findIndex(x => x.role === role && x.resource === p.resource);
            const row: Perm = { role, resource: p.resource, can_view: p.can_view, can_edit: p.can_edit };
            if (idx >= 0) next[idx] = row; else next.push(row);
          }
          return next;
        });
        return;
      }
      const payload = rows.map(p => ({ org_id: orgId!, role, resource: p.resource, can_view: p.can_view, can_edit: p.can_edit }));
      const { error } = await (supabase as any).from("role_permissions").upsert(payload, { onConflict: "org_id,role,resource" });
      if (error) throw error;
    },
    onSuccess: () => { if (!devBypass) qc.invalidateQueries({ queryKey: ["role-permissions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isAdmin) {
    return (
      <>
        <TopBar title="Access control" subtitle="Admin only" />
        <div className="p-6">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">Only owners and admins can manage access.</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Access control" subtitle="Decide exactly what each role can see and change" />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map(r => (
            <button key={r} onClick={() => setRole(r)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                role === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}>
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="rounded-md border border-border bg-card/40 px-4 py-3">
          <div className="text-sm font-medium">{ROLE_LABELS[role]}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{ROLE_BLURBS[role]}</div>
        </div>

        <PermissionEditor
          note={devBypass
            ? "Dev bypass active — changes are held in memory for this tab only and are not saved to Supabase."
            : "Owners always keep full access. Changes save instantly. Person-level overrides (Team → Access) beat these role defaults."}
          getPerm={getPerm}
          onChange={(resource, next) => setPerm.mutate([{ resource, ...next }])}
          onBulk={(next) => setPerm.mutate(RESOURCES.map(r => ({ resource: r.key, ...next })))}
        />
      </div>
    </>
  );
}
