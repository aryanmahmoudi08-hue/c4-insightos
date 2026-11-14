/**
 * Escape a value for use as a literal in a Postgres LIKE / ILIKE pattern.
 *
 * `_` matches any single character and `%` any run, and both are ordinary
 * in email addresses — `first_last@x.com` is a pattern that also matches
 * `firstXlast@x.com`. Matching a lead by email with an unescaped ILIKE can
 * therefore link a booking or a ping to the wrong person.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
