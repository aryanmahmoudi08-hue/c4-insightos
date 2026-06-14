
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS application_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'note',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_notes_lead_idx ON public.lead_notes(lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lead_notes org read"  ON public.lead_notes FOR SELECT TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "lead_notes org write" ON public.lead_notes FOR INSERT TO authenticated WITH CHECK (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "lead_notes org upd"   ON public.lead_notes FOR UPDATE TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "lead_notes org del"   ON public.lead_notes FOR DELETE TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));

CREATE TABLE IF NOT EXISTS public.client_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  screenshot_url text,
  magnitude text NOT NULL DEFAULT 'minor',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_wins_org_idx ON public.client_wins(org_id, occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_wins TO authenticated;
GRANT ALL ON public.client_wins TO service_role;
ALTER TABLE public.client_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_wins org read"  ON public.client_wins FOR SELECT TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "client_wins org write" ON public.client_wins FOR INSERT TO authenticated WITH CHECK (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "client_wins org upd"   ON public.client_wins FOR UPDATE TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "client_wins org del"   ON public.client_wins FOR DELETE TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE TRIGGER trg_client_wins_updated BEFORE UPDATE ON public.client_wins FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  resource text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, role, resource)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "role_perm org read"  ON public.role_permissions FOR SELECT TO authenticated USING (org_id IN (SELECT public.current_user_orgs()));
CREATE POLICY "role_perm admin write" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::app_role[]))
  WITH CHECK (public.has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::app_role[]));
