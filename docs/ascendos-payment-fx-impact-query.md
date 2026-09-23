# AscendOS — Historical Payment FX Impact Query

Read-only SQL preparation. No records modified, no backfill, no schema change, no application
code change, no commit/push.

## Database access — re-checked, not assumed

Re-verified directly before writing anything below: `docker info` still fails (`docker NOT
reachable`), `supabase status` still reports the same Docker-daemon connection error, and a direct
`curl` to the local Supabase REST endpoint (`http://127.0.0.1:54321/rest/v1/`) returns connection
refused (curl exit 7). Nothing has changed since the last check. Per your instruction, no search
for credentials or workaround was attempted. **No legitimate database connection is available —
every query below is prepared and ready to run, not executed.**

---

## Affected Rows

```sql
select count(*) as total_affected_rows
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD';
```

**Could not be computed.**

## Provider Breakdown

```sql
select source_connector as provider, count(*) as affected_row_count
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD'
group by source_connector
order by provider;
```

Grouped by `source_connector` (the dedicated, always-populated provider column) rather than
`fx_source` — within this candidate set the two are identical in practice (the old code set both
to the same literal processor string), but `source_connector` is the semantically correct field
for "which provider," while `fx_source` is being used here purely as the pre/post-fix marker.

**Could not be computed.**

## Currency Breakdown

```sql
select upper(original_currency) as original_currency, count(*) as affected_row_count
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD'
group by upper(original_currency)
order by original_currency;
```

**Could not be computed.**

## Date Range

```sql
select
  min(collected_at) as earliest_affected_collected_at,
  max(collected_at) as latest_affected_collected_at
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD';
```

**Could not be computed.**

## Current Stored Value

What every downstream dashboard/report is *currently* summing for this candidate set — the wrong
number, since `amount_cents`/`currency` were never actually converted for these rows despite
`fx_rate = 1` implying they were:

```sql
select
  upper(original_currency) as original_currency,
  sum(amount_cents) as total_stored_amount_cents,
  sum(original_amount_cents) as total_original_amount_cents  -- identical to the line above for
                                                               -- this candidate set specifically —
                                                               -- amount_cents was never actually
                                                               -- converted, so it still equals the
                                                               -- native original figure today
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD'
group by upper(original_currency)
order by original_currency;
```

**Could not be computed.**

## Reconstructed Value

This is the one item that genuinely can't be fully answered by SQL alone, and it's worth being
precise about why rather than presenting a partial number as if it were complete.

`normalizePaymentToUsd()`'s real logic is: check the `fx_rates` cache first; if the specific
`(currency, date)` pair isn't cached, fetch it live from Frankfurter (an external HTTP call) and
*write it into the cache*. That means even a "read-only" resolvability check using the real
function would itself perform a write (a new row in `fx_rates`) — so it doesn't actually fit
inside a strictly read-only pass, and wasn't run.

What SQL alone **can** answer is the subset already sitting in the cache from prior real lookups
(e.g., from this session's earlier live use of `getHistoricalFxRate` elsewhere in the app, or any
organic use before this investigation):

```sql
-- Reconstructed USD value for the subset whose (currency, date) rate is
-- ALREADY cached — a real, partial answer, no live fetch involved.
select
  p.source_connector as provider,
  upper(p.original_currency) as original_currency,
  count(*) as row_count,
  sum(p.original_amount_cents) as total_original_amount_cents,
  sum(round(p.original_amount_cents / r.rate)) as reconstructed_usd_cents
from public.payments p
join public.fx_rates r
  on r.base_currency = 'USD'
  and r.quote_currency = upper(p.original_currency)
  and r.rate_date = p.collected_at::date
where p.fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(p.original_currency) <> 'USD'
group by p.source_connector, upper(p.original_currency)
order by provider, original_currency;

-- The (currency, date) pairs still needed but NOT yet cached — these are
-- the ones a live Frankfurter fetch (via getHistoricalFxRate, run as code,
-- not SQL) would be required to resolve.
select distinct
  upper(p.original_currency) as original_currency,
  p.collected_at::date as needed_rate_date
from public.payments p
left join public.fx_rates r
  on r.base_currency = 'USD'
  and r.quote_currency = upper(p.original_currency)
  and r.rate_date = p.collected_at::date
where p.fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(p.original_currency) <> 'USD'
  and r.id is null
order by original_currency, needed_rate_date;
```

**Could not be computed** (neither query above could be run — no DB access — and even with
access, the full reconstructed value requires the live-fetch step for any uncached pair, which is
a code-execution step, not pure SQL).

## Difference

```sql
-- Once "Current Stored Value" and "Reconstructed Value" are both known:
-- absolute_difference_cents = total_stored_amount_cents - reconstructed_usd_cents
-- percentage_difference = 100.0 * absolute_difference_cents / nullif(reconstructed_usd_cents, 0)
-- computed per provider/currency group, matching the breakdown above.
```

**Could not be computed** — depends on both prior values.

## Unresolvable Rows

**Cannot be determined without a live fetch, and only partially without one — this is the honest
limit of a read-only SQL-only pass, not a gap in the investigation.**

- Rows whose `(original_currency, collected_at date)` pair is **already cached** in `fx_rates`
  are confirmed resolvable — the "Reconstructed Value" query above identifies exactly which rows
  these are (a real, computable count once run).
- Rows whose pair is **not yet cached** are *unknown*, not "unresolvable" — Frankfurter/ECB
  generally covers most real-world currencies back to 1999, so most of these would likely resolve
  on a live attempt, but "likely" is not a count. Confirming each one requires actually calling
  `getHistoricalFxRate()` (or equivalent) — a real network call, and, as noted above, one that
  writes to the `fx_rates` cache as a side effect.
- A row only becomes genuinely, permanently "unresolvable" the same way the live webhook fix
  already handles it: `fx_source = 'unavailable'` after a real attempt fails. No such determination
  was made here.

## Sample Audit Records

Fields limited to exactly what's needed to audit this specific issue — no `org_id`, no
`client_id`, no `raw` (which can carry customer email/name), no anything from another table:

```sql
select
  id as payment_id,
  source_connector as provider,
  upper(original_currency) as original_currency,
  original_amount_cents,
  amount_cents as stored_amount_cents,
  collected_at,
  fx_source,
  fx_rate
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD'
order by collected_at desc
limit 25;
```

**Could not be computed.**

## Backfill Readiness

Unchanged from the prior investigation, restated precisely: **the backfill logic is ready and
deterministic** (same `normalizePaymentToUsd()` function, `original_amount_cents`/
`original_currency`/`collected_at` all confirmed `NOT NULL` on every row in the table) —what's
missing is purely the *data* (how many rows, which providers/currencies/dates, how much money) to
decide whether it's worth running and how to communicate it, none of which is available without
database access. No code was changed in this pass; no query was executed; nothing was written
anywhere, including the `fx_rates` cache.

No records modified. No backfill. No schema change. No application code change. No commit/push.
