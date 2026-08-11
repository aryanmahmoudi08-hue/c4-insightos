import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Power, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";

type RoleKey = "dm_setter" | "inbound_dialer" | "closer";
type Member = { id: string; name: string; role: RoleKey; active: boolean; created_at: string };

const ROLES: { value: RoleKey; label: string; accent: string }[] = [
  { value: "dm_setter", label: "DM Setter", accent: CHIP_TONE_CLASSES.default },
  { value: "inbound_dialer", label: "Inbound Dialer", accent: CHIP_TONE_CLASSES.info },
  { value: "closer", label: "Closer", accent: CHIP_TONE_CLASSES.success },
];

export function TeamRosterPanel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleKey>("dm_setter");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOver, setDragOver] = useState<RoleKey | null>(null);

  const { data: members } = useQuery({
    queryKey: ["team_members_all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as never)
        .select("id, name, role, active, created_at")
        .eq("org_id", orgId!)
        .order("role").order("name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["team_members_all"] });
    qc.invalidateQueries({ queryKey: ["team_members"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Name required");
      const { error } = await supabase.from("team_members" as never).insert({ org_id: orgId!, name: clean, role } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Added"); setName(""); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async (m: Member) => {
      const { error } = await supabase.from("team_members" as never).update({ active: !m.active } as never).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const updateMember = useMutation({
    mutationFn: async (vars: { id: string; patch: { name?: string; role?: RoleKey } }) => {
      const { error } = await supabase.from("team_members" as never).update(vars.patch as never).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const onDropToRole = (targetRole: RoleKey) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const m = (members ?? []).find(x => x.id === id);
    if (!m || m.role === targetRole) return;
    updateMember.mutate({ id, patch: { role: targetRole } });
    toast.success(`Moved to ${ROLES.find(r => r.value === targetRole)?.label}`);
  };

  const grouped = ROLES.map(r => ({ ...r, list: (members ?? []).filter(m => m.role === r.value) }));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider">Roster — Closers, Setters & Dialers</div>
        <div className="text-2xs text-muted-foreground">{members?.length ?? 0} total · drag cards between columns to reassign</div>
      </div>
      <form className="flex gap-2 p-3 border-b border-border bg-muted/10" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Input placeholder="Full name…" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Select value={role} onValueChange={(v) => setRole(v as RoleKey)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={add.isPending}><Plus className="h-4 w-4" />Add</Button>
      </form>

      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {grouped.map(g => (
          <div
            key={g.value}
            onDragOver={(e) => { e.preventDefault(); setDragOver(g.value); }}
            onDragLeave={() => setDragOver(prev => prev === g.value ? null : prev)}
            onDrop={onDropToRole(g.value)}
            className={`p-3 space-y-2 transition-colors ${dragOver === g.value ? "bg-accent/10" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className={`rounded px-1.5 py-0.5 text-3xs uppercase tracking-wide ${g.accent}`}>{g.label}</span>
              <span className="text-2xs text-muted-foreground">{g.list.length}</span>
            </div>
            <div className="space-y-1 min-h-[40px]">
              {g.list.map(m => {
                const isEditing = editingId === m.id;
                return (
                  <div
                    key={m.id}
                    draggable={!isEditing}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", m.id)}
                    className={`flex items-center gap-1.5 rounded-md border border-border/50 px-2 py-1.5 text-sm bg-background ${m.active ? "" : "opacity-50"} ${isEditing ? "" : "cursor-grab active:cursor-grabbing hover:border-primary/40"}`}
                  >
                    {!isEditing && <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    {isEditing ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editName.trim()) updateMember.mutate({ id: m.id, patch: { name: editName.trim() } });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                        <button type="button" className="text-[color:var(--color-success)]" title="Save"
                          onClick={() => editName.trim() && updateMember.mutate({ id: m.id, patch: { name: editName.trim() } })}>
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="text-muted-foreground" title="Cancel" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate font-medium">{m.name}</span>
                        <button type="button" className="text-muted-foreground hover:text-foreground" title="Edit name"
                          onClick={() => { setEditName(m.name); setEditingId(m.id); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-foreground" title={m.active ? "Deactivate" : "Activate"} onClick={() => toggle.mutate(m)}>
                          <Power className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-destructive" title="Remove" onClick={() => { if (confirm(`Remove ${m.name}?`)) remove.mutate(m.id); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
              {g.list.length === 0 && <div className="text-2xs text-muted-foreground italic px-1 py-2">Drop here…</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
