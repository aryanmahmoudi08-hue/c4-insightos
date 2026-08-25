-- Post-booking pre-call video: a real per-lead delivery link + click tracking,
-- replacing the manual "toggle a checkbox" that's the only thing driving
-- leads.precall_video_watched today. Public resolve step (no lead account
-- exists) goes through supabaseAdmin from a deliberately unauthenticated
-- server fn, same pattern as daily_wins; authenticated reps generate/view
-- links through normal RLS.
CREATE TABLE public.lead_video_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  vsl_kind text NOT NULL DEFAULT 'post_booking',
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.lead_video_links(lead_id);
GRANT SELECT, INSERT, UPDATE ON public.lead_video_links TO authenticated;
GRANT ALL ON public.lead_video_links TO service_role;
ALTER TABLE public.lead_video_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lvl_select" ON public.lead_video_links FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "lvl_insert" ON public.lead_video_links FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));
