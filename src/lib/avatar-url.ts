/**
 * Name-keyed avatar lookup.
 *
 * Avatars are correlated to people by display name rather than user id,
 * because the surfaces that want a face — the leaderboard above all — are
 * built from logged activity (`closer_name`, `setter_name`) and never carry a
 * user id. That is already how this app joins activity to members elsewhere,
 * so this matches it rather than inventing a second scheme.
 *
 * Name matching is best-effort by construction: two people sharing a display
 * name collide, and a rep whose logged name differs from their profile name
 * gets initials. Both degrade to precisely what rendered before photos
 * existed, which is why it is acceptable for a decoration and would not be for
 * anything that attributed money.
 */

/** Free-text name fields arrive with stray case and padding — "  Jamie  Lee "
 *  and "jamie lee" are the same person. Collapsing inner runs of whitespace
 *  matters as much as trimming: a double space between first and last name is
 *  invisible in the UI and would otherwise silently miss. */
export function avatarNameKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = name.trim().replace(/\s+/g, " ").toLowerCase();
  return key || null;
}

/** Look a person's signed avatar URL up by display name. */
export function avatarFor(
  avatars: ReadonlyMap<string, string>,
  name: string | null | undefined,
): string | undefined {
  const key = avatarNameKey(name);
  return key ? avatars.get(key) : undefined;
}
