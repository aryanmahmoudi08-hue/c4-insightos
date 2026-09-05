import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createTestWorkspace,
  teardownTestWorkspace,
  type TestWorkspace,
} from "./helpers";
import {
  buildSetterActivityPayload,
  buildClosureCallPayload,
  type EodValues,
} from "../eod-reports";

// EOD Reports Rebuild verification: the step-flow is a NEW insert path (its
// own payload builders in eod-reports.ts), even though the target tables/
// columns are the same ones Phase E already proved out in
// eod-forms.integration.test.ts. Don't assume the new path works just
// because the old dialogs' path does — this re-runs the same real-insert +
// re-aggregate discipline against the new builder functions directly, for
// all three roles.

const admin = adminClient();
let ws: TestWorkspace;

beforeAll(async () => {
  ws = await createTestWorkspace(admin, "eod-reports-flow");
}, 30000);
afterAll(async () => {
  if (ws) await teardownTestWorkspace(admin, ws);
});

describe("DM Setter EOD flow — buildSetterActivityPayload, dm_setter role", () => {
  it("the step-flow's own payload builder produces a row the dashboard's aggregation query picks up", async () => {
    const values: EodValues = {
      team_member_name: "Flow Test Setter",
      activity_date: "2026-08-11",
      inbound_dms_sent: 30,
      outbound_dms_sent: 40,
      replies: 18,
      leads_contacted: 20,
      qualified_convos: 8,
      followups_sent: 6,
      links_sent: 5,
      links_clicked: 2,
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
    expect(payload.inbound_dms_sent).toBe(30);
    expect(payload.outbound_dms_sent).toBe(40);
    expect(payload.cash_collected_cents).toBe(150000);

    const { error: insErr } = await ws.userClient.from("setter_activity").insert(payload);
    expect(insErr).toBeNull();

    const { data, error } = await ws.userClient
      .from("setter_activity")
      .select(
        "team_member_name, role, leads_contacted, inbound_dms_sent, outbound_dms_sent, replies, sets, closes, cash_collected_cents, dials, connections",
      )
      .eq("org_id", ws.orgId)
      .eq("team_member_name", "Flow Test Setter");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      role: "dm_setter",
      leads_contacted: 20,
      inbound_dms_sent: 30,
      outbound_dms_sent: 40,
      replies: 18,
      sets: 4,
      closes: 1,
      cash_collected_cents: 150000,
      dials: null,
      connections: null,
    });
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
    // DM-setter-only fields stay unset (not zeroed) on a dialer row — "not
    // applicable to this role", distinct from "asked, logged zero".
    expect(payload.leads_contacted).toBeUndefined();

    const { error: insErr } = await ws.userClient.from("setter_activity").insert(payload);
    expect(insErr).toBeNull();

    const { data, error } = await ws.userClient
      .from("setter_activity")
      .select("team_member_name, role, dials, connections, sets, closes")
      .eq("org_id", ws.orgId)
      .eq("team_member_name", "Flow Test Dialer");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({
      role: "inbound_dialer",
      dials: 60,
      connections: 15,
      sets: 3,
      closes: 1,
    });
  });
});

describe("Closer EOD flow — buildClosureCallPayload", () => {
  it("Closed maps to status=closed, closed=true, showed=true, and preserves the raw eod_lead_status", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-11",
      lead_email: "flow-test-lead@example.test",
      status: "Closed",
      offer_made: true,
      cash_collected: 2000,
      total_revenue: 5000,
      recording_url: "https://example.test/recording/flow-test",
      summary: "Closed after handling price objection.",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload).not.toBeNull();
    expect(payload!.status).toBe("closed");
    expect(payload!.closed).toBe(true);
    expect(payload!.showed).toBe(true);
    expect(payload!.eod_lead_status).toBe("Closed");
    expect(payload!.cash_collected_cents).toBe(200000);

    const { data: callRow, error: callErr } = await ws.userClient
      .from("calls")
      .insert(payload!)
      .select("id")
      .single();
    expect(callErr).toBeNull();
    expect(callRow?.id).toBeTruthy();

    const { data: calls, error: callsErr } = await ws.userClient
      .from("calls")
      .select(
        "closer_name, status, eod_lead_status, showed, offer_made, closed, cash_collected_cents, contract_value_cents",
      )
      .eq("org_id", ws.orgId)
      .eq("closer_name", "Flow Test Closer");
    expect(callsErr).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({
      status: "closed",
      eod_lead_status: "Closed",
      closed: true,
      showed: true,
      cash_collected_cents: 200000,
      contract_value_cents: 500000,
    });
  });

  it("Deposit maps to closed=true and records the collected cash as the deposit too", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-12",
      lead_email: "flow-test-lead-2@example.test",
      status: "Deposit",
      offer_made: true,
      cash_collected: 1000,
      total_revenue: 5000,
      recording_url: "https://example.test/recording/flow-test-2",
      summary: "Deposit collected, remainder on a payment plan.",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload!.closed).toBe(true);
    expect(payload!.deposit_cents).toBe(100000);
    expect(payload!.cash_collected_cents).toBe(100000);
  });

  it("Follow Up (short term) preserves the exact submitted choice and leaves showed unknown rather than guessed", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-13",
      lead_email: "flow-test-lead-3@example.test",
      status: "Follow Up (short term)",
      offer_made: false,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-3",
      summary: "No decision yet, following up next week.",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload!.lead_id).toBeNull();
    expect(payload!.closed).toBe(false);
    expect(payload!.status).toBe("follow_up");
    expect(payload!.eod_lead_status).toBe("Follow Up (short term)");
    expect(payload!.showed).toBeNull();

    const { data: callRow, error } = await ws.userClient
      .from("calls")
      .insert(payload!)
      .select("id, status, eod_lead_status, lead_id")
      .single();
    expect(error).toBeNull();
    expect(callRow?.status).toBe("follow_up");
    expect(callRow?.eod_lead_status).toBe("Follow Up (short term)");
    expect(callRow?.lead_id).toBeNull();
  });

  it("IGNORE returns null — the caller must skip the insert entirely, not write a hidden row", () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-14",
      lead_email: "flow-test-lead-4@example.test",
      status: "IGNORE",
      offer_made: false,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-4",
      summary: "Test entry, ignore.",
    };
    expect(buildClosureCallPayload(ws.orgId, values)).toBeNull();
  });
});
