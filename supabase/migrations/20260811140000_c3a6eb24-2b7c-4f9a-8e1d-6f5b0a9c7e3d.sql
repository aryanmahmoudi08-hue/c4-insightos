-- Content Intelligence: mechanism+variation now drive a tailored question set
-- instead of the generic funnel_stage field. Answers to those questions are
-- stored per piece so they can inform Content Signals later.
ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS variation_answers jsonb NOT NULL DEFAULT '{}'::jsonb;
