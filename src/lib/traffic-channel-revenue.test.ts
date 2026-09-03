import { describe, expect, it } from "vitest";
import { computeChannelRevenue } from "./traffic-channel-revenue";

const sources = [{ id: "src-1", name: "Instagram Organic", category: "organic" }];

describe("computeChannelRevenue", () => {
  it("does NOT double-count a deal that has both a closed call and a separate client record", () => {
    // The exact scenario from the audit: a closer logs a closed call with a
    // contract value, and the same person is also onboarded as a mentee
    // with their own contract_value_cents on the clients table. These are
    // two independently-entered records for ONE real deal.
    const leads = [{ id: "lead-1", traffic_source_id: "src-1", status: "closed" }];
    const calls = [
      {
        lead_id: "lead-1",
        closed: true,
        contract_value_cents: 500000,
        cash_collected_cents: 200000,
      },
    ];
    const clients = [{ lead_id: "lead-1", contract_value_cents: 500000 }];

    const [channel] = computeChannelRevenue(sources, leads, calls, clients);

    // contractedCents reflects ONLY the verified closed-call record, not
    // 500000 (call) + 500000 (client) = 1000000.
    expect(channel.contractedCents).toBe(500000);
    expect(channel.collectedCents).toBe(200000);
    // The client contract value is exposed separately, not folded in.
    expect(channel.clientContractedCents).toBe(500000);
  });

  it("still counts a client contract value when there is no matching closed call", () => {
    const leads = [{ id: "lead-2", traffic_source_id: "src-1", status: "closed" }];
    const calls: never[] = [];
    const clients = [{ lead_id: "lead-2", contract_value_cents: 300000 }];

    const [channel] = computeChannelRevenue(sources, leads, calls, clients);
    expect(channel.contractedCents).toBe(0);
    expect(channel.clientContractedCents).toBe(300000);
  });

  it("sums multiple closed calls and multiple client records within one channel independently", () => {
    const leads = [
      { id: "lead-1", traffic_source_id: "src-1", status: "closed" },
      { id: "lead-2", traffic_source_id: "src-1", status: "closed" },
    ];
    const calls = [
      {
        lead_id: "lead-1",
        closed: true,
        contract_value_cents: 100000,
        cash_collected_cents: 100000,
      },
      {
        lead_id: "lead-2",
        closed: true,
        contract_value_cents: 200000,
        cash_collected_cents: 50000,
      },
    ];
    const clients = [
      { lead_id: "lead-1", contract_value_cents: 100000 },
      { lead_id: "lead-2", contract_value_cents: 200000 },
    ];

    const [channel] = computeChannelRevenue(sources, leads, calls, clients);
    expect(channel.contractedCents).toBe(300000);
    expect(channel.collectedCents).toBe(150000);
    expect(channel.clientContractedCents).toBe(300000);
  });

  it("ignores non-closed calls for contracted/collected revenue", () => {
    const leads = [{ id: "lead-1", traffic_source_id: "src-1", status: "booked" }];
    const calls = [
      { lead_id: "lead-1", closed: false, contract_value_cents: 100000, cash_collected_cents: 0 },
    ];
    const [channel] = computeChannelRevenue(sources, leads, calls, []);
    expect(channel.contractedCents).toBe(0);
    expect(channel.collectedCents).toBe(0);
  });

  it("computes revenuePerLeadCents off the verified contracted basis, not client LTV", () => {
    const leads = [
      { id: "lead-1", traffic_source_id: "src-1", status: "closed" },
      { id: "lead-2", traffic_source_id: "src-1", status: "active" },
    ];
    const calls = [
      {
        lead_id: "lead-1",
        closed: true,
        contract_value_cents: 200000,
        cash_collected_cents: 200000,
      },
    ];
    const clients = [{ lead_id: "lead-1", contract_value_cents: 900000 }];
    const [channel] = computeChannelRevenue(sources, leads, calls, clients);
    // 200000 contracted / 2 leads = 100000, NOT influenced by the 900000
    // client LTV figure.
    expect(channel.revenuePerLeadCents).toBe(100000);
  });

  it("leaves a channel with no matched leads at zero, not undefined/NaN", () => {
    const [channel] = computeChannelRevenue(sources, [], [], []);
    expect(channel).toMatchObject({
      leads: 0,
      clients: 0,
      closeRate: 0,
      contractedCents: 0,
      collectedCents: 0,
      clientContractedCents: 0,
      revenuePerLeadCents: 0,
    });
  });

  it("sorts channels by verified contracted revenue, descending", () => {
    const twoSources = [
      { id: "a", name: "A", category: null },
      { id: "b", name: "B", category: null },
    ];
    const leads = [
      { id: "l1", traffic_source_id: "a", status: "closed" },
      { id: "l2", traffic_source_id: "b", status: "closed" },
    ];
    const calls = [
      { lead_id: "l1", closed: true, contract_value_cents: 10000, cash_collected_cents: 0 },
      { lead_id: "l2", closed: true, contract_value_cents: 90000, cash_collected_cents: 0 },
    ];
    const result = computeChannelRevenue(twoSources, leads, calls, []);
    expect(result.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
