-- Closer EOD "Follow-Up Details" — connects directly to the existing
-- Closer Dashboard Follow-Up Pipeline (src/routes/_authenticated.closer.tsx,
-- the `followUps = list.filter(c => c.status === 'follow_up')` table),
-- which already reads straight off `calls`. No new table: a follow-up
-- record IS the same `calls` row a "Follow Up (short term/long term)" Lead
-- Status already creates — these columns just let that one row also carry
-- the requested follow-up date/time, what was pitched, and why, instead of
-- only the generic scheduled_for/contract_value/eod_lead_status it had
-- before. Short-term vs long-term stays sourced from the existing
-- `eod_lead_status` text column (already stores the raw "Follow Up (short
-- term)" / "Follow Up (long term)" choice verbatim) — not re-derived here.
ALTER TABLE public.calls
  ADD COLUMN IF NOT EXISTS requested_followup_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_amount_pitched_cents bigint,
  ADD COLUMN IF NOT EXISTS followup_reason text,
  ADD COLUMN IF NOT EXISTS followup_reason_other text,
  ADD COLUMN IF NOT EXISTS followup_notes text;

-- Same canonical taxonomy as call_objections.category
-- (src/lib/objection-taxonomy.ts) — Follow-Up Reason reuses the identical
-- 8-value list but is stored in its own column, never conflated with
-- Objections (call_objections rows for the same call stay untouched by
-- this field).
ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_followup_reason_check;
ALTER TABLE public.calls ADD CONSTRAINT calls_followup_reason_check CHECK (followup_reason IS NULL OR followup_reason IN (
  'money', 'think_about_it', 'partner_spouse', 'trust', 'competitor', 'timing', 'diy_themselves', 'other'
));
