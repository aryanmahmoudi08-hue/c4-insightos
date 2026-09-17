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
  buildClosureCallObjectionRows,
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

  it("Objections? multi-select writes one call_objections row per category, including Other's free text, against the real DB constraint", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-08-15",
      lead_email: "flow-test-lead-5@example.test",
      status: "Follow Up (short term)",
      offer_made: true,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-5",
      summary: "Solid call, needs to think about the investment.",
      objections_categories: "money,think_about_it,other",
      objections_other: "Worried about time commitment with a new baby",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload).not.toBeNull();
    const { data: callRow, error: callErr } = await ws.userClient
      .from("calls")
      .insert(payload!)
      .select("id")
      .single();
    expect(callErr).toBeNull();

    const objectionRows = buildClosureCallObjectionRows(ws.orgId, callRow!.id, values);
    expect(objectionRows).toHaveLength(3);
    expect(objectionRows.map((r) => r.category).sort()).toEqual([
      "money",
      "other",
      "think_about_it",
    ]);
    const otherRow = objectionRows.find((r) => r.category === "other");
    expect(otherRow?.objection).toBe("Worried about time commitment with a new baby");

    const { error: objErr } = await ws.userClient.from("call_objections").insert(objectionRows);
    expect(objErr).toBeNull();

    const { data: stored, error: selErr } = await ws.userClient
      .from("call_objections")
      .select("objection, category, resolved")
      .eq("call_id", callRow!.id)
      .order("category");
    expect(selErr).toBeNull();
    expect(stored).toHaveLength(3);
    expect(stored?.every((r) => r.resolved === false)).toBe(true);
    expect(stored?.map((r) => r.category).sort()).toEqual(["money", "other", "think_about_it"]);
  });

  it("A legacy category value (e.g. 'price', retired in favor of 'money') is still a valid DB insert — historical rows are never invalidated", async () => {
    const { data: callRow } = await ws.userClient
      .from("calls")
      .insert(
        buildClosureCallPayload(ws.orgId, {
          closer_name: "Flow Test Closer",
          date_of_call: "2026-08-16",
          lead_email: "flow-test-lead-6@example.test",
          status: "Lost",
          offer_made: true,
          cash_collected: 0,
          total_revenue: 0,
          recording_url: "https://example.test/recording/flow-test-6",
          summary: "Legacy-category regression check.",
        })!,
      )
      .select("id")
      .single();
    const { error: legacyErr } = await ws.userClient.from("call_objections").insert({
      org_id: ws.orgId,
      call_id: callRow!.id,
      objection: "price",
      category: "price",
      resolved: false,
    });
    expect(legacyErr).toBeNull();
  });

  it("Follow Up (short term) with Follow-Up Details writes the follow-up columns onto the same calls row — no separate follow-up table, no duplicate call", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-09-18",
      lead_email: "flow-test-lead-followup@example.test",
      status: "Follow Up (short term)",
      offer_made: true,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-followup",
      summary: "Needs to check finances before deciding.",
      followup_requested_at: "2026-09-25T14:30",
      followup_amount_pitched: 10000,
      followup_reason: "think_about_it",
      followup_notes: "Wants to review the offer with their partner.",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload).not.toBeNull();
    expect(payload!.status).toBe("follow_up");
    expect(payload!.eod_lead_status).toBe("Follow Up (short term)");
    // Amount Pitched is never conflated with Cash Collected / Total Revenue.
    expect(payload!.cash_collected_cents).toBe(0);
    expect(payload!.contract_value_cents).toBe(0);
    expect(payload!.followup_amount_pitched_cents).toBe(1000000);
    expect(payload!.followup_reason).toBe("think_about_it");
    expect(payload!.followup_notes).toBe("Wants to review the offer with their partner.");
    expect(payload!.requested_followup_at).toBe(new Date("2026-09-25T14:30").toISOString());

    const { data: callRow, error } = await ws.userClient
      .from("calls")
      .insert(payload!)
      .select(
        "id, status, eod_lead_status, requested_followup_at, followup_amount_pitched_cents, followup_reason, followup_notes, cash_collected_cents, contract_value_cents",
      )
      .single();
    expect(error).toBeNull();
    expect(callRow?.status).toBe("follow_up");
    expect(callRow?.followup_amount_pitched_cents).toBe(1000000);
    expect(callRow?.cash_collected_cents).toBe(0);
    expect(callRow?.contract_value_cents).toBe(0);

    // The existing Follow-Up Pipeline query shape (closer.tsx) — same table,
    // same status filter, no separate follow-up system to keep in sync.
    const { data: pipelineRows, error: pipelineErr } = await ws.userClient
      .from("calls")
      .select("id, status, eod_lead_status, requested_followup_at, followup_reason")
      .eq("org_id", ws.orgId)
      .eq("status", "follow_up")
      .eq("id", callRow!.id);
    expect(pipelineErr).toBeNull();
    expect(pipelineRows).toHaveLength(1);
    expect(pipelineRows?.[0].eod_lead_status).toBe("Follow Up (short term)");
  });

  it("Follow Up (long term) with Other reason stores the free-text reason separately from Objections", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-09-19",
      lead_email: "flow-test-lead-followup-2@example.test",
      status: "Follow Up (long term)",
      offer_made: true,
      cash_collected: 0,
      total_revenue: 0,
      recording_url: "https://example.test/recording/flow-test-followup-2",
      summary: "Long-term nurture.",
      followup_requested_at: "2026-10-15T09:00",
      followup_amount_pitched: 5000,
      followup_reason: "other",
      followup_reason_other: "Waiting on a business loan to be approved.",
      objections_categories: "money,think_about_it",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload!.eod_lead_status).toBe("Follow Up (long term)");
    expect(payload!.followup_reason).toBe("other");
    expect(payload!.followup_reason_other).toBe("Waiting on a business loan to be approved.");

    const objectionRows = buildClosureCallObjectionRows(ws.orgId, "placeholder-call-id", values);
    // Follow-up reason and objections are independent — selecting
    // objections never overwrites or gets overwritten by the follow-up
    // reason field.
    expect(objectionRows.map((r) => r.category).sort()).toEqual(["money", "think_about_it"]);
    expect(payload!.followup_reason).not.toBe("money");
  });

  it("A normal (non-follow-up) Lead Status never writes follow-up columns", async () => {
    const values: EodValues = {
      closer_name: "Flow Test Closer",
      date_of_call: "2026-09-20",
      lead_email: "flow-test-lead-normal@example.test",
      status: "Closed",
      offer_made: true,
      cash_collected: 3000,
      total_revenue: 3000,
      recording_url: "https://example.test/recording/flow-test-normal",
      summary: "Closed on the call.",
      // Even if stray follow-up values are present in state (e.g. the rep
      // briefly picked Follow Up then changed to Closed), a non-follow-up
      // status must never persist them.
      followup_requested_at: "2026-09-25T14:30",
      followup_amount_pitched: 10000,
      followup_reason: "money",
    };
    const payload = buildClosureCallPayload(ws.orgId, values);
    expect(payload!.status).toBe("closed");
    expect(payload!.requested_followup_at).toBeNull();
    expect(payload!.followup_amount_pitched_cents).toBeNull();
    expect(payload!.followup_reason).toBeNull();
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
