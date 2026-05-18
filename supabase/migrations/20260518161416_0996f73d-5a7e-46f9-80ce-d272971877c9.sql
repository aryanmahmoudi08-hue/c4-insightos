CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role, name)
);
CREATE INDEX IF NOT EXISTS idx_team_members_org_role ON public.team_members(org_id, role) WHERE active;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read team_members" ON public.team_members FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "org members insert team_members" ON public.team_members FOR INSERT WITH CHECK (is_org_member(auth.uid(), org_id));
CREATE POLICY "org members update team_members" ON public.team_members FOR UPDATE USING (is_org_member(auth.uid(), org_id));
CREATE POLICY "org members delete team_members" ON public.team_members FOR DELETE USING (is_org_member(auth.uid(), org_id));
CREATE TRIGGER team_members_updated_at BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();