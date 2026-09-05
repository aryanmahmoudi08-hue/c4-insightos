import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import type { TeamRole } from "@/components/team-member-picker";

export const ALL_MEMBERS = "__all__";

// Matches each page's own existing devBypass mock data (closer.tsx's
// MOCK_CLOSER_SCORECARD / mockCalls(), team.tsx's teamMembersAll dev
// fallback) rather than TeamMemberPicker's own DEV_ROSTER (placeholder names
// used only for the EOD-form "add new" path) — this filter needs names that
// actually match rows already present in each page's mock query results, or
// selecting one would just show an empty page.
const DEV_FILTER_ROSTER: Record<TeamRole, string[]> = {
  dm_setter: ["Taylor Brooks", "Morgan Lee"],
  inbound_dialer: ["Alex Kim"],
  closer: ["Jordan Blake", "Sam Rivera", "Casey Nguyen", "Morgan Lee"],
};

interface Props {
  role: TeamRole;
  value: string; // ALL_MEMBERS or a name
  onChange: (v: string) => void;
}

export function TeamMemberFilter({ role, value, onChange }: Props) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();

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
  // devBypass never has a real Supabase session, so the query above comes
  // back RLS-empty — same reasoning as every other devBypass branch in this
  // app, matched to names that actually appear in each page's own mock data.
  const members = devBypass
    ? DEV_FILTER_ROSTER[role].map((n) => ({ id: n, name: n }))
    : (realMembers ?? []);

  return (
    <div className="flex items-center gap-2">
      <Users className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[200px]">
          <SelectValue placeholder="All team members" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_MEMBERS}>All team members</SelectItem>
          {(members ?? []).map((m) => (
            <SelectItem key={m.id} value={m.name}>
              {m.name}
            </SelectItem>
          ))}
          {(members ?? []).length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              No members yet — add one from /team
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
