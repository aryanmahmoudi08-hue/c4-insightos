import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- request-scoped client, typed loosely like the other .functions.ts helpers.
async function assertOrgMember(supabase: any, userId: string, orgId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/**
 * A DM setter claims a lead when they send their link, so the application is
 * theirs even if the lead applies from another phone or browser. Needs at
 * least one way to recognise the lead: a handle, email, phone, or full name.
 */
export const createDmClaimFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        org_id: z.string().uuid(),
        setter_member_id: z.string().uuid().nullable(),
        lead_name: z.string().max(200).nullable(),
        platform: z.enum(["instagram", "tiktok", "linkedin", "other"]).nullable(),
        handle: z.string().max(300).nullable(),
        email: z.string().max(255).nullable(),
        phone: z.string().max(60).nullable(),
        notes: z.string().max(500).nullable(),
      })
      .refine(
        (v) =>
          !!(
            blank(v.handle) ||
            blank(v.email) ||
            blank(v.phone) ||
            (blank(v.lead_name) ?? "").includes(" ")
          ),
        { message: "Add their handle, email, phone, or full name (first and last)." },
      )
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as never as { supabase: unknown; userId: string };
    await assertOrgMember(supabase, userId, data.org_id);
    const { claimAndMatch } = await import("./dm-ownership.server");
    return claimAndMatch({
      orgId: data.org_id,
      createdBy: userId,
      setterMemberId: data.setter_member_id,
      leadName: blank(data.lead_name),
      platform: data.platform,
      handle: blank(data.handle),
      email: blank(data.email),
      phone: blank(data.phone),
      notes: blank(data.notes),
    });
  });
