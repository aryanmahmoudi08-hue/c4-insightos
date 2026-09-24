import { describe, expect, it } from "vitest";
import { validateAcquisitionSpendRecord } from "./acquisition";
import {
  mapMetaInsights,
  metaExternalRecordId,
  metaSpendToCents,
  spendRecordToRow,
} from "./meta-ads";

const ACCOUNT = { id: "act_123", name: "Main", currency: "USD" };

describe("metaSpendToCents", () => {
  it("converts Meta's decimal string to minor units", () => {
    expect(metaSpendToCents("12.34")).toBe(1234);
    expect(metaSpendToCents("1,250.00")).toBe(125000);
    expect(metaSpendToCents("0")).toBe(0);
  });

  it("returns null for absent or unparseable spend instead of inventing a zero", () => {
    expect(metaSpendToCents(undefined)).toBeNull();
    expect(metaSpendToCents("")).toBeNull();
    expect(metaSpendToCents("n/a")).toBeNull();
    expect(metaSpendToCents("-5")).toBeNull();
  });
});

describe("mapMetaInsights", () => {
  const row = {
    campaign_id: "c-1",
    campaign_name: "Evergreen",
    spend: "150.00",
    impressions: "10000",
    clicks: "250",
    date_start: "2026-09-01",
    date_stop: "2026-09-01",
  };

  it("maps a daily campaign row into a valid canonical spend record", () => {
    const { records, skipped } = mapMetaInsights({ orgId: "org-1", account: ACCOUNT, rows: [row] });
    expect(skipped).toHaveLength(0);
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r).toMatchObject({
      orgId: "org-1",
      provider: "meta",
      adAccountId: "act_123",
      campaignId: "c-1",
      campaignName: "Evergreen",
      spendDate: "2026-09-01",
      currency: "USD",
      spendAmountCents: 15000,
      impressions: 10000,
      clicks: 250,
      sourceType: "paid",
    });
    // must satisfy the app's own validator, not just look right
    expect(validateAcquisitionSpendRecord(r)).toEqual({ valid: true, errors: [] });
  });

  it("takes currency from the ad account and never defaults to USD", () => {
    const { records } = mapMetaInsights({
      orgId: "org-1",
      account: { id: "act_9", currency: "cad" },
      rows: [row],
    });
    expect(records[0].currency).toBe("CAD");
  });

  it("skips rows when the account currency is unresolvable rather than assuming one", () => {
    // Mis-denominating spend is the exact failure the currency remediation
    // fixed elsewhere — an unknown currency must not silently become USD.
    const { records, skipped } = mapMetaInsights({
      orgId: "org-1",
      account: { id: "act_9" },
      rows: [row],
    });
    expect(records).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/currency/i);
  });

  it("skips rows missing campaign_id or a usable date, and says why", () => {
    const { records, skipped } = mapMetaInsights({
      orgId: "org-1",
      account: ACCOUNT,
      rows: [
        { ...row, campaign_id: undefined },
        { ...row, date_start: "not-a-date" },
      ],
    });
    expect(records).toHaveLength(0);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/campaign_id/),
      expect.stringMatching(/date_start/),
    ]);
  });

  it("leaves paid visits null — clicks and landing-page visits are different measurements", () => {
    const { records } = mapMetaInsights({ orgId: "org-1", account: ACCOUNT, rows: [row] });
    expect(records[0].paidVisits).toBeNull();
    expect(records[0].clicks).toBe(250);
  });

  it("keeps a real zero-spend day distinct from a missing one", () => {
    const { records } = mapMetaInsights({
      orgId: "org-1",
      account: ACCOUNT,
      rows: [
        { ...row, spend: "0" },
        { ...row, campaign_id: "c-2", spend: undefined },
      ],
    });
    expect(records[0].spendAmountCents).toBe(0);
    expect(records[1].spendAmountCents).toBeNull();
  });
});

describe("idempotency", () => {
  it("keys a campaign-day stably, so a re-pull updates instead of duplicating", () => {
    // Meta restates recent days as attribution windows settle.
    expect(metaExternalRecordId("c-1", "2026-09-01")).toBe("c-1:2026-09-01");
    const a = mapMetaInsights({
      orgId: "org-1",
      account: ACCOUNT,
      rows: [{ campaign_id: "c-1", spend: "10", date_start: "2026-09-01" }],
    }).records[0];
    const b = mapMetaInsights({
      orgId: "org-1",
      account: ACCOUNT,
      rows: [{ campaign_id: "c-1", spend: "18.50", date_start: "2026-09-01" }],
    }).records[0];
    expect(a.externalRecordId).toBe(b.externalRecordId);
    expect(b.spendAmountCents).toBe(1850);
  });
});

describe("spendRecordToRow", () => {
  it("maps onto the acquisition_spend column names", () => {
    const { records } = mapMetaInsights({
      orgId: "org-1",
      account: ACCOUNT,
      rows: [{ campaign_id: "c-1", spend: "10.00", date_start: "2026-09-01" }],
    });
    expect(spendRecordToRow(records[0])).toMatchObject({
      org_id: "org-1",
      provider: "meta",
      ad_account_id: "act_123",
      campaign_id: "c-1",
      spend_date: "2026-09-01",
      currency: "USD",
      spend_amount_cents: 1000,
      external_record_id: "c-1:2026-09-01",
    });
  });
});
