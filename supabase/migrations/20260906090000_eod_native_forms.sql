-- Native EOD report forms (replacing the Typeform placeholder). The Closer
-- Post-Call form's exact required "Lead Status" choices (Closed, Deposit,
-- No Show, Follow Up short/long term, Lost, Bad Fit, DQ, Cancelled,
-- Rescheduling, IGNORE) don't map one-to-one onto the existing call_status
-- enum or the analytics disposition taxonomy — both of those keep
-- normalizing/reporting as before, this column additionally preserves the
-- exact raw submitted choice so the two are never confused with each other.
alter table public.calls
  add column if not exists eod_lead_status text;
