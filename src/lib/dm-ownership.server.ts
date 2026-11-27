/**
 * DM lead ownership, applied to real rows. Rules live in dm-ownership.ts.
 *
 *   applyDmOwnership  — run on every application (partial or complete):
 *                       tagged link first, else an open claim.
 *   claimAndMatch     — a setter logs a lead; if that lead already applied
 *                       (they claimed late), it's matched straight away.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  CLAIM_WINDOW_DAYS,
  matchClaim,
  memberForTag,
  normEmail,
  normFullName,
  normHandle,
  normPhone,
  tagName,
  type DmClaimLike,
  type LeadIdentity,
} from "./dm-ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

type Member = {
  id: string;
  name: string;
  role: string | null;
  user_id: string | null;
  active: boolean | null;
};

export type DmOwnership = {
  via: "link" | "claim";
  setterName: string | null;
  memberId: string | null;
};

async function roster(orgId: string): Promise<Member[]> {
  const { data } = await db
    .from("team_members")
    .select("id, name, role, user_id, active")
    .eq("org_id", orgId);
  return (data ?? []) as Member[];
}

async function stamp(
  orgId: string,
  leadId: string,
  via: "link" | "claim",
  member: Member | null,
  setterName: string | null,
) {
  const patch: Record<string, unknown> = {
    dm_owned_via: via,
    dm_setter_member_id: member?.id ?? null,
    dm_setter_name: member?.name ?? setterName,
    dm_owned_at: new Date().toISOString(),
  };
  // assigned_setter_id is an auth.users FK; only set it when the setter has
  // a login, so payment alerts can tag them.
  if (member?.user_id) patch.assigned_setter_id = member.user_id;
  await db.from("leads").update(patch).eq("org_id", orgId).eq("id", leadId);
}

/** Decide and record whether this application is a DM setter's lead. Never
 *  throws: ownership is best-effort and must not fail an application. */
export async function applyDmOwnership(
  orgId: string,
  leadId: string | null,
  input: LeadIdentity & { sourceMedium: string | null; contentTag: string | null },
): Promise<DmOwnership | null> {
  if (!leadId) return null;
  try {
    const { data: existing } = await db
      .from("leads")
      .select("dm_owned_via, dm_setter_name, dm_setter_member_id")
      .eq("org_id", orgId)
      .eq("id", leadId)
      .maybeSingle();
    if (existing?.dm_owned_via) {
      return {
        via: existing.dm_owned_via,
        setterName: existing.dm_setter_name ?? null,
        memberId: existing.dm_setter_member_id ?? null,
      };
    }

    // 1. Their tracked link.
    if ((input.sourceMedium ?? "").toLowerCase() === "dm") {
      const tag = tagName(input.contentTag);
      const member = tag ? memberForTag(tag, await roster(orgId)) : null;
      const name = member?.name ?? (tag ? tag[0].toUpperCase() + tag.slice(1) : null);
      await stamp(orgId, leadId, "link", member, name);
      return { via: "link", setterName: name, memberId: member?.id ?? null };
    }

    // 2. A claim the setter logged.
    const since = new Date(Date.now() - CLAIM_WINDOW_DAYS * 864e5).toISOString();
    const { data: claims } = await db
      .from("dm_claims")
      .select(
        "id, setter_member_id, setter_name, lead_name, handle, email, phone, created_at, matched_lead_id",
      )
      .eq("org_id", orgId)
      .is("matched_lead_id", null)
      .gte("created_at", since)
      .limit(500);
    const hit = matchClaim(input, (claims ?? []) as DmClaimLike[]);
    if (!hit) return null;
    const member = hit.claim.setter_member_id
      ? ((await roster(orgId)).find((m) => m.id === hit.claim.setter_member_id) ?? null)
      : null;
    await stamp(orgId, leadId, "claim", member, hit.claim.setter_name);
    await db
      .from("dm_claims")
      .update({ matched_lead_id: leadId, matched_at: new Date().toISOString() })
      .eq("id", hit.claim.id);
    return {
      via: "claim",
      setterName: member?.name ?? hit.claim.setter_name,
      memberId: member?.id ?? null,
    };
  } catch (err) {
    console.error("applyDmOwnership:", err);
    return null;
  }
}

export type NewClaim = {
  orgId: string;
  createdBy: string;
  setterMemberId: string | null;
  leadName: string | null;
  platform: string | null;
  handle: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

/** Save a claim, then check whether that lead already applied (a late claim). */
export async function claimAndMatch(
  c: NewClaim,
): Promise<{ id: string; matchedLeadName: string | null }> {
  const members = await roster(c.orgId);
  const member = c.setterMemberId ? (members.find((m) => m.id === c.setterMemberId) ?? null) : null;
  const { data: saved, error } = await db
    .from("dm_claims")
    .insert({
      org_id: c.orgId,
      created_by: c.createdBy,
      setter_member_id: member?.id ?? null,
      setter_name: member?.name ?? null,
      lead_name: c.leadName,
      platform: c.platform,
      handle: c.handle,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
    })
    .select(
      "id, setter_member_id, setter_name, lead_name, handle, email, phone, created_at, matched_lead_id",
    )
    .single();
  if (error) throw new Error(error.message);

  // Already applied? Look at recent leads nobody owns yet.
  const since = new Date(Date.now() - CLAIM_WINDOW_DAYS * 864e5).toISOString();
  const { data: leads } = await db
    .from("leads")
    .select("id, full_name, email, phone, handle")
    .eq("org_id", c.orgId)
    .is("dm_owned_via", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);
  const claim = saved as DmClaimLike;
  for (const l of (leads ?? []) as Array<LeadIdentity & { id: string }>) {
    const sameEmail = normEmail(claim.email) && normEmail(claim.email) === normEmail(l.email);
    const samePhone = normPhone(claim.phone) && normPhone(claim.phone) === normPhone(l.phone);
    const sameHandle =
      normHandle(claim.handle) && normHandle(claim.handle) === normHandle(l.handle);
    const sameName =
      normFullName(claim.lead_name) && normFullName(claim.lead_name) === normFullName(l.full_name);
    if (sameEmail || samePhone || sameHandle || sameName) {
      await stamp(c.orgId, l.id, "claim", member, member?.name ?? null);
      await db
        .from("dm_claims")
        .update({ matched_lead_id: l.id, matched_at: new Date().toISOString() })
        .eq("id", claim.id);
      return { id: claim.id, matchedLeadName: l.full_name };
    }
  }
  return { id: claim.id, matchedLeadName: null };
}
