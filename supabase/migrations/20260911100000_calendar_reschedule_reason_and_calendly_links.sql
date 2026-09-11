-- Calls on Calendar — Google Calendar-style pass (Master Plan Priority 6).
-- Additive only, same pattern as 20260908090000's confirmation workflow.

-- Reschedule reason — cancellation already had `cancelled_reason`; a
-- reschedule had nowhere to record why. Plain text (not a separate
-- category+notes pair) matching the existing `cancelled_reason` column's
-- own design — the UI enforces the structured category list, storing
-- either the chosen label or "Other — <notes>" here.
alter table public.call_confirmations
  add column if not exists rescheduled_reason text;

-- Calendly cancellation/reschedule links — event-specific URLs Calendly's
-- own booking-confirmation payload provides per appointment. Nullable and
-- unpopulated until a real Calendly webhook/API integration writes them;
-- the UI shows an honest "Calendly links not connected" when null rather
-- than fabricating or reusing another lead's link.
alter table public.calls
  add column if not exists calendly_cancel_url text,
  add column if not exists calendly_reschedule_url text;
