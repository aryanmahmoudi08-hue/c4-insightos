# AscendOS — Supabase Canonical Data Contract

Research/design document (Prompt 6). Defines the ingestion / idempotency / RLS contract for the
two integration shapes identified in `docs/ascendos-external-integration-contract.md` (Prompt 5):
the **Webinar Platform Event Feed** and the **Ad Platform Spend Feed**, plus Wistia. No code, no
migrations applied, no commit/push.

## Method

Before designing anything new, the existing integration platform was read end-to-end: every
table it's built from, the one real webhook route that implements the full pattern
(`src/routes/api/public/stripe.ts`), and the outbound side (`src/lib/dispatch.server.ts`). The
finding: **AscendOS already has a complete, working ingestion architecture** — six real tables
and one real end-to-end example — sitting mostly unused by anything except payments/Typeform.
This document is not a new design; it's the existing pattern applied precisely to the two feeds
Prompt 5 specified, plus three real gaps found along the way that block it from working for them
today.

---

## 0. The existing platform, as it actually stands (verified against `supabase/migrations/`)

| Table | Real columns | Current real usage |
|---|---|---|
| `public.connector_registry` | `id text PK, name, category, description, auth_method, supports_events, icon, is_available` | Catalog of known providers. Public-read (`"anyone read connector_registry" using (true)`). 15 rows exist (payments ×5, `typeform`, `zapier`, `discord`, `slack`, `gohighlevel`, `calendly`, and — important for this contract — `instagram`, `tiktok`, `youtube`, `meta_ads`, all seeded `is_available=true`). |
| `public.connector_connections` | `id, org_id, connector_id FK, display_name, external_account_id, config jsonb, state enum('not_connected','connected','syncing','error','disabled'), created_by, created_at, updated_at` | The org-scoped instance of a connector. `config` holds provider secrets (webhook secret, API key, etc.) — written by `connectWorkspaceConnector()` (`connectors.functions.ts:202+`) after Zod-validating against a per-connector schema. |
| `public.connector_sync_status` | `id, connection_id FK, org_id, resource, last_sync_at, next_sync_at, cursor, state enum, last_error, records_synced, updated_at` | Poll/health state per `(connection_id, resource)`. Real, wired: `upsertDefaultSync()` (`connectors.functions.ts:163-200`) writes a `resource='default'` row on every connect/disconnect today — the shape is real, just not yet used for actual per-resource sync cursors. |
| `public.ingestion_jobs` | `id, org_id, connection_id FK, job_type, status, scheduled_for, attempt, max_attempts, next_retry_at, last_error, payload jsonb, created_at, updated_at` | **Verified zero writers anywhere in `src/`.** A real, RLS-protected job-queue table — built ahead of anything that uses it, same pattern as `acquisition_spend` before this remediation. This is the correct home for backfill/retry state (§2, §3) instead of inventing a new mechanism. |
| `public.raw_payloads` | `id, org_id, connector_id, connection_id FK, resource, external_id, payload jsonb, received_at, processed_at, process_error` | The universal audit trail. `stripe.ts:77-85` inserts here **unconditionally, before any business-table write, for every event type including ones it doesn't act on** — this is the pattern every new route should copy exactly. |
| `public.events` + `dispatchEvent()` | `events(org_id, event_type, actor_user_id, subject_type, subject_id, payload, occurred_at)`; `webhook_subscriptions`/`webhook_deliveries` for outbound fan-out | Internal domain-event log, already real (`stripe.ts:157-168`), plus a working outbound dispatcher (`dispatch.server.ts`) that fans an event back out to the org's own Slack/Discord/n8n subscriptions. This means once a new feed writes an `events` row, org-level outbound automation is free — no new work. |

**RLS, already correct, no new design needed**: `connector_connections`, `connector_sync_status`,
`raw_payloads`, and `ingestion_jobs` all get identical org-scoped policies from one generator loop
(`20260518151934...sql:200-209`: `is_org_member(auth.uid(), org_id)` for select/insert/update/
delete). `connector_registry` is public-read by design (it's a catalog, not org data). Every real
webhook route (`stripe.ts`, and by extension the new ones below) writes via `supabaseAdmin`
(service role, bypasses RLS entirely) because the caller is an unauthenticated third-party server,
not a logged-in app user — org identity comes from resolving a `connection_id` against
`connector_connections`, never from a session or from a value the payload itself claims. This
is the one correct pattern and this document doesn't deviate from it.

**Real gap found, not part of Prompt 5's scope but directly relevant here**: `instagram`,
`tiktok`, `youtube`, and `meta_ads` already have `connector_registry` rows with
`is_available=true`, but `connectorRequirements` (`connectors.functions.ts:14-81` — the Zod
schema map `validateConnectorConfig()` checks against) has **no entry for any of them**. Today,
a user who clicks "Connect" on any of these four in the UI hits `validateConnectorConfig()`'s
fallback: `"This connector needs real provider credentials before it can be connected."` — a
dead end, not a working flow. This is the concrete, UI-visible symptom of the OAuth gap flagged
in Prompt 5's cross-cutting note. Flagged here, not fixed — fixing it means either building real
OAuth support (real engineering work, belongs in Prompt 7) or setting `is_available=false` on
these four rows until it exists (a one-line data change, but still a change, so left for you to
decide rather than silently applied).

---

## 1. Contract: Webinar Platform Event Feed

**New `connector_registry` row needed** (none exists yet): `id='webinar_platform'` (or a
provider-specific id — e.g. `'webinarjam'` — if a specific platform is chosen before Prompt 7;
either is a one-row insert following the exact pattern already used for `whop`/`fanbasis`/`wise`/
`paypal` in `20260920210000_payment_processor_connector_rows.sql`).

**`connector_connections.config` shape**: `{ webhookSecret: string }` if the chosen platform
signs its webhooks (WebinarJam and EverWebinar both do) — same shape as the existing `stripe`/
`whop`/`fanbasis` entries in `connectorRequirements`, not a new pattern.

**Ingest route** (new file, `src/routes/api/public/webinar-events.ts` — not created by this
prompt): identical shape to `stripe.ts`:
1. Read `connection_id` from the query string; look up `connector_connections` (`org_id, config`)
   filtered `connector_id='webinar_platform'`, `state='connected'`. 404 if not found — this is how
   org identity is resolved, never trust an org field in the payload itself.
2. Verify the platform's webhook signature against `config.webhookSecret` using plain `crypto`
   (matching the `verifyStripeSignature()` pattern — no new SDK dependency, consistent with this
   app's existing convention for every webhook it already verifies).
3. Insert into `raw_payloads` unconditionally (`connector_id='webinar_platform', resource=<event
   type>, external_id=<platform's own event id>, payload=<raw body>`) — before any processing,
   matching `stripe.ts:77-85` exactly.
4. Call `public.record_webinar_event()` (already built, `20260827200000_webinar_event_pipeline.sql:40-84`)
   with the mapped fields from Prompt 5's spec. The RPC's own `ON CONFLICT (org_id, webinar_id,
   event_key) DO NOTHING` plus advisory lock is the idempotency boundary — **no new dedup check
   is needed in the route itself**, unlike `stripe.ts`'s manual `payments` existence check,
   because this RPC already solves it at the DB layer.
5. On `RETURN true` (row actually inserted, not a duplicate), insert an `events` row
   (`event_type='webinar.event_recorded'`, `subject_type='webinar_events'`) and call
   `dispatchEvent()` — same closing steps as `stripe.ts:157-178`.
6. Return `{ ok: true, recorded: <boolean from the RPC> }`.

**Backfill**: if the chosen platform exposes a historical export, model it as an `ingestion_jobs`
row (`job_type='webinar_backfill'`, `connection_id`, `payload={date_range}`) — this is precisely
what that currently-unused table is shaped for: `attempt`/`max_attempts`/`next_retry_at` give a
real retry contract instead of a one-shot script, and `status` gives a resumable job state a
long-running historical pull actually needs. This is a genuine use for a table that has had zero
writers until now.

**Idempotency key** (restated from Prompt 5, now placed in the full route contract):
`webinar_events.event_key`, already `UNIQUE (org_id, webinar_id, event_key) WHERE event_key IS
NOT NULL`, enforced inside `record_webinar_event()` — no change needed.

## 2. Contract: Ad Platform Spend Feed (Meta first; same shape for TikTok/YouTube/LinkedIn if confirmed needed)

**`connector_registry` rows**: `meta_ads`, `tiktok`, `youtube` already exist (seeded, currently
`is_available=true` but non-functional per the gap above); `linkedin` does not exist and would
need a new row, same insert pattern.

**This is a polling feed, not a webhook** (per Prompt 5) — the contract differs from §1:

1. **Scheduling**: an `ingestion_jobs` row per org per day (`job_type='ad_spend_poll'`,
   `connection_id`, `scheduled_for=<next day boundary>`) — n8n's own cron trigger can enqueue
   this row and then poll `ingestion_jobs.status` back, OR simply run the whole poll-transform-
   upsert cycle itself and write the resulting state directly to `connector_sync_status` (§ below)
   without an intermediate job row. Recommend the **simpler direct path** for the initial build —
   use `ingestion_jobs` once (or if) retry/backoff behavior needs to survive across separate n8n
   runs, not before it's needed.
2. **Cursor/health state**: `connector_sync_status` row per `(connection_id, resource='daily_spend')`
   — `cursor` holds the last successfully-pulled `spend_date`, `last_sync_at`/`records_synced`
   updated after each run, `state`/`last_error` set to `'error'`/the message on failure. This
   reuses the exact table/shape `upsertDefaultSync()` already writes for connection health, just
   scoped to a real per-resource sync (`resource='daily_spend'` instead of `'default'`) — the
   table was already built to carry more than one resource per connection; today's code just
   never uses that dimension.
3. **Audit**: insert into `raw_payloads` per API response batch (`resource='ad_insights'`,
   `external_id=<campaign_id>:<date_start>`, `payload=<raw API response>`) before transforming —
   same unconditional-audit-trail rule as §1.
4. **Idempotency**: `public.acquisition_spend`'s existing unique index,
   `(org_id, provider, external_record_id)` (`20260827210000_acquisition_spend_foundation.sql:34-35`)
   — `external_record_id` = the provider's `campaign_id`+`date_start` composite (per Prompt 5).
   `ON CONFLICT ... DO UPDATE` (spend figures can restate within a provider's attribution window).
5. **OAuth blocker (restated, now scoped precisely)**: `connector_connections.config` is the
   correct place to store `{ access_token, refresh_token, expires_at, ad_account_id }` once a
   real OAuth flow exists — but today nothing in `connectors.functions.ts` refreshes a token or
   handles an OAuth callback. This feed cannot go live for Meta/TikTok/YouTube/LinkedIn until
   that capability is built — a prerequisite, not a detail this feed's own contract can route
   around.

## 3. Contract: Wistia (P2, lower detail — matches Prompt 5's priority)

Same polling shape as §2, scoped down: `connector_registry` needs a new `wistia` row;
`connector_connections.config = { apiToken }` (Wistia Stats API uses a plain token, no OAuth —
this one is NOT blocked by the OAuth gap); `connector_sync_status` `resource='vsl_stats'`;
`raw_payloads` audit per video-stats pull; destination `public.vsl_metric_snapshots`.

**One real schema gap found here, not present for the other two feeds**: `vsl_metric_snapshots`
has **no unique index at all** beyond its primary key — nothing stops a daily poll from writing
duplicate same-day snapshots per video if a job runs twice. Two honest options, neither applied
by this document: (a) a small follow-up migration adding a partial unique index on
`(vsl_id, (captured_at::date))` — the cleanest fix, or (b) a write-layer check-before-insert
("does a snapshot for this `vsl_id` already exist today?") mirroring the pattern `stripe.ts` uses
for `payments` before its own insert — no schema change needed, slightly weaker (a race between
check and insert is possible, though low-stakes for a daily-cadence job). Recommend (a) when
Prompt 7 implements this feed; noting the choice here rather than deciding it silently.

---

## 4. The cross-cutting idempotency/ingestion contract (applies to all three feeds above, and to any future one)

Every inbound integration in AscendOS — verified as the pattern `stripe.ts` already follows, now
stated as an explicit, reusable rule rather than something only observable by reading one file:

1. **Resolve org via `connection_id`** (query param or path segment) → `connector_connections`
   lookup. Never trust an org identifier inside the payload itself — a third party's payload is
   untrusted input.
2. **Verify the signature** (HMAC/RSA/token, per provider) before parsing the body as data.
3. **Insert into `raw_payloads` unconditionally** — every received event, including ones later
   skipped or deduplicated. This is the audit trail that makes replay/debugging possible; it is
   not optional and not conditioned on successful processing.
4. **Deduplicate** — prefer a DB-level unique index + `ON CONFLICT` (as `record_webinar_event()`
   and `acquisition_spend` already do) over an application-level "does it exist" check where
   possible; both are acceptable, but the DB-level version is race-safe and this app already has
   working examples of both.
5. **Write the canonical business table.**
6. **Insert an `events` row** — the internal audit/notification log every other real integration
   already populates.
7. **Call `dispatchEvent()`** — free once step 6 is done; it's how an org's own Slack/Discord/n8n
   subscriptions hear about new data without this feed needing to know they exist.
8. **On failure**: a webhook route returns non-2xx so the provider's own retry logic fires
   (matching how every processor webhook here already behaves); a polling job writes
   `state='error'`/`last_error` to `connector_sync_status` (and, if using `ingestion_jobs`,
   increments `attempt` and sets `next_retry_at`) — never fail silently, never drop the run
   without a visible trace.

---

## 5. RLS design

No new policies are required. `connector_connections`, `connector_sync_status`, `raw_payloads`,
and `ingestion_jobs` already carry correct org-scoped RLS from the existing generator loop
(§0) — any new row these three feeds write inherits it automatically, since none of them need a
new table. `connector_registry`'s public-read policy is correct as-is for a provider catalog. The
one deliberate, already-established exception is that the ingest routes themselves write via
`supabaseAdmin` (service role), which is correct and necessary — an unauthenticated webhook
caller has no `auth.uid()` for RLS to evaluate against, and this repo's own convention
(`client.server.ts`'s `supabaseAdmin`, used only inside `.server.ts`/route-handler files per
`CLAUDE.md`) already exists precisely for this case.

## 6. Explicitly out of scope here (deferred to Prompt 7)

- Actual route files, RPC calls, or n8n workflow definitions.
- Building real OAuth support in `connectors.functions.ts` (blocks §2 for the ad-spend providers;
  does not block §1 or §3).
- New `connectorRequirements` Zod schemas for `webinar_platform`/`wistia`/`linkedin`.
- Deciding what to do about the four dead-end `is_available=true` registry rows (§0) — flagged,
  not resolved.
- The `vsl_metric_snapshots` unique-index decision (§3) — flagged, not applied.

No code changes. No migrations applied. No commit/push.
