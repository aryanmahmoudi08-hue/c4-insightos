-- Team Calendar visual + interaction correction pass. Additive only, same
-- pattern as every prior call_confirmations migration.

-- "Responded" already existed for two of the five touchpoints (morning via
-- morning_responded_at, thirty_min via thirty_min_confirmed_at) but not the
-- other three — a rep could mark night_before/one_hour/ten_min as SENT with
-- no way to record that the lead actually responded to that specific
-- message. Extending the same per-touchpoint "*_responded_at" pattern to
-- the remaining three closes that gap without inventing a second concept:
-- sent means "we logged sending it," responded means "the lead replied to
-- it," and only the latter now renders as the filled/green confirmation
-- circle everywhere the five-circle sequence is shown.
alter table public.call_confirmations
  add column if not exists night_before_responded_at timestamptz,
  add column if not exists one_hour_responded_at timestamptz,
  add column if not exists ten_min_responded_at timestamptz;

-- A cancelled/rescheduled booking's box now needs to render in its ORIGINAL
-- status's color (border + text), not a generic "cancelled gray" — the goal
-- is to preserve what the booking's confirmation state actually was right
-- before it stopped being active, not discard that history. `overall_status`
-- itself gets overwritten to 'cancelled'/'rescheduled' the moment that
-- happens, so there's nowhere left to read the prior value from once it's
-- gone. This column is a pure snapshot, written once at the moment of that
-- transition (by the same call that sets overall_status), never read by any
-- status-machine logic — display only.
alter table public.call_confirmations
  add column if not exists previous_status text
    check (previous_status is null or previous_status in ('awaiting','confirmed','overdue','at_risk'));
