import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { PermissionEditor, type PermValue } from "@/components/permission-editor";
import { RESOURCES, defaultPerm } from "@/lib/permissions";

type Perm = { resource: string; can_view: boolean; can_edit: boolean };

export function MemberPermissionsDialog({ open, onOpenChange, userId, displayName, role = "viewer" }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; displayName: string; role?: string;
}) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();

  const { data: perms } = useQuery({
    queryKey: ["member-permissions", orgId, userId],
    enabled: !!orgId && !!userId && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("member_permissions")
        .select("resource, can_view, can_edit")
        .eq("org_id", orgId!)
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as Perm[];
    },
  });

  const getPerm = (res: string): PermValue => {
    const found = perms?.find(p => p.resource === res);
    return found ? { can_view: found.can_view, can_edit: found.can_edit } : defaultPerm(role, res);
  };

  const setPerm = useMutation({
    mutationFn: async (rows: Perm[]) => {
      const payload = rows.map(p => ({ org_id: orgId!, user_id: userId!, resource: p.resource, can_view: p.can_view, can_edit: p.can_edit }));
      const { error } = await (supabase as any).from("member_permissions").upsert(payload, { onConflict: "org_id,user_id,resource" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-permissions", orgId, userId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("member_permissions").delete().eq("org_id", orgId!).eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["member-permissions", orgId, userId] }); toast.success("Reset to role defaults"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-4 w-4" /> Access · {displayName}</DialogTitle>
        </DialogHeader>
        <PermissionEditor
          note={`Person-level overrides. Anything you don't touch follows the "${role.replace(/_/g, " ")}" role defaults. Overrides always win over role settings.`}
          getPerm={getPerm}
          onChange={(resource, next) => setPerm.mutate([{ resource, ...next }])}
          onBulk={(next) => setPerm.mutate(RESOURCES.map(r => ({ resource: r.key, ...next })))}
        />
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={() => reset.mutate()}>Reset to role defaults</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
