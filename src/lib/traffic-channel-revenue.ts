/**
 * Traffic channel revenue (InsightOS upgrade spec, Priority 1 correction).
 *
 * The previous computation summed calls.contract_value_cents (closed calls)
 * AND clients.contract_value_cents into one "revenue" figure per channel.
 * Those are two independently-entered, unlinked records for the same
 * real-world deal — a closer logs a closed call with a contract value, and
 * a client/mentee record with its own contract value is added separately
 * (Mentees "Add mentee" form) with no enforced link back to that specific
 * call. Summing both double-counts the deal whenever both exist.
 *
 * This module keeps three concepts strictly separate, as required:
 *  - contractedCents: verified closed-call contract value (the "Revenue
 *    attribution basis" — the most granular, per-deal, date-range-scoped
 *    record available).
 *  - collectedCents: verified closed-call cash actually collected.
 *  - clientContractedCents: the client/mentee record's own contract value —
 *    a distinct LTV concept, exposed separately, never summed into revenue.
 */

export type ChannelRevenueSource = {
  id: string;
  name: string;
  category: string | null;
};

export type ChannelRevenueLead = {
  id: string;
  traffic_source_id: string | null;
  status: string;
};

export type ChannelRevenueCall = {
  lead_id: string | null;
  closed: boolean | null;
  contract_value_cents: number | null;
  cash_collected_cents: number | null;
};

export type ChannelRevenueClient = {
  lead_id: string | null;
  contract_value_cents: number | null;
};

export type ChannelRevenueResult = {
  id: string;
  name: string;
  category: string | null;
  leads: number;
  clients: number;
  closeRate: number;
  /** Verified closed-call contract value — the revenue attribution basis. */
  contractedCents: number;
  /** Verified closed-call cash actually collected — never combined with
   * contractedCents into one ambiguous number. */
  collectedCents: number;
  /** Client/mentee record contract value — a separate LTV concept, kept
   * apart from the two fields above rather than summed into "revenue". */
  clientContractedCents: number;
  /** Per-lead rate computed off the verified contracted basis only. */
  revenuePerLeadCents: number;
};

export function computeChannelRevenue(
  sources: ChannelRevenueSource[],
  leads: ChannelRevenueLead[],
  calls: ChannelRevenueCall[],
  clients: ChannelRevenueClient[],
): ChannelRevenueResult[] {
  const leadsBySource = new Map<string, ChannelRevenueLead[]>();
  for (const lead of leads) {
    if (!lead.traffic_source_id) continue;
    const arr = leadsBySource.get(lead.traffic_source_id) ?? [];
    arr.push(lead);
    leadsBySource.set(lead.traffic_source_id, arr);
  }
  const callsByLead = new Map<string, ChannelRevenueCall[]>();
  for (const call of calls) {
    if (!call.lead_id) continue;
    const arr = callsByLead.get(call.lead_id) ?? [];
    arr.push(call);
    callsByLead.set(call.lead_id, arr);
  }
  const clientCentsByLead = new Map<string, number>();
  for (const client of clients) {
    if (!client.lead_id) continue;
    clientCentsByLead.set(
      client.lead_id,
      (clientCentsByLead.get(client.lead_id) ?? 0) + (client.contract_value_cents ?? 0),
    );
  }

  return sources
    .map((source) => {
      const matched = leadsBySource.get(source.id) ?? [];
      const won = matched.filter((lead) => lead.status === "closed").length;
      let contractedCents = 0;
      let collectedCents = 0;
      let clientContractedCents = 0;
      for (const lead of matched) {
        for (const call of callsByLead.get(lead.id) ?? []) {
          if (!call.closed) continue;
          contractedCents += call.contract_value_cents ?? 0;
          collectedCents += call.cash_collected_cents ?? 0;
        }
        clientContractedCents += clientCentsByLead.get(lead.id) ?? 0;
      }
      return {
        id: source.id,
        name: source.name,
        category: source.category,
        leads: matched.length,
        clients: won,
        closeRate: matched.length ? (won / matched.length) * 100 : 0,
        contractedCents,
        collectedCents,
        clientContractedCents,
        revenuePerLeadCents: matched.length ? Math.round(contractedCents / matched.length) : 0,
      };
    })
    .sort((a, b) => b.contractedCents - a.contractedCents);
}
