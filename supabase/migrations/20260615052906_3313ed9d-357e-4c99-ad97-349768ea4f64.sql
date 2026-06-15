
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_stage text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS precall_video_watched boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS precall_assets_sent_at timestamptz;

CREATE TABLE IF NOT EXISTS public.member_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  resource text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, resource)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_permissions TO authenticated;
GRANT ALL ON public.member_permissions TO service_role;

ALTER TABLE public.member_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_perm org read" ON public.member_permissions
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT current_user_orgs()));

CREATE POLICY "member_perm admin write" ON public.member_permissions
  FOR ALL TO authenticated
  USING (has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::app_role[]))
  WITH CHECK (has_org_role(auth.uid(), org_id, ARRAY['owner','admin']::app_role[]));
