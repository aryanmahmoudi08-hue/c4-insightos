-- Leads CRM (Sales Tracking Part 1): custom tags + per-lead call transcripts.

-- Custom tags — plain array column, same shape as leads' own existing
-- `objections_raised text[]`, not a new join through the generic `tags`
-- catalog table (which nothing currently links to leads and would add a
-- second parallel tagging system for no real benefit here).
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

-- Per-lead call transcripts — genuinely new: `calls` has no transcript column,
-- and the only existing `transcript` column in the schema is
-- `setter_call_signals.transcript` (Content Signals' own pipeline, unrelated
-- scope). Reuses that column's shape for a lead-scoped equivalent.
CREATE TABLE IF NOT EXISTS public.lead_call_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  call_type text NOT NULL DEFAULT 'setting' CHECK (call_type IN ('setting', 'closing')),
  transcript text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_call_transcripts TO authenticated;
GRANT ALL ON public.lead_call_transcripts TO service_role;
ALTER TABLE public.lead_call_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read lead call transcripts" ON public.lead_call_transcripts
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members insert lead call transcripts" ON public.lead_call_transcripts
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members update lead call transcripts" ON public.lead_call_transcripts
  FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members delete lead call transcripts" ON public.lead_call_transcripts
  FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));

CREATE INDEX IF NOT EXISTS idx_lead_call_transcripts_lead ON public.lead_call_transcripts(lead_id, created_at DESC);

CREATE TRIGGER tg_lead_call_transcripts_updated BEFORE UPDATE ON public.lead_call_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
