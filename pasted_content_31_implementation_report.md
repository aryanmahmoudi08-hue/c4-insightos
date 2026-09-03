# InsightOS Priority 2 — Webinar Event Pipeline Report

## Scope and safety

Priority 2 from `pasted_content_31.txt` was applied to the existing `upgrade/localhost-8081-command-center` working tree. No production Supabase migration or production data write was performed, and `main` was not merged or modified.

The implementation intentionally does not reconstruct missing historical webinar activity. Existing metric snapshots remain available as a fallback where they are the only legitimate source; event-backed stages override snapshot counts only when persisted webinar events exist.

## Webinar Event Map

| Event | Source | Timestamp | Persisted in | Idempotency | Attribution |
|---|---|---|---|---|---|
| `registered` | Provider-neutral ingestion helper, when an authoritative registration source calls it | Provider/source `occurredAt` | `webinar_events` | Stable provider ID or deterministic event key | Webinar, lead, platform, source type, campaign, content, format |
| `confirmation` | Supported only when a confirmation source calls the ingestion helper | Provider event time | `webinar_events` | Same | Same nullable attribution fields |
| `notification` | Supported only when an SMS/API/call/email source calls the ingestion helper | Provider event time | `webinar_events` | Same | Same nullable attribution fields |
| `live` / `joined` / `attended` | Webinar provider attendance source | Provider event time | `webinar_events` | Same | Webinar and lead when supplied |
| `engagement` / `chat` / `question` / `poll` / `cta_click` | Webinar engagement provider source | Provider event time | `webinar_events` | Same | Webinar and lead when supplied |
| `pitch` | Authoritative pitch milestone source | Provider/event time | `webinar_events` | Same | Webinar and lead when supplied |
| `exited` | Provider exit event | Provider event time | `webinar_events` | Same | Webinar and lead when supplied |
| `replay_started` / `replay_completed` | Replay provider source | Provider event time | `webinar_events` | Same | Webinar and lead when supplied |
| `application` | Application source, if connected to call the helper | Application event time | `webinar_events` | Same | Explicit webinar/lead IDs only |
| `booked_call` | Existing Closer call source when a webinar-linked lead/call is present | `calls.scheduled_for` | `lead_response_events` via existing lifecycle foundation; webinar linkage remains on lead/call | Existing lifecycle idempotency key | Lead, webinar, content, rep, call |
| `show` | Existing Closer mutation, when `showed` is selected | New `calls.showed_at` | Existing lifecycle event table | Existing lifecycle idempotency key | Lead, webinar, content, rep, call |
| `offer` | Existing Closer mutation, when `offer_made` is selected | New `calls.offer_at` | Existing lifecycle event table | Existing lifecycle idempotency key | Lead, webinar, content, rep, call |
| `close` | Existing Closer close mutation | Mutation timestamp | Existing lifecycle event table | Existing lifecycle idempotency key | Lead, webinar, content, rep, call |
| `cash` | Existing call-level cash capture; payment ledger remains authoritative | Mutation timestamp unless a payment source supplies `collected_at` | Existing lifecycle event table; payment rows remain in `payments` | Existing lifecycle idempotency key | Lead, webinar, call, payment where IDs exist |
| `deposit` / `sale` / `refund` / `bump` / `upsell` | Supported in the canonical event vocabulary; no current internal writer was found | Source event time | `webinar_events` when a source calls ingestion | Stable provider ID or deterministic key | Nullable provider-neutral attribution |

## Data sources audited

The current repository owns `webinars`, `webinar_events`, and `webinar_metrics` through the additive analytics foundation migration. Webinar Analytics currently reads webinar records, manual/metric snapshots, and webinar events. Existing `leads` and `calls` support nullable webinar and content attribution. Existing `payments` contains `amount_cents` and `collected_at`; no separate payment ledger was introduced. Existing content data is represented by `content_pieces` and content metric tables. The current repository does not expose a confirmed authoritative application table/write path, registration provider webhook, attendance provider webhook, notification provider event stream, or payment webhook that could safely be wired without inventing infrastructure.

The `/webinar-analytics` route owns selection, date filtering, comparison UI, funnel presentation, retention chart rendering, and unavailable states. `/content` and `/content-signals` remain separate existing workspaces; this phase did not fabricate webinar-to-content paths without explicit IDs.

## Schema changes

Added migration:

`supabase/migrations/20260827200000_webinar_event_pipeline.sql`

The migration is additive and adds the following nullable fields to `webinar_events`:

| Field | Purpose |
|---|---|
| `provider_event_id` | Optional external/provider event identifier |
| `registration_source` | Registration source detail when supplied |
| `source_campaign` | Campaign attribution |
| `source_content_id` | Explicit content-piece linkage |
| `source_format` | Explicit format attribution |
| `event_key` | Deterministic internal idempotency key |

The event-type check constraint is expanded to the canonical provider-neutral vocabulary. New indexes support provider lookup, event ordering, and event-key idempotency. The `record_webinar_event(...)` function uses an advisory transaction lock and a unique event-key index so retries do not create duplicate webinar events. It returns `true` for an inserted event and `false` when the same event key already exists.

No destructive migration, historical backfill, synthetic event insertion, duplicate ledger, or production operation was performed.

## Server and aggregation logic

Added `src/lib/webinar-events.ts`, which contains the canonical event vocabulary, source model, deterministic key helper, RPC capture wrapper, milestone counts, event normalization, occurred-time ordering, and retention calculation.

Updated `src/lib/webinar-analytics.ts` so persisted event rows drive registration, live attendance, pitch, deposit, application, booked-call, show, offer, close, engagement, and replay counts whenever event rows exist. Missing events remain absent; no aggregate attendee total is converted into a fabricated timestamped event. Metric snapshots remain a fallback for legacy/manual metrics when no event rows exist.

Updated `src/routes/_authenticated.webinar-analytics.tsx` to request the expanded event fields and to render event-backed summaries even when a webinar has events but no manual metric snapshot. The selected webinar date range continues to filter event rows by `occurred_at` and metric snapshots by `captured_at`.

## UI changes

The existing Webinar Analytics design and functionality were preserved. The route continues to provide webinar selection, comparison controls, the executive KPI layer, funnel stage display, retention chart, closing/return panel, and unavailable states. The retention panel now uses actual persisted event timestamps and does not render a pitch point without a persisted pitch event.

## Deterministic tests

Added `src/lib/webinar-events.test.ts` covering:

- Stable provider-ID and fallback event keys.
- Registration, attendance, pitch, engagement, and replay milestone counts.
- Missing stages remaining zero rather than being inferred.
- Out-of-order insertion being sorted by `occurred_at`.
- Retention registration → attendance → pitch behavior.
- No fabricated pitch point when no pitch event exists.

Final test suite result: **8 test files, 57 tests passed**.

## Validation

| Check | Result |
|---|---:|
| Prettier | Passed |
| Focused ESLint | Passed with 0 errors and 0 warnings on edited webinar files |
| TypeScript `tsc --noEmit` | Passed |
| Development build | Passed |
| Full Vitest suite | Passed — 57/57 |
| `git diff --check` | Passed |
| Production data | Not touched |
| `main` branch | Not merged or modified |

## Browser validation

The authenticated browser navigated successfully to `/webinar-analytics` after the changes. However, the browser artifact collector failed to provide DOM elements or screenshots, and a follow-up browser view failed because the connected extension URL was inaccessible to the collector. Therefore, click-level verification of the selector, date range, comparison switching, retention chart, navigation, and `/content`/`/content-signals` continuity could not honestly be claimed. No test data or synthetic events were inserted to force a visual result.

## Remaining provider dependencies and historical limitations

The repository still needs a real provider or internal mutation source for webinar registration, confirmation, notification delivery/open/click events, attendance milestones, pitch events, engagement, replay milestones, application linkage, and authoritative payment/order events. Once such a source exists, it should call `recordWebinarEvent` with a stable provider event ID and explicit internal IDs where available.

The current repository cannot reconstruct historical registrations, attendance, retention, engagement, pitch, notification, application, or webinar-attributed financial events where the source event and identifiers were never persisted. Timing-only joins are intentionally not performed.

## Changed files for this phase

- `supabase/migrations/20260827200000_webinar_event_pipeline.sql`
- `src/lib/webinar-events.ts`
- `src/lib/webinar-events.test.ts`
- `src/lib/webinar-analytics.ts`
- `src/routes/_authenticated.webinar-analytics.tsx`

The existing prior InsightOS upgrade work remains in the working tree; no merge or reset was performed.
