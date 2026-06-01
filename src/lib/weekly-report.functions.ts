import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dispatchEvent } from "@/lib/dispatch.server";

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  cash: number;
  prevCash: number;
  cashDeltaPct: number;
  newLeads: number;
  callsBooked: number;
  callsShowed: number;
  closes: number;
  showRate: number;
  closeRate: number;
  topCloser: { name: string; cash: number } | null;
  contentViews: number;
  contentLeads: number;
  atRiskClients: number;
  trends: string[];
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

export const sendWeeklyReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: m } = await supabase.from("memberships").select("org_id").eq("user_id", userId).limit(1).maybeSingle();
    if (!m) throw new Error("No workspace");
    const orgId = m.org_id as string;

    const now = new Date();
    const weekEnd = isoDate(now);
    const weekStart = isoDate(new Date(now.getTime() - 7 * 86400e3));
    const prevStart = isoDate(new Date(now.getTime() - 14 * 86400e3));
    const prevEnd = isoDate(new Date(now.getTime() - 8 * 86400e3));

    const fetchWindow = async (from: string, to: string) => {
      const fromISO = `${from}T00:00:00`;
      const toISO = `${to}T23:59:59`;
      const [pays, leads, calls, setters, content] = await Promise.all([
        supabase.from("payments").select("amount_cents").eq("org_id", orgId).gte("collected_at", fromISO).lte("collected_at", toISO),
        supabase.from("leads").select("id").eq("org_id", orgId).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("calls").select("showed, closed, closer_name, cash_collected_cents, contract_value_cents").eq("org_id", orgId).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("setter_activity").select("calls_on_calendar, live_calls, closes, cash_collected_cents").eq("org_id", orgId).gte("activity_date", from).lte("activity_date", to),
        supabase.from("content_metrics").select("views, leads_generated").eq("org_id", orgId).gte("captured_at", fromISO).lte("captured_at", toISO),
      ]);
      const callList = calls.data ?? [];
      const setterList = setters.data ?? [];
      const cashPay = (pays.data ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const cashCall = callList.reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
      const cashSet = setterList.reduce((s, a) => s + (a.cash_collected_cents ?? 0), 0);
      const cash = Math.max(cashPay, cashCall + cashSet);
      const booked = Math.max(callList.length, setterList.reduce((s, a) => s + (a.calls_on_calendar ?? 0), 0));
      const showed = Math.max(callList.filter(c => c.showed).length, setterList.reduce((s, a) => s + (a.live_calls ?? 0), 0));
      const closes = Math.max(callList.filter(c => c.closed).length, setterList.reduce((s, a) => s + (a.closes ?? 0), 0));
      const closerMap = new Map<string, number>();
      for (const c of callList) {
        if (!c.closer_name) continue;
        closerMap.set(c.closer_name, (closerMap.get(c.closer_name) ?? 0) + (c.cash_collected_cents ?? 0));
      }
      const top = Array.from(closerMap.entries()).sort((a, b) => b[1] - a[1])[0];
      return {
        cash,
        newLeads: leads.data?.length ?? 0,
        callsBooked: booked,
        callsShowed: showed,
        closes,
        topCloser: top ? { name: top[0], cash: top[1] } : null,
        contentViews: (content.data ?? []).reduce((s, c) => s + (c.views ?? 0), 0),
        contentLeads: (content.data ?? []).reduce((s, c) => s + (c.leads_generated ?? 0), 0),
      };
    };

    const [curr, prev, atRisk] = await Promise.all([
      fetchWindow(weekStart, weekEnd),
      fetchWindow(prevStart, prevEnd),
      supabase.from("clients").select("id, health_score, renewal_date, renewal_conv_started, status").eq("org_id", orgId).eq("status", "active"),
    ]);

    const atRiskCount = (atRisk.data ?? []).filter(c => {
      const hs = Number(c.health_score ?? 100);
      if (hs < 50) return true;
      if (c.renewal_date) {
        const days = Math.floor((new Date(c.renewal_date).getTime() - Date.now()) / 86400e3);
        if (days >= 0 && days < 30 && !c.renewal_conv_started) return true;
        if (days < 0) return true;
      }
      return false;
    }).length;

    const cashDelta = prev.cash > 0 ? ((curr.cash - prev.cash) / prev.cash) * 100 : 0;
    const trends: string[] = [];
    if (cashDelta < -10) trends.push(`Cash down ${Math.abs(cashDelta).toFixed(0)}% WoW`);
    if (cashDelta > 10) trends.push(`Cash up ${cashDelta.toFixed(0)}% WoW`);
    if (curr.callsBooked > 5 && curr.callsBooked && (curr.callsShowed / curr.callsBooked) < 0.6) trends.push(`Show rate slipped to ${((curr.callsShowed / curr.callsBooked) * 100).toFixed(0)}%`);
    if (atRiskCount > 0) trends.push(`${atRiskCount} active client${atRiskCount === 1 ? "" : "s"} flagged at risk`);

    const summary: WeeklySummary = {
      weekStart, weekEnd,
      cash: curr.cash,
      prevCash: prev.cash,
      cashDeltaPct: cashDelta,
      newLeads: curr.newLeads,
      callsBooked: curr.callsBooked,
      callsShowed: curr.callsShowed,
      closes: curr.closes,
      showRate: curr.callsBooked > 0 ? (curr.callsShowed / curr.callsBooked) * 100 : 0,
      closeRate: curr.callsShowed > 0 ? (curr.closes / curr.callsShowed) * 100 : 0,
      topCloser: curr.topCloser ? { name: curr.topCloser.name, cash: curr.topCloser.cash / 100 } : null,
      contentViews: curr.contentViews,
      contentLeads: curr.contentLeads,
      atRiskClients: atRiskCount,
      trends,
    };

    // Dispatch to any active Slack/Discord/webhook subscribers
    await dispatchEvent(orgId, "report.weekly", summary as unknown as Record<string, unknown>);

    return { ok: true, summary };
  });
