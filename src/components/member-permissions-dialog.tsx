import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield } from "lucide-react";

const RESOURCES = [
  { key: "dashboard", label: "Main Hub" },
  { key: "leads", label: "Leads CRM" },
  { key: "outreach", label: "Messaging (Email & SMS)" },
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
  { key: "fulfillment", label: "Client Results" },
  { key: "insights", label: "AI Insights" },
  { key: "events", label: "Event Bus" },
  { key: "connectors", label: "Connectors" },
];

type Perm = { resource: string; can_view: boolean; can_edit: boolean };

export function MemberPermissionsDialog({ open, onOpenChange, userId, displayName }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; displayName: string;
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

  const find = (res: string): Perm => perms?.find(p => p.resource === res) ?? { resource: res, can_view: true, can_edit: false };

  const setPerm = useMutation({
    mutationFn: async (p: Perm) => {
      const { error } = await (supabase as any).from("member_permissions").upsert(
        { org_id: orgId!, user_id: userId!, resource: p.resource, can_view: p.can_view, can_edit: p.can_edit },
        { onConflict: "org_id,user_id,resource" }
      );
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
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-4 w-4 text-accent" /> Permissions · {displayName}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">
          Overrides for this person only. Unchecked rows fall back to their role's defaults.
        </div>
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 uppercase tracking-wider text-[10px] text-muted-foreground">
              <tr><th className="text-left p-2.5">Section</th><th className="text-center p-2.5 w-20">View</th><th className="text-center p-2.5 w-20">Edit</th></tr>
            </thead>
            <tbody>
              {RESOURCES.map(r => {
                const p = find(r.key);
                return (
                  <tr key={r.key} className="border-t border-border">
                    <td className="p-2.5 font-medium">{r.label}</td>
                    <td className="p-2.5 text-center">
                      <Checkbox checked={p.can_view} onCheckedChange={(c) => setPerm.mutate({ ...p, can_view: !!c, can_edit: !c ? false : p.can_edit })} />
                    </td>
                    <td className="p-2.5 text-center">
                      <Checkbox checked={p.can_edit} disabled={!p.can_view} onCheckedChange={(c) => setPerm.mutate({ ...p, can_edit: !!c })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" onClick={() => reset.mutate()}>Reset to role defaults</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
