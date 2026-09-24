import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { META_GRAPH_VERSION, needsRefresh } from "@/lib/oauth";
import { exchangeMetaForLongLivedToken } from "@/lib/meta-oauth.server";
import {
  mapMetaInsights,
  spendRecordToRow,
  type MetaAdAccount,
  type MetaInsightsRow,
} from "@/lib/meta-ads";

// connector_oauth_tokens isn't in the generated type snapshot yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = supabaseAdmin as any;

type FetchImpl = typeof fetch;

/** Stop runaway paging if Meta ever returns a cyclic `next`. 200 pages at the
 * default page size is far more than any real date range needs. */
const MAX_PAGES = 200;

/**
 * The org's Meta token, refreshed in place if it's near expiry.
 *
 * This is the only read path for the token, which is what makes lazy refresh
 * work: there's no scheduler in this app, so a token that's only ever checked
 * when used is the honest design rather than one that silently dies between
 * syncs. A null expiry means the token doesn't expire (Marketing API apps with
 * Standard access) and is left alone.
 */
export async function getMetaAccessToken(
  orgId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<string> {
  const { data: row, error } = await admin
    .from("connector_oauth_tokens")
    .select("access_token, expires_at")
    .eq("org_id", orgId)
    .eq("connector_id", "meta")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row?.access_token) {
    throw new Error("Meta isn't connected for this workspace — connect it in Settings first.");
  }

  if (!needsRefresh(row.expires_at)) return row.access_token as string;

  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];
  if (!appId || !appSecret) {
    // Can't refresh, but the existing token may still have life in it —
    // returning it is better than failing a sync that would have worked.
    console.error("[meta-ads] token needs refresh but META_APP_ID/SECRET are unset");
    return row.access_token as string;
  }

  try {
    const refreshed = await exchangeMetaForLongLivedToken(
      { shortLivedToken: row.access_token as string, appId, appSecret },
      fetchImpl,
    );
    await admin
      .from("connector_oauth_tokens")
      .update({ access_token: refreshed.accessToken, expires_at: refreshed.expiresAt })
      .eq("org_id", orgId)
      .eq("connector_id", "meta");
    return refreshed.accessToken;
  } catch (e) {
    // A failed refresh isn't automatically fatal — the current token is still
    // valid until its expiry, so let the caller try with it and surface the
    // real API error if it's genuinely dead.
    console.error("[meta-ads] refresh failed, using existing token", e);
    return row.access_token as string;
  }
}

async function graphJson(url: string, fetchImpl: FetchImpl, leg: string) {
  const response = await fetchImpl(url);
  const text = await response.text();
  let body: { error?: { message?: string }; [k: string]: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Meta ${leg} returned a non-JSON response (${response.status}).`);
  }
  if (body.error) throw new Error(`Meta ${leg} failed: ${body.error.message ?? "unknown error"}`);
  if (!response.ok) throw new Error(`Meta ${leg} failed with HTTP ${response.status}.`);
  return body;
}

/**
 * The ad accounts this token can read, with their currency.
 *
 * Currency is taken from here rather than from the insights rows — see
 * mapMetaInsights for why that matters.
 */
export async function listMetaAdAccounts(
  accessToken: string,
  fetchImpl: FetchImpl = fetch,
): Promise<MetaAdAccount[]> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,currency");
  url.searchParams.set("access_token", accessToken);
  const body = await graphJson(url.toString(), fetchImpl, "ad account listing");
  return (body.data as MetaAdAccount[]) ?? [];
}

/**
 * Daily, campaign-level insights for one ad account over a date range.
 *
 * `time_increment=1` is what makes Meta return one row per day; without it the
 * whole range collapses into a single aggregate row, which this app's
 * day-grained `acquisition_spend` can't represent honestly.
 */
export async function fetchMetaInsights(
  params: { accountId: string; accessToken: string; since: string; until: string },
  fetchImpl: FetchImpl = fetch,
): Promise<MetaInsightsRow[]> {
  const url = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${params.accountId}/insights`,
  );
  url.searchParams.set("level", "campaign");
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("time_range", JSON.stringify({ since: params.since, until: params.until }));
  url.searchParams.set(
    "fields",
    "campaign_id,campaign_name,spend,impressions,clicks,date_start,date_stop",
  );
  url.searchParams.set("access_token", params.accessToken);

  const rows: MetaInsightsRow[] = [];
  let next: string | null = url.toString();
  let pages = 0;
  while (next && pages < MAX_PAGES) {
    const body: Record<string, unknown> = await graphJson(next, fetchImpl, "insights");
    rows.push(...(((body.data as MetaInsightsRow[]) ?? []) as MetaInsightsRow[]));
    const paging = body.paging as { next?: string } | undefined;
    next = paging?.next ?? null;
    pages += 1;
  }
  return rows;
}

export type MetaSyncResult = {
  accounts: number;
  written: number;
  skipped: Array<{ reason: string }>;
};

/**
 * Pull campaign-day spend for every readable ad account into
 * `acquisition_spend`, upserting on the provider record key so a re-pull of a
 * day Meta has restated updates that row instead of duplicating it.
 */
export async function syncMetaSpend(
  params: { orgId: string; since: string; until: string },
  fetchImpl: FetchImpl = fetch,
): Promise<MetaSyncResult> {
  const accessToken = await getMetaAccessToken(params.orgId, fetchImpl);
  const accounts = await listMetaAdAccounts(accessToken, fetchImpl);

  let written = 0;
  const skipped: Array<{ reason: string }> = [];

  for (const account of accounts) {
    const rows = await fetchMetaInsights(
      { accountId: account.id, accessToken, since: params.since, until: params.until },
      fetchImpl,
    );
    const { records, skipped: rowsSkipped } = mapMetaInsights({
      orgId: params.orgId,
      account,
      rows,
    });
    skipped.push(...rowsSkipped.map((s) => ({ reason: s.reason })));
    if (!records.length) continue;

    const { error } = await admin
      .from("acquisition_spend")
      .upsert(records.map(spendRecordToRow), { onConflict: "org_id,provider,external_record_id" });
    if (error) throw new Error(error.message);
    written += records.length;
  }

  return { accounts: accounts.length, written, skipped };
}
