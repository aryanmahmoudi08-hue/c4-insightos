import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RolePicker } from "@/components/role-picker";
import {
  ASSIGNABLE_ROLES,
  allRoles,
  isRepRole,
  rolesLabel,
  splitRoles,
  type AppRole,
} from "@/lib/permissions";

/**
 * Change a member's roles after they joined: add a role (a closer who starts
 * dialing) or take one away. Saved through set_member_roles, which also
 * opens or retires their DM setter / dialer / closer seat on the roster.
 */
export function MemberRolesDialog({
  open,
  onOpenChange,
  orgId,
  member,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgId: string;
  member: { userId: string; name: string; role: string; additionalRoles: string[] } | null;
  isSelf: boolean;
}) {
  const qc = useQueryClient();
  const [roles, setRoles] = useState<AppRole[]>([]);
  useEffect(() => {
    if (member) setRoles(allRoles(member.role, member.additionalRoles));
  }, [member]);

  const isOwner = member?.role === "owner";
  // The owner keeps "owner"; only their extra sales roles can change. Your own
  // main role is locked too, so nobody removes their own admin access.
  const lockedPrimary = isOwner || isSelf ? (member?.role as AppRole) : null;
  const options = lockedPrimary
    ? (["setter", "inbound_dialer", "closer"] as AppRole[])
    : ASSIGNABLE_ROLES;
  const picked = lockedPrimary ? roles.filter((r) => r !== lockedPrimary) : roles;
  const split: ReturnType<typeof splitRoles> = lockedPrimary
    ? { ok: true, primary: lockedPrimary, additional: picked.filter(isRepRole) }
    : splitRoles(roles);

  const save = useMutation({
    mutationFn: async () => {
      if (!member) return;
      if (!split.ok) throw new Error(split.error);
      // set_member_roles is ahead of the generated types (20261120090000).
      const { error } = await supabase.rpc(
        "set_member_roles" as never,
        {
          _org_id: orgId,
          _user_id: member.userId,
          _role: split.primary,
          _additional_roles: split.additional,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Roles updated");
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["team_members_all"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
      qc.invalidateQueries({ queryKey: ["access-audit-log"] });
      qc.invalidateQueries({ queryKey: ["current-org"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update roles"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Roles for {member?.name}
          </DialogTitle>
          <DialogDescription>
            Someone with several roles sees every page any of them can see, and gets a roster seat
            for each sales role. Removing a sales role retires that seat; their past numbers stay.
          </DialogDescription>
        </DialogHeader>
        {lockedPrimary && (
          <p className="text-xs text-muted-foreground">
            {isOwner ? "The owner stays owner." : "You can't change your own main role."} Extra
            sales roles can still be added or removed.
          </p>
        )}
        <RolePicker
          value={picked}
          onChange={(next) => setRoles(lockedPrimary ? [lockedPrimary, ...next] : next)}
          options={options}
        />
        <div className="text-xs">
          <span className="text-muted-foreground">Will be: </span>
          <span className="font-medium">
            {split.ok ? rolesLabel([split.primary, ...split.additional]) : split.error}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!split.ok || save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save roles
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
