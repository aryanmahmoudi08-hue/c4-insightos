# AscendOS — External Integration Contract

Research/design document. No code, no n8n workflows, no UI changes, no commit/push — the internal
correctness layer is done; this defines the external-data contract those remaining metrics need.

## Method

Source of truth for "which metrics are actually blocked": the original 834-metric audit
(`docs/ascendos-metric-dictionary-audit-detail.csv`, `StatusNorm` column) cross-checked against
the reconciliation report (`docs/ascendos-metric-dictionary-reconciliation.md`, written this
session) so nothing already fixed in remediation gets re-flagged as a gap. Two metric groups the
raw CSV still lists as `NEEDS INTEGRATION` — `SALE-0308–0313` (DM Source Mix) and `SALE-0394`
(Payment Plan Uptake) — were confirmed via the reconciliation report §1 to already be `LIVE` off
existing internal data; they are **not** included below. Table/column names below are all read
directly from `supabase/migrations/*.sql` (cited per group) — none are invented.

Per the prompt's own instruction, a provider is only given a build spec below if a metric gap
traces to it. Ten of the sixteen required groups have **no verified gap** and are stated as such.

Every genuine gap in the current dictionary reduces to two integration shapes:

- **Webinar Platform Event Feed** → `public.webinar_events`, via the already-built
  `public.record_webinar_event()` RPC (idempotent on `event_key`, advisory-locked;
  `supabase/migrations/20260827200000_webinar_event_pipeline.sql:40-84`). One event stream
  already covers registration through sale/refund — no second "sales feed" is needed.
- **Ad Platform Spend Feed** → `public.acquisition_spend`, idempotent on
  `(org_id, provider, external_record_id)` (`supabase/migrations/20260827210000_acquisition_spend_foundation.sql:34-35`).
  This table is provider-neutral (`provider` is a free-text column), so Meta/TikTok/YouTube/
  LinkedIn all use the *same* contract — they're listed separately below only to state priority
  and evidence per platform, not because the destination differs.

Both destination tables, and the RPC, already exist with RLS and grants in place. **Nothing in
this document requires a new migration** — the schema was built ahead of the integrations that
would fill it (see `20260827090000_analytics_expansion_foundation.sql` and
`20260827200000_webinar_event_pipeline.sql`). The gap is entirely "nothing writes to it yet."

A cross-cutting note before the groups: AscendOS's existing connector infrastructure
(`public.connector_registry` + `connectorRequirements` in `src/lib/connectors.functions.ts:14-81`)
only supports **webhook-secret or plain-URL auth** (Stripe/PayPal/Fanbasis/Wise/Whop/Typeform/
Zapier all fit this). It has **no OAuth flow implemented**. Any provider below that requires
OAuth (Meta, TikTok, YouTube, LinkedIn ad APIs) needs that capability built before an n8n workflow
or direct integration can use user-level API access — this is a real, named architectural gap,
not a detail to gloss over in step 6/7.

---

## 1. Meta / Instagram

**Verified gap:** Ad Platform Spend Feed (shared contract, see Method). Evidence: `MAIN-0019`
(Ad Cash Collected) is `PARTIALLY CONNECTED` — `traffic_sources.category` already contains
`'Meta Ads'` and `leads.traffic_source_id` exists, but no connector ever sets it
(`dashboard.tsx:576-625` renders an honest "Not tracked" empty state, not a fake number). Meta/
Instagram is also the majority contributor to the 54 blocked Webinar Analytics metrics'
acquisition-efficiency subgroup (`OPSW-0745–0754`, `OPSW-0783`, `OPSW-0797` — CTR/CPC/CPL/CPA/
ROAS), since `traffic_sources` already has `'Meta Ads'` as a live category and content pieces
already tag `platform` (used elsewhere, e.g. `COPY-0556`).

| Field | Value |
|---|---|
| Required source system | Meta Marketing API (Graph API, `ads_insights` edge) |
| Required endpoint/event | `GET /act_{ad_account_id}/insights` (daily, campaign-level) |
| Required fields | `spend`, `impressions`, `clicks`, `campaign_id`, `campaign_name`, `date_start` |
| Required identifiers | `ad_account_id`, `campaign_id` |
| Required timestamps | `date_start` (day-granularity spend date) |
| Required attribution fields | none at this layer — spend is campaign-level, not lead-level; lead-level Meta attribution would additionally need click-id (`fbclid`) passthrough into `leads.source_campaign`, a separate, harder integration not currently evidenced as needed by any audited metric |
| Required org mapping | `ad_account_id` → `org_id` (1 org may have 1+ ad accounts; needs a mapping table or org-level config, not currently modeled) |
| Expected sync frequency | Daily (Meta's own insights API is not real-time; hourly polling gains nothing) |
| Historical backfill requirement | Yes — Meta Insights API supports historical date ranges; one-time backfill to the org's earliest tracked webinar/campaign |
| Webhook or polling | Polling — Meta does not push spend data via webhook |
| n8n appropriate | Yes — scheduled daily pull, transform, upsert is exactly n8n's use case |
| Direct API ingestion preferable | No — polling + OAuth token refresh is better owned by n8n than a bespoke Worker cron |
| Apify appropriate | No — this is a documented, authenticated API, not a scrape target |
| Requires OAuth/user authorization | **Yes** — Meta Marketing API requires an authorized System User or long-lived user token per ad account. AscendOS's connector registry does not support OAuth today (see cross-cutting note) |
| Public/private data | Private (requires ad-account-level authorization) |
| Exact destination Supabase table | `public.acquisition_spend` (`provider='meta'`) |
| Idempotency key | `(org_id, provider, external_record_id)` — `external_record_id` = Meta's `campaign_id`+`date_start` composite |
| Upsert strategy | `ON CONFLICT (org_id, provider, external_record_id) DO UPDATE` (spend/impressions/clicks can restate for a few days after Meta finalizes attribution windows) |
| Failure/retry strategy | n8n native retry (exponential backoff) on 4xx/5xx from Graph API; alert on 3 consecutive daily-pull failures |
| Data freshness requirement | T+1 day is acceptable — no metric on Webinar Analytics or Main Hub claims same-day ad spend today |

## 2. TikTok

**Verified gap:** same Ad Platform Spend Feed contract as Meta — but **lower confidence this is
currently in use**. No audited metric or code path references TikTok ad spend specifically;
the only TikTok reference in the whole dictionary is `COPY-0556` (Reach by channel, a manual/AI
positioning field, already `LIVE`). If the business runs paid TikTok campaigns, the contract is
identical in shape to Meta/Instagram above (source: TikTok Marketing API `reports/integrated/get`,
same `acquisition_spend` destination, `provider='tiktok'`). If not, **there is no verified metric
gap here today** — do not build this integration speculatively; confirm real ad spend exists
before scoping it.

## 3. YouTube

**Verified gap:** none found that isn't already covered by manual entry. YouTube is referenced
three times in the dictionary (`CONT-0549`, `COPY-0556`, `FULF-0598`) — all `LIVE`, all
manually-entered/AI-derived fields (content sequencing templates, positioning snapshot, onboarding
intake), not automated pulls. If the business runs paid YouTube/Google ads, the same Ad Platform
Spend Feed shape applies (`provider='google'` or `'youtube'`, source: Google Ads API) — matching
the `'Google'` category already present in `traffic_sources.category` per `MAIN-0019`'s real
source query. **No organic-content metrics gap exists** — do not build a YouTube Data API
integration for view/subscriber counts; no audited metric asks for one.

## 4. LinkedIn

**Verified gap:** none found. Zero references to LinkedIn anywhere in the 834-metric audit detail
CSV. If paid LinkedIn campaigns exist, same shared Ad Platform Spend Feed shape applies
(`provider='linkedin'`, source: LinkedIn Marketing API). Otherwise this group has no verified
metric gap — do not build it speculatively.

## 5. Webinar platform

**Verified gap — the largest in the dictionary.** 54 metrics on Ops → Webinar Analytics
(`OPSW-0738` through `OPSW-0797`, excluding the ad-spend subset already covered in group 1) are
`NEEDS INTEGRATION`. Root cause, confirmed by grep: zero write paths into `public.webinars`,
`public.webinar_events`, or `public.webinar_metrics` exist anywhere in the current app — the
schema, RLS policies, and an idempotent write RPC were all built ahead of any integration
(`supabase/migrations/20260827090000_analytics_expansion_foundation.sql:29-126`,
`20260827200000_webinar_event_pipeline.sql`).

| Field | Value |
|---|---|
| Required source system | The org's webinar platform (WebinarJam, EverWebinar, Zoom Webinar, StealthSeminar, etc. — provider-agnostic; the schema doesn't assume one) |
| Required endpoint/event | Platform's registration/attendance/engagement webhook or export, plus a sales-event source (checkout page or Stripe/processor metadata tagging `source_webinar_id`) |
| Required fields | `event_type` (must map to the already-defined enum: `registered, confirmation, notification, live, joined, attended, engagement, chat, question, poll, cta_click, pitch, exited, replay_started, replay_completed, application, booked_call, show, offer, deposit, close, cash, sale, refund, bump, upsell`), `occurred_at`, `source_platform`, `source_type` (paid/organic/direct), `metadata` (jsonb passthrough for provider-specific fields) |
| Required identifiers | `webinar_id` (FK to `public.webinars` — **a webinar row must exist before events can attach**; creating that row is an internal "create webinar" UI action, out of scope for this integration prompt, but is a hard prerequisite worth flagging now), `lead_id` (optional, for lead-matched events), `provider_event_id` (the platform's own event id, for dedup) |
| Required timestamps | `occurred_at` (event-level, required); `registered`/`live`/`replay` events need real per-event timestamps, not just a daily aggregate, for the Audience Retention (`OPSW-0772–0775`) and During/After-Pitch (`OPSW-0785–0788`) metric groups specifically — a platform that only exposes daily aggregates cannot serve those, only the `webinar_metrics` fallback (see below) |
| Required attribution fields | `source_platform`, `registration_source`, `source_campaign`, `source_content_id`, `source_format` — all already columns on `webinar_events` (`20260827200000_webinar_event_pipeline.sql:4-10`), populated from registration-page UTM/tracking parameters, not invented |
| Required org mapping | Platform account/subaccount → `org_id` — 1:1 assumed per org's webinar platform account |
| Expected sync frequency | Real-time or near-real-time (webhook) preferred; the Audience Retention and During/After-Pitch metric groups specifically need per-event granularity to be meaningful, not end-of-day rollups |
| Historical backfill requirement | Platform-dependent — most webinar platforms only expose historical exports, not a full event-replay API; backfill should be treated as best-effort CSV import, not a guaranteed API capability |
| Webhook or polling | **Webhook strongly preferred** if the platform offers one (WebinarJam and EverWebinar both do) — polling a webinar platform for per-attendee engagement events is impractical |
| n8n appropriate | Yes, for the transform+upsert step after the webhook lands — the platform's webhook still needs a receiving endpoint (see next field) |
| Direct API ingestion preferable | **Yes, for the receiving endpoint specifically** — a dedicated route under `src/routes/api/public/`, matching the existing pattern (`stripe.ts`, `whop.ts`, etc.), should receive the platform's webhook directly and call `record_webinar_event()` — n8n can sit downstream for any secondary fan-out, but the primary ingest path should be a first-party route like every other live processor integration today, not routed through n8n as a single point of failure for the largest remaining gap |
| Apify appropriate | No — this is webhook/API data, not a scrape target |
| Requires OAuth/user authorization | Platform-dependent; most webinar platforms use a webhook signing secret (same shape as the existing Stripe/Whop/Fanbasis connectors), not OAuth — confirm per chosen platform before assuming a connector-registry gap |
| Public/private data | Private (org-specific webinar/attendee data) |
| Exact destination Supabase table | `public.webinar_events`, via `public.record_webinar_event()` (`org_id, webinar_id, event_type, occurred_at, event_key, ...` — the RPC signature already matches every field above) |
| Idempotency key | `event_key` (already enforced: `UNIQUE (org_id, webinar_id, event_key) WHERE event_key IS NOT NULL`, plus a parallel `provider_event_id` unique index) — the RPC already advisory-locks on this key, so idempotent replay is a solved problem, not new design work |
| Upsert strategy | `record_webinar_event()`'s existing `ON CONFLICT ... DO NOTHING` — events are immutable facts, never updated in place; a correction is a new event, not an overwrite |
| Failure/retry strategy | Standard webhook retry: 2xx ack fast, queue failures, replay from the platform's own webhook retry log where available; `record_webinar_event()`'s idempotency makes replay safe |
| Data freshness requirement | Real-time for the ingest route itself; `Compare webinars table` (`OPSW-0789–0797`) and `Executive KPIs` (`OPSW-0738–0746`) are read live off these events, so freshness is bounded only by ingest latency, not a batch schedule |

**Fallback path for aggregate-only providers**: `public.webinar_metrics` already exists as a
day-level rollup table (`lead_capture_investment_cents, clicks, visits_paid/organic,
paid/organic/group_leads, registered, live_attendees, pitch_attendees, deposits, sales,
core_revenue_cents, refunds_cents, order_bump_*, upsell_*`) with a `source` column defaulting to
`'manual'`. If the chosen webinar platform genuinely cannot expose per-event granularity, writing
into `webinar_metrics` (`source='api'` or `'csv'`) unlocks the Executive KPI and Closing & Return
metric groups even without the event-level ones — a real, already-modeled degraded path, not a
gap to invent.

## 6. Wistia

**Verified gap:** `FULF-0726` (VSL total plays) and `FULF-0735` (VSL full funnel) are
`PARTIALLY CONNECTED` — both explicitly self-disclosed in the UI as "never a live API sync"
(`vsl.tsx:718-719`); every `vsl_metric_snapshots` row today is manual entry or CSV import
(`vsl.functions.ts:215-...`). This is a real, low-urgency automation opportunity, not a broken
metric — the honest-CSV-import path already works correctly.

| Field | Value |
|---|---|
| Required source system | Wistia Stats API |
| Required endpoint/event | `GET /v1/stats/medias/{media_id}.json` (per-video engagement stats) |
| Required fields | `play_count`, `load_count`, `hours_watched`, `engagement` (heatmap array) → maps to `total_plays`, `page_loads`, `avg_percent_watched` |
| Required identifiers | `wistia_video_id` (already a column on `public.vsls`, `20260704064935...sql:13`) |
| Required timestamps | Snapshot time (`captured_at`, already a column) |
| Required attribution fields | None — this is video-engagement data, not lead-attribution data |
| Required org mapping | Wistia account → `org_id` (1:1 assumed) |
| Expected sync frequency | Daily is sufficient — VSL Analytics is a trend view, not a real-time operational dashboard |
| Historical backfill requirement | No — Wistia's own stats reset/accumulate per video; a fresh daily snapshot going forward is enough, no need to reconstruct history |
| Webhook or polling | Polling — Wistia has no engagement-change webhook |
| n8n appropriate | Yes — this is a textbook daily-poll-and-upsert job |
| Direct API ingestion preferable | No — no low-latency requirement that would justify bypassing n8n |
| Apify appropriate | No — documented API exists |
| Requires OAuth/user authorization | No — Wistia Stats API uses a simple API token, not OAuth |
| Public/private data | Private (account-scoped API token) |
| Exact destination Supabase table | `public.vsl_metric_snapshots` (`source='api'` instead of the current `'manual'`/`'csv'`) |
| Idempotency key | None currently enforced on this table (no unique index beyond the PK) — an integration should add `(vsl_id, captured_at::date)` as a practical dedup key at the write layer, even without a DB constraint, to avoid duplicate daily snapshots |
| Upsert strategy | Insert one snapshot per video per day; do not overwrite manual/CSV-imported snapshots — they represent point-in-time facts a user recorded deliberately |
| Failure/retry strategy | n8n native retry; a single failed daily pull is low-stakes (VSL Analytics tolerates a stale day) |
| Data freshness requirement | Daily — no metric here demands same-day freshness |

## 7. Stripe

**No verified gap.** Already live: `src/routes/api/public/stripe.ts` (webhook receiver) +
`connector_registry`/`connectorRequirements` `stripe` entry (`connectors.functions.ts:38-44`,
webhook-secret auth). The one real remaining issue involving Stripe-sourced payments
(`payments.call_id` never populated, blocking `SALE-0395–0400`/`CONT-0451`) is an **internal
schema/join gap**, already fully specified in the Phase 4 reconciliation report §4 — not an
external-data gap, and out of scope for this document.

## 8. PayPal

**No verified gap.** Already live: `paypal.ts` + registry entry (`connectors.functions.ts:71-80`,
webhook ID + REST client id/secret). Same internal `call_id` caveat as Stripe applies, not an
external gap.

## 9. Fanbasis

**No verified gap.** Already live: `fanbasis.ts` + registry entry (webhook-secret auth). Same
internal `call_id` caveat applies, not an external gap.

## 10. Wise

**No verified gap.** Already live: `wise.ts` + registry entry (PEM public-key webhook
verification). Same internal `call_id` caveat applies, not an external gap.

## 11. Whop

**No verified gap.** Already live: `whop.ts` + registry entry (`ws_`-prefixed webhook secret).
Same internal `call_id` caveat applies, not an external gap.

## 12. Calendly

**No verified gap.** `SALE-0191` (Team Calendars → Rescheduled) is `LIVE` off real data — booking/
reschedule events already flow into the app. No audited metric names Calendly as a blocker.

## 13. Typeform

**No verified gap.** Already live: `typeform.ts` webhook receiver + registry entry
(`connectors.functions.ts:15-22`, form URL + webhook secret). `MAIN-0029`, `SALE-0098`,
`SALE-0115`, `SALE-0221`, `COPY-0578` are all `LIVE` off real Typeform-sourced fields.

## 14. Fathom / call transcripts

**No verified gap — and no evidence this integration is expected at all.** Zero references to
Fathom (or any call-transcription/recording provider) anywhere in the 834-metric audit. Call
narrative capture that does exist (`call_summary`, `key_moment` fields, accepted by the generic
`src/routes/api/public/ingest.$token.ts` event-ingest endpoint and the Closer manual-entry form)
is free-text human input, not an automated transcription pipeline, and no metric in the dictionary
claims otherwise. Do not build a Fathom integration speculatively — nothing in the current product
surface expects one.

## 15. Close / CRM

**No verified gap.** Every "Close" match in the audit CSV is the word "close"/"close rate"
(sales-close metrics), not the Close CRM product — grep-confirmed zero references. AscendOS *is*
the CRM of record for this business; there is no external CRM to sync against.

## 16. Other

**Connector-registry OAuth gap (cross-cutting, not provider-specific).** Called out in Method
above: `connector_registry`'s only supported auth shapes today are webhook-secret and plain URL.
Every provider in groups 1–4 that would need real API access (Meta, TikTok, YouTube, LinkedIn ad
platforms) requires OAuth, which the registry cannot currently express. This is real, scoped
infrastructure work for whichever of groups 1–4 gets picked up first — not a new provider, but a
prerequisite capability.

---

## Integration Priority

**P0 — Webinar Platform Event Feed** (group 5). Unlocks the largest single block in the entire
834-metric dictionary — 54 metrics across 6 metric groups on one page (Executive KPIs, Traffic
Analytics, Key Metrics, Audience Retention, Closing & Return, During/After-Pitch, Compare
Webinars). Zero new schema required — table, RLS, and an idempotent write RPC already exist and
are unused. Lowest implementation complexity relative to metrics unlocked of anything in this
document: the hard design work (event taxonomy, idempotency, attribution columns) is already
done in migration; what's missing is purely "connect a provider's webhook to the existing RPC."
Business importance: this is explicitly the business's core acquisition channel (an entire nav
page is dedicated to it) sitting at zero real data today.

**P1 — Ad Platform Spend Feed, Meta/Instagram first** (group 1, shared shape with groups 2–4).
Unlocks the acquisition-efficiency subset of the same 54 Webinar Analytics metrics
(`OPSW-0745–0754`, `0783`, `0797` — CTR/CPC/CPL/CPA/ROAS, currently blocked regardless of P0's
progress since they need spend data specifically) plus `MAIN-0019` on Main Hub. Higher complexity
than P0 because it's the one gap in this whole document that genuinely needs OAuth
(group 16's cross-cutting gap), which has to be built once, not per-provider. TikTok/YouTube/
LinkedIn ride the same contract at P2-or-lower priority until the business confirms real paid
spend exists on those platforms — building them speculatively would violate this prompt's own
instruction not to recommend a connector merely because it exists.

**P2 — Wistia auto-sync** (group 6). Only 2 metrics, both already served honestly today via
manual/CSV entry (correctly labeled, not broken). Real automation value, but small blast radius
and no urgency — appropriate to pick up after P0/P1 land, using the now-battle-tested n8n
daily-poll-and-upsert pattern from Wistia's own contract above.

**Not prioritized — no build recommended**: TikTok/YouTube/LinkedIn ad spend (groups 2–4, pending
confirmation real spend exists), Fathom (group 14, no evidenced product expectation), Close/CRM
(group 15, not applicable — AscendOS is the CRM). Stripe/PayPal/Fanbasis/Wise/Whop/Calendly/
Typeform (groups 7–13) need no external-integration work; their one remaining issue
(`payments.call_id`) is internal and already tracked in the Phase 4 reconciliation report.

No code changes. No n8n workflows. No commit/push.
