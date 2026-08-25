-- Hiring: portfolio/audio application links + resume upload (Sales Tracking Part 6).
ALTER TABLE public.hiring_applicants
  ADD COLUMN IF NOT EXISTS portfolio_url text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS resume_url text;

-- Resume storage — same bucket-policy shape as the existing `win-proof` bucket
-- (see 20260806235843_...sql), scoped to `authenticated` only (unlike
-- win-proof's `anon` allowance, since Hiring is an authed-only page with no
-- public applicant-facing upload flow).
CREATE POLICY "members upload applicant resumes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'applicant-resumes');

CREATE POLICY "members read applicant resumes" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'applicant-resumes');

CREATE POLICY "members delete applicant resumes" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'applicant-resumes');
