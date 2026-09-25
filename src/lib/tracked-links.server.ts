import { supabaseAdmin as typedSupabaseAdmin } from "@/integrations/supabase/client.server";

// The query-builder shape Supabase returns is deeply generic and not worth
// restating here; every other `.server.ts` in this app uses the same alias.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = { from: (t: string) => any };

// `tracked_links` / `tracked_link_clicks` are new and not in the generated
// types snapshot yet — same escape hatch pre-call-video.server.ts uses.
export const supabaseAdmin = typedSupabaseAdmin as unknown as Sb;

/** Short, unguessable, URL-safe. Same generator as lead_video_links. */
function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/**
 * Only http(s) destinations.
 *
 * This matters more than it looks: the redirect route is public and takes the
 * destination straight from this column, so without this check a rep could
 * store a `javascript:` or `data:` URL and the app would hand it to a
 * visitor's browser. Rejecting at write time keeps the read path simple.
 */
export function isSafeDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export type CreatedLink = { token: string; destinationUrl: string };

/** Authenticated path: mint a link for this rep. */
export async function createTrackedLink(
  sb: Sb,
  params: {
    orgId: string;
    userId: string;
    destinationUrl: string;
    label?: string | null;
    kind?: string;
    leadId?: string | null;
  },
): Promise<CreatedLink> {
  const destination = params.destinationUrl.trim();
  if (!isSafeDestination(destination)) {
    throw new Error("Enter a full http(s) link, including https://");
  }
  const token = generateToken();
  const { error } = await sb.from("tracked_links").insert({
    org_id: params.orgId,
    created_by: params.userId,
    lead_id: params.leadId ?? null,
    token,
    destination_url: destination,
    label: params.label?.trim() || null,
    kind: params.kind ?? "dm_link",
  });
  if (error) throw new Error(`Tracked link creation failed: ${error.message}`);
  return { token, destinationUrl: destination };
}

export type ResolvedLink = { found: boolean; destinationUrl: string | null };

/**
 * Public path — no session, the visitor is whoever the rep sent the link to.
 * Takes an injected client rather than the singleton so this can run against
 * a throwaway database in a test, same as resolvePreCallVideo.
 *
 * The click is recorded on every open, not just the first: a prospect who
 * comes back three times is a real signal, and collapsing that to a boolean
 * throws it away. Recording failures are swallowed deliberately — a visitor
 * must reach the destination even if logging breaks, because a broken
 * redirect costs a lead and a missing row costs a statistic.
 */
export async function resolveTrackedLink(
  sb: Sb,
  token: string,
  meta?: { referrer?: string | null; userAgent?: string | null },
): Promise<ResolvedLink> {
  const { data: link, error } = await sb
    .from("tracked_links")
    .select("id, org_id, destination_url")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(`Tracked link lookup failed: ${error.message}`);
  if (!link) return { found: false, destinationUrl: null };

  try {
    await sb.from("tracked_link_clicks").insert({
      org_id: link.org_id,
      link_id: link.id,
      referrer: meta?.referrer ?? null,
      user_agent: meta?.userAgent ?? null,
    });
  } catch (e) {
    console.error("[tracked-links] click log failed", e);
  }

  return { found: true, destinationUrl: link.destination_url as string };
}

/** The columns `listTrackedLinks` selects, named so the mapping below is typed. */
type TrackedLinkRow = {
  id: string;
  token: string;
  destination_url: string;
  label: string | null;
  kind: string;
  created_at: string;
};

export type LinkWithClicks = {
  id: string;
  token: string;
  destinationUrl: string;
  label: string | null;
  kind: string;
  createdAt: string;
  clicks: number;
  lastClickedAt: string | null;
};

/** Links for a workspace, each with its real click count. */
export async function listTrackedLinks(sb: Sb, orgId: string): Promise<LinkWithClicks[]> {
  const { data: links, error } = await sb
    .from("tracked_links")
    .select("id, token, destination_url, label, kind, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Tracked links query failed: ${error.message}`);
  const rows = (links ?? []) as TrackedLinkRow[];
  if (!rows.length) return [];

  const { data: clicks, error: clickErr } = await sb
    .from("tracked_link_clicks")
    .select("link_id, clicked_at")
    .in(
      "link_id",
      rows.map((r) => r.id),
    );
  if (clickErr) throw new Error(`Tracked link clicks query failed: ${clickErr.message}`);

  const byLink = new Map<string, { n: number; last: string | null }>();
  for (const c of (clicks ?? []) as Array<{ link_id: string; clicked_at: string }>) {
    const cur = byLink.get(c.link_id) ?? { n: 0, last: null };
    cur.n += 1;
    if (!cur.last || c.clicked_at > cur.last) cur.last = c.clicked_at;
    byLink.set(c.link_id, cur);
  }

  return rows.map((r) => {
    const agg = byLink.get(r.id) ?? { n: 0, last: null };
    return {
      id: r.id,
      token: r.token,
      destinationUrl: r.destination_url,
      label: r.label ?? null,
      kind: r.kind,
      createdAt: r.created_at,
      clicks: agg.n,
      lastClickedAt: agg.last,
    };
  });
}
