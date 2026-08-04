ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time text,
  ADD COLUMN IF NOT EXISTS post_format text,
  ADD COLUMN IF NOT EXISTS repurpose_plan text,
  ADD COLUMN IF NOT EXISTS voice_notes text,
  ADD COLUMN IF NOT EXISTS why_it_works text,
  ADD COLUMN IF NOT EXISTS posting_instructions text;

CREATE INDEX IF NOT EXISTS content_pieces_scheduled_date_idx
  ON public.content_pieces (org_id, scheduled_date);