import { useQuery } from "@tanstack/react-query";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, PhoneCall } from "lucide-react";
import { cn } from "@/lib/utils";

// No leading "$" here — the DollarSign icon next to it already carries that glyph.
const fmtMoney = (cents: number) => Math.round(cents / 100).toLocaleString();

/**
 * Thin persistent live-status bar (B6) — today's cash and calls booked,
 * refreshed every 30s, with a spectrum-hot pulse signaling "this is live."
 * Rendered once in the authenticated shell, sits above every page's own
 * TopBar. Uses the same Math.max(payments, calls+setter) cash-dedup formula
 * dashboard.tsx already established, scoped to today instead of a range.
 */
export function LiveTicker() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const today = new Date().toISOString().slice(0, 10);

  const { data } = useQuery({
    queryKey: ["live-ticker", orgId, today, devBypass],
    enabled: !!orgId,
    refetchInterval: 30_000,
    queryFn: async () => {
      if (devBypass) return { cash: 428000, callsBooked: 7 };
      const [payments, calls, setterAgg] = await Promise.all([
        supabase.from("payments").select("amount_cents").eq("org_id", orgId!).gte("collected_at", `${today}T00:00:00`).lte("collected_at", `${today}T23:59:59`),
        supabase.from("calls").select("id, cash_collected_cents").eq("org_id", orgId!).gte("scheduled_for", `${today}T00:00:00`).lte("scheduled_for", `${today}T23:59:59`),
        supabase.from("setter_activity").select("cash_collected_cents, calls_on_calendar").eq("org_id", orgId!).eq("activity_date", today),
      ]);
      const paymentsCash = (payments.data ?? []).reduce((s, p) => s + (p.amount_cents ?? 0), 0);
      const callsCash = (calls.data ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
      const setterCash = (setterAgg.data ?? []).reduce((s, r) => s + (r.cash_collected_cents ?? 0), 0);
      const cash = Math.max(paymentsCash, callsCash + setterCash);
      const setterBooked = (setterAgg.data ?? []).reduce((s, r) => s + (r.calls_on_calendar ?? 0), 0);
      const callsBooked = Math.max((calls.data ?? []).length, setterBooked);
      return { cash, callsBooked };
    },
  });

  if (!orgId) return null;

  return (
    <div className="glass-header sticky top-0 z-30 flex h-8 items-center gap-4 border-b border-border/70 px-4 py-1.5 text-3xs md:px-6">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn("status-dot text-spectrum-hot", "ticker-pulse")} />
        Today
      </span>
      <span className="flex items-center gap-1 font-mono font-semibold text-spectrum-hot">
        <DollarSign className="h-3 w-3" />
        {data ? fmtMoney(data.cash) : "—"}
      </span>
      <span className="flex items-center gap-1 font-mono text-muted-foreground">
        <PhoneCall className="h-3 w-3" />
        {data ? data.callsBooked : "—"} calls booked
      </span>
    </div>
  );
}
