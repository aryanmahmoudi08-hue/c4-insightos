import { supabaseAdmin as typedSupabaseAdmin } from "@/integrations/supabase/client.server";

type Sb = { from: (t: string) => any };

// `lead_video_links` is a real table (see the migration adding it) but
// `integrations/supabase/types.ts` is generated from the live schema and
// hasn't been regenerated against it yet — same `any` escape hatch every
// other `.server.ts` file in this app uses for its own `Sb` type, applied
// here to supabaseAdmin specifically until `supabase gen types` catches up.
export const supabaseAdmin = typedSupabaseAdmin as unknown as Sb;

/** Random, unguessable, URL-safe token — no dependency on lead/org IDs being
 * secret (they aren't, in query params elsewhere in this app). */
function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Authenticated path: get-or-create a link for this lead. Reuses an
 * unopened link if one already exists rather than minting a new token every
 * time a rep clicks "copy link" — one real link per lead, not one per click.
 */
export async function getOrCreateLink(sb: Sb, orgId: string, leadId: string): Promise<string> {
  const { data: existing, error: selErr } = await sb
    .from("lead_video_links")
    .select("token")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .is("opened_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(`Lead video links query failed: ${selErr.message}`);
  if (existing?.token) return existing.token as string;

  const token = generateToken();
  const { error: insErr } = await sb.from("lead_video_links").insert({ org_id: orgId, lead_id: leadId, token, vsl_kind: "post_booking" });
  if (insErr) throw new Error(`Lead video link creation failed: ${insErr.message}`);
  return token;
}

export type ResolvedPreCallVideo = {
  found: boolean;
  vsl: { name: string; wistia_video_id: string | null } | null;
};

/**
 * Public path (no auth, no lead session — this is the one deliberately
 * public surface, same posture as daily-wins.server.ts). Takes an injected
 * admin-privileged client rather than reaching for the supabaseAdmin
 * singleton directly — same shape as getOrCreateLink above and every
 * testable `.server.ts` function elsewhere in this app, specifically so
 * this can run against a real (throwaway) database in an integration test,
 * not just be trusted by inspection. The public server-fn wrapper is the
 * only caller that passes the real production supabaseAdmin.
 *
 * Marks the lead's real per-lead signal (leads.precall_video_watched,
 * lead_events) the moment the link is actually opened — stricter than the
 * manual checkbox it replaces, which required zero verification.
 */
export async function resolvePreCallVideo(sb: Sb, token: string): Promise<ResolvedPreCallVideo> {
  const { data: link, error: linkErr } = await sb
    .from("lead_video_links")
    .select("id, org_id, lead_id, vsl_kind, opened_at")
    .eq("token", token)
    .maybeSingle();
  if (linkErr) throw new Error(`Lead video link lookup failed: ${linkErr.message}`);
  if (!link) return { found: false, vsl: null };

  const isFirstOpen = !link.opened_at;
  await Promise.all([
    sb.from("leads").update({ precall_video_watched: true }).eq("id", link.lead_id),
    sb.from("lead_events").insert({
      org_id: link.org_id,
      lead_id: link.lead_id,
      event_type: "precall_video_watched",
      payload: { token, first_open: isFirstOpen },
    }),
    isFirstOpen
      ? sb.from("lead_video_links").update({ opened_at: new Date().toISOString() }).eq("id", link.id)
      : Promise.resolve(),
  ]);

  const { data: vsl, error: vslErr } = await sb
    .from("vsls")
    .select("name, wistia_video_id")
    .eq("org_id", link.org_id)
    .eq("kind", link.vsl_kind)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (vslErr) throw new Error(`VSL lookup failed: ${vslErr.message}`);

  return { found: true, vsl: vsl ?? null };
}
