import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { TeamRosterPanel } from "@/components/team-roster-panel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Check, X, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/team")({ component: Team });

type Member = { user_id: string; role: string; profiles: { display_name: string | null; avatar_url: string | null } | null };

function Team() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});

  const { data: requests } = useQuery({
    queryKey: ["membership-requests", orgId],
    enabled: !!orgId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("membership_requests")
        .select("id, full_name, email, requested_role, status, created_at")
        .eq("org_id", orgId!)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, approve, role, email }: { id: string; approve: boolean; role: string; email: string }) => {
      if (approve) {
        // Try to find existing user by email via profiles
        const { data: userRows } = await supabase
          .from("profiles")
          .select("id")
          .ilike("display_name", email.split("@")[0])
          .limit(1);
        const userId = userRows?.[0]?.id;
        if (userId) {
          const { error: mErr } = await supabase.from("memberships").insert({ org_id: orgId!, user_id: userId, role: role as "owner" });
          if (mErr) throw mErr;
        }
      }
      const { error } = await supabase
        .from("membership_requests")
        .update({ status: approve ? "approved" : "rejected", decided_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Request approved" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["membership-requests"] });
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: members } = useQuery({
    queryKey: ["team", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("user_id, role, profiles:user_id(display_name, avatar_url)")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data as unknown as Member[];
    },
  });

  const { data: setterStats } = useQuery({
    queryKey: ["setter-stats", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30*86400000).toISOString();
      const { data } = await supabase.from("calls").select("setter_id, closer_id, showed, closed, cash_collected_cents").eq("org_id", orgId!).gte("created_at", since);
      return data ?? [];
    },
  });

  const byUser = (members ?? []).map(m => {
    const setterCalls = (setterStats ?? []).filter(c => c.setter_id === m.user_id);
    const closerCalls = (setterStats ?? []).filter(c => c.closer_id === m.user_id);
    return {
      ...m,
      booked: setterCalls.length,
      shown: setterCalls.filter(c => c.showed).length,
      closes: closerCalls.filter(c => c.closed).length,
      cash: closerCalls.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0) / 100,
    };
  });

  return (
    <>
      <TopBar title="Team" subtitle="Setters, closers, owners — last 30d performance" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Members" value={members?.length ?? 0} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Owners / Admins" value={(members ?? []).filter(m => m.role === "owner" || m.role === "admin").length} accent="accent" />
          <StatCard label="Setters" value={(members ?? []).filter(m => m.role === "setter").length} accent="primary" />
          <StatCard label="Closers" value={(members ?? []).filter(m => m.role === "closer").length} accent="success" />
        </div>
        <TeamRosterPanel />


        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Member</th><th className="text-left p-3">Role</th>
                <th className="text-right p-3 font-mono">Booked</th><th className="text-right p-3 font-mono">Shown</th>
                <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash 30d</th></tr>
            </thead>
            <tbody>
              {byUser.map(m => (
                <tr key={m.user_id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3 flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-[11px] font-mono">{(m.profiles?.display_name ?? "??").slice(0,2).toUpperCase()}</div>
                    <span className="font-medium">{m.profiles?.display_name ?? m.user_id.slice(0,8)}</span>
                  </td>
                  <td className="p-3"><span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">{m.role}</span></td>
                  <td className="p-3 text-right font-mono">{m.booked}</td>
                  <td className="p-3 text-right font-mono">{m.shown}</td>
                  <td className="p-3 text-right font-mono">{m.closes}</td>
                  <td className="p-3 text-right font-mono text-[color:var(--color-success)]">${m.cash.toLocaleString()}</td>
                </tr>
              ))}
              {byUser.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">No team members yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
