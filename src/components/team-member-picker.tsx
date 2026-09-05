import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

export type TeamRole = "dm_setter" | "inbound_dialer" | "closer";

interface Props {
  role: TeamRole;
  name: string; // hidden input name submitted with the form
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}

const ADD_NEW = "__add_new__";

const DEV_ROSTER: Record<TeamRole, string[]> = {
  dm_setter: ["Dev Setter"],
  inbound_dialer: ["Dev Dialer"],
  closer: ["Dev Closer"],
};

export function TeamMemberPicker({
  role,
  name,
  value,
  onChange,
  required,
  placeholder = "Select team member",
}: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [internal, setInternal] = useState(value ?? "");
  const selected = value ?? internal;
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  // Dev bypass never has a real Supabase session, so the roster query/insert
  // below would come back RLS-empty — same reasoning as every other
  // interactive workflow in this app. Local names are added to this
  // in-memory list so "Add new" is genuinely usable, not just a dead click.
  const [devRoster, setDevRoster] = useState<string[]>(DEV_ROSTER[role]);

  const { data: realMembers } = useQuery({
    queryKey: ["team_members", orgId, role],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as never)
        .select("id, name")
        .eq("org_id", orgId!)
        .eq("role", role)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const members = devBypass ? devRoster.map((n) => ({ id: n, name: n })) : (realMembers ?? []);

  const add = useMutation({
    mutationFn: async (n: string) => {
      const clean = n.trim();
      if (!clean) throw new Error("Name required");
      if (devBypass) {
        setDevRoster((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
        return clean;
      }
      const { error } = await supabase
        .from("team_members" as never)
        .insert({ org_id: orgId!, role, name: clean } as never);
      if (error) throw error;
      return clean;
    },
    onSuccess: (n) => {
      toast.success(`Added ${n}`);
      if (!devBypass) qc.invalidateQueries({ queryKey: ["team_members", orgId, role] });
      setInternal(n);
      onChange?.(n);
      setNewName("");
      setAdding(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (adding) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Full name"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add.mutate(newName);
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => add.mutate(newName)}
          disabled={add.isPending}
        >
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setAdding(false);
            setNewName("");
          }}
        >
          <X className="h-4 w-4" />
        </Button>
        <input type="hidden" name={name} value={selected} />
      </div>
    );
  }

  return (
    <>
      <Select
        value={selected || undefined}
        onValueChange={(v) => {
          if (v === ADD_NEW) {
            setAdding(true);
            return;
          }
          setInternal(v);
          onChange?.(v);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(members ?? []).map((m) => (
            <SelectItem key={m.id} value={m.name}>
              {m.name}
            </SelectItem>
          ))}
          {(members ?? []).length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet</div>
          )}
          <SelectItem value={ADD_NEW}>
            <span className="flex items-center gap-1.5 text-primary">
              <Plus className="h-3.5 w-3.5" /> Add new
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <input type="hidden" name={name} value={selected} required={required} />
    </>
  );
}
