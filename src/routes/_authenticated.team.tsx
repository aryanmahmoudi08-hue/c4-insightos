import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { TeamRosterPanel } from "@/components/team-roster-panel";
import { MemberPermissionsDialog } from "@/components/member-permissions-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Check, X, UserPlus, Shield } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";

export const Route = createFileRoute("/_authenticated/team")({ component: Team });

type Member = { user_id: string; role: string; profiles: { display_name: string | null; avatar_url: string | null } | null };

function TeamCashHero({ teamCash30d, topEarner, memberCount }: { teamCash30d: number; topEarner?: { profiles: { display_name: string | null } | null; cash: number; closes: number }; memberCount: number }) {
  return (
    <div className="hover-lift relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative">
        <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Team Cash · Last 30d</div>
        <div className="display-serif mt-1 text-5xl font-bold tabular-nums text-spectrum-hot">${teamCash30d.toLocaleString()}</div>
      </div>
      <div className="relative flex items-end justify-between gap-3 text-2xs text-muted-foreground">
        <span>{memberCount} member{memberCount === 1 ? "" : "s"} on the roster</span>
        {topEarner && topEarner.cash > 0 && (
          <span className="font-mono">
            Top: <span className="font-semibold text-foreground">{topEarner.profiles?.display_name ?? "—"}</span> · ${topEarner.cash.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}

function Team() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [permTarget, setPermTarget] = useState<{ userId: string; name: string; role: string } | null>(null);

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

  useEffect(() => {
    if (!orgId || !isAdmin) return;
    const ch = supabase
      .channel(`mreq-${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "membership_requests", filter: `org_id=eq.${orgId}` },
        () => qc.invalidateQueries({ queryKey: ["membership-requests", orgId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, isAdmin, qc]);

  const decide = useMutation({
    mutationFn: async ({ id, approve, role }: { id: string; approve: boolean; role: string; email: string }) => {
      if (approve) {
        const { error } = await supabase.rpc("approve_membership_request", { _request_id: id, _role: role as "setter" });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("reject_membership_request", { _request_id: id });
        if (error) throw error;
      }
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Request approved" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["membership-requests"] });
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["team_members_all"] });
      qc.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["team", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      // Dev bypass never got a real Supabase session, so this 400s (no Bearer
      // token) same as every other RLS-gated query in the app — hand back a
      // small mock roster instead, matching the established pattern.
      if (devBypass) {
        return [
          { user_id: "dev-owner", role: "owner", profiles: { display_name: "Dev Owner", avatar_url: null } },
          { user_id: "dev-setter", role: "setter", profiles: { display_name: "Dev Setter", avatar_url: null } },
          { user_id: "dev-closer", role: "closer", profiles: { display_name: "Dev Closer", avatar_url: null } },
        ] as Member[];
      }
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
      const { data, error } = await supabase.from("calls").select("setter_id, closer_id, showed, closed, cash_collected_cents").eq("org_id", orgId!).gte("created_at", since);
      if (error) throw error;
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

  const teamCash30d = byUser.reduce((s, m) => s + m.cash, 0);
  const topEarner = [...byUser].sort((a, b) => b.cash - a.cash)[0];

  return (
    <>
      <TopBar title="Team" subtitle="Setters, closers, owners — last 30d performance" />
      <div className="p-6 space-y-5">
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="hero">
            <TeamCashHero teamCash30d={teamCash30d} topEarner={topEarner} memberCount={members?.length ?? 0} />
          </BentoCell>
        </BentoGrid>

        {/* Headcount by role — categorical, not a funnel metric, so it stays
            neutral rather than borrowing spectrum or semantic-state color. */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Members" value={members?.length ?? 0} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Owners / Admins" value={(members ?? []).filter(m => m.role === "owner" || m.role === "admin").length} />
          <StatCard label="Setters" value={(members ?? []).filter(m => m.role === "setter").length} />
          <StatCard label="Closers" value={(members ?? []).filter(m => m.role === "closer").length} />
        </div>
        <TeamRosterPanel />

        {isAdmin && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-accent/5 text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" /> Pending access requests · {requests?.length ?? 0}
            </div>
            {(!requests || requests.length === 0) ? (
              <EmptyState icon={<UserPlus className="h-4 w-4" />} title="No pending requests" description="Share /request-access with teammates." />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-right p-3">Actions</th></tr>
                </thead>
                <tbody>
                  {requests.map(r => {
                    const role = pendingRoles[r.id] ?? r.requested_role;
                    return (
                      <tr key={r.id} className="border-t border-border/70">
                        <td className="p-3 font-medium">{r.full_name}</td>
                        <td className="p-3 text-xs text-muted-foreground">{r.email}</td>
                        <td className="p-3">
                          <Select value={role} onValueChange={(v) => setPendingRoles(p => ({ ...p, [r.id]: v }))}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["viewer","setter","closer","sales_manager","growth_ops","admin"].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <Button size="sm" variant="outline" disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, approve: false, role, email: r.email })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" disabled={decide.isPending}
                            onClick={() => decide.mutate({ id: r.id, approve: true, role, email: r.email })}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}




        <GlassTableShell>
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Member</th><th className="text-left p-3">Role</th>
                <th className="text-right p-3 font-mono">Booked</th><th className="text-right p-3 font-mono">Shown</th>
                <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash 30d</th>
                {isAdmin && <th className="text-right p-3">Access</th>}
              </tr>
            </thead>
            <tbody>
              {byUser.map(m => (
                <tr key={m.user_id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="p-3 flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-2xs font-mono">{(m.profiles?.display_name ?? "??").slice(0,2).toUpperCase()}</div>
                    <span className="font-medium">{m.profiles?.display_name ?? m.user_id.slice(0,8)}</span>
                  </td>
                  <td className="p-3"><span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">{m.role}</span></td>
                  <td className="p-3 text-right font-mono">{m.booked}</td>
                  <td className="p-3 text-right font-mono">{m.shown}</td>
                  <td className="p-3 text-right font-mono">{m.closes}</td>
                  <td className="p-3 text-right font-mono text-[color:var(--color-success)]">${m.cash.toLocaleString()}</td>
                  {isAdmin && (
                    <td className="p-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setPermTarget({ userId: m.user_id, name: m.profiles?.display_name ?? m.user_id.slice(0,8), role: m.role })}>
                        <Shield className="h-3.5 w-3.5 mr-1.5" /> Access
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {membersLoading && <tr><td colSpan={isAdmin ? 7 : 6} className="p-10 text-center text-sm text-muted-foreground">Loading…</td></tr>}
              {!membersLoading && byUser.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6}><EmptyState icon={<Users className="h-4 w-4" />} title="No team members yet" /></td></tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>
      </div>
      <MemberPermissionsDialog
        open={!!permTarget}
        onOpenChange={(o) => { if (!o) setPermTarget(null); }}
        userId={permTarget?.userId ?? null}
        displayName={permTarget?.name ?? ""}
        role={permTarget?.role ?? "viewer"}
      />
    </>
  );
}
