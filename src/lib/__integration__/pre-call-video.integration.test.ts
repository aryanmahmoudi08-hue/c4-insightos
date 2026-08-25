import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestWorkspace, teardownTestWorkspace, type TestWorkspace } from "./helpers";
import { getOrCreateLink, resolvePreCallVideo } from "../pre-call-video.server";

// Real round trip against a throwaway Supabase project — this is the part
// that can't be verified from this sandbox's dev server (no
// SUPABASE_SERVICE_ROLE_KEY configured for it), so it's the actual proof
// the public /pcv/$token flow does what it claims: mark
// leads.precall_video_watched, log a real lead_events row, and hand back
// the org's real post_booking VSL — not just that the code compiles.

const admin = adminClient();
let ws: TestWorkspace;
let leadId: string;

beforeAll(async () => {
  ws = await createTestWorkspace(admin, "pcv");
  const { data: lead, error } = await admin.from("leads").insert({ org_id: ws.orgId, full_name: "Test Lead", email: "test-lead@example.test" }).select("id").single();
  if (error || !lead) throw new Error(`seed lead failed: ${error?.message}`);
  leadId = lead.id;
}, 30000);

afterAll(async () => {
  if (ws) await teardownTestWorkspace(admin, ws);
});

describe("pre-call video: getOrCreateLink + resolvePreCallVideo real round trip", () => {
  it("reuses the same unopened link on a second call rather than minting a new token every click", async () => {
    const token1 = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    const token2 = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    expect(token1).toBe(token2);
  });

  it("an unresolved (bogus) token returns found:false, not an error", async () => {
    const result = await resolvePreCallVideo(admin as never, "not-a-real-token");
    expect(result).toEqual({ found: false, vsl: null });
  });

  it("resolving a real token marks the lead watched, logs a real lead_events row, and returns the org's post_booking VSL", async () => {
    const { error: vslErr } = await admin.from("vsls").insert({ org_id: ws.orgId, kind: "post_booking", name: "Test Post-Booking VSL", wistia_video_id: "abc123" });
    expect(vslErr).toBeNull();

    const { data: leadBefore } = await admin.from("leads").select("precall_video_watched").eq("id", leadId).single();
    expect(leadBefore?.precall_video_watched).not.toBe(true);

    const token = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    const result = await resolvePreCallVideo(admin as never, token);

    expect(result.found).toBe(true);
    expect(result.vsl).toEqual({ name: "Test Post-Booking VSL", wistia_video_id: "abc123" });

    const { data: leadAfter } = await admin.from("leads").select("precall_video_watched").eq("id", leadId).single();
    expect(leadAfter?.precall_video_watched).toBe(true);

    const { data: events } = await admin.from("lead_events").select("event_type, payload").eq("lead_id", leadId).eq("event_type", "precall_video_watched");
    expect(events?.length).toBe(1);
    expect((events?.[0]?.payload as { first_open?: boolean } | null)?.first_open).toBe(true);

    const { data: link } = await admin.from("lead_video_links").select("opened_at").eq("token", token).single();
    expect(link?.opened_at).not.toBeNull();
  });

  it("resolving the same token twice flags first_open:true then first_open:false, not two first opens", async () => {
    const token = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    await resolvePreCallVideo(admin as never, token);
    await resolvePreCallVideo(admin as never, token);

    // Scoped to this token's own two events via payload, not a bare count —
    // this lead accumulates events across the whole describe block (shared
    // seed), so a total-count assertion would be testing suite ordering,
    // not this behavior specifically.
    const { data: events } = await admin
      .from("lead_events")
      .select("payload")
      .eq("lead_id", leadId)
      .eq("event_type", "precall_video_watched")
      .contains("payload", { token })
      .order("created_at", { ascending: true });
    expect(events?.length).toBe(2); // both real opens of THIS token, not deduped away
    expect((events?.[0]?.payload as { first_open?: boolean } | null)?.first_open).toBe(true);
    expect((events?.[1]?.payload as { first_open?: boolean } | null)?.first_open).toBe(false);
  });

  it("once a link has been opened, getOrCreateLink mints a fresh token rather than reusing the opened one", async () => {
    const openedToken = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    await resolvePreCallVideo(admin as never, openedToken);

    const nextToken = await getOrCreateLink(ws.userClient as never, ws.orgId, leadId);
    expect(nextToken).not.toBe(openedToken);
  });
});
