import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { TeamRosterPanel } from "@/components/team-roster-panel";
import { MemberPermissionsDialog } from "@/components/member-permissions-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Users,
  Check,
  X,
  UserPlus,
  UserX,
  Shield,
  ChevronDown,
  Sparkles,
  Activity,
  Inbox,
  History,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { GlassTableShell, FilterPills } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { KpiBand, type KpiBandItem } from "@/components/kpi-band";
import { RepLeaderboard, type RepMetricOption } from "@/components/rep-leaderboard";
import type { DateRange } from "@/components/date-range-picker";
import { priorPeriod, pctDelta } from "@/lib/trend";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/team")({ component: Team });

type Member = {
  user_id: string;
  role: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
};
type TeamMemberRow = {
  id: string;
  name: string;
  role: "dm_setter" | "inbound_dialer" | "closer";
  active: boolean;
};
type ByUserRow = Member & { booked: number; shown: number; closes: number; cash: number };

const fmtMoney = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface HubCloserPerson {
  name: string;
  calls: number;
  closes: number;
  cash: number;
}
interface HubSetterPerson {
  name: string;
  sets: number;
  closes: number;
  cash: number;
}

// Same RepMetricOption/RepLeaderboard pattern the Main Hub and rep dashboards
// already use — a real, independently-overridable (30D) window, not tied to
// the page's own date-range picker (which the Roster tab's table still uses).
const TEAM_CLOSER_METRICS: RepMetricOption<HubCloserPerson>[] = [
  {
    key: "closes",
    label: "Closes",
    spectrum: "hot",
    primary: (p) => `${p.closes}`,
    secondary: (p) => fmtMoney(p.cash),
    rankBy: (p) => p.closes,
  },
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => fmtMoney(p.cash),
    secondary: (p) => `${p.closes} closed`,
    rankBy: (p) => p.cash,
  },
];
const TEAM_SETTER_METRICS: RepMetricOption<HubSetterPerson>[] = [
  {
    key: "sets",
    label: "Sets",
    spectrum: "mid",
    primary: (p) => `${p.sets} sets`,
    secondary: (p) => `${p.closes} closes`,
    rankBy: (p) => p.sets,
  },
  {
    key: "cash",
    label: "Cash Collected",
    spectrum: "hot",
    primary: (p) => fmtMoney(p.cash),
    secondary: (p) => `${p.sets} sets`,
    rankBy: (p) => p.cash,
  },
];

function Team() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const { devBypass, user } = useAuth();
  const orgId = org?.org_id;
  const { range } = useDateRange();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;
  const qc = useQueryClient();
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});
  const [permTarget, setPermTarget] = useState<{
    userId: string;
    name: string;
    role: string;
  } | null>(null);
  const [profileMember, setProfileMember] = useState<ByUserRow | null>(null);
  const [rosterRoleFilter, setRosterRoleFilter] = useState<
    "all" | "owner_admin" | "setter" | "closer"
  >("all");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);

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
    mutationFn: async ({
      id,
      approve,
      role,
    }: {
      id: string;
      approve: boolean;
      role: string;
      email: string;
    }) => {
      if (approve) {
        const { error } = await supabase.rpc("approve_membership_request", {
          _request_id: id,
          _role: role as "setter",
        });
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

  const revoke = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!orgId) throw new Error("No workspace");
      const { error } = await supabase.rpc("revoke_membership_access", {
        _org_id: orgId,
        _target_user_id: targetUserId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["team"] });
      qc.invalidateQueries({ queryKey: ["access-audit-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to revoke access"),
  });

  const { data: auditLog } = useQuery({
    queryKey: ["access-audit-log", orgId, devBypass],
    enabled: !!orgId && isAdmin && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_audit_log")
        .select("id, action, target_email, actor_user_id, detail, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ["team", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        return [
          {
            user_id: "dev-owner",
            role: "owner",
            profiles: { display_name: "Dev Owner", avatar_url: null },
          },
          {
            user_id: "dev-setter",
            role: "setter",
            profiles: { display_name: "Dev Setter", avatar_url: null },
          },
          {
            user_id: "dev-closer",
            role: "closer",
            profiles: { display_name: "Dev Closer", avatar_url: null },
          },
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

  // Same queryKey TeamRosterPanel itself uses — shared cache, one source of
  // truth for the dm_setter/inbound_dialer/closer headcount (a distinct
  // roster from `memberships`, which only has generic setter/closer system
  // roles with no dialer distinction).
  const { data: teamMembersAll } = useQuery({
    queryKey: ["team_members_all", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        return [
          { id: "tm-1", name: "Taylor Brooks", role: "dm_setter", active: true },
          { id: "tm-2", name: "Morgan Lee", role: "dm_setter", active: true },
          { id: "tm-3", name: "Alex Kim", role: "inbound_dialer", active: true },
          { id: "tm-4", name: "Jordan Blake", role: "closer", active: true },
          { id: "tm-5", name: "Sam Rivera", role: "closer", active: true },
        ] as TeamMemberRow[];
      }
      const { data, error } = await supabase
        .from("team_members" as never)
        .select("id, name, role, active")
        .eq("org_id", orgId!)
        .order("role")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as TeamMemberRow[];
    },
  });

  const { data: setterStats } = useQuery({
    queryKey: ["setter-stats", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calls")
        .select("setter_id, closer_id, showed, closed, cash_collected_cents")
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byUser: ByUserRow[] = (members ?? []).map((m) => {
    const setterCalls = (setterStats ?? []).filter((c) => c.setter_id === m.user_id);
    const closerCalls = (setterStats ?? []).filter((c) => c.closer_id === m.user_id);
    return {
      ...m,
      booked: setterCalls.length,
      shown: setterCalls.filter((c) => c.showed).length,
      closes: closerCalls.filter((c) => c.closed).length,
      cash: closerCalls.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0),
    };
  });

  // Fixed 30-day window (independent of the page's own date-range picker,
  // which the Roster tab's table still respects) — same rationale as the
  // Main Hub's leaderboards (Part 7) having their own default window.
  const now = useMemo(() => new Date(), []);
  const d30 = useMemo(
    () => ({
      from: iso(new Date(now.getTime() - 29 * 86400e3)),
      to: iso(now),
      label: "Last 30 days",
    }),
    [now],
  );
  const prev30 = useMemo(() => priorPeriod(d30.from, d30.to), [d30]);

  const { data: team30d } = useQuery({
    queryKey: ["team-30d", orgId, d30.from, d30.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) {
        return {
          curr: { booked: 65, showed: 47, closed: 22, cash: 1_205_000 },
          prev: { booked: 58, showed: 40, closed: 18, cash: 980_000 },
          closers: [
            { name: "Jordan Blake", calls: 22, closes: 9, cash: 485_000 },
            { name: "Sam Rivera", calls: 18, closes: 6, cash: 312_000 },
          ] as HubCloserPerson[],
          setters: [
            { name: "Taylor Brooks", sets: 14, closes: 5, cash: 185_000 },
            { name: "Morgan Lee", sets: 11, closes: 3, cash: 98_000 },
          ] as HubSetterPerson[],
        };
      }
      const fetchWindow = async (from: string, to: string) => {
        const fromI = `${from}T00:00:00`;
        const toI = `${to}T23:59:59`;
        const [callsRes, actRes] = await Promise.all([
          supabase
            .from("calls")
            .select("closer_name, showed, closed, cash_collected_cents")
            .eq("org_id", orgId!)
            .gte("created_at", fromI)
            .lte("created_at", toI),
          supabase
            .from("setter_activity")
            .select(
              "team_member_name, sets, closes, cash_collected_cents, calls_on_calendar, live_calls",
            )
            .eq("org_id", orgId!)
            .gte("activity_date", from)
            .lte("activity_date", to),
        ]);
        const callList = callsRes.data ?? [];
        const actList = actRes.data ?? [];
        const setBooked = actList.reduce((s, a) => s + (a.calls_on_calendar ?? 0), 0);
        const setShowed = actList.reduce((s, a) => s + (a.live_calls ?? 0), 0);
        const setCash = actList.reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
        const callCash = callList.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
        return {
          booked: Math.max(callList.length, setBooked),
          showed: Math.max(callList.filter((c) => c.showed).length, setShowed),
          closed: callList.filter((c) => c.closed).length,
          cash: Math.max(callCash, setCash),
          callList,
          actList,
        };
      };
      const [curr, prev] = await Promise.all([
        fetchWindow(d30.from, d30.to),
        fetchWindow(prev30.from, prev30.to),
      ]);

      const closerMap = new Map<string, HubCloserPerson>();
      for (const c of curr.callList) {
        const name = c.closer_name ?? "Unassigned";
        const r = closerMap.get(name) ?? { name, calls: 0, closes: 0, cash: 0 };
        r.calls += 1;
        if (c.closed) r.closes += 1;
        r.cash += c.cash_collected_cents ?? 0;
        closerMap.set(name, r);
      }
      const setterMap = new Map<string, HubSetterPerson>();
      for (const a of curr.actList) {
        const r = setterMap.get(a.team_member_name) ?? {
          name: a.team_member_name,
          sets: 0,
          closes: 0,
          cash: 0,
        };
        r.sets += a.sets ?? 0;
        r.closes += a.closes ?? 0;
        r.cash += a.cash_collected_cents ?? 0;
        setterMap.set(a.team_member_name, r);
      }

      return {
        curr: { booked: curr.booked, showed: curr.showed, closed: curr.closed, cash: curr.cash },
        prev: { booked: prev.booked, showed: prev.showed, closed: prev.closed, cash: prev.cash },
        closers: Array.from(closerMap.values()),
        setters: Array.from(setterMap.values()),
      };
    },
  });

  // Team Activity feed (Sales Tracking Part 3) — a real filtered read of the
  // `events` table, same table /events itself renders, scoped to the event
  // types team-roster-panel.tsx now actually dispatches plus any real
  // call.closed_won activity already dispatched elsewhere in the app.
  const { data: activity } = useQuery({
    queryKey: ["team-activity", orgId],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, event_type, payload, occurred_at")
        .eq("org_id", orgId!)
        .in("event_type", ["team_member.added", "team_member.role_changed", "call.closed_won"])
        .order("occurred_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [closerMetric, setCloserMetric] = useState("cash");
  const [setterMetric, setSetterMetric] = useState("cash");
  const [lbOverride, setLbOverride] = useState<DateRange | null>(null);
  const lbRange = lbOverride ?? d30;

  const setterCount = (teamMembersAll ?? []).filter(
    (m) => m.role === "dm_setter" && m.active,
  ).length;
  const dialerCount = (teamMembersAll ?? []).filter(
    (m) => m.role === "inbound_dialer" && m.active,
  ).length;
  const closerCount = (teamMembersAll ?? []).filter((m) => m.role === "closer" && m.active).length;

  const t = team30d?.curr;
  const p = team30d?.prev;
  const showRate = t && t.booked ? (t.showed / t.booked) * 100 : 0;
  const prevShowRate = p && p.booked ? (p.showed / p.booked) * 100 : 0;

  const kpiItems: KpiBandItem[] = [
    {
      key: "members",
      label: "Team Members",
      value: String(members?.length ?? 0),
      spectrum: "cold",
    },
    { key: "setters", label: "Setters", value: String(setterCount), spectrum: "cold" },
    { key: "dialers", label: "Dialers", value: String(dialerCount), spectrum: "cold" },
    { key: "closers", label: "Closers", value: String(closerCount), spectrum: "mid" },
    {
      key: "booked",
      label: "Booked (30D)",
      value: String(t?.booked ?? 0),
      spectrum: "mid",
      deltaPct: t && p ? pctDelta(t.booked, p.booked) : undefined,
      priorValue: p ? String(p.booked) : undefined,
    },
    {
      key: "showRate",
      label: "Show Rate",
      value: `${showRate.toFixed(0)}%`,
      spectrum: showRate >= 60 ? "hot" : "mid",
      deltaPct: t && p ? pctDelta(showRate, prevShowRate) : undefined,
      priorValue: p ? `${prevShowRate.toFixed(0)}%` : undefined,
    },
    {
      key: "cash",
      label: "Cash Collected (30D)",
      value: fmtMoney(t?.cash ?? 0),
      spectrum: "hot",
      featured: true,
      wide: true,
      deltaPct: t && p ? pctDelta(t.cash, p.cash) : undefined,
      priorValue: p ? fmtMoney(p.cash) : undefined,
    },
  ];

  const rosterFiltered = byUser.filter((m) => {
    if (rosterRoleFilter === "all") return true;
    if (rosterRoleFilter === "owner_admin") return m.role === "owner" || m.role === "admin";
    return m.role === rosterRoleFilter;
  });

  return (
    <>
      <TopBar
        title="Team"
        subtitle="Setters, closers, owners — performance in range"
        showDateRange
      />
      <div className="p-6 space-y-5">
        <KpiBand title="Team Snapshot" items={kpiItems} />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="roster">Roster</TabsTrigger>
            <TabsTrigger value="access">Access</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <TeamIntelligenceSummary
              members={members ?? []}
              t={t}
              p={p}
              showRate={showRate}
              setterCount={setterCount}
              dialerCount={dialerCount}
              closerCount={closerCount}
            />
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                  <Activity className="h-3.5 w-3.5" /> Team activity
                </div>
              </div>
              <div className="divide-y divide-border">
                {(activity ?? []).map((e) => (
                  <div key={e.id} className="px-4 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {activityLabel(e.event_type, e.payload as Record<string, unknown>)}
                      </span>
                      <span className="text-3xs text-muted-foreground shrink-0">
                        {new Date(e.occurred_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {(!activity || activity.length === 0) && (
                  <EmptyState
                    icon={<Inbox className="h-4 w-4" />}
                    title="No team activity yet"
                    description="Adding roster members or changing roles will show up here."
                  />
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <RepLeaderboard
                titlePrefix="Top closers · 30D"
                metrics={TEAM_CLOSER_METRICS}
                metricKey={closerMetric}
                onMetricChange={setCloserMetric}
                people={team30d?.closers ?? []}
                emptyLabel="No closers in this window."
                dateRange={lbRange}
                onDateRangeChange={setLbOverride}
                overridden={!!lbOverride}
                onResetRange={() => setLbOverride(null)}
              />
              <RepLeaderboard
                titlePrefix="Top setters · 30D"
                metrics={TEAM_SETTER_METRICS}
                metricKey={setterMetric}
                onMetricChange={setSetterMetric}
                people={team30d?.setters ?? []}
                emptyLabel="No setters in this window."
                dateRange={lbRange}
                onDateRangeChange={setLbOverride}
                overridden={!!lbOverride}
                onResetRange={() => setLbOverride(null)}
              />
            </div>
          </TabsContent>

          <TabsContent value="roster" className="space-y-4">
            <FilterPills
              options={[
                { key: "all", label: "All", count: byUser.length },
                { key: "owner_admin", label: "Owners/Admins" },
                { key: "setter", label: "Setters" },
                { key: "closer", label: "Closers" },
              ]}
              value={rosterRoleFilter}
              onChange={setRosterRoleFilter}
            />
            <GlassTableShell>
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Member</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-right p-3 font-mono">Booked</th>
                    <th className="text-right p-3 font-mono">Shown</th>
                    <th className="text-right p-3 font-mono">Closes</th>
                    <th className="text-right p-3 font-mono">Cash</th>
                    <th className="text-right p-3 font-mono">Close %</th>
                    <th className="text-left p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rosterFiltered.map((m) => (
                    <tr
                      key={m.user_id}
                      className="border-t border-border/70 hover:bg-muted/20 cursor-pointer"
                      onClick={() => setProfileMember(m)}
                    >
                      <td className="p-3 flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-2xs font-mono">
                          {(m.profiles?.display_name ?? "??").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">
                          {m.profiles?.display_name ?? m.user_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">
                          {m.role}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono">{m.booked}</td>
                      <td className="p-3 text-right font-mono">{m.shown}</td>
                      <td className="p-3 text-right font-mono">{m.closes}</td>
                      <td className="p-3 text-right font-mono text-[color:var(--color-success)]">
                        {fmtMoney(m.cash)}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {m.shown ? `${((m.closes / m.shown) * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-[color:var(--color-success)]/15 px-1.5 py-0.5 text-3xs text-[color:var(--color-success)]">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                  {membersLoading && (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!membersLoading && rosterFiltered.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={<Users className="h-4 w-4" />}
                          title="No team members match this filter"
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>

            {/* TeamRosterPanel demoted to secondary status per the plan's own
                trade-off note: it's the dm_setter/inbound_dialer/closer name
                roster (a distinct, real, working drag-and-drop tool) — kept,
                just collapsed under the primary stats table above rather than
                being the page's main view. */}
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                type="button"
                onClick={() => setRosterOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                Manage roster names (dm setter / inbound dialer / closer)
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", rosterOpen && "rotate-180")}
                />
              </button>
              {rosterOpen && (
                <div className="border-t border-border">
                  <TeamRosterPanel />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="access" className="space-y-4">
            {isAdmin && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setRequestsOpen((o) => !o)}
                  disabled={!requests || requests.length === 0}
                  className="flex w-full items-center justify-between px-4 py-2 border-b border-border bg-accent/5 text-xs font-semibold uppercase tracking-wider text-accent disabled:cursor-default"
                >
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-3.5 w-3.5" /> Pending access requests ·{" "}
                    {requests?.length ?? 0}
                  </span>
                  {requests && requests.length > 0 && (
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", requestsOpen && "rotate-180")}
                    />
                  )}
                </button>
                {!requests || requests.length === 0 ? (
                  <EmptyState
                    icon={<UserPlus className="h-4 w-4" />}
                    title="No pending requests"
                    description="Share /request-access with teammates."
                  />
                ) : (
                  requestsOpen && (
                    <table className="w-full text-sm">
                      <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="text-left p-3">Name</th>
                          <th className="text-left p-3">Email</th>
                          <th className="text-left p-3">Role</th>
                          <th className="text-right p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requests.map((r) => {
                          const role = pendingRoles[r.id] ?? r.requested_role;
                          return (
                            <tr key={r.id} className="border-t border-border/70">
                              <td className="p-3 font-medium">{r.full_name}</td>
                              <td className="p-3 text-xs text-muted-foreground">{r.email}</td>
                              <td className="p-3">
                                <Select
                                  value={role}
                                  onValueChange={(v) =>
                                    setPendingRoles((pr) => ({ ...pr, [r.id]: v }))
                                  }
                                >
                                  <SelectTrigger className="h-8 w-36">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {[
                                      "viewer",
                                      "setter",
                                      "closer",
                                      "sales_manager",
                                      "growth_ops",
                                      "admin",
                                    ].map((x) => (
                                      <SelectItem key={x} value={x}>
                                        {x}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-3 text-right space-x-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={decide.isPending}
                                  onClick={() =>
                                    decide.mutate({
                                      id: r.id,
                                      approve: false,
                                      role,
                                      email: r.email,
                                    })
                                  }
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={decide.isPending}
                                  onClick={() =>
                                    decide.mutate({ id: r.id, approve: true, role, email: r.email })
                                  }
                                >
                                  <Check className="h-3.5 w-3.5" /> Approve
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            )}

            <GlassTableShell>
              <table className="w-full text-sm">
                <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left p-3">Member</th>
                    <th className="text-left p-3">Role</th>
                    <th className="text-right p-3">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {byUser.map((m) => (
                    <tr key={m.user_id} className="border-t border-border/70 hover:bg-muted/20">
                      <td className="p-3 flex items-center gap-2">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-muted text-2xs font-mono">
                          {(m.profiles?.display_name ?? "??").slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">
                          {m.profiles?.display_name ?? m.user_id.slice(0, 8)}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase">
                          {m.role}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPermTarget({
                              userId: m.user_id,
                              name: m.profiles?.display_name ?? m.user_id.slice(0, 8),
                              role: m.role,
                            })
                          }
                        >
                          <Shield className="h-3.5 w-3.5 mr-1.5" /> Access
                        </Button>
                        {isAdmin && m.role !== "owner" && m.user_id !== user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={revoke.isPending}
                            onClick={() => {
                              const name = m.profiles?.display_name ?? m.user_id.slice(0, 8);
                              if (
                                !confirm(
                                  `Revoke ${name}'s access? They will immediately lose access to this workspace.`,
                                )
                              )
                                return;
                              revoke.mutate(m.user_id);
                            }}
                          >
                            <UserX className="h-3.5 w-3.5 mr-1.5" /> Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassTableShell>

            {isAdmin && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3.5 w-3.5" /> Recent access changes
                </div>
                {!auditLog || auditLog.length === 0 ? (
                  <EmptyState
                    icon={<History className="h-4 w-4" />}
                    title="No access changes yet"
                    description="Approvals, rejections, and revocations will appear here."
                  />
                ) : (
                  <ul className="divide-y divide-border/70 text-xs">
                    {auditLog.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-3 px-4 py-2"
                      >
                        <span className="text-muted-foreground">
                          {entry.action === "membership_approved" && "Approved "}
                          {entry.action === "membership_rejected" && "Rejected "}
                          {entry.action === "access_revoked" && "Revoked "}
                          <span className="font-medium text-foreground">
                            {entry.target_email ?? "unknown"}
                          </span>
                          {entry.action === "membership_approved" &&
                            typeof entry.detail === "object" &&
                            entry.detail &&
                            "role" in entry.detail && <> as {String(entry.detail.role)}</>}
                        </span>
                        <span className="shrink-0 font-mono text-3xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <MemberPermissionsDialog
        open={!!permTarget}
        onOpenChange={(o) => {
          if (!o) setPermTarget(null);
        }}
        userId={permTarget?.userId ?? null}
        displayName={permTarget?.name ?? ""}
        role={permTarget?.role ?? "viewer"}
      />

      <RepProfileSheet
        member={profileMember}
        onOpenChange={(o) => {
          if (!o) setProfileMember(null);
        }}
        teamAvg={byUser}
      />
    </>
  );
}

function activityLabel(eventType: string, payload: Record<string, unknown>): string {
  const name = String(payload?.name ?? "Someone");
  if (eventType === "team_member.added")
    return `${name} added to the roster (${payload?.role ?? "—"})`;
  if (eventType === "team_member.role_changed")
    return `${name} moved from ${payload?.from ?? "—"} to ${payload?.to ?? "—"}`;
  if (eventType === "call.closed_won") return `${name} closed a deal`;
  return eventType;
}

/** "C4 Team Intelligence" — same grounding discipline as C4 Sentinel: only
 * real computed comparisons, never a generated claim without a number behind
 * it. Deterministic, not a new AI Gateway call. */
function TeamIntelligenceSummary({
  members,
  t,
  p,
  showRate,
  setterCount,
  dialerCount,
  closerCount,
}: {
  members: Member[];
  t?: { booked: number; showed: number; closed: number; cash: number };
  p?: { booked: number; showed: number; closed: number; cash: number };
  showRate: number;
  setterCount: number;
  dialerCount: number;
  closerCount: number;
}) {
  if (!t) return null;
  const sentences: string[] = [];
  sentences.push(
    `${members.length} team member${members.length === 1 ? "" : "s"} on the roster — ${setterCount} setter${setterCount === 1 ? "" : "s"}, ${dialerCount} dialer${dialerCount === 1 ? "" : "s"}, ${closerCount} closer${closerCount === 1 ? "" : "s"}.`,
  );
  if (p) {
    const cashDelta = pctDelta(t.cash, p.cash);
    if (cashDelta !== undefined) {
      sentences.push(
        `Cash collected over the last 30 days ${cashDelta >= 0 ? "is up" : "is down"} ${Math.abs(cashDelta).toFixed(0)}% vs the prior 30 days (${fmtMoney(t.cash)} vs ${fmtMoney(p.cash)}).`,
      );
    }
  }
  sentences.push(
    `Show rate is ${showRate.toFixed(0)}% (${t.showed} of ${t.booked} booked calls) over the last 30 days.`,
  );
  return (
    <div className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4 text-accent" />
        <div className="text-sm font-semibold">C4 Team Intelligence</div>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {sentences.map((s, i) => (
          <p key={i}>{s}</p>
        ))}
      </div>
    </div>
  );
}

function RepProfileSheet({
  member,
  onOpenChange,
  teamAvg,
}: {
  member: ByUserRow | null;
  onOpenChange: (o: boolean) => void;
  teamAvg: ByUserRow[];
}) {
  const avgCash = teamAvg.length ? teamAvg.reduce((s, m) => s + m.cash, 0) / teamAvg.length : 0;
  const vsAvg = member && avgCash > 0 ? ((member.cash - avgCash) / avgCash) * 100 : undefined;

  return (
    <Sheet open={!!member} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {member?.profiles?.display_name ?? member?.user_id.slice(0, 8)}
          </SheetTitle>
        </SheetHeader>
        {member && (
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 text-3xs uppercase tracking-wider">
                {member.role}
              </span>
              <span className="rounded bg-[color:var(--color-success)]/15 px-1.5 py-0.5 text-3xs text-[color:var(--color-success)]">
                Active
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border p-2.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Booked
                </div>
                <div className="font-mono text-lg font-bold">{member.booked}</div>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">Shown</div>
                <div className="font-mono text-lg font-bold">{member.shown}</div>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Closes
                </div>
                <div className="font-mono text-lg font-bold">{member.closes}</div>
              </div>
              <div className="rounded-md border border-border p-2.5">
                <div className="text-3xs uppercase tracking-wider text-muted-foreground">Cash</div>
                <div className="font-mono text-lg font-bold text-[color:var(--color-success)]">
                  {fmtMoney(member.cash)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-accent mb-1">
                <Sparkles className="h-3 w-3" /> Performance analysis
              </div>
              <p className="text-xs text-muted-foreground">
                {vsAvg !== undefined
                  ? `Cash collected in range is ${vsAvg >= 0 ? "above" : "below"} the team average by ${Math.abs(vsAvg).toFixed(0)}% (${fmtMoney(member.cash)} vs a ${fmtMoney(avgCash)} team average).`
                  : "Not enough team data yet to compare against an average."}
                {member.booked > 0 &&
                  ` Show rate is ${((member.shown / member.booked) * 100).toFixed(0)}% of booked calls.`}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                <Activity className="h-3 w-3" /> Activity
              </div>
              <div className="text-xs text-muted-foreground italic">
                No per-member activity feed yet — see the Team tab's org-wide activity feed.
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
