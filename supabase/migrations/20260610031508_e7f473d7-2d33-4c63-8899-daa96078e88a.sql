-- Swipe Library: image support
ALTER TABLE public.copy_swipes ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}'::text[];

-- Story Sequences: dedicated table for the 7-day cadence (Sun→Sat)
CREATE TABLE IF NOT EXISTS public.story_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.copy_clients(id) ON DELETE SET NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  template_key text NOT NULL,
  title text NOT NULL,
  slides jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  scheduled_for date,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sequences TO authenticated;
GRANT ALL ON public.story_sequences TO service_role;
ALTER TABLE public.story_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read story sequences" ON public.story_sequences FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members write story sequences" ON public.story_sequences FOR ALL TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER tg_story_sequences_updated_at BEFORE UPDATE ON public.story_sequences FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Outreach (SMS + Email) scaffolding
CREATE TABLE IF NOT EXISTS public.outreach_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('email','sms')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_lists TO authenticated;
GRANT ALL ON public.outreach_lists TO service_role;
ALTER TABLE public.outreach_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw outreach lists" ON public.outreach_lists FOR ALL TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER tg_outreach_lists_updated_at BEFORE UPDATE ON public.outreach_lists FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.outreach_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.outreach_lists(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text,
  phone text,
  full_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_recipients TO authenticated;
GRANT ALL ON public.outreach_recipients TO service_role;
ALTER TABLE public.outreach_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw outreach recipients" ON public.outreach_recipients FOR ALL TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE TABLE IF NOT EXISTS public.outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  list_id uuid REFERENCES public.outreach_lists(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('email','sms')),
  subject text,
  body text NOT NULL,
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'draft',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outreach_messages TO authenticated;
GRANT ALL ON public.outreach_messages TO service_role;
ALTER TABLE public.outreach_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members rw outreach messages" ON public.outreach_messages FOR ALL TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE TRIGGER tg_outreach_messages_updated_at BEFORE UPDATE ON public.outreach_messages FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();