
CREATE TABLE public.copy_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  display_name TEXT NOT NULL,
  niche TEXT,
  offer_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  avatar_research JSONB NOT NULL DEFAULT '{}'::jsonb,
  sacred_cows TEXT,
  competitors TEXT,
  voice_transcripts TEXT,
  voice_fingerprint JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_clients TO authenticated;
GRANT ALL ON public.copy_clients TO service_role;
ALTER TABLE public.copy_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage copy_clients" ON public.copy_clients FOR ALL TO authenticated
  USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER copy_clients_set_updated BEFORE UPDATE ON public.copy_clients FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX copy_clients_org_idx ON public.copy_clients(org_id);

CREATE TABLE public.copy_swipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  title TEXT NOT NULL,
  copy_type TEXT NOT NULL,
  angle TEXT,
  emotion TEXT,
  body TEXT NOT NULL,
  source TEXT,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_swipes TO authenticated;
GRANT ALL ON public.copy_swipes TO service_role;
ALTER TABLE public.copy_swipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage copy_swipes" ON public.copy_swipes FOR ALL TO authenticated
  USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER copy_swipes_set_updated BEFORE UPDATE ON public.copy_swipes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX copy_swipes_org_idx ON public.copy_swipes(org_id);

CREATE TABLE public.copy_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  client_id UUID REFERENCES public.copy_clients(id) ON DELETE SET NULL,
  copy_type TEXT NOT NULL,
  goal TEXT,
  angle TEXT,
  prompt_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  output TEXT NOT NULL,
  review_score INT,
  review_feedback JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_generations TO authenticated;
GRANT ALL ON public.copy_generations TO service_role;
ALTER TABLE public.copy_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage copy_generations" ON public.copy_generations FOR ALL TO authenticated
  USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE INDEX copy_generations_org_idx ON public.copy_generations(org_id, created_at DESC);
