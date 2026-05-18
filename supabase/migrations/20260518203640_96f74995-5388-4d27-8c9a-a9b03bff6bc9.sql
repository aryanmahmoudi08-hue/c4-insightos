ALTER TABLE public.content_pieces ADD COLUMN IF NOT EXISTS hook_score smallint;
ALTER TABLE public.setter_activity ADD COLUMN IF NOT EXISTS lead_source text;