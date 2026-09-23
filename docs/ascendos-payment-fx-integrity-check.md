# AscendOS — Historical Payment FX Integrity Check

Read-only investigation. No records modified, no backfill run, no schema changed, no dashboard
calculations touched, no commit/push.

## Environment check (done first, not assumed)

Re-verified directly rather than relied on memory: `SUPABASE_URL="http://127.0.0.1:54321"` (this
sandbox's server-side config points only at the local dev stack), `docker info` fails
(`docker NOT reachable`), and `supabase status` confirms the project is linked to a real remote
project (`project_ref: nnfihxlikgfyxalfcddz`) but cannot reach it either — no credentials for that
remote project exist in this environment, only local-dev ones. Per your own instruction not to go
looking for a way around this, I did not attempt to independently locate or use separate
production credentials. **No database access is possible in this environment, for either the
local or the remote project.** Every count below is therefore "the query that would answer this,"
not a number — consistent with your explicit instruction not to fabricate one.

## Database findings

**Could not be executed.** The queries below are exact and ready to run — either through the
Supabase SQL editor against the linked project, or via `supabase db` once Docker/remote access is
available. All target `public.payments` only; nothing else is touched.

```sql
-- 1. Total payment rows
select count(*) as total_rows from public.payments;

-- 2. USD rows (original_currency is the ground truth for "was this really USD",
--    since currency itself is what's potentially wrong)
select count(*) as usd_rows
from public.payments
where upper(original_currency) = 'USD';

-- 3. Non-USD rows
select count(*) as non_usd_rows
from public.payments
where upper(original_currency) <> 'USD';

-- 4. Non-USD rows with fx_rate = 1 (the exact shape the old bug produced —
--    a non-USD original_currency with no real conversion applied)
select count(*) as non_usd_fx_rate_one
from public.payments
where upper(original_currency) <> 'USD' and fx_rate = 1;

-- 5. Non-USD rows already marked fx_source = 'unavailable' (rows the FIXED
--    code itself flagged as unresolved — only possible on/after the fix)
select count(*) as non_usd_fx_unavailable
from public.payments
where upper(original_currency) <> 'USD' and fx_source = 'unavailable';

-- 6. Rows with a real, non-identity FX rate applied (either by the fix, or
--    pre-existing legitimate conversions from some other source)
select count(*) as legitimately_converted
from public.payments
where fx_rate <> 1;

-- 7-9. The precise "potentially affected" set, with date range, provider,
--       and financial exposure grouped together (see next section for why
--       this exact filter, not a broader "all non-USD rows" one, is correct)
select
  source_connector,
  original_currency,
  count(*) as affected_row_count,
  min(collected_at) as earliest_collected_at,
  max(collected_at) as latest_collected_at,
  sum(original_amount_cents) as total_original_amount_cents,
  sum(amount_cents) as total_amount_currently_recorded_as_if_usd_cents
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD'
group by source_connector, original_currency
order by source_connector, original_currency;

-- Grand total across all providers/currencies
select count(*) as potentially_affected_rows
from public.payments
where fx_source in ('stripe', 'paypal', 'fanbasis', 'wise', 'whop')
  and upper(original_currency) <> 'USD';
```

## Potentially affected rows

**Not every non-USD row is wrong — confirmed from the code, not assumed.** The precise,
deterministic marker for "written by the pre-fix code" is `fx_source IN ('stripe', 'paypal',
'fanbasis', 'wise', 'whop')`:

- **Before the fix**, every one of the 5 webhooks wrote `fx_source` as the literal, hardcoded
  processor name (`fx_source: "stripe"`, etc.) — unconditionally, for every row, USD or not.
- **After the fix**, `fx_source` is always `normalized.fxSource`, which
  `normalizePaymentToUsd()` (`src/lib/fx.server.ts`) only ever sets to `'identity'` (real USD,
  no conversion needed), `'frankfurter'` (the only source the fx-rate cache/live fetch ever
  writes — verified directly, not assumed), or `'unavailable'` (non-USD, no rate resolvable). It
  **never** writes a bare processor name.

So `fx_source` being a raw processor name is only possible on a row the *old* code wrote — a
clean, unambiguous timestamp-free marker (no reliance on comparing `created_at` to a deploy date,
which this session's changes were never committed/deployed anyway).

Within that set, **only the rows where `original_currency <> 'USD'` are actually wrong.** A
pre-fix USD row (`original_currency = 'USD'`) has `fx_rate = 1` too, but `fx_rate = 1` is the
*correct* answer for a real USD payment — the bug was never in the logic for USD, only in the
missing branch for everything else. So:

**Potentially affected = `fx_source IN ('stripe','paypal','fanbasis','wise','whop') AND
original_currency <> 'USD'`** — exactly the filter in query 7-9 above. The count could not be
retrieved (no DB access); the query will return it directly, `0` if none exist.

## Providers affected

All 5 are structurally capable of having produced an affected row (all 5 had the identical bug
before this session's fix) — but not equally likely in practice:

- **Wise** — highest real risk. Wise's entire purpose is international transfers; a non-USD
  balance credit is the expected case there, not an edge case (noted explicitly in this session's
  fix commentary).
- **PayPal, Whop** — plausible; both support settling in multiple currencies depending on
  merchant/product configuration.
- **Stripe** — plausible if the connected Stripe account ever accepts a non-USD currency (the
  original pre-fix code's own comment incorrectly assumed "Stripe settles in a single real
  currency per charge" as a reason no conversion was needed — that reasoning was about
  *within-charge* consistency, not about the org only ever using USD, and was wrong to treat as
  such).
- **Fanbasis (Commas)** — plausible, currency comes directly from the processor payload with no
  evidence one way or the other.

The query in "Database findings" (`group by source_connector`) answers this precisely; it cannot
be narrowed further without running it.

## Date range

Bounded by `min(collected_at)`/`max(collected_at)` in query 7-9 above. Structurally, the earliest
possible affected row cannot predate `20260918100000_payments_processor_and_plan_linking.sql`'s
`processor`/`source_connector` conventions being live, and the latest possible affected row is
whenever this session's fix actually lands in a running deployment (still uncommitted at the time
of this check) — every row inserted after that point uses the new logic. Neither bound is
knowable without running the query.

## Financial exposure

`sum(original_amount_cents)` (the real, unconverted native-currency total — only meaningful
summed *within* one `original_currency` group, never across currencies) and
`sum(amount_cents)` (what's currently, incorrectly, being treated as USD for that same set) are
both in query 7-9. The **delta between what every downstream dashboard currently reports as USD
cash and what those rows actually represent** is exactly `sum(amount_cents) -
[sum(original_amount_cents) actually converted to USD at the correct historical rate]` — the
second half of that can't be computed without either running the backfill logic (not done here,
per your instruction) or at minimum fetching the real historical rates read-only. Not calculated
here.

## Deterministically repairable?

**Yes, for any row where a historical FX rate is actually resolvable for its `(original_currency,
collected_at date)` pair — confirmed from the schema and code, not assumed:**

- `original_amount_cents` and `original_currency` are `NOT NULL` on every single row in this
  table (enforced by `20260907100000_currency_fx_foundation.sql`'s own `ALTER COLUMN ... SET NOT
  NULL`, applied to *all* pre-existing rows via that migration's backfill) — the real, unconverted
  source figures are never missing, not even on rows older than the FX work itself.
- `collected_at` is `NOT NULL` on every row (base schema, `20260518151934...sql`) — the exact date
  needed for a historical (not "today's") rate lookup is always present.
- The conversion function needed (`getHistoricalFxRate` → `normalizePaymentToUsd`) already exists,
  is already tested (`src/lib/fx.server.test.ts`), and is exactly the same function the live
  webhooks now use going forward — repairing a historical row means running the *identical* logic
  against already-stored data, not inventing a new formula.

**The one real caveat**: resolvability depends on Frankfurter/ECB actually having a rate for that
specific currency on that specific historical date. Frankfurter covers the currencies it lists
back to 1999 for the currencies ECB publishes, which is a large majority of realistic transaction
dates/currencies for this business — but not a guarantee for every conceivable row (an
unsupported currency code, or a data-entry currency typo, would come back `null`, and
`normalizePaymentToUsd` already handles that honestly: no repair applied, row left as-is with
`fx_source` unchanged). This can only be confirmed by actually attempting the lookup per row —
not knowable in advance from schema alone.

## Proposed backfill logic, if applicable

**Not executed — proposed only, exactly as instructed.** For each row where `fx_source IN
('stripe','paypal','fanbasis','wise','whop') AND original_currency <> 'USD'`:

```
rate = getHistoricalFxRate(row.original_currency, row.collected_at::date)

if rate resolves:
  new_amount_cents = round(row.original_amount_cents / rate.rate)
  update payments set
    amount_cents = new_amount_cents,
    currency = 'USD',
    fx_rate = rate.rate,
    fx_rate_date = rate.date,
    fx_source = rate.source            -- 'frankfurter'
  where id = row.id

if rate does not resolve:
  update payments set
    fx_source = 'unavailable'           -- amount_cents/currency left untouched (still native),
                                         -- matching exactly how a new row behaves today when
                                         -- unresolved — never guessed, never silently 1:1'd
  where id = row.id
```

This is precisely `normalizePaymentToUsd()`'s own logic, applied to stored rows instead of an
incoming webhook payload — no new formula, no new judgment call, the same function already
shipped and tested. A script implementing this would iterate the affected set, call the existing
function per row, and apply exactly one of the two branches above per row — deterministic, no
row requires a human decision about *how* to convert it, only whether to run the pass at all (see
below).

## What requires explicit approval before changing financial records

Everything below is a genuine decision, not a technical detail — none of it was decided or acted
on here:

1. **Whether to run the backfill at all.** Rewriting `amount_cents` on existing rows changes
   numbers that may have already appeared in a sent Weekly Report, an exported statement, or a
   screenshot/conversation with someone at this business. Even a *correct* retroactive change can
   be disruptive if nobody expects a past month's "cash collected" to move.
2. **Which historical rate source to trust for the backfill.** This proposal reuses Frankfurter/
   ECB (the same source the live fix uses) for consistency — but ECB reference rates are a
   mid-market rate, not necessarily what the processor itself actually converted at, if the
   processor did its own FX at all. For a payment processor that already performs its own
   conversion at a different (its own) rate, Frankfurter's rate is a reasonable proxy, not
   necessarily the literal rate that applied to that specific transaction. Worth confirming this
   approximation is acceptable before treating the backfilled numbers as exact.
3. **What to do with genuinely unresolvable rows** (rare, but the SQL/logic above can't rule out
   zero of them in advance) — whether to leave them flagged indefinitely, chase down a rate
   manually, or handle them some other way.
4. **Timing relative to deploying the fix itself.** The webhook fix from the prior turn is still
   uncommitted/unpushed — a backfill only makes sense once the *live* code is actually the fixed
   version (otherwise new rows would keep needing the same backfill).
5. **Who should actually run it, and how it's audited.** Not addressed here at all — no script was
   written, only the logic it would follow.

No records modified. No backfill run. No schema changed. No dashboard calculations changed. No
commit/push.
