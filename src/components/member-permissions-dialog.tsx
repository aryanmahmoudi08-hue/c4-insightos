import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { PermissionEditor, type PermValue } from "@/components/permission-editor";
import { RESOURCES, defaultPerm } from "@/lib/permissions";

type Perm = { resource: string; can_view: boolean; can_edit: boolean };
type Draft = Record<string, PermValue>;

/** Dev bypass has no real membership row, so a write to member_permissions
 * gets rejected by RLS — saved dev-bypass overrides live in sessionStorage,
 * keyed per user, so they survive a remount/refresh instead of silently
 * failing and appearing to "revert." */
function mockKey(userId: string) {
  return `c4-dev-bypass-member-permissions:${userId}`;
}
function loadMock(userId: string): Perm[] {
  try {
    const raw = sessionStorage.getItem(mockKey(userId));
    return raw ? (JSON.parse(raw) as Perm[]) : [];
  } catch {
    return [];
  }
}
function saveMock(userId: string, rows: Perm[]) {
  try {
    sessionStorage.setItem(mockKey(userId), JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export function MemberPermissionsDialog({
  open,
  onOpenChange,
  userId,
  displayName,
  role = "viewer",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId: string | null;
  displayName: string;
  role?: string;
}) {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const qc = useQueryClient();

  const { data: perms } = useQuery({
    queryKey: ["member-permissions", orgId, userId],
    enabled: !!orgId && !!userId && open && !devBypass,
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

  // Real React state (not re-derived from sessionStorage on every render) so
  // a dev-bypass save updates baseline/dirty immediately, the same way a
  // real save updating react-query's cache does.
  const [mockPerms, setMockPerms] = useState<Perm[]>([]);
  useEffect(() => {
    if (devBypass && open && userId) setMockPerms(loadMock(userId));
  }, [devBypass, open, userId]);

  const savedPerms = useMemo(
    () => (devBypass ? mockPerms : (perms ?? [])),
    [devBypass, mockPerms, perms],
  );

  const baseline = useMemo<Draft>(() => {
    const map: Draft = {};
    for (const p of savedPerms) map[p.resource] = { can_view: p.can_view, can_edit: p.can_edit };
    return map;
  }, [savedPerms]);

  const [draft, setDraft] = useState<Draft>(baseline);

  // Re-sync whenever the dialog opens for a (possibly different) person, or
  // the saved data underneath changes (initial load / right after a save).
  useEffect(() => {
    if (open) setDraft(baseline);
  }, [open, baseline]);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
    for (const k of keys) {
      const a = baseline[k] ?? defaultPerm(role, k);
      const b = draft[k] ?? defaultPerm(role, k);
      if (a.can_view !== b.can_view || a.can_edit !== b.can_edit) return true;
    }
    return false;
  }, [baseline, draft, role]);

  const getPerm = (res: string): PermValue => draft[res] ?? defaultPerm(role, res);

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      // Anything that now matches the role default is a real "no override"
      // state and should be DELETED (not upserted with the default value),
      // so it keeps tracking the role default if that ever changes later —
      // this is what makes "Reset to role defaults" below a real, persisted
      // action instead of just a local clear.
      const toUpsert: Perm[] = [];
      const toDelete: string[] = [];
      const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
      for (const resource of keys) {
        const def = defaultPerm(role, resource);
        const value = draft[resource] ?? def;
        const wasOverridden = resource in baseline;
        const isDefault = value.can_view === def.can_view && value.can_edit === def.can_edit;
        if (isDefault) {
          if (wasOverridden) toDelete.push(resource);
        } else {
          toUpsert.push({ resource, ...value });
        }
      }
      if (toUpsert.length === 0 && toDelete.length === 0) return;

      if (devBypass) {
        let next = loadMock(userId);
        next = next.filter((p) => !toDelete.includes(p.resource));
        for (const p of toUpsert) {
          const idx = next.findIndex((x) => x.resource === p.resource);
          if (idx >= 0) next[idx] = p;
          else next.push(p);
        }
        saveMock(userId, next);
        setMockPerms(next);
        return;
      }

      if (toUpsert.length > 0) {
        const payload = toUpsert.map((p) => ({ org_id: orgId!, user_id: userId!, ...p }));
        const { error } = await (supabase as any)
          .from("member_permissions")
          .upsert(payload, { onConflict: "org_id,user_id,resource" });
        if (error) throw error;
      }
      if (toDelete.length > 0) {
        const { error } = await (supabase as any)
          .from("member_permissions")
          .delete()
          .eq("org_id", orgId!)
          .eq("user_id", userId!)
          .in("resource", toDelete);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Access changes saved");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["member-permissions", orgId, userId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = () => setDraft(baseline);
  const resetToDefaults = () => setDraft({});

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && dirty) {
          toast.error("Save or revert your changes before closing.");
          return;
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4" /> Access · {displayName}
          </DialogTitle>
        </DialogHeader>
        <PermissionEditor
          note={`Person-level overrides. Anything you don't touch follows the "${role.replace(/_/g, " ")}" role defaults. Overrides always win over role settings.${devBypass ? " Dev bypass active — saved changes are held in this browser tab's session and are not written to Supabase." : ""}`}
          getPerm={getPerm}
          onChange={(resource, next) => setDraft((d) => ({ ...d, [resource]: next }))}
          onBulk={(next) => {
            const nextDraft: Draft = { ...draft };
            for (const r of RESOURCES) nextDraft[r.key] = next;
            setDraft(nextDraft);
          }}
          dirty={dirty}
          saving={save.isPending}
          onSave={() => save.mutate()}
          onRevert={revert}
        />
        <div className="flex justify-between pt-2">
          <Button variant="ghost" size="sm" disabled={save.isPending} onClick={resetToDefaults}>
            Reset to role defaults
          </Button>
          <Button size="sm" variant="outline" disabled={dirty} onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
