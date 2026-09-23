# AscendOS — Weekly Report Final Upgrade

Prompt 13, intentionally last in the 13-prompt roadmap — "synthesizes everything else." Unlike
Prompts 4/5/6/8/9/10/11 (research/audit-only), this one shipped a real, scoped code fix, because
Weekly Report's whole purpose is to be the trustworthy synthesis of everything the rest of this
remediation fixed — and reviewing it surfaced a real gap in that trust.

## What Weekly Report already was (verified, not assumed)

Read `src/lib/weekly-report.server.ts`/`.functions.ts` and `_authenticated.weekly-report.tsx`
before touching anything. It's a genuinely well-built synthesis, not a stub: real cash/calls/leads
aggregation reconciled across `payments`/`calls`/`setter_activity` (a `Math.max()` floor across
sources, an already-reviewed, deliberate choice — not touched here), the *exact same*
`deriveCap`/`deriveWorking` funnel-health functions the rep dashboards' click-to-explain panels
use, the *exact same* content-mix computation Content Command Center's Content Signals section
shows (reused via `computeDemand`/`computeWeeklyContentCheck`, not re-derived), real client-health
and hiring-pipeline breakdowns, a dynamic plain-English `trends` array, and a working "Send to
Discord" action through the same `dispatchEvent()`/`webhook_subscriptions` infrastructure
documented in Prompt 6. This is real, current work — the review found one concrete gap, not a
pattern of neglect.

## The gap found and fixed

`fetchCoreWindow()` summed `calls.cash_collected_cents`/`contract_value_cents` and
`setter_activity.cash_collected_cents`/`total_revenue_cents` **raw**, with no currency
normalization — exactly the bug Phase 1 already fixed on the Closer/DM Setter/Inbound Dialer
dashboards (`_authenticated.closer.tsx`, via `sumNormalizedCents()`/`collectFxPairs()` from
`src/lib/currency.ts`, converting each row to USD cents via historical FX rates before summing,
never guessing a rate, excluding unresolvable rows rather than folding them in as USD). Weekly
Report — the one page meant to be the trustworthy summary of everything else — had never been
covered by that fix. A rep or client logging cash in a non-USD `original_currency` would have had
that amount silently counted as USD in the weekly digest, disagreeing with the (already-correct)
Closer dashboard's own number for the same rows.

**Fixed in `src/lib/weekly-report.server.ts`**: `fetchCoreWindow()` now selects `original_currency`
(+ `scheduled_for` for calls, `activity_date` for setter_activity — the same date keys
`closer.tsx` uses to look up historical rates) on both queries, fetches every distinct non-USD
`(currency, date)` pair once per window via `getHistoricalFxRate()` (the real, non-wrapped
`.server.ts` implementation — this file already runs server-side, so no `createServerFn` round
trip is needed, unlike the client-side `closer.tsx`), and normalizes through `sumNormalizedCents()`
for the headline cash total and through an equivalent per-row conversion for the per-rep
Closer/Setter leaderboard cash (which had the identical raw-sum bug — a rep with mixed-currency
rows would have shown an inflated or deflated number even after the org-wide total got fixed).
Incomplete conversions (a currency/date pair with no resolvable historical rate) are excluded from
the totals, never guessed — and now surfaced honestly in the report's own `trends` array
("Some non-USD cash/revenue rows couldn't be converted for this window — totals exclude them
rather than guessing (FX incomplete)"), matching the exact disclosure convention Phase 1 already
established elsewhere rather than inventing a new one.

**Verified**: `npx tsc --noEmit` clean; `npx eslint` clean (one pre-existing, unrelated
`no-explicit-any` error on this file's `Sb` type, predating this change); Prettier clean; 360/361
tests pass (same one pre-existing, unrelated `speed-to-lead.test.ts` failure this whole
remediation has consistently carried). **Not verified live in-browser**: this sandbox's local
Supabase needs Docker, which isn't running (same constraint hit in Prompts 10/11) — the Dev
Bypass path this route falls back to uses a separate, independent mock dataset
(`mockWeeklyReport()`) that never exercises `fetchCoreWindow()` at all, so a live click-through
wouldn't have exercised this fix either way. The fix mirrors `closer.tsx`'s already-proven-correct
pattern exactly (same functions, same call shape, same disclosure convention), which is the basis
for confidence here in place of a live render.

## A bigger finding surfaced along the way — flagged, not fixed

Checking why Weekly Report alone had this gap led to checking how many *other* pages sum these
same raw fields. The answer: **`sumNormalizedCents` is used in exactly one file in this entire
codebase** (`_authenticated.closer.tsx`) — plus, as of this prompt, `weekly-report.server.ts`.
Grepped every other file referencing `cash_collected_cents`/`contract_value_cents`/
`total_revenue_cents` and found roughly 20 more — `_authenticated.attribution.tsx` (corrected in
`docs/ascendos-attribution-integrity-audit.md`, new §E), `_authenticated.dashboard.tsx` (33 raw
references — the single largest surface), `_authenticated.content.tsx`, `content-command-center.tsx`,
`hub-operating-metrics.tsx`, `mentee-renewal-panel.tsx`, `_authenticated.team.tsx`,
`_authenticated.webinar-analytics.tsx`, `traffic-channel-revenue.ts`, `rep-kpi-actuals.ts`, and
others — **none scanned line-by-line for this pass**. Doing that properly, the way Prompt 8 did
for attribution specifically, is its own dedicated audit, not something to rush through as a
footnote here. What's confirmed: the currency-mixing bug is broader than "the three rep dashboards
Phase 1 already fixed" — it's the default state everywhere except those three files plus, now,
Weekly Report. **This needs its own follow-up pass** before treating any other page's cash total
as currency-safe by default.

## What else "synthesizing everything else" could mean, considered and set aside

Reviewed whether Weekly Report should also cross-reference the final metric-dictionary status
(Prompt 9) or the attribution findings (Prompt 8) directly in its own UI (e.g. a "N metrics still
pending integration" line). Decided against inventing that here: Weekly Report's job is a
7-day operational digest for someone running the business, not a meta-report about this
remediation project's own status — conflating the two would be scope creep the same way a
gratuitous "834-metric audit" banner on a live dashboard would be. The metric/attribution work
stays in its own docs, cross-referenced from here in prose, not injected into the product.

No commit/push.
