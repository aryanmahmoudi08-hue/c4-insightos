# AscendOS — Broad Currency Normalization Remediation

Fixes every confirmed site from `docs/ascendos-currency-mixing-audit.md`. Reuses the existing
canonical infrastructure (`sumNormalizedCents`/`collectFxPairs`/`getHistoricalFxRatesFn` from
Phase 1, proven on `closer.tsx`) throughout — no second normalization system. No commit/push.

## Fixed

1. **`src/routes/_authenticated.dashboard.tsx`** — all 6 confirmed blocks: headline Cash
   Collected/Revenue Generated hero (`fetchPeriod()`, shared by curr+prev), paid-ad cash
   (`hub-ad-attributed-cash` query), both rep leaderboards (`hub-stats`'s inline leaderboard and
   the independent `hub-leaderboard` query), the day-bucketed chart series, and Month-End Pace.
   Date range, prior-period comparison, per-rep breakdowns, and pace math all preserved — only the
   cash/contract inputs feeding them are now normalized.
2. **`src/routes/_authenticated.attribution.tsx`** — `callRows` normalized once, in place, right
   after fetch; every downstream consumer (totals, per-source breakdown, `callCashById` evidence
   lookups) reads the already-correct value. Attribution models/strength/coverage/drilldowns
   untouched — only the money inputs changed.
3. **`src/routes/_authenticated.content.tsx`** — Traffic section's `computeChannelRevenue()` input
   normalized before the call. **Also found and fixed `src/lib/traffic-hierarchy.ts`** (used by
   `src/routes/_authenticated.traffic.tsx`) — the *actual* rendered Traffic UI (Content Command
   Center embeds `<TrafficPageContent embedded />` directly; `content.tsx`'s own traffic/attribution
   props turned out to be computed but never rendered). `traffic-hierarchy.ts`'s `addCallToMetrics()`
   accumulates via `+=`, a pattern the original audit's `.reduce()`-only grep missed — a real gap in
   that audit, corrected here rather than left standing.
4. **`src/routes/_authenticated.team.tsx`** — Team Roster Closes/Cash (`byUser`) and Team Snapshot
   leaderboards (`team30d`), both normalized. Closer-identity matching logic (Task 4 remediation)
   untouched.
5. **`src/routes/_authenticated.leads.tsx`** — investigated first per the prompt's instruction
   ("prove it before leaving unchanged"): `calls.original_currency` is per-row with no schema
   constraint tying one lead's calls to a single currency — not provably single-currency, so fixed
   rather than left alone.
6. **`src/components/live-ticker.tsx`** — today's cash normalized before the `Math.max(payments,
   calls+setter)` dedup; ticker refresh behavior (30s interval) untouched.
7. **`src/lib/vsl.functions.ts`** — both `getVslFunnelData` (VSL Analytics funnel cash) and
   `listVslActionQueue` (per-video action-queue cash driving `deriveVideoActionQueue`) normalized,
   server-side via `getHistoricalFxRate` directly (these are `createServerFn` handlers, already
   server execution context — no client round-trip needed). Wistia/CRM joins, viewer metrics, and
   unavailable states all untouched.
8. **`src/lib/rep-kpi-actuals.ts`** — the trickiest one, flagged as such in the audit. This module
   is deliberately pure/synchronous with zero Supabase/FX access (by design, for independent unit
   testability). Smallest correct fix: extended `CallActualRow` with `original_currency`, and
   `actualFromCalls`'s `cash_collected_cents`/`contract_value_cents` cases now **exclude** any row
   whose currency isn't USD (never fold it in as if it were) — the module still can't convert a
   non-USD row (no FX access), so exclusion is the only honest option available to it. Added
   `callActualHasNonUsdRows()` as an opt-in companion callers can use to show a disclosure without
   forcing a breaking return-type change on every existing caller. Extended the two real query
   sites that feed this function (`closer.tsx` and `team.tsx`'s `targetCallRows`) to select
   `original_currency`.

## Intentionally unchanged

- **`src/components/mentee-renewal-panel.tsx`, `src/components/hub-operating-metrics.tsx`,
  `src/lib/mentee-payments.ts`** — confirmed their `contract_value_cents` references are
  `public.clients.contract_value_cents`, a different column with no `original_currency` column
  ever added to that table (checked every migration). Genuinely mono-currency, not a false
  assumption.
- **`content_metrics.cash_collected_cents`** (`content-command-center.tsx`, most of
  `content-signals.server.ts`) — confirmed zero write path anywhere in the app (already
  established elsewhere in this remediation); always `0`, no value to mix.
- **`src/lib/content-signals.server.ts`'s `calls` query** — re-investigated per the audit's own
  citation and found it was **imprecise**: `calls.cash_collected_cents` is selected but never
  actually read anywhere in this file. The "Weekly Check" cash figures trace to
  `content_metrics.cash_collected_cents` (dead field, see above); the AI Bottleneck Read's `cash`
  figure traces to `payments.amount_cents` (a separate, out-of-scope question — payments-table
  currency handling was never part of this 9-file scope). No fix applied; the original audit's
  citation for this file is corrected here.
- **Per-row, non-aggregating renders** (`calls-on-calendar.tsx`, `traffic.tsx`'s original per-row
  table cells) — no cross-row summation, so no mixing risk exists regardless of currency.

## FX behavior

Every fix reuses the exact rule already proven in `closer.tsx`/`weekly-report.server.ts`:
historical (never today's) USD→quote rate, resolved per `(currency, date)` pair via
`getHistoricalFxRatesFn` (client components, through the new `useFxRates`/`fetchFxRates` helpers in
`src/hooks/use-fx-rates.ts`) or `getHistoricalFxRate` directly (server-side `.server.ts`/
`createServerFn` handlers). A row with no resolvable rate is **excluded** from the total — never
guessed as USD, never averaged, never converted twice (verified by a dedicated test, see below).
Every fixed surface has some form of honest disclosure: a `"· FX incomplete"` label suffix (Main
Hub, Team, Attribution, Traffic KPI cards), an inline note on Main Hub's Month-End Pace card and
the Team Efficiency leaderboards, or an `"(FX incomplete)"` suffix on the Lead Journey cash
summary. `rep-kpi-actuals.ts`'s `callActualHasNonUsdRows()` is available for its callers to wire up
their own disclosure without a breaking change.

`src/lib/currency.ts` gained one new canonical export, **`usdCentsForRow()`** — the per-row
counterpart to the existing `sumNormalizedCents()`, for grouped/bucketed aggregation (leaderboards,
day-buckets, per-call lookup maps) where a single running total isn't the right shape. Two
near-duplicate local copies of this logic (written mid-task in `dashboard.tsx` and
`attribution.tsx` before the duplication was noticed) were consolidated into this one export rather
than left standing — same one-system rule the prompt asked for.

## Tests

`src/lib/currency.test.ts` (+14 tests) and `src/lib/rep-kpi-actuals.test.ts` (+7 tests), covering
every scenario requested: USD-only, mixed USD+CAD, mixed USD+EUR, missing FX rate (both a missing
key and an explicit `null`), multiple reps with mixed currencies (each rep's exclusion scoped
independently), prior-period comparison (two windows, each resolving against its own date, no
cross-contamination), date-bucket aggregation (each day resolving its own rate), target
actual-vs-target aggregation (`actualFromCalls`'s exclusion behavior), and no-double-conversion
(an already-converted USD amount fed back through the same rates map is not converted again).
374/375 total suite passes (1 pre-existing, unrelated `speed-to-lead.test.ts` failure this whole
remediation has consistently carried — confirmed present before this change too).

`npx tsc --noEmit`: clean. `npm run lint` on every touched file: 0 errors (10 pre-existing warnings
in `closer.tsx`, all predating this change — confirmed via a targeted diff-scoped check). Prettier:
clean.

## Browser verification

Dev server + Dev Bypass + Demo Mode (deterministic fixtures — the only way to exercise real
rendering paths in this sandbox, which has no live Supabase; see the environment note below).
Verified, desktop and 375px mobile, no console errors beyond the expected
`net::ERR_CONNECTION_REFUSED` noise (this sandbox's local Supabase needs Docker, not running here —
same constraint hit in Prompts 10/11/13) and no visual regressions:

- **Main Hub** — Cash Collected/Revenue Generated hero, Month-End Pace, both closer/setter
  leaderboards all render real numbers, no crash, no incorrect "FX incomplete" tag (none of this
  data has non-USD rows, so none should show, and none did).
- **Team** — Cash Collected (30D) stat and the Roster table's per-member Cash column both render;
  the Roster's underlying query fails in this sandbox (real Supabase call, not gated behind demo
  mode — a pre-existing behavior, not something this change introduced) and correctly falls back to
  an honest `$0`, not a crash or `NaN`.
- **Attribution Command Center** — Demo Data Active banner confirmed, Cash Collected renders
  correctly.
- **Traffic** (standalone and embedded in Content Command Center) — Cash Collected + "$X
  contracted" hint render correctly via the `devBypass` mock-hierarchy fallback.
- **Content Command Center** — renders with both its own query and the embedded Traffic/Attribution
  page components active simultaneously, no conflicts.

Not verified live: the specific "FX incomplete" disclosure banners themselves (this sandbox's
fixture/mock data has no non-USD rows to trigger them) — their logic is covered by the unit tests
above instead. DM Setter/Inbound Dialer/Closer Targets cards' new exclusion behavior (item 8) was
also not click-verified live, for the same reason.

## Remaining currency risks (as of this pass)

- **UI disclosure coverage is uneven by design, not oversight** — every fixed data path is
  correct, but not every one has a wired visual "FX incomplete" indicator (e.g. VSL Analytics'
  funnel cash, the VSL action-queue's per-video cash, `content.tsx`'s now-dead-but-fixed
  `businessBridge.traffic`/`attribution` fields). Flagged specifically in "Fixed" above rather than
  silently left un-mentioned.

No commit/push.

---

# Addendum — `payments.amount_cents` fix

The user asked for this remaining risk to be fixed too. Real root cause, real fix, real gap —
different in shape from the `calls`/`setter_activity` bug above.

## The real bug

`20260907100000_currency_fx_foundation.sql`'s own comment states the contract explicitly:
**"payments.amount_cents/currency keep their current meaning (canonical USD)... original_*/fx_*
are pure provenance for the source transaction."** Every downstream reader (Weekly Report, Main
Hub, Team, Live Ticker, Traffic, `content-signals.server.ts`) correctly relies on that contract and
sums `amount_cents` raw — that side was never the bug.

The bug was upstream: all 5 payment-processor webhooks
(`src/routes/api/public/{stripe,paypal,fanbasis,wise,whop}.ts`) wrote `amount_cents` as the **raw,
unconverted native-currency amount** while tagging `currency` with the real (possibly non-USD)
processor currency and hardcoding `fx_rate: 1` unconditionally — with no `if (currency === "USD")`
guard anywhere. This directly violates the migration's own contract: a non-USD payment (most
plausible on Wise, whose whole purpose is international transfers) was recorded as if 1 unit of
its native currency equaled 1 USD cent-for-cent.

`src/lib/fx.server.ts`'s `getHistoricalFxRate()` was already built and already documented for
exactly this: *"used to normalize a non-USD payment at capture time"* — and never actually called
from any webhook until now.

## The fix

Added `normalizePaymentToUsd()` to `src/lib/fx.server.ts` — one shared conversion step, called
from all 5 webhooks before their `.insert()`. For a USD payment: pass-through, `fx_source:
'identity'`. For non-USD: resolves the historical rate for the payment's **real collection
date** (not "today" — a delayed or replayed webhook must convert at the rate that applied when the
money actually moved), converts `amount_cents` to USD, and records the real `fx_rate`/`fx_source`.
`original_amount_cents`/`original_currency` keep the untouched native figures as provenance, exactly
as the schema intends. If no rate can be resolved (rare — a live Frankfurter fetch failing), the
row is still written (a real payment can't be dropped from the ledger) but `amount_cents`/`currency`
stay in the native currency rather than falsely claiming USD, marked `fx_source: 'unavailable'`
and logged server-side, so it's both auditable and greppable for reconciliation later — the same
never-guess philosophy as every other fix in this remediation, adapted to a write path that can't
simply "exclude" a real transaction the way a read-side aggregate can exclude a row.

**Files changed**: `src/lib/fx.server.ts` (+`normalizePaymentToUsd`, refactored to accept an
injectable rate-fetcher for testability — same dependency-injection convention
`content-signals.server.ts` already uses), `src/routes/api/public/stripe.ts`,
`.../paypal.ts`, `.../fanbasis.ts`, `.../wise.ts`, `.../whop.ts`.

## Tests

`src/lib/fx.server.test.ts` (new, 8 tests): USD pass-through (including case-insensitivity),
resolvable CAD/EUR conversion, using the payment's real collection date rather than today's
(proven by supplying a deliberately-wrong "today" rate and confirming it's never used), missing
rate (both a missing key and an explicit `null` from the fetcher) falling back honestly without
guessing, and no double-conversion for an already-USD payment. 382/383 total suite passes (same
one pre-existing, unrelated `speed-to-lead.test.ts` failure).

## Verification

`npx tsc --noEmit`: clean. `npm run lint` on every touched file: 0 errors. Prettier: clean.
Live-browser smoke test: started the dev server and POSTed to all 5 webhook routes directly: all 5
fail identically at the pre-existing `connector_connections` lookup step (`ECONNREFUSED
127.0.0.1:54321` — this sandbox's local Supabase needs Docker, not running here, same constraint
as every other live-data check in this session) — confirmed via server logs this is the *same*
failure every route hits regardless of my changes, not a new crash introduced by
`normalizePaymentToUsd`. A real end-to-end webhook call (valid signature, live Supabase, live
Frankfurter fetch) could not be exercised in this sandbox; confidence rests on the unit tests
above plus the fact that `getHistoricalFxRate` itself is already proven working elsewhere in this
app (`weekly-report.server.ts`, `vsl.functions.ts`, both already calling it successfully).

## A real, separate decision this does NOT make: existing rows

This fixes **future** payments only. Any already-written `payments` row with `fx_source` in
`('stripe','paypal','fanbasis','wise','whop')` and `original_currency <> 'USD'` was inserted under
the old, buggy logic — `amount_cents` for that row is the raw native amount, not a real USD
conversion, even though `fx_rate` says `1`. Whether any such rows actually exist in this org's real
data couldn't be checked (no live Supabase in this sandbox). **Not backfilled here, deliberately**:
retroactively rewriting a financial ledger's amounts changes historical reports (a past month's
"cash collected" could visibly change), and doing that from a query I can't run is not a call to
make silently. If it matters, the right first step is checking whether any non-USD rows actually
exist (`select * from payments where fx_source in ('stripe','paypal','fanbasis','wise','whop') and
original_currency <> 'USD'`) before deciding whether/how to correct them.

No commit/push.
