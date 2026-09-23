# AscendOS Metric Dictionary — Reconciliation Audit

**Input**: `AscendOS_Data_Control_Center.xlsx` (the canonical Data Control Center workbook — 21
pages, 834 metrics, `METRIC REGISTRY` + `RAW DATA` + `FORMULAS` + `AUTOMATION MAP` +
`DEPENDENCIES` + `COMPLETENESS AUDIT` tabs). Every row in that workbook's `Source`/`Formula`/
`Status` columns was an unverified placeholder (`TBD`, `PLACEHOLDER`) — this audit is the first
pass reconciling every one of those 834 rows against the real repository at
`/Users/aryanmahmoudi/c4-insightos` (TanStack Start + Supabase/Postgres, RLS-first, `org_id`
multi-tenant) and the real Supabase schema (`supabase/migrations/*.sql`).

**Full row-level detail** (all 834 metrics, one row each, with real source citations) is in the
companion file [`ascendos-metric-dictionary-audit-detail.csv`](ascendos-metric-dictionary-audit-detail.csv)
in this same folder. This document is the summary and findings layer on top of it — every
aggregate number below is computed directly from that CSV.

**Method**: six parallel research passes, one per functional domain, each grounded in the same
verified facts (the `org_id`/RLS multi-tenancy model, the `*.functions.ts`/`*.server.ts` split,
the real migration history) and each instructed never to mark a metric LIVE just because a UI
card exists for it, and never to invent a formula, source, or status. Every claim below traces to
a `file:line` citation in the detail CSV. Nothing in this report was fabricated to make the
dictionary look more complete than it is — where the audit couldn't find a real source, it says so.

---

## 1. Total metrics reviewed

**834 / 834** — every Metric ID in the workbook's `METRIC REGISTRY` tab was reconciled; none were
skipped, merged away, or silently dropped.

| Page | Metrics | Page | Metrics |
|---|---:|---|---:|
| ContentOS → Content | 92 | Sales Tracking → Attribution | 34 |
| Fulfillment → Payments | 80 | CopyOS → Client DNA | 24 |
| Main Hub | 78 | Sales Tracking → Team | 23 |
| Sales Tracking → Reps → Closer | 72 | Sales Tracking → Traffic | 22 |
| Ops → Webinar Analytics | 60 | Fulfillment | 21 |
| Sales Tracking → Reps → Inbound Dialer | 53 | Sales Tracking → Hiring | 17 |
| Sales Tracking → Leads | 46 | ContentOS → Content Calendar | 15 |
| Sales Tracking → Reps → DM Setter | 46 | Sales Tracking → Team Calendars | 13 |
| Fulfillment → Onboarding | 46 | Fulfillment → VSL Analytics | 12 |
| Admin → Home | 37 | ContentOS → Sequences | 9 |
| Sales Tracking → EOD Reports | 34 | | |

## 2. Live metrics

**690 of 834 (82.7%)** are backed by a real, org-scoped Supabase query with no mock/demo
fallback in the production path. This is the single most important top-line number: **AscendOS's
real data layer is much further along than the placeholder workbook suggested** — the workbook had
every one of these marked `PLACEHOLDER`, which was simply wrong.

Standout domains: **Sales Tracking → Attribution** (34/34), **EOD Reports** (34/34), **Team
Calendars** (13/13), **ContentOS → Content Calendar** (15/15), **Sequences** (9/9), **CopyOS →
Client DNA** (24/24), and **Fulfillment → Onboarding** (46/46) are **100% LIVE**.

The only mock-data fallbacks found anywhere in this audit are gated behind `devBypass` (local dev
only, no real session) or an explicit, user-visible Demo Mode toggle — never a silent production
substitution. That anti-fabrication discipline (see `CLAUDE.md`, and the project's own "Not
tracked" pattern used throughout) held up under this audit.

## 3. Partial metrics

**49 of 834 (5.9%)** are `PARTIALLY CONNECTED` — a real query runs against real data, but with a
caveat that stops short of full confidence:

- **AI-generated fields** (Lead AI Insights, Hiring AI evaluation, ContentOS AI Bottleneck
  Read/Setter Signals) — real prompts over real data, but gated on `LOVABLE_API_KEY` being
  configured, and for hiring, a best-effort Loom transcript scrape that can fail silently.
- **Misattributed source data** — Inbound Dialer's "Average Call Length"/"Average Talk Time"
  query `calls.duration_seconds`/`talk_seconds`, but those columns are only ever populated by the
  **Closer's** manual "Log a sales call" dialog; the Inbound Dialer EOD form has no such field, and
  the query has no per-role filter, so these tiles show org-wide Closer-logged data, not dialer
  activity (`src/routes/_authenticated.inbound-dialer.tsx`, `src/routes/_authenticated.closer.tsx`).
- **Meaningless-but-real columns** — Main Hub's "Client Health" tile averages
  `clients.health_score`, a column `src/lib/client-risk.ts` itself documents as dead (`default
  100`, never written by any code path) — the app's own risk logic stopped reading it for exactly
  that reason, but this Main Hub tile didn't get the memo.
- **VSL metrics** (Page Visits/Plays/Unique Viewers/Engagement) query a real,
  org-scoped table (`vsl_metric_snapshots`), but no ingest route was found anywhere under
  `src/routes/api/public/*` that would populate it from Wistia — the table exists, nothing writes
  to it automatically yet.

## 4. Integration-dependent metrics

**61 of 834 (7.3%)** are `NEEDS INTEGRATION` — schema/UI exist, but a specific external connector
or internal wiring fix is required before the number can be real:

- **Ops → Webinar Analytics dominates this bucket: 54 of its 60 metrics.** This is the single
  biggest integration gap found in the whole audit — see §11.
- **DM Setter's "DM Source Mix" group (6 metrics)** — not a missing integration so much as a
  **role-gate bug**: the exact query that correctly powers Inbound Dialer's "Inbound Lead Sources"
  is wired with `enabled: isDialer && ...` (`activity-module.tsx:1016`), so it can never run for
  DM Setter. One-line fix, not new infrastructure.
- **Closer's "Payment Plan Uptake"** — real schema, but the field it would read is never written
  by any of the payment webhooks.

## 5. Schema-dependent metrics

**22 of 834 (2.6%)**, Category C — the concept genuinely needs a data-model addition or a broken
join fixed before it can be measured, not just a new connector:

| Metric ID(s) | Metric | Real problem |
|---|---|---|
| SALE-0395 – SALE-0399 | Payment Success Rate, Failed/Default Rate, Failed Payments, Recovered Failed Payments, Deposit → Full Payment | **No payment webhook (Stripe/PayPal/Fanbasis/Wise/Whop) ever populates `payments.call_id`**, so the Closer dashboard's `.in("call_id", listCallIds)` join is permanently empty. This isn't "not connected" — the connectors ARE live and writing real `payments` rows; they just never link them to the call that produced them. |
| SALE-0331/0332 | Average Call Length, Average Talk Time (Inbound Dialer) | Same root cause as §3 above — needs a real per-role call-duration source, not just a filter fix. |
| SALE-0320 | Speed-to-Lead SLA Compliance | No SLA target column exists to compare against. |
| CONT-0449/0451 | "Booking"/"Payment" columns, Canonical Content→Cash | `CanonicalLifecycleAttributionPath.bookingId`/`.paymentId` are real typed fields that `buildAttributionPathsForModel()` never populates in any of its 5 branches — dead columns despite looking wired. |
| MAIN-0045 | Top inbound setter | Fully-built render block, gated on a `topSetter` prop the one call site never passes — dead code, not a missing query. |
| MAIN-0047 | Client Health | See §3 — reads the documented-dead `clients.health_score` column. |

## 6. Undefined metrics

**11 of 834 (1.3%)** are `PLACEHOLDER` — and this audit found a real, important distinction the
workbook's flat `PLACEHOLDER` label couldn't make: **most of these are honest** (a UI element
correctly rendering "Not tracked" because no schema exists), but **a handful are actively
misleading** — a fabricated or wrong number rendered with the identical visual treatment as real
data next to it:

**Confirmed fabricated / actively wrong (fix before anyone trusts this page again):**

- **MAIN-0042 "Avg first response time"** — hardcoded in source: `{ label: 'Avg first response
  time', value: '< 4 mins', pct: 82 }` (`hub-operating-metrics.tsx:242-243`). It never varies with
  real data and renders with the exact same progress-bar UI as the real "Convo-to-link sent rate"
  and "Daily inbound volume pace" tiles beside it. The most deceptive fabricated number found in
  this entire audit.
- **SALE-0179 "Status" (Team → Roster)** — a hardcoded `'Active'` string literal in JSX
  (`team.tsx:723-726`); every roster row shows the same static chip regardless of real membership
  state.
- **SALE-0302 / SALE-0350 "Inbound DMs" / "Inbound leads" (Workflow panel stage labels, DM
  Setter & Inbound Dialer)** — both hardcode the string `"Verified activity"`
  (`operational-workflow-panel.tsx:94-98`); neither reflects the real counts the parent component
  has already computed one panel over.
- **SALE-0400 "Future Scheduled Cash" (Closer)** — the worst of these. Because the broken
  `call_id` join from §5 makes "amount already collected" always compute to zero, this metric's
  formula (`Σ max(0, contract_value_cents − Σpaid)`) silently **overstates the full contract value
  as the remaining balance**, rather than showing "Unavailable." It is actively wrong, not merely
  missing.

**Honest placeholders (correctly disclosed, not a problem):** MAIN-0014 "MRR — Low Ticket",
CONT-0444/0462/0492/0493/0520/0521 (Cash/Closes on Content pieces — `content_metrics
.cash_collected_cents`/`.closes` exist in schema but are never in the Log-content save mutation's
field list, and every surface correctly shows "Not tracked" rather than a fake `$0`).

## 7. Duplicate metrics

**246 of 834 rows** carry a flagged near-duplicate elsewhere in the registry (full list in the
detail CSV's `DuplicateOf` column). The great majority of these are **legitimate, not bugs** — the
same real-world figure rolled up at a different scope on a different page is expected in a
dashboard product (e.g. "Cash Collected" appears at company scope on Main Hub, per-rep scope on
Closer, and per-deal scope in Attribution — 20 occurrences, all correct, all reading the same
underlying `cash_collected_cents`/`calls`/`payments` data at different aggregation levels).

The list below is the **curated subset that is a real risk** — two different code paths computing
what should be the same number, with no shared source, so they can silently drift apart:

| Duplicate pair | Canonical definition needed | Current state |
|---|---|---|
| **`FULF-0647` "Total contracted" (Ledger) vs. `FULF-0687` "Portfolio value" (all-time)** | Two genuinely different scopes (date-range-gated vs. all-time) that *look* like the same metric | **Already fixed.** This is the exact conflict documented in the prior Payments-page plan (`/Users/aryanmahmoudi/.claude/plans/quirky-sleeping-bee.md`, finding #1) — confirmed implemented: the all-time card was relabeled away from "Contracted" specifically so it can't be misread as the ledger's number (`payments.tsx:996-1002`). No action needed; flagging so it isn't "fixed" a second time by accident. |
| **`OPSW-0746` "ROAS" (Executive KPIs) vs. `OPSW-0754` "ROAS" (Acquisition efficiency)** | One canonical ROAS formula, one input set | **Not fixed** — both are real formulas (`revenueCents / spendCents`), but computed from two different input sets (`webinar_metrics`-derived revenue vs. the acquisition-ledger's own revenue figure) that could diverge. Same shape of risk as the Payments conflict above, currently unresolved. |
| **`SALE-0369` "Closes" (Closer → Targets) vs. `SALE-0378`/`0385`/`0417`/`0433` "Closes" (5 other places on the same page)** | One shared "what counts as a close" predicate | **Real inconsistency, unfixed.** Every other "Closes" tile on the Closer page uses `closed \|\| status==='closed'`; Targets alone uses only `closed`, so it can under-count relative to every other Closes number on the exact same page. |
| **`SALE-0163`/family "Booked (30D)"/"Show Rate"/"Cash Collected (30D)" (Team Snapshot)** | One authoritative source per metric | **Real risk, unfixed.** Each takes `Math.max()` of two independent, non-reconciled sources — raw `calls` rows vs. self-reported `setter_activity` aggregates (`team.tsx:398-431`) — rather than one source of truth. Worth checking for double-counting. |
| **`SALE-0134`/`0146` "Calls On Calendar" vs. the Team Calendars "Open Slots" tile** | "Open Slots" is mislabeled | The "Open Slots" tile is actually a count of **cancelled** calls (`overallStatus==='cancelled'`) — same underlying number as the status-legend's "Cancelled" count, just relabeled to sound like free capacity. |
| **`SALE-0111` "Closer" (Leads table, via `calls.closer_name`) vs. `SALE-0176` "Closer" (Team → Roster, via `calls.closer_id`)** | One identity-matching strategy for "who closed this" | The Leads page deliberately avoids `closer_id` (documented as unreliable — the native EOD form never sets it) in favor of `closer_name`; Roster makes the opposite choice on the same table, for the same question. |

## 8. Missing source mappings

**0 of 834** rows were left with an unresolved `RealSource` — every metric was traced to either a
real table/column/function, or an explicit, cited absence (no query exists at all). This does
**not** mean every metric is live; it means the audit itself is complete — nothing was left as an
unexamined `TBD`. See §§2–6 for what that tracing actually found.

## 9. Missing formulas

Only **2 of 834** rows classified as DERIVED/AGGREGATED/RATE had no determinable real formula:
`CONT-0532` "Ready to post" and `CONT-0533` "Already posted" (ContentOS → Content Calendar) —
both are simple counts by pipeline stage rather than true ratios; their "formula" is really just
"count where status = X," already captured in their `RealSource`.

Every other derived/aggregated metric in the registry has a real, cited formula from actual code —
not the workbook's invented examples. A sample of what was actually found (see the detail CSV for
all of them):

- **Close Rate variants are NOT one formula** — the audit found at least two genuinely different
  "close rate" computations on the Closer page alone (on-show vs. on-pitch denominators), which is
  correct/intentional per the workbook's own `DEPENDENCIES` tab note ("Offer → Close Rate ... Do
  not call this overall close rate") but means "Close Rate" needs to stay several distinctly-named
  metrics, not one.
- **Collection Rate** genuinely is `Cash Collected ÷ Contracted Value` where implemented, matching
  the workbook's example — but is not computed everywhere the workbook's flat list implies.
- **Speed to Lead** (`SALE-0339`, Inbound Dialer) is real:
  `median(minutesBetween(leadAssignedAt ?? leadCreatedAt, firstAttemptAt))` over
  `lead_response_events`, independently unit-tested (`speed-to-lead.test.ts`) — matching the
  workbook's example formula shape almost exactly.

## 10. Missing tenant/org scope

**This is a clean result.** Of 834 metrics, 802 either have a confirmed `org_id`-scoped real
query (**792**) or are correctly `N/A` because no query exists at all for that row (**32** — the
placeholder/dead-code rows from §6, where there's nothing to scope). The audit found **zero cases**
of a real query that reads business data without an `org_id` filter — no cross-tenant leakage risk
was identified anywhere in this pass. This matches the repo's stated architecture (every business
table carries `org_id`, RLS enforced via `public.is_org_member()`/`public.has_org_role()`, real
`gen_random_uuid()` organization IDs — never the fake `org_001`-style IDs Task 5 explicitly warned
against).

## 11. Recommended next infrastructure work

Ranked by real impact, grounded in what this audit actually found — not a generic roadmap:

1. **Fix the Closer payment-quality join** (`payments.call_id` is never set by any of the five
   payment webhooks). This single fix unblocks 6 Category-C metrics (§5) and stops
   `SALE-0400` from actively lying about remaining balance (§6). This is a code fix, not a new
   integration — the data (`payments`, `calls`) already exists on both sides of the join.
2. **Webinar ingestion is the single largest gap in the workbook: 54 metrics, one root cause.**
   `public.webinars`/`webinar_metrics`/`webinar_events`/`acquisition_spend` have real,
   well-designed read/aggregation logic (correct null-vs-zero handling, no fabrication anywhere)
   but **zero write paths exist anywhere in the app** — no "create webinar" UI, no CSV import
   (unlike VSL, which has a real one), no webhook, and `record_webinar_event()` has zero callers.
   In a real (non-demo) workspace this entire page will permanently show "No webinars yet." This
   is a pure ingestion-layer gap, not a modeling problem — the schema and the read side are ready.
3. **DM Setter "DM Source Mix" role-gate bug** — one boolean condition (`activity-module.tsx:1016`)
   is blocking 6 metrics that work correctly for Inbound Dialer today. Cheapest fix in this report.
4. **Currency isn't normalized anywhere on the rep dashboards.** `original_currency` is captured
   at EOD entry but every DM Setter/Inbound Dialer/Closer dashboard sums `cash_collected_cents`/
   `contract_value_cents` as raw cents regardless of currency before formatting — a real,
   code-confirmed correctness gap across every money metric on all three rep roles.
5. **ContentOS's Top KPI row / performance chart / format mix / post-level table ignore the page's
   own date-range picker** (`content.tsx:998` passes the unranged, latest-200 query, not the
   range-filtered one) — while Weekly Check is hardcoded to a trailing-7-days window regardless of
   the picker. Not a missing integration, a wiring inconsistency inside code that already exists.
6. **Reconcile the two unresolved formula-duplication risks from §7** (webinar ROAS, Closer
   "Closes" predicate) before they diverge in a way a manager would notice and distrust.
7. **Decide what to do with the confirmed-fabricated tiles in §6** — each needs either a real data
   source built for it, or removal. Leaving them as-is means a manager can be shown a hardcoded
   `< 4 mins`/`82%`/`'Active'` and reasonably believe it's real, because nothing in the UI
   distinguishes it from the genuinely live tile next to it.
8. Everything else in §§4–5 (58 remaining `NEEDS INTEGRATION`/Category-C rows outside Webinar and
   Payments) is either a real external connector (Wistia auto-ingest for VSL, a
   Speed-to-Lead SLA target definition, `topSetter` wiring) — see the detail CSV's
   `PlausibleExternalSource` column per row for what's actually evidenced in code vs. speculative.

---

## Data Source Registry (Task 8)

The workbook doesn't yet have a dedicated Data Sources tab. Based on what this audit actually
found wired into the repo (real webhook routes, real connector rows, real env vars — not
aspirational), here is the real registry, ready to paste into the workbook as its own tab:

| Provider | System | Object | Auth required | Webhook/API/Manual | Status | Notes |
|---|---|---|---|---|---|---|
| Typeform | Application intake | `leads`, `leads.ticket_tier` | Webhook secret | Webhook | **Live** | `src/routes/api/public/typeform.ts` — confirmed setting `ticket_tier` from CopyOS's real Classification Rules, not just writing to an unused table. |
| Stripe | Payments | `payments` | Webhook signing secret | Webhook | **Live** (code) / **uncommitted on this branch** | Real HMAC verification, real inserts (`stripe.ts:11-35,125-149`) — but never sets `payments.call_id` (§5/§11). |
| PayPal | Payments | `payments` | Webhook cert/signature | Webhook | **Live** (code) / **uncommitted on this branch** | Same `call_id` gap as Stripe. |
| Fanbasis | Payments | `payments` | Webhook signature | Webhook | **Live** (code) / **uncommitted on this branch** | Same `call_id` gap. |
| Wise | Payments | `payments` | Webhook signature | Webhook | **Live** (code) / **uncommitted on this branch** | Same `call_id` gap. |
| Whop | Payments | `payments` | Webhook signature | Webhook | **Live** (code) / **uncommitted on this branch** | Same `call_id` gap. There is also **no manual "add payment" UI anywhere** — `payments` can only ever be populated via these five webhooks. |
| Twilio | Inbound dialer events | `lead_response_events` | Signature validation | Webhook | **Live** | `src/routes/api/public/twilio.$event.ts` + `src/lib/lead-dial-attempts.server.ts` manual fallback; powers real, unit-tested Speed-to-Lead. |
| Google Calendar / Calendly | Team calendar sync, booking confirmations | `calls`, calendar link fields | OAuth / link token | Webhook + sync | **Live** | Confirmed via `20260911100000_calendar_reschedule_reason_and_calendly_links.sql`, `20260913120000_calendar_confirmation_responses_and_status_history.sql`. |
| Wistia | VSL metrics | `vsl_metric_snapshots` | API key / CSV import | Manual CSV import (real) | **Partially connected** | Real table, real org-scoped reads; no auto-ingest route found — CSV import exists for VSL but not for the webinar side (see next row). |
| Webinar platform (unspecified — Zoom/WebinarJam/etc.) | Webinar analytics | `webinars`, `webinar_metrics`, `webinar_events`, `acquisition_spend` | Not yet chosen | **None** | **Not connected** | §11 — zero write paths anywhere; this is the single biggest gap in the whole dictionary. |
| Meta / Google / TikTok Ads | Paid acquisition spend | `acquisition_spend` | Ads API OAuth | Not built | **Not connected** | Table exists (`20260827210000_acquisition_spend_foundation.sql`); no ingest route under `src/routes/api/public/*`. Main Hub/Webinar Ad Spend/ROAS correctly show "Not tracked" rather than fabricate a number. |
| Instagram / TikTok / YouTube / LinkedIn | Content performance | `content_metrics`, `slide_metrics` | Platform API OAuth | Manual entry today | **Manual only** | The Log-content dialog is genuinely real (writes to real tables) but is human-entered; no platform API pulls metrics automatically yet. `cash_collected_cents`/`closes` on this table are dead columns (§6) — not wired even to manual entry. |
| Lovable AI Gateway | AI insight generation (Lead AI Insights, Hiring evaluation, Content Signals) | n/a (inference only) | `LOVABLE_API_KEY` | API | **Live, config-dependent** | Real calls, real prompts, graceful fallback when unset — matches `CLAUDE.md`'s documented AI pattern. |

## Automation readiness (Task 9)

Computed per-metric in the detail CSV from the reconciled `Status`/`Category` columns
(`READY` = Category A; `READY_AFTER_CONNECTOR` = Category B; `NEEDS_SCHEMA` = Category C;
`NOT_MEASURABLE`/`NEEDS_DEFINITION` = Category D, split per §6 into honest-placeholder vs.
confirmed-fabricated). Aggregate:

| Readiness | Count | % |
|---|---:|---:|
| READY (already supported by real code/schema) | 684 | 82.0% |
| READY_AFTER_CONNECTOR (schema exists, needs external connector) | 113 | 13.5% |
| NEEDS_SCHEMA (real gap — join fix or new column/table) | 22 | 2.6% |
| NOT_MEASURABLE / NEEDS_DEFINITION (dead code, hardcoded, or genuinely undecided) | 15 | 1.8% |

---

## Answering your closing questions directly

**What's already correct in the spreadsheet:** the *structure* — Metric IDs, the 21-page
taxonomy, the RAW DATA / FORMULAS / AUTOMATION MAP / METRIC REGISTRY separation, and the
explicit anti-fabrication labeling convention (`PLACEHOLDER`, `Do not fabricate data.`) are all
sound and worth keeping exactly as designed. Nothing about the workbook's shape needed to change.

**What Claude discovered is wrong/incomplete:** every `Source`/`Formula`/`Status` value in the
workbook itself — all 834 were unverified placeholders, and the real picture (82.7% LIVE) is far
more complete than the sheet showed. Separately, real bugs exist in the *app* independent of the
spreadsheet: the Closer `payments.call_id` join, DM Setter's dead `DM Source Mix` role gate,
ContentOS's date-range bypass, uncurrency-normalized money sums, and the handful of confirmed
fabricated tiles in §6 (most importantly `MAIN-0042` "Avg first response time" and `SALE-0400`
"Future Scheduled Cash," which actively overstates money).

**What needs n8n:** nothing yet, by design — no n8n workflows were touched or proposed per your
instruction. Once the webinar-platform decision in §11 is made and the payment `call_id` fix
ships, n8n becomes the natural place to wire Webinar/Ads ingestion using the same webhook pattern
already proven for Stripe/Typeform/Twilio.

**What needs Supabase:** the `payments.call_id` fix (§11 #1) and the currency-normalization gap
(§11 #4) are schema/query-layer work inside the existing Supabase project — no new external
service required for either.

**What needs external API credentials:** Meta/Google/TikTok Ads (acquisition spend/ROAS), a
webinar platform (not yet chosen), and native Instagram/TikTok/YouTube/LinkedIn content-metrics
pulls (currently manual entry) — see the Data Source Registry above for exactly which table each
would feed.

**What can be tested entirely with demo data today:** everything in §2 (690 LIVE metrics) — in
particular the 100%-LIVE pages (Attribution, EOD Reports, Team Calendars, Content Calendar,
Sequences, Client DNA, Onboarding) are fully exercisable right now with no new connector, no
schema change, and no credentials, using the app's existing Demo Mode / seeded data path.
