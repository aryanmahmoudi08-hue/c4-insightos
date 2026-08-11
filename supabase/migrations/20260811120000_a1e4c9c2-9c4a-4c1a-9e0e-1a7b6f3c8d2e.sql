-- Daily W unification: one win-logging surface. Manual entries from inside the app
-- and Typeform-style public submissions now land in the same daily_wins table,
-- distinguished only by this tag.
ALTER TABLE public.daily_wins
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

ALTER TABLE public.daily_wins
  ADD CONSTRAINT daily_wins_source_check CHECK (source IN ('manual', 'typeform'));
