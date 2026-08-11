-- Hiring: Loom-grading now also extracts historical + recent cash figures the
-- applicant states on camera, alongside the existing transcript-quality score.
ALTER TABLE public.hiring_applicants
  ADD COLUMN IF NOT EXISTS historical_cash_collected_cents bigint,
  ADD COLUMN IF NOT EXISTS recent_monthly_cash_collected_cents bigint,
  ADD COLUMN IF NOT EXISTS ai_stated_role text;
