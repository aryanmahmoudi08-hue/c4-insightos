-- Traffic (Sales Tracking Part 7): UTM fields + tracking URL generator.
ALTER TABLE public.traffic_sources
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS base_url text;
