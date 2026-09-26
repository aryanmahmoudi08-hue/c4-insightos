-- `daily_wins.source` was constrained to ('manual','typeform') when public
-- submissions were added (20260811120000). The operator is using a Google Form
-- for the student daily-win check-in instead, and labelling those rows
-- 'typeform' would be a lie in a column whose only job is to record where the
-- row came from — the exact kind of quiet inaccuracy that makes a provenance
-- column worthless.
--
-- 'manual' still means someone typed it into the app; 'typeform' and
-- 'google_form' each name a real external origin.
alter table public.daily_wins
  drop constraint if exists daily_wins_source_check;

alter table public.daily_wins
  add constraint daily_wins_source_check
  check (source in ('manual', 'typeform', 'google_form'));
