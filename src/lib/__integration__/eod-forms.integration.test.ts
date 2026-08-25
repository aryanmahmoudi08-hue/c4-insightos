import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestWorkspace, teardownTestWorkspace, type TestWorkspace } from "./helpers";

// Part 6 verification: "submit a real test entry through each of the three
// forms and confirm it actually appears in the corresponding dashboard's
// existing table/tiles — not just a success toast." This sandbox has no
// real login for the actual dev workspace (same constraint hit earlier this
// project — no SUPABASE_SERVICE_ROLE_KEY, and no test user credentials to
// drive the real React dialogs end-to-end), so the React dialog UI itself
// isn't click-driven here. What IS verified, against a real throwaway
// Supabase project: the exact row shape each dialog's mutationFn inserts
// (activity-module.tsx's "Log day", closer.tsx's "Log call" +
// call_objections) writes successfully through a real RLS-scoped
// (authenticated, non-admin) client — proving a rep really can write it —
// and that re-running the SAME aggregation queries the dashboards use picks
// the new row up. That's the real "feeds the dashboard" proof; it's not a
// substitute for a live click-through, and is reported as such.

const admin = adminClient();
let ws: TestWorkspace;

beforeAll(async () => { ws = await createTestWorkspace(admin, "eod-forms"); }, 30000);
afterAll(async () => { if (ws) await teardownTestWorkspace(admin, ws); });

describe("DM Setter / Inbound Dialer 'Log day' — exact activity-module.tsx payload shape", () => {
  it("a real rep-authenticated insert lands, and the dashboard's own aggregation query picks it up", async () => {
    // Exact field set + types activity-module.tsx's create.mutate() builds,
    // for the Dialer variant (dials/connections branch).
    const payload = {
      org_id: ws.orgId,
      team_member_name: "Integration Test Dialer",
      activity_date: "2026-08-10",
      rate_today: 8,
      objections: "price, timing",
      notes: "Solid day",
      lead_source: null,
      leads_contacted: 0,
      links_sent: 0,
      qualified_convos: 6,
      sets: 3,
      calls_on_calendar: 3,
      live_calls: 2,
      closes: 1,
      downsells: 0,
      cash_collected_cents: 150000,
      total_revenue_cents: 300000,
      dials: 40,
      connections: 12,
    };
    const { error: insErr } = await ws.userClient.from("setter_activity").insert(payload);
    expect(insErr).toBeNull();

    // The exact select activity-module.tsx's own dashboard query uses.
    const { data, error } = await ws.userClient
      .from("setter_activity")
      .select("team_member_name, sets, qualified_convos, leads_contacted, connections, dials, closes, live_calls, calls_on_calendar, links_sent, cash_collected_cents")
      .eq("org_id", ws.orgId)
      .eq("team_member_name", "Integration Test Dialer");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ dials: 40, connections: 12, sets: 3, closes: 1, cash_collected_cents: 150000 });
  });
});

describe("Closer 'Log call' — exact closer.tsx payload shape, including call_objections", () => {
  it("a real rep-authenticated insert lands with all 8 status values valid, and objections parse into real rows", async () => {
    const payload = {
      org_id: ws.orgId,
      lead_id: null,
      closer_name: "Integration Test Closer",
      lead_email: "test-lead@example.test",
      status: "closed",
      scheduled_for: new Date("2026-08-10T15:00:00Z").toISOString(),
      showed: true,
      offer_made: true,
      closed: true,
      contract_value_cents: 500000,
      cash_collected_cents: 200000,
      deposit_cents: 0,
      call_summary: "Closed on the second call after handling a price objection.",
      recording_url: "https://example.test/recording/abc123",
      time_to_close_seconds: 45 * 60,
      key_moment: "ROI reframe",
    };
    const { data: callRow, error: callErr } = await ws.userClient.from("calls").insert(payload).select("id").single();
    expect(callErr).toBeNull();
    expect(callRow?.id).toBeTruthy();

    // Exact objection-parsing logic closer.tsx's mutationFn runs.
    const objRaw = "price, timing";
    const parts = objRaw.split(/[,;\n|]+/).map((s) => s.trim()).filter(Boolean);
    const { error: objErr } = await ws.userClient.from("call_objections").insert(
      parts.map((p) => ({ org_id: ws.orgId, call_id: callRow!.id, objection: p, resolved: true })),
    );
    expect(objErr).toBeNull();

    // Re-run closer.tsx's own dashboard aggregation query shape.
    const { data: calls, error: callsErr } = await ws.userClient
      .from("calls")
      .select("closer_name, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents")
      .eq("org_id", ws.orgId)
      .eq("closer_name", "Integration Test Closer");
    expect(callsErr).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({ status: "closed", closed: true, cash_collected_cents: 200000 });

    const { data: objections, error: objSelErr } = await ws.userClient.from("call_objections").select("objection, resolved").eq("call_id", callRow!.id);
    expect(objSelErr).toBeNull();
    expect(objections).toHaveLength(2);
    expect(objections?.map((o) => o.objection).sort()).toEqual(["price", "timing"]);
  });

  it("every one of the 8 expanded STATUS_OPTIONS values is a real, insertable enum value", async () => {
    const values = ["booked", "showed", "no_show", "offer_made", "closed", "disqualified", "follow_up", "rescheduled"];
    for (const status of values) {
      const { error } = await ws.userClient.from("calls").insert({
        org_id: ws.orgId, closer_name: "Status Probe", status, showed: false, offer_made: false, closed: status === "closed",
      });
      expect(error, `status "${status}" should be a valid calls.status enum value`).toBeNull();
    }
  });
});
