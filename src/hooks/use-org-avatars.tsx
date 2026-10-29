import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { avatarNameKey } from "@/lib/avatar-url";

/**
 * Display name -> signed avatar URL, for everyone in the current workspace.
 *
 * Keyed by name rather than user id on purpose. The surfaces that want a face
 * — the leaderboard especially — work in rep *names*, because a leaderboard row
 * is built from logged activity (`closer_name`, `setter_name`) rather than from
 * a membership row. Matching on name is already how this app correlates the
 * two (see `_authenticated.team.tsx`, which falls back to
 * `c.closer_name === m.profiles?.display_name`), so this follows that rather
 * than inventing a second, different correlation.
 *
 * That makes it best-effort by nature: two people with the same display name
 * collide, and a rep whose logged name differs from their profile name simply
 * gets initials. Both degrade to exactly what the app did before photos
 * existed, which is why name-matching is acceptable here and would not be for
 * anything that moved money.
 */

/** Long enough that a signed URL outlives any realistic session on a page,
 *  short enough that a leaked URL stops working the same day. Refetch below is
 *  set well inside it so an open tab re-signs before its links expire. */
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 8;

export { avatarFor } from "@/lib/avatar-url";

export function useOrgAvatars() {
  const { data: org } = useCurrentOrg();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;

  const { data } = useQuery({
    queryKey: ["org-avatars", orgId],
    enabled: !!orgId,
    // Re-sign comfortably before SIGNED_URL_TTL_SECONDS elapses, so a tab left
    // open overnight does not start rendering broken images.
    staleTime: (SIGNED_URL_TTL_SECONDS / 2) * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data: rows, error } = await supabase
        .from("memberships")
        .select("profiles:user_id(display_name, avatar_url)")
        .eq("org_id", orgId!);
      if (error) throw new Error(error.message);

      const byPath = new Map<string, string[]>();
      for (const row of rows ?? []) {
        const p = (
          row as { profiles?: { display_name?: string | null; avatar_url?: string | null } }
        ).profiles;
        if (!p?.avatar_url || !p.display_name) continue;
        // One path can serve several names only in the degenerate case, but
        // grouping keeps the signing call deduplicated either way.
        const names = byPath.get(p.avatar_url) ?? [];
        const key = avatarNameKey(p.display_name);
        if (!key) continue;
        names.push(key);
        byPath.set(p.avatar_url, names);
      }

      const paths = [...byPath.keys()];
      if (paths.length === 0) return new Map();

      const { data: signed, error: signErr } = await supabase.storage
        .from("applicant-photos")
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      // A failure here means no faces, not a broken page — every caller falls
      // back to initials, which is what they rendered before this existed.
      if (signErr) return new Map();

      const out = new Map<string, string>();
      for (const entry of signed ?? []) {
        if (!entry.signedUrl || entry.error) continue;
        for (const name of byPath.get(entry.path ?? "") ?? []) out.set(name, entry.signedUrl);
      }
      return out;
    },
  });

  return data ?? EMPTY;
}

/** Shared frozen instance so consumers can use the result as a hook dep
 *  without it changing identity on every render while the query is pending. */
const EMPTY: ReadonlyMap<string, string> = new Map();
