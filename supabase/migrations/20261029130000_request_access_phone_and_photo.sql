-- Request-access form gains a phone number and a profile photo.
--
-- The photo exists so a rep shows up as a face on the leaderboard and in the
-- team list instead of two initials. It is collected at request time because
-- that is the only moment we have the person's attention before they are an
-- account; chasing it afterwards never happens.

ALTER TABLE public.membership_requests
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS photo_path text;

COMMENT ON COLUMN public.membership_requests.photo_path IS
  'Object path inside the applicant-photos bucket, not a URL. Same convention as membership_requests'' sibling flows (win-proof) — the bucket is private, so a URL would be stale the moment a signed one expired.';

-- Private bucket, unlike win-proof: a photo of a person is not proof of a sale.
-- Reads go through a signed URL from an authenticated session.
--
-- The limits are enforced here rather than only in the form, because the form
-- is not the security boundary — the anon INSERT policy below is, and a policy
-- cannot express "is actually a 2MB JPEG".
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'applicant-photos',
  'applicant-photos',
  false,
  10485760, -- 10 MB, matching what the form tells the applicant
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- Anonymous insert is deliberate and already precedented here (see "anon upload
-- win proof", 20260806235843): the applicant has no account yet, so there is no
-- authenticated identity to attach. The bucket's own size and MIME limits are
-- what keep that from being an open file dump.
DROP POLICY IF EXISTS "anon upload applicant photo" ON storage.objects;
CREATE POLICY "anon upload applicant photo" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'applicant-photos');

DROP POLICY IF EXISTS "members read applicant photo" ON storage.objects;
CREATE POLICY "members read applicant photo" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'applicant-photos');

DROP POLICY IF EXISTS "members delete applicant photo" ON storage.objects;
CREATE POLICY "members delete applicant photo" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'applicant-photos');

-- The 4-argument function has to go rather than sit alongside a 6-argument one:
-- with both present and the new arguments defaulted, an existing 4-argument
-- call is ambiguous and errors. Dropping it and defaulting the new parameters
-- keeps every old call site working through the new function.
DROP FUNCTION IF EXISTS public.submit_membership_request(text, text, text, app_role);

CREATE OR REPLACE FUNCTION public.submit_membership_request(
  _admin_email text,
  _email text,
  _full_name text,
  _requested_role app_role,
  _phone text DEFAULT NULL,
  _photo_path text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE _admin uuid; _org uuid; _id uuid;
BEGIN
  IF _admin_email IS NULL OR _email IS NULL OR _full_name IS NULL THEN
    RAISE EXCEPTION 'missing fields';
  END IF;
  SELECT id INTO _admin FROM auth.users WHERE lower(email) = lower(_admin_email) LIMIT 1;
  IF _admin IS NULL THEN RAISE EXCEPTION 'admin not found'; END IF;
  SELECT org_id INTO _org FROM public.memberships
    WHERE user_id = _admin AND role IN ('owner','admin')
    ORDER BY created_at ASC LIMIT 1;
  IF _org IS NULL THEN RAISE EXCEPTION 'no workspace for admin'; END IF;
  INSERT INTO public.membership_requests
    (org_id, email, full_name, admin_email, requested_role, status, phone, photo_path)
    VALUES
    (_org, _email, _full_name, _admin_email, _requested_role, 'pending',
     nullif(btrim(_phone), ''), nullif(btrim(_photo_path), ''))
    RETURNING id INTO _id;
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.submit_membership_request(text, text, text, app_role, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_membership_request(text, text, text, app_role, text, text) TO anon, authenticated;
