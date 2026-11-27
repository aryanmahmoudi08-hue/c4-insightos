/**
 * Who owns a lead a DM setter brought in — pure rules, no database.
 *
 * A lead is a DM setter's when either:
 *   - it applied through their tracked link: utm_medium=dm and
 *     utm_content=dm-<name> (the site keeps these 30 days, DM winning), or
 *   - it matches a claim the setter logged when they sent the link.
 *
 * Claims match on the strongest identifier both sides have: email, then
 * phone, then social handle, then full name. A name match alone only counts
 * when it is the full name (first and last), so two "Mike"s never collide.
 */

export type DmClaimLike = {
  id: string;
  setter_member_id: string | null;
  setter_name: string | null;
  lead_name: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  matched_lead_id: string | null;
};

export type LeadIdentity = {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  handle: string | null;
};

/** Claims older than this don't match: the same window the site keeps tags. */
export const CLAIM_WINDOW_DAYS = 30;

export const normEmail = (v: string | null | undefined) => v?.trim().toLowerCase() || null;

/** Last 10 digits, so "+1 (404) 555-0182" and "4045550182" are the same. */
export function normPhone(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
}

/** "@Dana.Reed", "instagram.com/dana.reed/", "linkedin.com/in/dana-reed" → "danareed". */
export function normHandle(v: string | null | undefined): string | null {
  let s = (v ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.replace(/^(instagram\.com|tiktok\.com|linkedin\.com\/in|linkedin\.com)\//, "");
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^@/, "").replace(/[^a-z0-9]/g, "");
  return s || null;
}

/** Full name only (two or more words), lowercased, single-spaced. */
export function normFullName(v: string | null | undefined): string | null {
  const s = (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return s.includes(" ") ? s : null;
}

/** "dm-jordan" → "jordan"; anything that isn't a dm tag → null. */
export function tagName(contentTag: string | null | undefined): string | null {
  const m = /^dm-([a-z0-9]+)$/i.exec((contentTag ?? "").trim());
  return m ? m[1].toLowerCase() : null;
}

/** Which roster entry a "dm-<name>" tag means: first name, or the whole name squashed. */
export function memberForTag<
  T extends { name: string; role?: string | null; active?: boolean | null },
>(tag: string, members: T[]): T | null {
  const live = members.filter((m) => m.active !== false);
  const hits = live.filter((m) => {
    const full = m.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const first = m.name
      .trim()
      .toLowerCase()
      .split(/\s+/)[0]
      .replace(/[^a-z0-9]/g, "");
    return full === tag || first === tag;
  });
  if (hits.length <= 1) return hits[0] ?? null;
  // Two reps with the same first name: prefer the DM setter.
  return hits.find((m) => (m.role ?? "").includes("setter")) ?? hits[0];
}

/** The claim this lead matches, strongest identifier first; newest claim wins a tie. */
export function matchClaim(
  lead: LeadIdentity,
  claims: DmClaimLike[],
  now: Date = new Date(),
): { claim: DmClaimLike; on: "email" | "phone" | "handle" | "name" } | null {
  const cutoff = now.getTime() - CLAIM_WINDOW_DAYS * 864e5;
  const open = claims
    .filter((c) => !c.matched_lead_id && new Date(c.created_at).getTime() >= cutoff)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const e = normEmail(lead.email);
  const p = normPhone(lead.phone);
  const h = normHandle(lead.handle);
  const n = normFullName(lead.full_name);
  for (const on of ["email", "phone", "handle", "name"] as const) {
    const hit = open.find((c) => {
      if (on === "email") return !!e && normEmail(c.email) === e;
      if (on === "phone") return !!p && normPhone(c.phone) === p;
      if (on === "handle") return !!h && normHandle(c.handle) === h;
      return !!n && normFullName(c.lead_name) === n;
    });
    if (hit) return { claim: hit, on };
  }
  return null;
}
