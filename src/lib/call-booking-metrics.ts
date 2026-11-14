/**
 * "Calls booked" vs "Calls on calendar" — two different questions that the
 * app used to answer with one number.
 *
 *   Calls booked       bookings MADE in the period: a call that was booked
 *                      on Saturday for Monday counts on Saturday.
 *   Calls on calendar  calls SCHEDULED in the period: the same call counts on
 *                      Monday.
 *
 * Every "calls booked" figure was really the second one (filtered on
 * scheduled_for), so on a Saturday with four calls booked for Monday, every
 * surface said ~0 booked. The existing figures keep their exact computation
 * and are relabelled "on calendar" — show rate and the other downstream rates
 * keep using them as their denominator, so nothing historical shifts — and
 * "booked" is added beside them. Decided by the workspace owner 2026-11-14.
 *
 * What counts as a booking: a call synced from a scheduling tool
 * (source_connector set — Calendly today). Not a closer's post-call log or the
 * "Log a sales call" dialog: those record the outcome of a call, not the
 * booking of one. A reschedule is a new row pointing back at the one it
 * replaced (rescheduled_from_external_id); it is the same booking moved, so
 * it is not counted again. A booking later cancelled still counts — it was
 * made.
 *
 * Setters also self-report bookings on their EOD (setter_activity
 * .calls_on_calendar — despite the column name, those are calls they put on
 * the calendar that day, i.e. bookings made). Where both exist, the larger is
 * used rather than the sum, the same rule the rest of the app uses so one
 * booking is never counted twice.
 */

export type BookingRow = {
  source_connector: string | null;
  eod_lead_status: string | null;
  rescheduled_from_external_id: string | null;
};

export function isBooking(row: BookingRow): boolean {
  return !!row.source_connector && !row.eod_lead_status && !row.rescheduled_from_external_id;
}

/** Synced bookings vs what setters reported — never the sum. */
export function callsBookedTotal(syncedBookings: number, setterReported: number): number {
  return Math.max(syncedBookings, setterReported);
}

/** Columns a booking query needs; filter the rows with isBooking. */
export const BOOKING_COLUMNS =
  "id, created_at, source_connector, eod_lead_status, rescheduled_from_external_id";
