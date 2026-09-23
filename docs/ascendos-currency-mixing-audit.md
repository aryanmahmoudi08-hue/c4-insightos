# AscendOS — Currency-Mixing Audit (broad follow-up to Prompt 13)

Full audit of the ~35 files (of the ~20 originally estimated) that reference `calls`/
`setter_activity`'s money columns (`cash_collected_cents`, `contract_value_cents`,
`total_revenue_cents`), checking each for the exact bug already fixed on the Closer/DM Setter/
Inbound Dialer headline KPIs (Phase 1) and again on Weekly Report (Prompt 13): summing raw cents
across rows tagged with different `original_currency` values as if they were all USD. Every file
was read, not just grepped — several likely-looking hits turned out to reference a *different*
table's same-named column with no currency risk at all. No fixes applied in this pass — this is
the audit you asked for; fixing is a separate decision.

## Method

`sumNormalizedCents()`/`collectFxPairs()` (`src/lib/currency.ts`) is the one real, proven fix,
converting each row to USD cents via a historical FX rate before summing, excluding — never
guessing — a row whose `(currency, date)` has no resolvable rate. A file is **safe** if it either
(a) never aggregates these fields across rows (per-row display has no mixing risk, only an
unlabeled-currency risk, which is a different, lesser problem not in scope here), or (b) aggregates
a field that is genuinely mono-currency by schema (no `original_currency` column exists on that
table, verified against every migration, not just the base `CREATE TABLE`). A file is **bugged**
if it sums `calls.cash_collected_cents`/`contract_value_cents` or
`setter_activity.cash_collected_cents`/`total_revenue_cents` — both of which **do** carry a real
`original_currency` column (`20260912090000_eod_original_currency.sql`) — without normalizing.

## Confirmed bugged — raw-summed, no normalization (9 files)

| File | Where | What it feeds |
|---|---|---|
| `src/routes/_authenticated.dashboard.tsx` | **6 separate aggregation blocks**: L407-431 (headline Cash Collected vs Revenue Generated hero), L597-621 (paid-ad-attributed cash), L740-824 (rep leaderboard, 1st occurrence), L879-955 (day-bucketed chart series feeding the trend line), L1018-1019 ("Month-End Pace" projected-close card), L1072-1118 (rep leaderboard, 2nd occurrence, different tab/section) | Main Hub — the single largest surface in the app; this is the page every session opens to |
| `src/routes/_authenticated.attribution.tsx` | L417/431/439 | Attribution Command Center's Cash Collected/Attributed/Unattributed KPIs and Paid/Organic/Referral Cash breakdown — already documented as a correction in `docs/ascendos-attribution-integrity-audit.md` §E |
| `src/routes/_authenticated.content.tsx` | L559/563 (from a `calls` query at L480/497) | ContentOS Traffic section's revenue-by-channel attribution |
| `src/routes/_authenticated.team.tsx` | L370, L445, L466, L479 | Team Roster's Closes/Cash columns and per-rep cash totals |
| `src/routes/_authenticated.leads.tsx` | L1784 | A single lead's Lead Journey timeline "Total Cash" (lowest blast radius — scoped to one lead's own calls, but the schema allows a lead to have multiple calls in different currencies, so not zero-risk) |
| `src/components/live-ticker.tsx` | L49-52 | The live cash ticker (same `Math.max(paymentsCash, callsCash+setterCash)` shape Weekly Report had before Prompt 13's fix) |
| `src/lib/content-signals.server.ts` | L63 (`perMech[k].cash += m.cash_collected_cents`, from a real `calls` query at L649 — distinct from this same file's many *other*, safe references to `content_metrics.cash_collected_cents`) | Content Signals' "Weekly Check" — the exact "drove the most DMs/calls: Educational — $0 cash" insight reviewed live in Prompt 11 |
| `src/lib/vsl.functions.ts` | L482, L600 | VSL Analytics' cash-per-video attribution (`closedCalls.reduce(...)`, from `calls` joined via `source_vsl_id`) |
| `src/lib/rep-kpi-actuals.ts` | L127-130 (`actualFromCalls()`) | The Targets-vs-Actual engine — notably, its own `CallActualRow` type (L85-93) doesn't even carry `original_currency`, so callers structurally can't normalize before calling it. **This means even the "already fixed" Closer/DM Setter/Inbound Dialer pages still have this bug specifically in their Targets card's actual-vs-target cash comparison** — a distinct code path from the headline KPIs Phase 1 fixed, exactly matching that phase's own caveat about day-bucketed/secondary views not being covered. |

## Confirmed safe — read closely, not just grepped (the rest)

- **`src/components/mentee-renewal-panel.tsx`, `src/components/hub-operating-metrics.tsx`,
  `src/lib/mentee-payments.ts`** — their `contract_value_cents` references are
  `public.clients.contract_value_cents`, a different column on a different table. Checked every
  migration: `clients` has no currency column at all, ever added — genuinely mono-currency by
  schema, not just by omission.
- **`src/components/content-command-center.tsx`, most of `src/lib/content-signals.server.ts`** —
  reference `content_metrics.cash_collected_cents`, already established elsewhere in this
  remediation to have zero write path (always `0` in a live workspace) — no value to mix.
- **`src/components/calls-on-calendar.tsx`, `src/routes/_authenticated.traffic.tsx`** — render
  `cash_collected_cents`/`contract_value_cents` per-row only (a calendar card, a table cell); no
  cross-row summation exists to mix currencies in the first place.
- **`src/lib/dispatch.functions.ts`** — passes one call's cash value through to an outbound
  webhook event-by-event; not a cross-row sum.
- **`src/lib/crm-foundation.server.ts`** — a single lead's activity timeline, per-row display only.
- **`src/routes/_authenticated.hiring.tsx`, `_authenticated.payments.tsx`, `_authenticated.vsl.tsx`,
  `_authenticated.webinar-analytics.tsx`, `src/lib/content-attribution.ts`,
  `content-performance.ts`/`.server.ts`, `hiring.server.ts`, `traffic-hierarchy.ts`,
  `traffic-channel-revenue.ts`, `kpi-targets.ts`, `media-intelligence.ts`, `content-taxonomy.ts`,
  `payments-ledger.ts`, `client-events.functions.ts`** — no aggregation of `calls`/
  `setter_activity` money fields found at all (either no query against those tables, or fields
  referenced only in type definitions never summed).
- **`src/components/activity-module.tsx`, `src/lib/eod-reports.ts`,
  `src/routes/_authenticated.closer.tsx`** — already correct (Phase 1's own fix, or the write path
  that tags `original_currency` in the first place).

## What this means

The org-wide headline cash figures on 3 pages (Closer, DM Setter, Inbound Dialer) are currency-safe.
**Almost everywhere else that touches the same underlying `calls`/`setter_activity` cash data is
not** — most visibly Main Hub, which every session opens to, and which has six separate raw-summed
views, not one. The practical exposure depends entirely on whether this org's real data has any
non-USD `original_currency` rows at all; if every row has always been entered as USD (the column's
own default), every one of these totals is coincidentally correct today and would only diverge the
first time a non-USD entry appears. That's a real, live risk in the schema, not a hypothetical one
— the whole reason `original_currency` was added.

## Not done here

No fixes applied. Nine confirmed sites across nine files is a meaningfully larger and riskier change
than Weekly Report's single-file fix in Prompt 13 — `dashboard.tsx` alone has six independent call
sites that would each need their own currency-pair collection, FX fetch, and normalized sum,
touching the page most people look at first. That's worth doing carefully, one page at a time with
its own verification, not as one large sweep. Say which of the nine you want tackled (dashboard.tsx
first would fix the highest-traffic surface; live-ticker.tsx and rep-kpi-actuals.ts are the smallest,
most contained fixes if you want to start small) and I'll apply the same proven `sumNormalizedCents`
pattern used in `closer.tsx` and `weekly-report.server.ts`.

No commit/push.
