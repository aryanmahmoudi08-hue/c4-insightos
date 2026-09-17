import { useState } from "react";

/**
 * "Which roster name is me?" — persisted per-browser (not per-account,
 * since there is no real link between an auth user and the free-text
 * `team_members.name` / `setter_activity.team_member_name` /
 * `calls.closer_name` rows the rest of the app already keys every rep
 * dashboard off; see TeamMemberFilter/activity-module.tsx/closer.tsx, none
 * of which resolve "me" automatically either — they default to showing
 * every rep and require a manual name pick).
 *
 * The Home page uses this same name-matching convention (not a new
 * identity system) so a rep's personal cards can be scoped to their own
 * rows without inventing a stronger link the data doesn't actually have.
 * A confident best-effort default (matched against the account's real
 * display name) is offered by the caller — this hook only stores whatever
 * name was ultimately confirmed/chosen.
 */
export function useRepIdentity(storageKey: string) {
  const [repName, setRepNameState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const setRepName = (name: string | null) => {
    setRepNameState(name);
    try {
      if (name) localStorage.setItem(storageKey, name);
      else localStorage.removeItem(storageKey);
    } catch {
      // Private-browsing/storage-blocked — the in-memory state above still
      // works for the current session, it just won't persist across reloads.
    }
  };
  return { repName, setRepName };
}
