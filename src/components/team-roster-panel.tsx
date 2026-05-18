import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Member = { id: string; name: string; role: string; active: boolean; created_at: string };

const ROLES: { value: "dm_setter" | "inbound_dialer" | "closer"; label: string; accent: string }[] = [
  { value: "dm_setter", label: "DM Setter", accent: "bg-primary/15 text-primary" },
  { value: "inbound_dialer", label: "Inbound Dialer", accent: "bg-accent/15 text-accent" },
  { value: "closer", label: "Closer", accent: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]" },
];

export function TeamRosterPanel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]["value"]>("dm_setter");

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

  const add = useMutation({
    mutationFn: async () => {
      const clean = name.trim();
      if (!clean) throw new Error("Name required");
      const { error } = await supabase.from("team_members" as never).insert({ org_id: orgId!, name: clean, role } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Added"); setName(""); qc.invalidateQueries({ queryKey: ["team_members_all"] }); qc.invalidateQueries({ queryKey: ["team_members"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggle = useMutation({
    mutationFn: async (m: Member) => {
      const { error } = await supabase.from("team_members" as never).update({ active: !m.active } as never).eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["team_members_all"] }); qc.invalidateQueries({ queryKey: ["team_members"] }); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["team_members_all"] }); qc.invalidateQueries({ queryKey: ["team_members"] }); },
  });

  const grouped = ROLES.map(r => ({ ...r, list: (members ?? []).filter(m => m.role === r.value) }));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider">Roster — Closers, Setters & Dialers</div>
        <div className="text-[11px] text-muted-foreground">{members?.length ?? 0} total</div>
      </div>
      <form className="flex gap-2 p-3 border-b border-border bg-muted/10" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Input placeholder="Full name…" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={add.isPending}><Plus className="h-4 w-4" />Add</Button>
      </form>

      <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {grouped.map(g => (
          <div key={g.value} className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${g.accent}`}>{g.label}</span>
              <span className="text-[11px] text-muted-foreground">{g.list.length}</span>
            </div>
            <div className="space-y-1">
              {g.list.map(m => (
                <div key={m.id} className={`flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm ${m.active ? "" : "opacity-50"}`}>
                  <span className="flex-1 truncate font-medium">{m.name}</span>
                  <button type="button" className="text-muted-foreground hover:text-foreground" title={m.active ? "Deactivate" : "Activate"} onClick={() => toggle.mutate(m)}><Power className="h-3.5 w-3.5" /></button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" title="Remove" onClick={() => { if (confirm(`Remove ${m.name}?`)) remove.mutate(m.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {g.list.length === 0 && <div className="text-[11px] text-muted-foreground italic px-1 py-2">None yet.</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
