-- FAQ videos (post-booking objection handlers)
CREATE TABLE public.faq_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  question text,
  video_url text,
  wistia_video_id text,
  mechanism text,
  clicks integer NOT NULL DEFAULT 0,
  plays integer NOT NULL DEFAULT 0,
  avg_watch_pct numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faq_videos TO authenticated;
GRANT ALL ON public.faq_videos TO service_role;
ALTER TABLE public.faq_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faq_videos_select" ON public.faq_videos FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "faq_videos_insert" ON public.faq_videos FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "faq_videos_update" ON public.faq_videos FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "faq_videos_delete" ON public.faq_videos FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER tg_faq_videos_updated BEFORE UPDATE ON public.faq_videos FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Setter call signals (limiting beliefs / objections -> content direction)
CREATE TABLE public.setter_call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  setter_name text NOT NULL,
  call_date date NOT NULL DEFAULT current_date,
  source text NOT NULL DEFAULT 'manual',
  transcript text,
  notes text,
  limiting_beliefs text[] NOT NULL DEFAULT '{}',
  objections text[] NOT NULL DEFAULT '{}',
  mechanism text,
  ai_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setter_call_signals TO authenticated;
GRANT ALL ON public.setter_call_signals TO service_role;
ALTER TABLE public.setter_call_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scs_select" ON public.setter_call_signals FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "scs_insert" ON public.setter_call_signals FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "scs_update" ON public.setter_call_signals FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "scs_delete" ON public.setter_call_signals FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER tg_scs_updated BEFORE UPDATE ON public.setter_call_signals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Stricter per-reel tracking
ALTER TABLE public.content_metrics
  ADD COLUMN IF NOT EXISTS follower_views integer,
  ADD COLUMN IF NOT EXISTS non_follower_views integer,
  ADD COLUMN IF NOT EXISTS engagement_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS drop_off_rate_pct numeric;

-- Mechanism + variation stored directly on content for reporting
ALTER TABLE public.content_pieces
  ADD COLUMN IF NOT EXISTS mechanism text,
  ADD COLUMN IF NOT EXISTS variation text;

-- Onboarding answers -> content mechanism signals
ALTER TABLE public.onboarding_responses
  ADD COLUMN IF NOT EXISTS mechanism_signals jsonb NOT NULL DEFAULT '{}'::jsonb;