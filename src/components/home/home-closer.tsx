import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useRepIdentity } from "@/hooks/use-rep-identity";
import { HomeSection, HomeStat, FocusRow, FocusEmpty, TimeframeLabel } from "./home-shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  GraduationCap,
  ListChecks,
  PhoneCall,
} from "lucide-react";
import { mockCloserCalls, mockCoachingReviews } from "@/lib/home-dev-mock-data";

const TODAY = new Date().toISOString().slice(0, 10);
function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const DEV_ROSTER = ["Jordan Blake", "Sam Rivera", "Casey Nguyen"];

export function HomeCloser({ orgId }: { orgId: string }) {
  const { user, devBypass } = useAuth();
  const { repName, setRepName } = useRepIdentity(`home-closer-name:${orgId}`);
  const [timeframe, setTimeframe] = useState<"today" | "week">("today");
  const rangeFrom = timeframe === "today" ? TODAY : isoDaysAgo(6);

  const { data: roster = [] } = useQuery({
    queryKey: ["home-closer-roster", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async (): Promise<string[]> => {
      if (devBypass) return DEV_ROSTER;
      const { data, error } = await supabase
        .from("calls")
        .select("closer_name")
        .eq("org_id", orgId)
        .not("closer_name", "is", null)
        .limit(500);
      if (error) throw error;
      return Array.from(
        new Set((data ?? []).map((r) => r.closer_name).filter(Boolean)),
      ) as string[];
    },
  });

  const { data: identity } = useQuery({
    queryKey: ["home-closer-identity-guess", user?.id, devBypass],
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
    const match = roster.find((n) => n.toLowerCase() === identity.toLowerCase());
    if (match) setRepName(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, roster]);

  // Dev Bypass preview always lands on the canonical dev roster name (no
  // ambiguity to resolve, unlike production's best-effort match above), so
  // the page is populated the moment "Closer" is picked in Dev Preview —
  // Role, without an extra manual step.
  useEffect(() => {
    if (!devBypass || repName || roster.length === 0) return;
    setRepName(roster[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devBypass, roster]);

  const { data: calls = [] } = useQuery({
    queryKey: ["home-closer-calls", orgId, repName, rangeFrom, devBypass],
    enabled: !!orgId && !!repName,
    queryFn: async () => {
      if (devBypass) return mockCloserCalls(rangeFrom);
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, scheduled_for, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents, deposit_cents, payment_plan, lead_email, no_show_recovered, recovered_from_call_id, cancelled",
        )
        .eq("org_id", orgId)
        .eq("closer_name", repName!)
        .gte("scheduled_for", `${rangeFrom}T00:00:00`)
        .order("scheduled_for", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const todayCalls = calls.filter((c) => c.scheduled_for?.slice(0, 10) === TODAY && !c.cancelled);
  const upcomingToday = todayCalls.filter((c) => new Date(c.scheduled_for!) > new Date());
  const noShows = calls.filter(
    (c) => c.status === "no_show" && !c.no_show_recovered && !c.recovered_from_call_id,
  );
  const awaitingPayment = calls.filter(
    (c) =>
      c.payment_plan &&
      (c.contract_value_cents ?? 0) > (c.cash_collected_cents ?? 0) &&
      !c.deposit_cents,
  );

  const booked = calls.length;
  const showed = calls.filter((c) => c.showed).length;
  const offers = calls.filter((c) => c.offer_made).length;
  const closes = calls.filter((c) => c.closed || c.status === "closed").length;
  const cashCents = calls.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);

  const { data: coaching = [] } = useQuery({
    queryKey: ["home-closer-coaching", orgId, repName, devBypass],
    enabled: !!orgId && !!repName,
    queryFn: async () => {
      if (devBypass)
        return mockCoachingReviews().filter(
          (r) => r.rep_name.toLowerCase() === repName!.toLowerCase(),
        );
      const { data, error } = await supabase
        .from("call_coaching_reviews" as never)
        .select("id, reviewer_name, what_learned, gap_category, created_at, rep_name")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // rep_name is free text (no FK) — same name-match convention as
      // everything else on this page, filtered client-side.
      return (
        data as Array<{
          id: string;
          reviewer_name: string | null;
          what_learned: string | null;
          gap_category: string | null;
          created_at: string;
          rep_name: string;
        }>
      )
        .filter((r) => r.rep_name?.toLowerCase() === repName!.toLowerCase())
        .slice(0, 3);
    },
  });

  return (
    <div className="space-y-4">
      {roster.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2">
          <span className="text-xs text-muted-foreground">Closer view for</span>
          <Select value={repName ?? ""} onValueChange={(v) => setRepName(v || null)}>
            <SelectTrigger className="h-7 w-[200px] text-xs">
              <SelectValue placeholder="Select your name…" />
            </SelectTrigger>
            <SelectContent>
              {roster.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!repName && (
            <span className="text-2xs text-muted-foreground">
              Matched by name on the call log — pick yours to personalize this page.
            </span>
          )}
        </div>
      )}

      {!repName ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {roster.length === 0
            ? devBypass
              ? "Dev Bypass has no real session — select a name above once real data is available."
              : "No closer-attributed calls found for this workspace yet."
            : "Select your name above to see your calls, focus items, and performance."}
        </div>
      ) : (
        <>
          <HomeSection
            title="Calls on Calendar"
            icon={<PhoneCall className="h-4 w-4" />}
            tone="cold"
          >
            {todayCalls.length === 0 ? (
              <FocusEmpty label="No calls booked with you today." />
            ) : (
              <>
                <FocusRow
                  label={`${upcomingToday.length} of ${todayCalls.length} call${todayCalls.length === 1 ? "" : "s"} today still ahead`}
                  to="/team-calendar"
                />
                {upcomingToday.slice(0, 3).map((c) => (
                  <FocusRow
                    key={c.id}
                    label={c.lead_email ?? "Booked call"}
                    detail={new Date(c.scheduled_for!).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    to="/team-calendar"
                  />
                ))}
              </>
            )}
          </HomeSection>

          <HomeSection
            title="Attention Required"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="destructive"
          >
            {noShows.length === 0 && awaitingPayment.length === 0 ? (
              <FocusEmpty label="No unrecovered no-shows or pending deposits in range." />
            ) : (
              <>
                {noShows.length > 0 && (
                  <FocusRow
                    tone="destructive"
                    label={`${noShows.length} no-show${noShows.length === 1 ? "" : "s"} not yet recovered`}
                    to="/closer"
                  />
                )}
                {awaitingPayment.length > 0 && (
                  <FocusRow
                    tone="warning"
                    label={`${awaitingPayment.length} payment-plan deal${awaitingPayment.length === 1 ? "" : "s"} with no deposit logged`}
                    to="/closer"
                  />
                )}
              </>
            )}
          </HomeSection>

          <HomeSection
            title="Your Performance"
            icon={<CalendarClock className="h-4 w-4" />}
            tone="hot"
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
            {calls.length === 0 ? (
              <FocusEmpty label="No calls logged for this window yet." />
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                <HomeStat
                  label="Booked"
                  value={booked}
                  icon={<PhoneCall className="h-4 w-4" />}
                  tone="cold"
                  emphasis="subtle"
                />
                <HomeStat
                  label="Showed"
                  value={showed}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="cold"
                />
                <HomeStat
                  label="Offers"
                  value={offers}
                  icon={<ListChecks className="h-4 w-4" />}
                  tone="mid"
                  emphasis="subtle"
                />
                <HomeStat
                  label="Closes"
                  value={closes}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  tone="mid"
                />
                <HomeStat
                  label="Cash"
                  value={`$${(cashCents / 100).toLocaleString()}`}
                  icon={<DollarSign className="h-4 w-4" />}
                  tone="hot"
                  emphasis="strong"
                />
              </div>
            )}
          </HomeSection>

          <HomeSection title="Coaching" icon={<GraduationCap className="h-4 w-4" />} tone="mid">
            {coaching.length === 0 ? (
              <FocusEmpty label="No recent coaching reviews logged for you." />
            ) : (
              coaching.map((r) => (
                <FocusRow
                  key={r.id}
                  label={r.gap_category ?? "Coaching review"}
                  detail={`${r.what_learned ?? "—"} · ${new Date(r.created_at).toLocaleDateString()}${r.reviewer_name ? ` · ${r.reviewer_name}` : ""}`}
                  to="/closer"
                />
              ))
            )}
          </HomeSection>
        </>
      )}
    </div>
  );
}
