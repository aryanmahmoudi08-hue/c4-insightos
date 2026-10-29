-- Make `memberships -> profiles` embeddable, so the Team roster stops coming
-- back empty.
--
-- `_authenticated.team.tsx` asks PostgREST for
--   memberships.select("user_id, role, profiles:user_id(display_name, avatar_url)")
-- and gets:
--   PGRST200 — Could not find a relationship between 'memberships' and 'user_id'
--
-- Both tables reference auth.users(id) — memberships.user_id and profiles.id —
-- but neither references the other, and PostgREST will only embed across a real
-- foreign key. So the request 400s, the roster renders zero rows, and the page
-- reports "0 team members on the roster" while the table underneath holds them.
-- Dev Bypass hides it completely, because that path returns fixture rows
-- without ever calling PostgREST.
--
-- The fix is the missing constraint rather than splitting the query in the
-- client: the same embed is used by the roster, the access tab and the avatar
-- lookup, and a relationship that genuinely exists should be declared once in
-- the schema instead of worked around three times.

-- Belt and braces. handle_new_user() creates a profile for every new auth user,
-- so this should select nothing — but adding a foreign key against a table with
-- even one orphan fails outright, and an older row predating that trigger would
-- take the whole migration down with it.
INSERT INTO public.profiles (id, display_name)
SELECT m.user_id, split_part(u.email, '@', 1)
FROM public.memberships m
JOIN auth.users u ON u.id = m.user_id
LEFT JOIN public.profiles p ON p.id = m.user_id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ON DELETE CASCADE matches what both tables already do from auth.users: when
-- the user goes, the profile and the membership go with them. Without it this
-- constraint would block deleting a profile that still has memberships, which
-- is the opposite of the existing behaviour.
ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_user_id_profiles_fkey;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- PostgREST caches the schema and will keep returning PGRST200 until it is told
-- the relationship exists.
NOTIFY pgrst, 'reload schema';
