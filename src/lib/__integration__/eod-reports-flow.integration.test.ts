import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, createTestWorkspace, teardownTestWorkspace, type TestWorkspace } from "./helpers";
import { buildSetterActivityPayload, buildCallPayload, buildObjectionRows, type EodValues } from "../eod-reports";

// EOD Reports Rebuild verification: the step-flow is a NEW insert path (its
// own payload builders in eod-reports.ts), even though the target tables/
// columns are the same ones Phase E already proved out in
// eod-forms.integration.test.ts. Don't assume the new path works just
// because the old dialogs' path does — this re-runs the same real-insert +
// re-aggregate discipline against the new builder functions directly, for
// all three roles.

const admin = adminClient();
let ws: TestWorkspace;

beforeAll(async () => { ws = await createTestWorkspace(admin, "eod-reports-flow"); }, 30000);
afterAll(async () => { if (ws) await teardownTestWorkspace(admin, ws); });

describe("DM Setter EOD flow — buildSetterActivityPayload, dm_setter role", () => {
  it("the step-flow's own payload builder produces a row the dashboard's aggregation query picks up", async () => {
    const values: EodValues = {
      team_member_name: "Flow Test Setter",
      activity_date: "2026-08-11",
      lead_source: "Instagram Spiderweb",
      leads_contacted: 20,
      links_sent: 5,
      qualified_convos: 8,
      sets: 4,
      calls_on_calendar: 4,
      live_calls: 3,
      closes: 1,
      downsells: 0,
      cash_collected: 1500,
      total_revenue: 3000,
      rate_today: 9,
      objections: "price, timing",
      notes: "Good day",
    };
    const payload = buildSetterActivityPayload("dm_setter", ws.orgId, values);
    expect(payload.leads_contacted).toBe(20);
    expect(payload.cash_collected_cents).toBe(150000);

    const { error: insErr } = await ws.userClient.from("setter_activity").insert(payload);
    expect(insErr).toBeNull();

    const { data, error } = await ws.userClient
      .from("setter_activity")
      .select("team_member_name, role, leads_contacted, sets, closes, cash_collected_cents, dials, connections")
      .eq("org_id", ws.orgId)
      .eq("team_member_name", "Flow Test Setter");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ role: "dm_setter", leads_contacted: 20, sets: 4, closes: 1, cash_collected_cents: 150000, dials: 0, connections: 0 });
  });
});

describe("Inbound Dialer EOD flow — buildSetterActivityPayload, inbound_dialer role", () => {
  it("the same builder correctly maps Dials/Connections for the dialer branch", async () => {
    const values: EodValues = {
      team_member_name: "Flow Test Dialer",
      activity_date: "2026-08-11",
      dials: 60,
      connections: 15,
      qualified_convos: 6,
      sets: 3,
      calls_on_calendar: 3,
      live_calls: 2,
      closes: 1,
      downsells: 0,
      cash_collected: 1200,
      total_revenue: 2400,
      rate_today: 7,
      objections: "spouse",
      notes: "Solid volume",
    };
    const payload = buildSetterActivityPayload("inbound_dialer", ws.orgId, values);
    expect(payload.dials).toBe(60);
    expect(payload.connections).toBe(15);
    expect(payload.leads_contacted).toBe(0);

    const { error: insErr } = await ws.userClient.from("setter_activity").insert(payload);
    expect(insErr).toBeNull();

    const { data, error } = await ws.userClient
      .from("setter_activity")
      .select("team_member_name, role, dials, connections, sets, closes")
      .eq("org_id", ws.orgId)
      .eq("team_member_name", "Flow Test Dialer");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ role: "inbound_dialer", dials: 60, connections: 15, sets: 3, closes: 1 });
  });
});

describe("Closer EOD flow — buildCallPayload + buildObjectionRows", () => {
  it("a real rep-authenticated insert lands with objections parsed, and the dashboard's own query picks it up", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-11T15:00",
      lead_email: "flow-test-lead@example.test",
      status: "closed",
      showed: true,
      offer_made: true,
      cash_collected: 2000,
      deposit: 0,
      total_revenue: 5000,
      ttc_min: 45,
      key_moment: "ROI reframe",
      objections: "price, timing",
      recording_url: "https://example.test/recording/flow-test",
      summary: "Closed after handling price objection.",
    };
    const payload = buildCallPayload(ws.orgId, values);
    expect(payload.status).toBe("closed");
    expect(payload.closed).toBe(true);
    expect(payload.cash_collected_cents).toBe(200000);

    const { data: callRow, error: callErr } = await ws.userClient.from("calls").insert(payload).select("id").single();
    expect(callErr).toBeNull();
    expect(callRow?.id).toBeTruthy();

    const objRows = buildObjectionRows(ws.orgId, callRow!.id, values.objections, payload.closed);
    expect(objRows).toHaveLength(2);
    const { error: objErr } = await ws.userClient.from("call_objections").insert(objRows);
    expect(objErr).toBeNull();

    const { data: calls, error: callsErr } = await ws.userClient
      .from("calls")
      .select("closer_name, status, showed, offer_made, closed, cash_collected_cents, contract_value_cents")
      .eq("org_id", ws.orgId)
      .eq("closer_name", "Flow Test Closer");
    expect(callsErr).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({ status: "closed", closed: true, cash_collected_cents: 200000, contract_value_cents: 500000 });

    const { data: objections, error: objSelErr } = await ws.userClient.from("call_objections").select("objection, resolved").eq("call_id", callRow!.id);
    expect(objSelErr).toBeNull();
    expect(objections).toHaveLength(2);
    expect(objections?.map((o) => o.objection).sort()).toEqual(["price", "timing"]);
  });

  it("an unpicked (optional) lead and unresolved-status call still insert cleanly — lead_id/objections stay empty, not fabricated", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-12T10:00",
      lead_email: "flow-test-lead-2@example.test",
      status: "follow_up",
      showed: true,
      offer_made: false,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-2",
      summary: "No decision yet, following up next week.",
    };
    const payload = buildCallPayload(ws.orgId, values);
    expect(payload.lead_id).toBeNull();
    expect(payload.closed).toBe(false);
    expect(payload.status).toBe("follow_up");

    const { data: callRow, error } = await ws.userClient.from("calls").insert(payload).select("id, status, lead_id").single();
    expect(error).toBeNull();
    expect(callRow?.status).toBe("follow_up");
    expect(callRow?.lead_id).toBeNull();

    const objRows = buildObjectionRows(ws.orgId, callRow!.id, values.objections, payload.closed);
    expect(objRows).toHaveLength(0);
  });
});
