import { describe, it, expect } from "vitest";
import { buildDemoCoreDataset } from "./demo-fixtures";

describe("buildDemoCoreDataset (Priority 5 — populate the OS with demo data)", () => {
  const data = buildDemoCoreDataset();

  it("produces a non-trivial, internally consistent dataset", () => {
    expect(data.leads.length).toBeGreaterThan(30);
    expect(data.calls.length).toBeGreaterThan(10);
    expect(data.setterActivity.length).toBeGreaterThan(10);
    expect(data.clients.length).toBeGreaterThan(0);
    expect(data.contentMetrics.length).toBeGreaterThan(0);
  });

  it("never produces duplicate ids within a table", () => {
    for (const table of [data.leads, data.calls, data.clients, data.payments] as {
      id: string;
    }[][]) {
      const ids = table.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("every call references a real lead in the same dataset", () => {
    const leadIds = new Set(data.leads.map((l) => l.id));
    for (const call of data.calls) expect(leadIds.has(call.lead_id)).toBe(true);
  });

  it("every client comes from an actually-closed call, never invented", () => {
    for (const client of data.clients) {
      const call = data.calls.find((c) => c.lead_id === client.lead_id);
      expect(call?.closed).toBe(true);
      expect(client.contract_value_cents).toBe(call!.contract_value_cents);
    }
  });

  it("is deterministic within a short window (cached, not re-randomized per call)", () => {
    const again = buildDemoCoreDataset();
    expect(again.leads.map((l) => l.id)).toEqual(data.leads.map((l) => l.id));
    expect(again.calls[0]).toEqual(data.calls[0]);
  });

  it("has disqualified leads, so the Priority 2 tiles have something real to show in demo mode", () => {
    expect(data.leads.some((l) => l.status === "disqualified")).toBe(true);
    const dqCalls = data.calls.filter((c) => c.status === "disqualified");
    expect(dqCalls.length).toBeGreaterThan(0);
  });

  it("payment-plan clients have installments that sum to less than or equal to the contract", () => {
    for (const client of data.clients.filter((c) => c.payment_plan)) {
      const clientPayments = data.payments.filter((p) => p.client_id === client.id);
      const total = clientPayments.reduce((s, p) => s + p.amount_cents, 0);
      expect(total).toBeLessThanOrEqual(client.contract_value_cents + 1); // rounding
    }
  });

  it("team roster covers all three roles used by the rep dashboards", () => {
    const roles = new Set(data.teamMembers.map((m) => m.role));
    expect(roles.has("dm_setter")).toBe(true);
    expect(roles.has("inbound_dialer")).toBe(true);
    expect(roles.has("closer")).toBe(true);
  });
});
