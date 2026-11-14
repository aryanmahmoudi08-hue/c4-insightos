import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BOOKING_COLUMNS, isBooking, type BookingRow } from "@/lib/call-booking-metrics";
import { browserTimeZone, zonedDayRangeUtc } from "@/lib/zoned-time";

/**
 * Calls booked (bookings made in the period) and calls on calendar (calls
 * scheduled in the period) for local dates `from`–`to`. See
 * call-booking-metrics.ts for what each one counts and why they differ.
 *
 * `booked` is synced bookings only; a surface that also has setters'
 * self-reported bookings combines them with callsBookedTotal().
 *
 * The window is the local days as real instants, not the naive
 * `T00:00:00`–`T23:59:59` strings Postgres reads as UTC (which ended "today"
 * at 7 PM in New York).
 */
export function useCallVolume(params: {
  orgId: string | null | undefined;
  from: string;
  to: string;
  devBypass?: boolean;
}) {
  const { orgId, from, to, devBypass } = params;
  return useQuery({
    queryKey: ["call-volume", orgId, from, to, devBypass],
    enabled: !!orgId && !!from && !!to,
    queryFn: async (): Promise<{ booked: number; onCalendar: number }> => {
      if (devBypass) return { booked: 9, onCalendar: 7 };
      const { startIso, endIso } = zonedDayRangeUtc(from, to, browserTimeZone());
      // rescheduled_from_external_id / eod_lead_status are ahead of the
      // generated types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [madeRes, scheduledRes] = await Promise.all([
        db
          .from("calls")
          .select(BOOKING_COLUMNS)
          .eq("org_id", orgId)
          .not("source_connector", "is", null)
          .gte("created_at", startIso)
          .lt("created_at", endIso),
        db
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("scheduled_for", startIso)
          .lt("scheduled_for", endIso),
      ]);
      if (madeRes.error) throw madeRes.error;
      if (scheduledRes.error) throw scheduledRes.error;
      const booked = ((madeRes.data ?? []) as BookingRow[]).filter(isBooking).length;
      return { booked, onCalendar: scheduledRes.count ?? 0 };
    },
  });
}
