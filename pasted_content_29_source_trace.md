# InsightOS Priority 1 Source-of-Truth Investigation

**Scope.** This investigation follows `pasted_content_29.txt`. It traces the current application’s actual lifecycle write paths and deliberately does not add mutations, generate events, infer timestamps, backfill history, or mark Priority 1 complete.

## A. Exact source map

| Lifecycle event | UI → function → mutation → database record → lifecycle event | Per-lead? | Exact timestamp? | Safe to wire now? |
|---|---|---:|---:|---:|
| `lead_created` | No confirmed current UI call site was found for `dispatchLeadEvent`. The server action exists in `src/lib/dispatch.functions.ts` as `dispatchLeadEvent`; it reads `leads` and invokes `captureLifecycleEvent` with `lead_created`. The underlying `leads` insert path is not present in the current source search. | Yes in the helper contract | Yes when the existing lead row has `created_at` | **Only if the actual lead-create mutation calls it** |
| `lead_assigned` | `leads.assigned_setter_id` exists in the schema and is read by analytics. No current application mutation that updates `assigned_setter_id` was found in routes, components, or server functions. | No authoritative action found | No | **No** |
| `first_attempt` | DM Setter and Inbound Dialer use aggregate `setter_activity` records. No per-lead dial, message, outbound-call, Twilio, or communication-attempt mutation was found. | No | No | **No** |
| `first_connection` | Existing source contains aggregate/live-call concepts, but no per-lead answered/connected/disposition mutation was found. | No | No | **No** |
| `qualified_conversation` | `src/lib/dispatch.functions.ts` exposes `dispatchLeadEvent`; its `lead.qualified` branch records `qualified_conversation`. No confirmed current UI call site was found for that server action. | Contract yes; current source action unconfirmed | Action time only; no qualification timestamp field | **Only after the real qualification mutation is identified** |
| `set` | Setter metrics are represented in aggregate `setter_activity` fields such as `sets` and `calls_on_calendar`. No per-lead set/appointment mutation was found. | No | No | **No** |
| `booked_call` | Closer UI: `src/routes/_authenticated.closer.tsx` → `create` React Query mutation → `supabase.from("calls").insert(payload)` → `calls` row. After the insert succeeds, it invokes `captureCallLifecycleEventsFn`, which emits `booked_call` when `scheduled_for` exists. | Yes when `lead_id` is present | `calls.scheduled_for` | **Yes, for this call-insert flow** |
| `showed` | Same Closer call-insert path. The call payload has `showed`; after insert, `captureCallLifecycleEventsFn` emits `showed` when true. | Yes when `lead_id` is present | No exact `showed_at` column; current helper uses `calls.updated_at` | **No for exact timestamp; only provisional capture exists** |
| `offer` | Same Closer call-insert path. The call payload has `offer_made`; after insert, `captureCallLifecycleEventsFn` emits `offer` when true. | Yes when `lead_id` is present | No exact `offer_at` column; current helper uses `calls.updated_at` | **No for exact timestamp; only provisional capture exists** |
| `close` | Closer call-insert path when `closed=true`, plus `src/lib/dispatch.functions.ts` `dispatchCallWon` action. Both call the existing lifecycle helper. | Yes when `lead_id` is present | Close action time is available in the mutation path; legacy historical exact time is not | **Yes for supported current call-won actions; avoid duplicate calls through idempotency** |
| `cash_collected` | Existing payment ledger is queried by dashboards (`payments.amount_cents`, `payments.collected_at`). Closer call records also contain `cash_collected_cents`. `dispatchCallWon` and the Closer lifecycle capture emit cash when the call has positive cash, but `dispatchCallWon` is not proven to be the sole payment authority. | Sometimes | Payment timestamp exists in `payments.collected_at`; call-only path has no payment timestamp/ID | **Only through the authoritative payment creation/webhook path** |

## B. Lead assignment trace

The current schema contains `leads.assigned_setter_id`, and analytics read the field. The source search did not find a current UI or server mutation that updates it. Therefore there is no verified authoritative assignment action to attach to. An ownership snapshot must not be converted into a historical `lead_assigned` event. The minimum safe change is to identify the real CRM assignment action or webhook, then invoke the existing idempotent lifecycle helper in that action using the mutation timestamp.

## C. First-attempt trace

The current DM Setter and Inbound Dialer dashboards are analytical views. Their operational rows are based on daily `setter_activity` data and existing lead/call aggregates. The repository contains no verified individual dial/message-attempt record per lead and no confirmed Twilio or equivalent provider write path. Daily totals cannot produce a first-attempt event because they do not identify the lead or the first attempt timestamp. The minimum safe change is an attempt-level record from the actual dialer, CRM, SMS, or messaging provider.

## D. First-connection trace

The source includes words such as `connected`, `live_calls`, and call outcomes in analytics, but no authoritative per-lead answered/connected/disposition mutation was found. A live-call or daily aggregate cannot safely be treated as a connection for an individual lead. The minimum safe change is an answered/disposition event from the actual dialer/CRM provider, carrying lead ID, rep ID, connection timestamp, source attribution, and provider event ID.

## E. Set trace

Setter dashboards use aggregate fields such as `sets` and `calls_on_calendar`. No per-lead set mutation, appointment mutation, or calendar webhook was found. A booked call must not be inferred to be a setter set because the specification explicitly prohibits that inference. The minimum safe change is the actual appointment/set action or calendar/CRM webhook with lead ID and event timestamp.

## F. Show and offer timestamp trace

The existing `calls` table has `showed` and `offer_made` booleans but no `showed_at` or `offer_at` fields. The current lifecycle helper uses `calls.updated_at` for these events. That is not an exact action timestamp and must not be used for historical reconstruction. The minimum safe change is to add nullable `showed_at` and `offer_at` columns and populate them only inside the real status mutation, using `COALESCE(existing_timestamp, mutation_timestamp)` so repeated updates cannot overwrite the first authoritative timestamp. Existing legacy rows remain null.

## G. Payment and cash trace

The payment ledger is represented by `payments` and is queried using `amount_cents` and `collected_at`. The current application also stores call-level `cash_collected_cents`. The current `dispatchCallWon` action is a cash-entry path and is not proven to be the exclusive payment authority. A call-level amount without payment ID, payment timestamp, client relationship, and processor event ID cannot replace the payment ledger. The minimum safe change is to attach lifecycle capture to the actual payment insert or processor webhook, passing payment ID, collected timestamp, client/call/lead IDs, rep, and known attribution. No second payment ledger should be created.

## H. Real current user flows

| Workspace | Current chain found | What it records today |
|---|---|---|
| DM Setter | `/dm-setter` → shared `ActivityModule` → `setter_activity` and related analytical queries/filters | Daily aggregate activities, rep/platform/source analytics; no verified per-lead attempt, connection, qualification, set, or assignment mutation |
| Inbound Dialer | `/inbound-dialer` → shared `ActivityModule` → aggregate activity plus `lead_response_events` query for Speed to Lead | Event-backed response analytics where rows exist; no verified producer for all attempt/connection/outcome events |
| Closer | `/closer` → Closer form `create` mutation → `calls` insert → `captureCallLifecycleEventsFn`; separate `dispatchCallWon` server action exists | Per-call booked/show/offer/close/cash fields; exact show/offer timestamps and payment linkage are incomplete |
| Payments | Dashboard and analytics queries read `payments`; no single confirmed payment creation action was found in this source trace | Ledger read path is present; authoritative payment write/webhook path still needs identification |

## I. Classification of missing pieces

### A — Source already exists and can be wired immediately

The existing Closer call-insert action can safely capture `booked_call`, and can capture `showed`, `offer`, `close`, and call-level cash as provisional event records using the existing idempotency path. The existing `dispatchCallWon` action can capture close and cash when it is the actual action used.

### B — Source exists but lacks exact timestamp

The Closer call record contains `showed` and `offer_made`, but lacks exact `showed_at` and `offer_at`. Add nullable timestamp fields and populate them in the actual status mutation. Do not use `updated_at` for exact reporting after that change, and do not backfill historical rows.

### C — Source exists only as aggregate data

`setter_activity` fields such as `sets`, `calls_on_calendar`, `live_calls`, and daily activity totals cannot produce per-lead assignment, first-attempt, first-connection, qualification, or set events. They can remain dashboard aggregate sources but must not be used to manufacture lifecycle rows.

### D — Source does not exist in the current application

A per-lead assignment action, attempt action, connection/disposition action, set action, and confirmed payment insert/webhook source were not found. These require a real internal operational action or external CRM/dialer/payment integration.

## J. Minimum safe implementation order

1. Identify and wire the authoritative payment insert/webhook because it determines cash truth and downstream attribution.
2. Add `showed_at` and `offer_at` at the real call-status mutation, preserving the first timestamp and leaving historical values null.
3. Identify the real lead-assignment mutation and emit `lead_assigned` with the assignment timestamp.
4. Integrate the actual dialer/CRM attempt and answered/disposition events for `first_attempt` and `first_connection`.
5. Integrate the actual setter/appointment mutation or calendar webhook for `set`.
6. Recompute Speed to Lead and downstream rep dashboards only from authoritative events, keeping aggregate fallback states visibly separate.
7. Add integration tests around concurrent duplicate status updates, close plus payment, repeated show actions, and multiple webhook workers.

## K. Type and build state

After aligning the generated Supabase type file with the additive nullable attribution fields and resolving the stale `ContentBusinessBridge` and dashboard period references, the current source passes:

| Check | Result |
|---|---:|
| TypeScript `tsc --noEmit` | Passed |
| Development build | Passed |
| Deterministic test suite | Passed — 7 files, 52 tests |
| `git diff --check` | Passed |
| SQL formatting | Not run through Prettier because no SQL parser is configured; this is not a SQL validation failure |

The lifecycle implementation must still be validated against an applied local/staging database migration for schema/index/function behavior. No production migration was applied.

## L. Important conclusion

**Priority 1 cannot be completed entirely inside the current InsightOS application as it exists today.** The current repository can capture lifecycle events for supported lead-dispatch and Closer call actions, but it does not contain authoritative per-lead assignment, dial/message attempt, answered connection, or setter-set actions. Exact show/offer timestamps require minimal call timestamp fields at the real mutation. Authoritative cash attribution requires the actual payment insert or processor webhook, because `dispatchCallWon` is only one known cash-entry path. An external CRM/dialer/payment provider is required for any missing event that is not added as a real internal operational mutation.

No application code was changed by this investigation. No synthetic events were inserted, no historical events were generated, production was untouched, and `main` was not merged.
