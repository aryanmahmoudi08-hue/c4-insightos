ALTER TABLE public.content_pieces ADD COLUMN IF NOT EXISTS pipeline_status text NOT NULL DEFAULT 'draft';
ALTER TABLE public.content_pieces ADD CONSTRAINT content_pieces_pipeline_status_check CHECK (pipeline_status IN ('draft','in_review','approved','ready_to_post','posted'));
UPDATE public.content_pieces SET pipeline_status = 'posted' WHERE posted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS content_pieces_pipeline_status_idx ON public.content_pieces (org_id, pipeline_status);