# InsightOS Priority 4 — CRM/Dialer Operational Event Integration

## A. Provider identified

The repository contains an existing **Twilio webhook route** at `src/routes/api/public/twilio.$event.ts`. The current session connector snapshot shows the built-in Close connector is disabled, and no authenticated Close CRM connection is available. Twilio is therefore the only concrete provider source found in the current application, but it is not confirmed as fully configured in this session because the required server-side Twilio secret/base URL and connected communication account are environment/application configuration requirements.

InsightOS already owns an internal CRM communication model for Twilio callbacks: `crm_external_events`, `crm_communication_accounts`, `crm_contacts`, `crm_communication_threads`, `crm_communication_messages`, `crm_call_sessions`, `crm_call_recordings`, and `crm_activities`. The existing route validates Twilio signatures, records external event IDs, resolves legacy leads by phone, and prevents duplicate provider callbacks in its CRM tables.

Close CRM, other dialers, payment providers, and a separate CRM assignment source were not found as enabled or authoritative in the current connected configuration. No provider was guessed or enabled.

## B. Event mapping

| Provider event | InsightOS event | Source timestamp | Lead/contact | Rep | Attribution |
|---|---|---|---|---|---|
| Twilio voice `initiated` | `first_attempt` | Validated Twilio `Timestamp` | Legacy lead resolved by `From` phone when present | Not supplied by current callback | Not supplied by current callback; remains null |
| Twilio voice `answered` | `first_connection` | Validated Twilio `Timestamp` | Legacy lead resolved by `From` phone when present | Not supplied by current callback | Not supplied by current callback; remains null |
| Twilio voice `ringing`, `completed`, `busy`, `failed`, `no_answer`, `canceled` | No lifecycle event inferred | Provider callback state is stored in CRM call-session/activity data | Contact/legacy lead may be resolved | Not supplied | Not inferred |
| Twilio SMS inbound | Existing CRM message/activity flow only | Existing received-time behavior | Contact/legacy lead may be resolved | Not supplied | Not inferred as a first attempt |
| Twilio recording callback | Existing CRM recording/activity flow only | Provider recording status/time fields | Contact/legacy lead may be resolved through call session | Not supplied | Not inferred |
| Internal Closer mutation | Existing `booked_call`, `showed`, `offer`, `close`, and supported cash lifecycle events | `scheduled_for`, `showed_at`, `offer_at`, mutation time | Internal lead ID | Internal setter/closer IDs where available | Existing nullable fields, including webinar/content/campaign |

## C. Ingestion architecture

The implemented Twilio voice path is:

> **Twilio callback → route validation → external-event idempotency check → provider normalization → existing `captureLifecycleEvent` helper → `record_lead_lifecycle_event` → `lead_response_events` → existing Speed to Lead and rep analytics**

Twilio signature validation remains server-side and uses the existing `TWILIO_AUTH_TOKEN` and `TWILIO_WEBHOOK_BASE_URL` environment configuration. The provider event timestamp is normalized and used as `eventAt`; the request receipt time is never used as the lifecycle event time. A missing lead ID or invalid/missing provider timestamp produces no lifecycle event rather than a fabricated one.

## D. Events now live

The following provider-confirmed events are now automatically produced when a valid, configured Twilio callback resolves to an existing legacy lead:

- `first_attempt` from Twilio voice `initiated`.
- `first_connection` from Twilio voice `answered`.

The following internal application events remain active from the previous phase:

- `booked_call` from the Closer call insertion path.
- `showed` with the exact new `calls.showed_at` timestamp.
- `offer` with the exact new `calls.offer_at` timestamp.
- `close` from supported Closer close mutations.
- Call-level cash lifecycle capture where the existing close path supplies a cash amount; the payment ledger remains authoritative.

All lifecycle writes use the existing idempotent lifecycle database function and event-log structure. Twilio callbacks also use the existing `crm_external_events` provider-event deduplication layer.

## E. Events still blocked

`lead_assigned` remains blocked because no authoritative assignment-change mutation or provider assignment webhook was found. The presence of `assigned_setter_id` is intentionally not treated as an assignment event.

`qualified_conversation` remains blocked because the current Twilio callback route exposes call status, not a qualification disposition. `set` remains blocked because aggregate setter activity and booked-call rows do not explicitly identify a setter appointment action; booked call is not inferred as set.

Authoritative `cash_collected` remains partially blocked for provider-grade payment linkage. Existing payment rows are available through the `payments` table, but no confirmed payment-created/payment-collected webhook or internal payment creation mutation was found in the repository. The existing call-level cash path is preserved and is not treated as a replacement payment ledger.

Rep identity and full platform/content/campaign/webinar propagation remain limited on the Twilio callback path because the callback currently resolves only phone-based contact/legacy-lead context. Existing lifecycle paths preserve attribution fields when those fields are already present on the application mutation.

## F. Schema changes

No new lifecycle table was created. No production migration was applied. This phase added no required schema migration because the existing `crm_external_events` and `lead_response_events` structures already provide provider-event storage and lifecycle persistence.

The previous additive migration remains the source of `calls.showed_at` and `calls.offer_at`. The existing provider-event deduplication uses `crm_external_events(provider, external_event_id)` as implemented by the Twilio route.

## G. Tests

Added `src/lib/crm-lifecycle-ingestion.ts` and `src/lib/crm-lifecycle-ingestion.test.ts`.

The deterministic provider-normalization tests cover:

- Twilio initiated → `first_attempt`.
- Twilio answered → `first_connection`.
- Provider timestamp preservation.
- Stable idempotency keys across retries.
- No qualification or set inference.
- No event when the lead ID is missing.
- No event when the provider timestamp is missing.

Final validation result: **10 test files, 66 tests passed**. TypeScript, development build, focused ESLint, formatting, and `git diff --check` all passed.

## H. Browser validation

The authenticated browser navigated to `/closer` and `/inbound-dialer` after the implementation. The browser artifact collector returned no interactive elements or screenshots, so click-level workflow verification could not honestly be claimed. No synthetic CRM, dialer, lifecycle, payment, assignment, or connection events were inserted.

Because no authenticated Twilio provider callback could be safely generated in the development browser, the actual provider-to-database webhook path was validated through source inspection, deterministic normalization tests, typecheck, and build rather than by fabricating a webhook request.

## I. External dependencies

To begin receiving live Twilio lifecycle events, the development/staging environment must have `TWILIO_AUTH_TOKEN` and `TWILIO_WEBHOOK_BASE_URL` configured, and a matching connected Twilio communication account in `crm_communication_accounts`. Twilio must be configured to send signed callbacks to the development/staging route paths `/api/public/twilio/voice`, `/api/public/twilio/voice-status`, `/api/public/twilio/sms`, and `/api/public/twilio/recording` as appropriate to the existing route convention.

To unlock assignment, qualification, set, rep identity, and authoritative payment events, the user must connect the actual CRM/dialer/payment provider or expose its authenticated webhook/API credentials and event schema. No connector was enabled because the current Close connector is disabled and no user-provided provider credential was supplied.

## Historical limitations

Historical assignments, attempts, connections, qualifications, sets, payments, and attribution remain null, unknown, legacy, or aggregate-only unless an authoritative provider record already contains the event and timestamp. No historical backfill was performed. Later Twilio attempts cannot replace the first attempt because lifecycle persistence is idempotent and the existing lifecycle row is the canonical analytical record.

## Files changed for Priority 4

- `src/lib/crm-lifecycle-ingestion.ts`
- `src/lib/crm-lifecycle-ingestion.test.ts`
- `src/routes/api/public/twilio.$event.ts`

The implementation remains on `upgrade/localhost-8081-command-center`; `main` was not merged and production was not touched.
