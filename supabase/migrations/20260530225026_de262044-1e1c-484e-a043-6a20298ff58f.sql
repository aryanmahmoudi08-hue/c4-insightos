
CREATE TABLE public.hiring_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  role_applied text NOT NULL DEFAULT 'setter',
  stage text NOT NULL DEFAULT 'applied',
  ai_score numeric,
  ai_reasoning text,
  source text,
  years_experience numeric,
  niche text,
  notes text,
  responses jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_shown_at timestamptz,
  applied_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hiring_applicants_org ON public.hiring_applicants(org_id);
CREATE INDEX idx_hiring_applicants_stage ON public.hiring_applicants(org_id, stage);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hiring_applicants TO authenticated;
GRANT ALL ON public.hiring_applicants TO service_role;

ALTER TABLE public.hiring_applicants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read hiring_applicants" ON public.hiring_applicants
  FOR SELECT USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org members insert hiring_applicants" ON public.hiring_applicants
  FOR INSERT WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org members update hiring_applicants" ON public.hiring_applicants
  FOR UPDATE USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "org members delete hiring_applicants" ON public.hiring_applicants
  FOR DELETE USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER trg_hiring_applicants_updated_at
  BEFORE UPDATE ON public.hiring_applicants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
