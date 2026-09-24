import type { AcquisitionSpendRecord } from "@/lib/acquisition";

/**
 * Pure mapping from Meta's Ads Insights rows into this app's canonical
 * `AcquisitionSpendRecord`. No network, no Supabase — the network legs live in
 * meta-ads.server.ts.
 *
 * Field names are Meta's own (`campaign_id`, `campaign_name`, `spend`,
 * `impressions`, `clicks`, `date_start`, `date_stop`) as documented on the Ads
 * Insights endpoint, not invented.
 */

/** One daily, campaign-level row as Meta returns it. Every numeric arrives as
 * a string. */
export type MetaInsightsRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start?: string;
  date_stop?: string;
  account_id?: string;
};

export type MetaAdAccount = {
  /** Meta's account id, already `act_`-prefixed as the API returns it. */
  id: string;
  name?: string;
  /** ISO-4217 for this account. Authoritative — see currencyFor note below. */
  currency?: string;
};

/**
 * Meta reports spend as a decimal string in the ad account's currency
 * ("12.34"), not minor units. Returns null rather than 0 for a missing or
 * unparseable value — 0 spend is a real measurement and shouldn't be
 * manufactured from absent data.
 */
export function metaSpendToCents(spend: string | null | undefined): number | null {
  if (spend === null || spend === undefined || String(spend).trim() === "") return null;
  const n = Number(String(spend).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function optionalCount(value: string | null | undefined): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Idempotency key for one campaign-day. `acquisition_spend` is unique on
 * (org_id, provider, external_record_id), and Meta restates recent days as
 * attribution windows settle — so re-pulling the same day must update that row
 * rather than insert a duplicate.
 */
export function metaExternalRecordId(campaignId: string, spendDate: string): string {
  return `${campaignId}:${spendDate}`;
}

export type MetaMappingResult = {
  records: AcquisitionSpendRecord[];
  /** Rows Meta returned that couldn't be mapped, with why — surfaced rather
   * than silently dropped, so a pull that half-worked doesn't look clean. */
  skipped: Array<{ row: MetaInsightsRow; reason: string }>;
};

/**
 * Map insights rows to spend records.
 *
 * `currency` comes from the ad account, not from the insights row: Meta's
 * per-row `account_currency` field isn't reliably present, and defaulting to
 * USD would silently mis-denominate every non-USD account — exactly the
 * failure the currency-mixing remediation fixed elsewhere in this app. A row
 * with no resolvable currency is skipped, never assumed.
 */
export function mapMetaInsights(params: {
  orgId: string;
  account: MetaAdAccount;
  rows: MetaInsightsRow[];
}): MetaMappingResult {
  const { orgId, account, rows } = params;
  const records: AcquisitionSpendRecord[] = [];
  const skipped: MetaMappingResult["skipped"] = [];

  const currency = (account.currency ?? "").trim().toUpperCase();

  for (const row of rows) {
    if (!currency) {
      skipped.push({ row, reason: "ad account has no resolvable currency" });
      continue;
    }
    const campaignId = row.campaign_id?.trim();
    if (!campaignId) {
      skipped.push({ row, reason: "row has no campaign_id" });
      continue;
    }
    const spendDate = row.date_start?.trim();
    if (!spendDate || !/^\d{4}-\d{2}-\d{2}$/.test(spendDate)) {
      skipped.push({ row, reason: "row has no usable date_start" });
      continue;
    }

    records.push({
      orgId,
      provider: "meta",
      adAccountId: account.id,
      campaignId,
      campaignName: row.campaign_name ?? null,
      spendDate,
      currency,
      spendAmountCents: metaSpendToCents(row.spend),
      impressions: optionalCount(row.impressions),
      clicks: optionalCount(row.clicks),
      // Meta's insights carry no landing-page visit count; paid visits come
      // from the site side, not the ad platform. Left null rather than
      // conflated with clicks, which are different measurements.
      paidVisits: null,
      sourcePlatform: "meta",
      sourceType: "paid",
      externalRecordId: metaExternalRecordId(campaignId, spendDate),
    });
  }

  return { records, skipped };
}

/** Row shape for `public.acquisition_spend`, derived from the canonical
 * record so the column mapping lives in exactly one place. */
export function spendRecordToRow(record: AcquisitionSpendRecord) {
  return {
    org_id: record.orgId,
    provider: record.provider,
    ad_account_id: record.adAccountId ?? null,
    campaign_id: record.campaignId ?? null,
    campaign_name: record.campaignName ?? null,
    spend_date: record.spendDate,
    currency: record.currency,
    spend_amount_cents: record.spendAmountCents ?? null,
    impressions: record.impressions ?? null,
    clicks: record.clicks ?? null,
    paid_visits: record.paidVisits ?? null,
    source_platform: record.sourcePlatform ?? null,
    source_type: record.sourceType ?? null,
    external_record_id: record.externalRecordId,
  };
}
