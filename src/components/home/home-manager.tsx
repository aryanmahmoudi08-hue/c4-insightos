import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { HomeSection, HomeStat, FocusRow, FocusEmpty } from "./home-shared";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  DollarSign,
  ListChecks,
  Users,
} from "lucide-react";
import {
  mockManagerCallsToday,
  mockManagerWeekCalls,
  MOCK_MANAGER_SLA_BREACHES,
} from "@/lib/home-dev-mock-data";

const TODAY = new Date().toISOString().slice(0, 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untypedDb = supabase as any;

export function HomeManager({ orgId }: { orgId: string }) {
  const { devBypass } = useAuth();

  const { data: calls = [] } = useQuery({
    queryKey: ["home-manager-calls", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockManagerCallsToday();
      const { data, error } = await supabase
        .from("calls")
        .select(
          "id, scheduled_for, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents, closer_name, lead_email, no_show_recovered, recovered_from_call_id, cancelled",
        )
        .eq("org_id", orgId)
        .gte("scheduled_for", `${TODAY}T00:00:00`)
        .lte("scheduled_for", `${TODAY}T23:59:59`)
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: weekCalls = [] } = useQuery({
    queryKey: ["home-manager-week-calls", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockManagerWeekCalls();
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const { data, error } = await supabase
        .from("calls")
        .select("closer_name, showed, offer_made, closed, status, cash_collected_cents")
        .eq("org_id", orgId)
        .gte("scheduled_for", `${from.toISOString().slice(0, 10)}T00:00:00`)
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slaBreaches } = useQuery({
    queryKey: ["home-manager-sla", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return MOCK_MANAGER_SLA_BREACHES;
      const { count, error } = await untypedDb
        .from("sla_breach_records")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "open");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const noShows = calls.filter(
    (c) => c.status === "no_show" && !c.no_show_recovered && !c.recovered_from_call_id,
  );
  const upcoming = calls
    .filter((c) => !c.cancelled && new Date(c.scheduled_for!) > new Date())
    .sort((a, b) => (a.scheduled_for! < b.scheduled_for! ? -1 : 1));

  const booked = calls.length;
  const showed = calls.filter((c) => c.showed).length;
  const offers = calls.filter((c) => c.offer_made).length;
  const closes = calls.filter((c) => c.closed || c.status === "closed").length;
  const cashToday = calls.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
  const cashWeek = weekCalls.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);

  const byCloser = new Map<
    string,
    { booked: number; showed: number; closes: number; cash: number }
  >();
  for (const c of weekCalls) {
    if (!c.closer_name) continue;
    const row = byCloser.get(c.closer_name) ?? { booked: 0, showed: 0, closes: 0, cash: 0 };
    row.booked += 1;
    if (c.showed) row.showed += 1;
    if (c.closed || c.status === "closed") row.closes += 1;
    row.cash += c.cash_collected_cents ?? 0;
    byCloser.set(c.closer_name, row);
  }
  const closerRows = Array.from(byCloser.entries()).sort((a, b) => b[1].cash - a[1].cash);

  return (
    <div className="space-y-4">
      <HomeSection title="Team Health · Today" icon={<Users className="h-4 w-4" />} tone="hot">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <HomeStat
            label="Calls Booked"
            value={booked}
            icon={<CalendarClock className="h-4 w-4" />}
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
            label="Cash Collected"
            value={`$${(cashToday / 100).toLocaleString()}`}
            icon={<DollarSign className="h-4 w-4" />}
            tone="hot"
            emphasis="strong"
          />
        </div>
        <div className="mt-2 text-2xs text-muted-foreground">
          Cash collected, last 7 days: ${(cashWeek / 100).toLocaleString()}
        </div>
      </HomeSection>

      <HomeSection
        title="Attention Required"
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="destructive"
      >
        {noShows.length === 0 && !slaBreaches ? (
          <FocusEmpty label="No unrecovered no-shows or open SLA breaches right now." />
        ) : (
          <>
            {noShows.length > 0 && (
              <FocusRow
                tone="destructive"
                label={`${noShows.length} no-show${noShows.length === 1 ? "" : "s"} today not yet recovered`}
                to="/closer"
              />
            )}
            {!!slaBreaches && (
              <FocusRow
                tone="destructive"
                label={`${slaBreaches} lead${slaBreaches === 1 ? "" : "s"} past the 5-minute speed-to-lead SLA`}
                to="/inbound-dialer"
              />
            )}
          </>
        )}
      </HomeSection>

      <HomeSection
        title="Closer Performance · Last 7 Days"
        icon={<CalendarClock className="h-4 w-4" />}
        tone="mid"
      >
        {closerRows.length === 0 ? (
          <FocusEmpty label="No calls logged in the last 7 days." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-1.5 text-left">Closer</th>
                  <th className="p-1.5 text-right">Booked</th>
                  <th className="p-1.5 text-right">Showed</th>
                  <th className="p-1.5 text-right">Closes</th>
                  <th className="p-1.5 text-right">Cash</th>
                </tr>
              </thead>
              <tbody>
                {closerRows.map(([name, row]) => (
                  <tr key={name} className="border-t border-border/60">
                    <td className="p-1.5 font-medium">{name}</td>
                    <td className="p-1.5 text-right font-sans tabular-nums">{row.booked}</td>
                    <td className="p-1.5 text-right font-sans tabular-nums">{row.showed}</td>
                    <td className="p-1.5 text-right font-sans tabular-nums">{row.closes}</td>
                    <td className="p-1.5 text-right font-sans tabular-nums font-semibold text-spectrum-hot">
                      ${(row.cash / 100).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HomeSection>

      <HomeSection
        title="Today's Calendar"
        icon={<CalendarClock className="h-4 w-4" />}
        tone="cold"
      >
        {upcoming.length === 0 ? (
          <FocusEmpty label="No more booked calls remaining today." />
        ) : (
          upcoming.slice(0, 6).map((c) => (
            <FocusRow
              key={c.id}
              label={`${c.lead_email ?? "Booked call"}${c.closer_name ? ` · ${c.closer_name}` : ""}`}
              detail={new Date(c.scheduled_for!).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
              to="/team-calendar"
            />
          ))
        )}
      </HomeSection>
    </div>
  );
}
