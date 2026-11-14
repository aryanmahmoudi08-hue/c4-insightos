/**
 * Attribution writes shared by every connector that creates or links leads.
 *
 * Two rules:
 *   - A utm_content that matches a content piece's tracking id (ignoring
 *     case) links the lead to that piece. Unmatched values are still stored
 *     raw in source_content_tag, so nothing that arrived is lost.
 *   - First touch wins. A later event — a Calendly booking for someone who
 *     applied through Typeform — only fills fields that are still empty; it
 *     never overwrites where the lead first came from.
 *
 * Takes the client as an argument so it can be tested against a database.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLike } from "./sql-like";

// leads.source_medium/source_content_tag and content_pieces.tracking_id are
// ahead of the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type Attribution = {
  source_platform: string | null;
  source_campaign: string | null;
  source_medium: string | null;
  source_content_tag: string | null;
  source_content_id: string | null;
};

/** The content piece whose tracking id is `tag`, case-insensitively. */
export async function contentIdForTag(
  db: Db,
  orgId: string,
  tag: string | null | undefined,
): Promise<string | null> {
  const t = tag?.trim();
  if (!t) return null;
  const { data } = await db
    .from("content_pieces")
    .select("id")
    .eq("org_id", orgId)
    .ilike("tracking_id", escapeLike(t))
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** UTMs as lead columns, with the content piece resolved from utm_content. */
export async function attributionFromUtms(
  db: Db,
  orgId: string,
  utm: {
    source?: string | null;
    campaign?: string | null;
    medium?: string | null;
    content?: string | null;
  },
): Promise<Attribution> {
  const tag = utm.content?.trim() || null;
  return {
    source_platform: utm.source?.trim() || null,
    source_campaign: utm.campaign?.trim() || null,
    source_medium: utm.medium?.trim() || null,
    source_content_tag: tag,
    source_content_id: await contentIdForTag(db, orgId, tag),
  };
}

/** Only the fields `current` has empty — first touch is never overwritten. */
export function missingAttribution(
  current: Partial<Record<keyof Attribution, string | null>>,
  incoming: Attribution,
): Partial<Attribution> {
  const patch: Partial<Attribution> = {};
  for (const key of Object.keys(incoming) as Array<keyof Attribution>) {
    if (incoming[key] && !current[key]) patch[key] = incoming[key];
  }
  return patch;
}

/** Fill a lead's empty attribution fields from a later event. */
export async function fillMissingAttribution(
  db: Db,
  orgId: string,
  leadId: string,
  incoming: Attribution,
) {
  const { data: lead } = await db
    .from("leads")
    .select(
      "source_platform, source_campaign, source_medium, source_content_tag, source_content_id",
    )
    .eq("org_id", orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  const patch = missingAttribution(lead, incoming);
  if (!Object.keys(patch).length) return;
  await db.from("leads").update(patch).eq("org_id", orgId).eq("id", leadId);
}
