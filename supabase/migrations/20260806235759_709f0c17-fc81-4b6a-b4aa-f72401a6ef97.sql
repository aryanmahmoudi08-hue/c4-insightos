-- 1. Client DNA enrichment
ALTER TABLE public.copy_clients
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS instagram_followers integer,
  ADD COLUMN IF NOT EXISTS tiktok_handle text,
  ADD COLUMN IF NOT EXISTS tiktok_followers integer,
  ADD COLUMN IF NOT EXISTS youtube_handle text,
  ADD COLUMN IF NOT EXISTS youtube_subscribers integer,
  ADD COLUMN IF NOT EXISTS business_stage text,
  ADD COLUMN IF NOT EXISTS monthly_revenue_cents bigint,
  ADD COLUMN IF NOT EXISTS offer_price_cents bigint,
  ADD COLUMN IF NOT EXISTS content_pillars text,
  ADD COLUMN IF NOT EXISTS goals text,
  ADD COLUMN IF NOT EXISTS dream_outcome text,
  ADD COLUMN IF NOT EXISTS proof_assets text;

-- 2. Hiring: Loom transcript + AI stage recommendation
ALTER TABLE public.hiring_applicants
  ADD COLUMN IF NOT EXISTS loom_url text,
  ADD COLUMN IF NOT EXISTS loom_transcript text,
  ADD COLUMN IF NOT EXISTS ai_recommended_stage text,
  ADD COLUMN IF NOT EXISTS ai_transcript_summary text;

-- 3. The Daily W
CREATE TABLE IF NOT EXISTS public.daily_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  win_date date NOT NULL DEFAULT current_date,
  yesterday_commitment text,
  yesterday_status text NOT NULL DEFAULT 'done',
  work_done text,
  win_types text[] NOT NULL DEFAULT '{}',
  win_description text NOT NULL,
  financial_amount_cents bigint,
  financial_source text,
  proof_url text,
  energy_score integer,
  blocker text,
  tomorrow_needle_mover text,
  priority text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_wins TO authenticated;
GRANT ALL ON public.daily_wins TO service_role;
ALTER TABLE public.daily_wins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read daily wins" ON public.daily_wins
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members write daily wins" ON public.daily_wins
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members update daily wins" ON public.daily_wins
  FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members delete daily wins" ON public.daily_wins
  FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));

CREATE INDEX IF NOT EXISTS daily_wins_org_date_idx ON public.daily_wins (org_id, win_date DESC);

CREATE TRIGGER tg_daily_wins_updated BEFORE UPDATE ON public.daily_wins
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4. Team calendars + work blocks
CREATE TABLE IF NOT EXISTS public.team_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  role text NOT NULL DEFAULT 'closer',
  provider text NOT NULL DEFAULT 'google',
  calendar_id text,
  ical_url text,
  embed_url text,
  color text,
  timezone text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, member_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_calendars TO authenticated;
GRANT ALL ON public.team_calendars TO service_role;
ALTER TABLE public.team_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read calendars" ON public.team_calendars
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members insert calendars" ON public.team_calendars
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members update calendars" ON public.team_calendars
  FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members delete calendars" ON public.team_calendars
  FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));

CREATE TRIGGER tg_team_calendars_updated BEFORE UPDATE ON public.team_calendars
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.work_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_name text NOT NULL,
  role text,
  title text NOT NULL,
  kind text NOT NULL DEFAULT 'work',
  block_date date NOT NULL,
  start_time text,
  end_time text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_blocks TO authenticated;
GRANT ALL ON public.work_blocks TO service_role;
ALTER TABLE public.work_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read work blocks" ON public.work_blocks
  FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members insert work blocks" ON public.work_blocks
  FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members update work blocks" ON public.work_blocks
  FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "members delete work blocks" ON public.work_blocks
  FOR DELETE TO authenticated USING (public.is_org_member(auth.uid(), org_id));

CREATE INDEX IF NOT EXISTS work_blocks_org_date_idx ON public.work_blocks (org_id, block_date);

CREATE TRIGGER tg_work_blocks_updated BEFORE UPDATE ON public.work_blocks
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();