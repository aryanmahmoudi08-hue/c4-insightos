import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { PermissionEditor, type PermValue } from "@/components/permission-editor";
import {
  RESOURCES,
  ROLES,
  ROLE_LABELS,
  ROLE_BLURBS,
  defaultPerm,
  type ManagedRole,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/_authenticated/permissions")({ component: Permissions });

type Perm = { role: string; resource: string; can_view: boolean; can_edit: boolean };
type Draft = Record<string, PermValue>;

const MOCK_KEY = "c4-dev-bypass-role-permissions";

/** Dev bypass has no real membership row, so any write to role_permissions gets
 * rejected by RLS — SAVED (not draft) dev-bypass edits live in sessionStorage
 * instead of a bare useState, so they survive a tab remount or page refresh
 * within the session, the same way a real save would. */
function loadMockPerms(): Perm[] {
  try {
    const raw = sessionStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as Perm[]) : [];
  } catch {
    return [];
  }
}

function saveMockPerms(perms: Perm[]) {
  try {
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(perms));
  } catch {
    /* ignore */
  }
}

function Permissions() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const { isAdmin } = useRole();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [role, setRole] = useState<ManagedRole>("setter");

  const [mockPerms, setMockPerms] = useState<Perm[]>(() => (devBypass ? loadMockPerms() : []));

  const { data: perms } = useQuery({
    queryKey: ["role-permissions", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("role_permissions")
        .select("role, resource, can_view, can_edit")
        .eq("org_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Perm[];
    },
  });

  const savedPerms = useMemo(
    () => (devBypass ? mockPerms : (perms ?? [])),
    [devBypass, mockPerms, perms],
  );

  // The last-SAVED value for the selected role, as a resource → value map —
  // this is what "Revert to original" reverts to, and what draft is diffed
  // against to decide whether anything is unsaved.
  const baseline = useMemo<Draft>(() => {
    const map: Draft = {};
    for (const p of savedPerms) {
      if (p.role !== role) continue;
      map[p.resource] = { can_view: p.can_view, can_edit: p.can_edit };
    }
    return map;
  }, [savedPerms, role]);

  const [draft, setDraft] = useState<Draft>(baseline);

  // Re-sync the draft whenever the selected role changes, or the saved data
  // underneath it changes (initial load, or right after a successful save) —
  // never on every keystroke/toggle, since draft is the source of truth
  // while editing.
  useEffect(() => {
    setDraft(baseline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, savedPerms]);

  const dirty = useMemo(() => {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(draft)]);
    for (const k of keys) {
      const a = baseline[k] ?? defaultPerm(role, k);
      const b = draft[k] ?? defaultPerm(role, k);
      if (a.can_view !== b.can_view || a.can_edit !== b.can_edit) return true;
    }
    return false;
  }, [baseline, draft, role]);

  const getPerm = (resource: string): PermValue => draft[resource] ?? defaultPerm(role, resource);

  const save = useMutation({
    mutationFn: async () => {
      const changed = Object.keys(draft).filter((resource) => {
        const a = baseline[resource] ?? defaultPerm(role, resource);
        const b = draft[resource];
        return a.can_view !== b.can_view || a.can_edit !== b.can_edit;
      });
      if (changed.length === 0) return;
      if (devBypass) {
        const next = [...mockPerms];
        for (const resource of changed) {
          const row: Perm = { role, resource, ...draft[resource] };
          const idx = next.findIndex((x) => x.role === role && x.resource === resource);
          if (idx >= 0) next[idx] = row;
          else next.push(row);
        }
        setMockPerms(next);
        saveMockPerms(next);
        return;
      }
      const payload = changed.map((resource) => ({
        org_id: orgId!,
        role,
        resource,
        ...draft[resource],
      }));
      const { error } = await (supabase as any)
        .from("role_permissions")
        .upsert(payload, { onConflict: "org_id,role,resource" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access changes saved");
      if (!devBypass) qc.invalidateQueries({ queryKey: ["role-permissions", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revert = () => setDraft(baseline);

  if (!isAdmin) {
    return (
      <>
        <TopBar title="Access control" subtitle="Admin only" />
        <div className="p-6">
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">
              Only owners and admins can manage access.
            </div>
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
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                if (dirty) {
                  toast.error("Save or revert your changes before switching roles.");
                  return;
                }
                setRole(r);
              }}
              disabled={dirty && r !== role}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                role === r
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              {ROLE_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="rounded-md border border-border bg-card/40 px-4 py-3">
          <div className="text-sm font-medium">{ROLE_LABELS[role]}</div>
          <div className="mt-0.5 text-2xs text-muted-foreground">{ROLE_BLURBS[role]}</div>
        </div>

        <PermissionEditor
          note={
            devBypass
              ? "Dev bypass active — saved changes are held in this browser tab's session (survive refresh, not a new tab) and are not written to Supabase."
              : "Owners always keep full access. Person-level overrides (Team → Access) beat these role defaults."
          }
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
      </div>
    </>
  );
}
