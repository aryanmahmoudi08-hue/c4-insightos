import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRepIdentity } from "@/hooks/use-rep-identity";
import {
  HomeSection,
  HomeStat,
  FocusRow,
  FocusEmpty,
  FocusUnavailable,
  TimeframeLabel,
} from "./home-shared";
import { DialerCallbackFab } from "@/components/dialer-callback-fab";
import { DialerFollowUpRows } from "@/components/dialer-followup-list";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  PhoneIncoming,
  ListChecks,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
  Users,
  CheckCircle2,
} from "lucide-react";
import {
  mockSetterActivityRows,
  mockMySetterLeads,
  mockUpcomingCallsForLeads,
  MOCK_DIALER_ATTENTION,
} from "@/lib/home-dev-mock-data";

type TeamRole = "dm_setter" | "inbound_dialer";
type RosterMember = { id: string; name: string; role: TeamRole };

const DEV_ROSTER: RosterMember[] = [
  { id: "dev-taylor", name: "Taylor Brooks", role: "dm_setter" },
  { id: "dev-morgan", name: "Morgan Lee", role: "dm_setter" },
  { id: "dev-alex", name: "Alex Kim", role: "inbound_dialer" },
];

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Combined DM Setter / Inbound Dialer Home. `setter` and `inbound_dialer`
 * are separate real app_role values (split in migration
 * 20260916150000_inbound_dialer_role.sql), but the actual dashboard flavor
 * to show is still resolved from `team_members.role` for whichever roster
 * name the person confirms is them, not from the auth role directly — the
 * roster is the source of truth for "which specific person", the auth role
 * only tells us which flavor to default to before they've picked a name.
 *
 * `knownFlavor` carries that default: `_authenticated.home.tsx` passes it
 * whenever the effective role (real or Dev Preview) already tells us the
 * flavor — Dev Preview's "DM Setter" ↔ "Inbound Dialer" switch, or a real
 * account whose membership role is genuinely `inbound_dialer`. Under Dev
 * Bypass this also force-selects the matching dev roster name, so switching
 * flavors in the preview updates immediately without a manual re-pick; for
 * a real session it only affects the pre-pick default, never auto-selects
 * a real person.
 */
export function HomeRepDashboard({
  orgId,
  knownFlavor,
}: {
  orgId: string;
  knownFlavor?: TeamRole;
}) {
  const { user, devBypass } = useAuth();
  const { repName, setRepName } = useRepIdentity(`home-rep-name:${orgId}`);

  const { data: roster = [] } = useQuery({
    queryKey: ["home-rep-roster", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async (): Promise<RosterMember[]> => {
      if (devBypass) return DEV_ROSTER;
      const { data, error } = await supabase
        .from("team_members" as never)
        .select("id, name, role")
        .eq("org_id", orgId)
        .in("role", ["dm_setter", "inbound_dialer"])
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as RosterMember[];
    },
  });

  // Best-effort default: the account's real display name, matched loosely
  // against the roster. This is never treated as a verified link — it's an
  // editable starting point via the picker below, same name-based scoping
  // every existing rep dashboard on this page already relies on.
  const { data: identity } = useQuery({
    queryKey: ["home-rep-identity-guess", user?.id, devBypass],
    enabled: !!user && !devBypass,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data?.display_name ?? null;
    },
  });
  useEffect(() => {
    if (repName || !identity || roster.length === 0) return;
    const match = roster.find((r) => r.name.toLowerCase() === identity.toLowerCase());
    if (match) setRepName(match.name);
    // Only ever auto-fill once, when nothing is picked yet — never override
    // an explicit manual choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, roster]);

  // Dev preview only: force the roster selection to match whichever flavor
  // is being previewed, every time that preview changes — this is what
  // makes switching "DM Setter" → "Inbound Dialer" update Home immediately
  // without a manual re-pick. A real session's `knownFlavor` never forces a
  // name — see the flavor fallback below instead.
  useEffect(() => {
    if (!devBypass || !knownFlavor) return;
    const canonical = DEV_ROSTER.find((r) => r.role === knownFlavor);
    if (canonical && repName !== canonical.name) setRepName(canonical.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devBypass, knownFlavor]);

  const picked = roster.find((r) => r.name === repName) ?? null;
  const flavor: TeamRole = picked?.role ?? knownFlavor ?? "dm_setter";

  const [timeframe, setTimeframe] = useState<"today" | "week">("today");
  const rangeFrom = timeframe === "today" ? TODAY : isoDaysAgo(6);

  const { data: activityRows = [] } = useQuery({
    queryKey: ["home-rep-activity", orgId, repName, rangeFrom, devBypass, flavor],
    enabled: !!orgId && !!repName,
    queryFn: async () => {
      if (devBypass) return mockSetterActivityRows(flavor, rangeFrom);
      const { data, error } = await supabase
        .from("setter_activity")
        .select(
          "activity_date, cash_collected_cents, total_revenue_cents, calls_on_calendar, live_calls, sets, closes, leads_contacted, qualified_convos, inbound_dms_sent, outbound_dms_sent, replies, followups_sent, dials, connections",
        )
        .eq("org_id", orgId)
        .eq("team_member_name", repName!)
        .gte("activity_date", rangeFrom)
        .lte("activity_date", TODAY);
      if (error) throw error;
      return data ?? [];
    },
  });
  const sum = (key: string) =>
    activityRows.reduce((s, r) => s + (Number(r[key as keyof typeof r] ?? 0) || 0), 0);

  // Real, FK-backed personal lead queue — leads.assigned_setter_id is a
  // genuine auth.users id (unlike setter_activity's free-text name), so
  // this doesn't need the picker at all. DM-Setter-flavor only: dialer
  // leads aren't routed through this same assignment field.
  const { data: myLeads = [] } = useQuery({
    queryKey: ["home-rep-my-leads", orgId, user?.id, devBypass, flavor],
    enabled: !!orgId && !!user && flavor === "dm_setter",
    queryFn: async () => {
      if (devBypass) return mockMySetterLeads();
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, status, created_at, first_touch_at")
        .eq("org_id", orgId)
        .eq("assigned_setter_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  const followUpDue = myLeads.filter((l) => l.status === "follow_up");
  const qualifiedUnbooked = myLeads.filter((l) => l.status === "qualified");
  const staleOptIns = myLeads.filter((l) => {
    if (l.status !== "dm_received") return false;
    const touched = l.first_touch_at ?? l.created_at;
    if (!touched) return false;
    const days = Math.floor((Date.now() - new Date(touched).getTime()) / 86400e3);
    return days >= 3;
  });

  return (
    <div className="space-y-4">
      {roster.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {flavor === "dm_setter" ? "DM Setter" : "Inbound Dialer"} view for
          </span>
          <Select value={repName ?? ""} onValueChange={(v) => setRepName(v || null)}>
            <SelectTrigger className="h-7 w-[220px] text-xs">
              <SelectValue placeholder="Select your name…" />
            </SelectTrigger>
            <SelectContent>
              {roster.map((r) => (
                <SelectItem key={r.id} value={r.name}>
                  {r.name} · {r.role === "dm_setter" ? "DM Setter" : "Inbound Dialer"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!repName && (
            <span className="text-2xs text-muted-foreground">
              Matched by name — pick yours to personalize this page.
            </span>
          )}
        </div>
      )}

      {!repName ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {roster.length === 0
            ? "No DM Setter / Inbound Dialer roster found for this workspace."
            : "Select your name above to see your activity, focus items, and performance."}
        </div>
      ) : (
        <>
          {flavor === "dm_setter" && (
            <HomeSection
              title="Your Focus Today"
              subtitle="Real leads assigned to you, not a rollup"
              icon={<ListChecks className="h-4 w-4" />}
              tone="warning"
            >
              {followUpDue.length === 0 && qualifiedUnbooked.length === 0 ? (
                <FocusEmpty label="Nothing outstanding on your assigned leads right now." />
              ) : (
                <>
                  {followUpDue.length > 0 && (
                    <FocusRow
                      tone="warning"
                      label={`${followUpDue.length} follow-up${followUpDue.length === 1 ? "" : "s"} due`}
                      to="/leads"
                    />
                  )}
                  {qualifiedUnbooked.length > 0 && (
                    <FocusRow
                      tone="destructive"
                      label={`${qualifiedUnbooked.length} qualified lead${qualifiedUnbooked.length === 1 ? "" : "s"} not yet booked`}
                      to="/leads"
                    />
                  )}
                  {staleOptIns.length > 0 && (
                    <FocusRow
                      tone="warning"
                      label={`${staleOptIns.length} lead${staleOptIns.length === 1 ? "" : "s"} received 3+ days ago with no progress logged`}
                      to="/leads"
                    />
                  )}
                </>
              )}
            </HomeSection>
          )}

          {flavor === "inbound_dialer" && (
            <>
              <HomeSection
                title="Attention Required"
                subtitle="Team-wide — Inbound Dialer leads have no per-rep assignment field to scope this to you specifically"
                icon={<AlertTriangle className="h-4 w-4" />}
                tone="destructive"
              >
                <DialerAttentionRow orgId={orgId} devBypass={devBypass} />
              </HomeSection>
              <HomeSection
                title="Upcoming Follow-ups"
                subtitle="Who needs a callback, and when"
                icon={<PhoneIncoming className="h-4 w-4" />}
                tone="cold"
              >
                <DialerFollowUpRows orgId={orgId} devBypass={devBypass} limit={6} />
              </HomeSection>
              <DialerCallbackFab orgId={orgId} devBypass={devBypass} />
            </>
          )}

          <HomeSection
            title="Your Performance"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="mid"
            right={
              <Select value={timeframe} onValueChange={(v) => setTimeframe(v as "today" | "week")}>
                <SelectTrigger className="h-7 w-28 text-2xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This week</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <div className="mb-2">
              <TimeframeLabel>{timeframe === "today" ? "Today" : "Last 7 days"}</TimeframeLabel>
            </div>
            {activityRows.length === 0 ? (
              <FocusEmpty label="No activity logged for this window yet." />
            ) : flavor === "dm_setter" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <HomeStat
                  label="DMs Sent"
                  value={sum("inbound_dms_sent") + sum("outbound_dms_sent")}
                  icon={<MessageSquare className="h-4 w-4" />}
                  tone="cold"
                />
                <HomeStat
                  label="Replies"
                  value={sum("replies")}
                  icon={<MessageSquare className="h-4 w-4" />}
                  tone="cold"
                />
                <HomeStat
                  label="Qualified"
                  value={sum("qualified_convos")}
                  icon={<Users className="h-4 w-4" />}
                  tone="mid"
                />
                <HomeStat
                  label="Sets"
                  value={sum("sets")}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="mid"
                />
                <HomeStat
                  label="Booked"
                  value={sum("calls_on_calendar")}
                  icon={<CalendarClock className="h-4 w-4" />}
                  tone="mid"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                <HomeStat
                  label="Dials"
                  value={sum("dials")}
                  icon={<PhoneIncoming className="h-4 w-4" />}
                  tone="cold"
                />
                <HomeStat
                  label="Connections"
                  value={sum("connections")}
                  icon={<PhoneIncoming className="h-4 w-4" />}
                  tone="cold"
                />
                <HomeStat
                  label="Qualified"
                  value={sum("qualified_convos")}
                  icon={<Users className="h-4 w-4" />}
                  tone="mid"
                />
                <HomeStat
                  label="Booked"
                  value={sum("calls_on_calendar")}
                  icon={<CalendarClock className="h-4 w-4" />}
                  tone="mid"
                />
              </div>
            )}
          </HomeSection>

          <HomeSection title="Upcoming" icon={<CalendarClock className="h-4 w-4" />} tone="cold">
            {flavor === "dm_setter" ? (
              <UpcomingForMyLeads
                orgId={orgId}
                leadIds={myLeads.map((l) => l.id)}
                devBypass={devBypass}
              />
            ) : (
              <FocusUnavailable label="Upcoming calls can't be reliably attributed to an individual dialer yet — calls.setter_id isn't populated by the current booking flow." />
            )}
          </HomeSection>
        </>
      )}
    </div>
  );
}

function UpcomingForMyLeads({
  orgId,
  leadIds,
  devBypass,
}: {
  orgId: string;
  leadIds: string[];
  devBypass: boolean;
}) {
  const { data: calls = [] } = useQuery({
    queryKey: ["home-rep-upcoming-calls", orgId, leadIds.join(","), devBypass],
    enabled: leadIds.length > 0,
    queryFn: async () => {
      if (devBypass) return mockUpcomingCallsForLeads();
      const { data, error } = await supabase
        .from("calls")
        .select("id, scheduled_for, lead_email, closer_name, status")
        .eq("org_id", orgId)
        .in("lead_id", leadIds)
        .gte("scheduled_for", new Date().toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (leadIds.length === 0)
    return <FocusEmpty label="No assigned leads to show upcoming calls for." />;
  if (calls.length === 0) return <FocusEmpty label="No upcoming booked calls for your leads." />;
  return (
    <>
      {calls.map((c) => (
        <FocusRow
          key={c.id}
          label={c.lead_email ?? "Booked call"}
          detail={`${new Date(c.scheduled_for!).toLocaleString()}${c.closer_name ? ` · ${c.closer_name}` : ""}`}
          to="/team-calendar"
        />
      ))}
    </>
  );
}

// sla_breach_records / operational_work_items aren't in the generated
// client type snapshot — same documented gap the rest of the app already
// works around (webinar-analytics.tsx, activity-module.tsx) with this cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedDb = supabase as any;

function DialerAttentionRow({ orgId, devBypass }: { orgId: string; devBypass: boolean }) {
  const { data: breaches } = useQuery({
    queryKey: ["home-dialer-sla-breaches", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { count, error } = await untypedDb
        .from("sla_breach_records")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const { data: callbacksDue } = useQuery({
    queryKey: ["home-dialer-callbacks-due", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await untypedDb
        .from("operational_work_items")
        .select("id, due_at, state")
        .eq("org_id", orgId)
        .eq("entity_type", "dialer_callback")
        .neq("state", "completed");
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const rows = (data ?? []) as Array<{ due_at: string | null }>;
      return {
        dueToday: rows.filter((r) => r.due_at?.slice(0, 10) === today).length,
        overdue: rows.filter((r) => r.due_at && r.due_at.slice(0, 10) < today).length,
      };
    },
  });

  const shownBreaches = devBypass ? MOCK_DIALER_ATTENTION.slaBreaches : (breaches ?? 0);
  const shownCallbacksDue = devBypass
    ? MOCK_DIALER_ATTENTION.callbacksDueToday
    : (callbacksDue?.dueToday ?? 0);
  const shownCallbacksOverdue = devBypass
    ? MOCK_DIALER_ATTENTION.callbacksOverdue
    : (callbacksDue?.overdue ?? 0);

  const nothing = !shownBreaches && !shownCallbacksDue && !shownCallbacksOverdue;
  if (nothing) return <FocusEmpty label="No open SLA breaches or callbacks due." />;
  return (
    <>
      {!!shownBreaches && (
        <FocusRow
          tone="destructive"
          label={`${shownBreaches} lead${shownBreaches === 1 ? "" : "s"} past the 5-minute speed-to-lead SLA`}
          to="/inbound-dialer"
        />
      )}
      {!!shownCallbacksOverdue && (
        <FocusRow
          tone="destructive"
          label={`${shownCallbacksOverdue} callback${shownCallbacksOverdue === 1 ? "" : "s"} overdue`}
          to="/inbound-dialer"
        />
      )}
      {!!shownCallbacksDue && (
        <FocusRow
          tone="warning"
          label={`${shownCallbacksDue} callback${shownCallbacksDue === 1 ? "" : "s"} due today`}
          to="/inbound-dialer"
        />
      )}
    </>
  );
}
