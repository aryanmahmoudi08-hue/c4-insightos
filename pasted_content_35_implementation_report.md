# InsightOS Priority 6 — Acquisition, Spend, and Financial Attribution Foundation

## Scope and safety

Priority 6 was applied to the existing InsightOS branch as a provider-neutral architecture and internal-data integration. No Meta Ads, Google Ads, TikTok Ads, or other advertising provider was activated. No credentials were requested, production was not touched, no spend was fabricated, and `main` was not merged.

## Acquisition sources currently present

The repository already contains acquisition-relevant data in several places:

| Source | Existing data | Date semantics | Status |
|---|---|---|---|
| `leads` | `source_connector`, `source_platform`, `source_format`, `source_content_id`, `source_campaign`, `source_webinar_id`, `first_touch_content_id` | Lead creation / first-touch fields | Existing attribution source |
| `content_pieces` / `content_metrics` | Platform, funnel stage, mechanism, variation, content metrics, captured metrics | `content_metrics.captured_at` | Existing content-performance source |
| `webinar_events` / `webinar_metrics` | Registration, attendance, pitch, sales-setting, closing, revenue fields | `webinar_events.occurred_at`; metric snapshot `captured_at` | Existing event-backed webinar source |
| `payments` | Amount, currency, `collected_at`, call, client, connector, status | `payments.collected_at` | Existing financial ledger |
| `calls` and `lead_attribution_v` | Rep/call outcomes and attribution fields | Call and mutation timestamps | Existing lifecycle/call source |
| Traffic / Attribution routes | Existing traffic and attribution views | Route-specific source dates | Existing dashboards preserved |
| Connectors | Meta Ads Manager, Google Ads, TikTok for Business, Stripe and others exist but are disabled | N/A | No provider activation performed |

No existing provider-neutral spend table was found. The new foundation fills that gap without duplicating the payment ledger or existing lifecycle/event stores.

## New canonical model

Added the additive migration `supabase/migrations/20260827210000_acquisition_spend_foundation.sql` with `public.acquisition_spend`.

| Field | Purpose |
|---|---|
| `org_id` | Organization ownership and tenant isolation |
| `provider` | Provider-neutral source identifier |
| `ad_account_id` | Optional upstream advertising account |
| `campaign_id`, `campaign_name` | Stable campaign dimensions |
| `spend_date` | Provider-reported spend date |
| `currency` | Currency preservation; no silent conversion |
| `spend_amount_cents` | Spend amount, nullable and non-negative |
| `impressions`, `clicks`, `paid_visits` | Provider-reported delivery facts, independently nullable |
| `is_remarketing` | Keeps remarketing spend separate from acquisition spend |
| `source_platform`, `source_type` | Platform and Paid/Organic/Direct/Referral/Unattributed classification when supplied |
| `webinar_id`, `content_id` | Nullable explicit relationships only |
| `external_record_id` | Stable provider record identifier |
| `captured_at`, `metadata` | Ingestion timing and non-authoritative provider metadata |

A unique index on `(org_id, provider, external_record_id)` prevents duplicate spend records. Date, campaign, webinar, and content indexes support scoped analytical queries. Check constraints reject empty currencies and negative numeric facts.

The existing canonical attribution dimensions remain the source of truth across Traffic, Content, Webinar, Leads, Calls, and Payments: **platform → source → campaign → campaign ID → ad account → content → format → webinar → lead → rep → call → close → cash**, with nullable fields where the upstream system does not supply a relationship.

## Provider-neutral validation and calculations

Added `src/lib/acquisition.ts` with:

- `validateAcquisitionSpendRecord` for organization, provider, external ID, ISO spend date, currency, non-negative numeric values, and allowed source types.
- `acquisitionRecordKey` for stable organization/provider/external-record idempotency.
- `calculateAcquisitionMetrics` for CTR, CPC, CPL, CPA, and ROAS with denominator-safe null behavior.
- `aggregateSpendByCurrency` to prevent silently mixing currencies.
- `attributionMatchesScope` for explicit dimension matching without timing-based joins.

The metric formulas are:

| Metric | Formula | Availability rule |
|---|---|---|
| CTR | Clicks / Impressions | Null when impressions are missing or zero |
| CPC | Spend / Clicks | Null when clicks are missing or zero |
| CPL | Spend / Paid leads | Null when paid leads are missing or zero |
| CPA | Spend / Attributable customers | Null when customers are missing or zero |
| ROAS | Attributable revenue / attributable spend | Requires compatible scope, legitimate revenue, and positive spend |

Zero spend is not substituted for unavailable spend. Currency mismatches make ROAS unavailable rather than silently converting or combining currencies.

## Webinar Analytics integration

`src/routes/_authenticated.webinar-analytics.tsx` now queries `acquisition_spend` for the selected webinar and selected date range using `spend_date`, while webinar event data continues using `webinar_events.occurred_at` and existing metric snapshots use `captured_at`.

The selected webinar now has an Acquisition Efficiency section with:

- Lead Capture Investment.
- Impressions.
- Clicks.
- CTR.
- CPC.
- CPL / CPA / ROAS.
- Paid visits, currency, and a visible remarketing-separation note.

The UI renders **Unavailable** when a legitimate spend source or denominator is absent. Existing webinar funnel, retention, comparison, and financial panels remain intact. The existing webinar metric-row ROAS behavior was not removed; the new acquisition query provides the provider-neutral spend source when it exists.

## Content Command Center and existing dashboards

The existing Content Command Center, Traffic, and Attribution routes were preserved. Content and lead attribution fields remain available for explicit campaign/content/webinar relationships. No timing-based joins were added, and no ad spend was fabricated for content or webinar records.

A future provider ingestion can populate `acquisition_spend` with `content_id` and/or `webinar_id`; those explicit IDs are the supported path for connecting Campaign → Content → Webinar → Lead → Close → Cash. Missing relationships remain null.

## Financial source audit

The existing `payments` table remains the financial ledger. It contains `amount_cents`, `currency`, `collected_at`, `call_id`, `client_id`, `external_id`, `source_connector`, and payment status. No second payment ledger was created.

Core offer revenue, deposits, refunds, order bumps, and upsells are only distinct where the existing source fields provide those distinctions. The new acquisition layer does not collapse payment types or invent a mapping that the existing ledger does not expose.

## Calculable metrics now

| Metric | Current status |
|---|---|
| Spend | Calculable once legitimate `acquisition_spend` rows exist; currently unavailable without provider rows |
| Impressions | Calculable from provider rows; currently unavailable without provider rows |
| Clicks | Calculable from provider rows; currently unavailable without provider rows |
| CTR | Calculable with provider clicks and non-zero impressions |
| CPC | Calculable with provider spend and non-zero clicks |
| Paid visits | Calculable only when the provider supplies paid visits; never inferred from clicks |
| CPL | Calculable with spend and legitimate paid leads |
| CPA | Calculable with spend and explicit attributable customers |
| Remarketing spend | Separately supported by `is_remarketing` |
| Revenue | Existing webinar/payment/call sources remain available where populated |
| ROAS | Calculable only when compatible attributable revenue and spend exist; otherwise unavailable |

No external advertising provider is currently configured, so no live spend, impressions, clicks, paid visits, CPC, CTR, CPL, CPA, or provider-backed ROAS result is claimed.

## Tests and validation

Added `src/lib/acquisition.test.ts`, covering:

- Valid spend insertion contract and stable idempotency key.
- Malformed dates, negative values, and missing identity rejection.
- Normal CTR, CPC, CPL, CPA, and ROAS.
- Zero and missing denominator behavior.
- Mixed-currency ROAS rejection.
- Explicit attribution-scope matching and mismatch behavior.

Final validation result: **12 test files, 74 tests passed**. Focused ESLint, TypeScript, development build, and `git diff --check` all passed. The SQL migration is additive and was reviewed as a migration artifact; the formatter does not support SQL parsing in this environment.

## Browser validation

The authenticated browser navigated to:

- `/webinar-analytics`
- `/content`
- `/traffic`
- `/attribution`

Each route resolved to the InsightOS shell and reported `Loading workspace…`. The browser screenshot and DOM artifact collector returned no interactive elements or screenshots, so click-level verification of acquisition filters, unavailable-state cards, content attribution, traffic, and attribution interactions could not honestly be claimed. No forms were submitted and no test records were inserted.

## Remaining external dependencies

No ad provider was activated. To begin receiving legitimate spend data, a later phase must connect one approved provider through the existing connector architecture and implement its authenticated ingestion into `acquisition_spend`. The provider must supply a non-production credential, external record IDs, spend date, currency, numeric delivery facts, and any explicit campaign/content/webinar relationships available from that source.

A provider-specific implementation must preserve the existing contract:

> **Provider → validation → normalization → `acquisition_spend` → explicit attribution → aggregation → filters → UI**

Meta Ads Manager, Google Ads, TikTok for Business, and payment connectors remain disabled. Historical spend and attribution were not backfilled.

## Production safety

Production was not touched. No external advertising provider was activated. No ad credentials were requested or used. No fake spend or synthetic acquisition records were inserted. The existing payment ledger and lifecycle systems were preserved. `main` was not merged or modified.

## Files changed for Priority 6

- `supabase/migrations/20260827210000_acquisition_spend_foundation.sql`
- `src/lib/acquisition.ts`
- `src/lib/acquisition.test.ts`
- `src/routes/_authenticated.webinar-analytics.tsx`
