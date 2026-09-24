-- Calendly connector. The destination was built ahead of this:
-- 20260911100000 added calls.calendly_cancel_url / calendly_reschedule_url
-- with the note "unpopulated until a real Calendly webhook/API integration
-- writes them". This is that integration.
--
-- The registry row has existed since the initial schema but was marked
-- unavailable, so connecting it threw before reaching any real logic.
update public.connector_registry
  set is_available = true,
      auth_method = 'webhook',
      description = 'Booked calls, cancellations and reschedules via webhook'
  where id = 'calendly';

-- Idempotency for booking sync. Calendly retries deliveries, and a reschedule
-- fires invitee.canceled + invitee.created as two separate events, so the same
-- invitee URI can legitimately arrive more than once. Keyed on the invitee URI
-- stored in external_id.
--
-- Partial, so it constrains only connector-sourced bookings: calls logged by
-- hand or through EOD reports leave external_id null and are unaffected.
create unique index if not exists calls_connector_external_uidx
  on public.calls (org_id, source_connector, external_id)
  where external_id is not null and source_connector is not null;

-- A reschedule in Calendly is a new invitee that points back at the one it
-- replaced (payload.old_invitee). Recording that link keeps the calendar able
-- to show "moved from" rather than an unexplained cancellation next to an
-- unexplained new booking.
alter table public.calls
  add column if not exists rescheduled_from_external_id text;
