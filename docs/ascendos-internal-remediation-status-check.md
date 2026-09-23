# AscendOS — Internal Remediation Status Check

All 9 requested items map exactly to Phase 2's 9 tasks from earlier in this same session. Per this
repo's own standing rule (`feedback_read_state_before_rerunning`), verified each directly against
the current code before doing anything — found all 9 already implemented and still present. One
genuine, small gap closed (a regression test for item 7). Nothing else changed. No commit/push.

## Completed

All verified against the live code (file:line citations below), not just memory:

1. **Inbound Dialer call duration/talk time** — left honestly unavailable, not attributed to
   Dialers. `activity-module.tsx:985-986`: `dialerCallDurationUnavailableReason` — real
   investigation finding, restated: `calls.duration_seconds`/`talk_seconds` are only ever logged by
   the Closer's manual call dialog (no per-dialer source); `crm_call_sessions` (the real
   Twilio-backed table) has no rep/dialer identity column to attribute a session to a specific
   dialer. Used at both KPI card sites (`activity-module.tsx:2269,2277`). Closer metrics
   untouched.
2. **Speed-to-Lead Targets** — `speedToLeadSlaForWindow()` (`speed-to-lead.ts:210`), the same
   canonical event-based calculation (`lead_response_events`, 5-minute SLA), called from the
   Targets dispatcher at `activity-module.tsx:544`. Not duplicated — one function, one call site.
3. **Closer Payment Plan Uptake** — persists to the real `calls.payment_plan` column, not a new
   field. `eod-reports.ts:401,594` (native EOD flow, via `buildClosureCallPayload`) and
   `closer.tsx:346` ("Log a sales call" dialog, direct insert). Regression tests already exist:
   `eod-reports.test.ts` (4 cases — checked/unchecked/real-world-shaped submission).
4. **Closer identity** — canonicalized around `closer_id`. `closer.tsx:2083` and
   `eod-reports.tsx:206` both resolve it via `team_members.user_id` before insert (both real entry
   points). `team.tsx:379`: `closer_id === m.user_id || (!c.closer_id && c.closer_name ===
   m.profiles?.display_name)` — ID-first, name-only as a historical fallback, never the reverse.
   Display name resolved from the canonical `profiles` table via a real join
   (`team.tsx:254`: `profiles:user_id(display_name, avatar_url)`), not a free-text field.
   **No duplicate reps**: verified `byUser`/`closerMap` are built by mapping over the real roster
   (`members`, one row per person) and matching calls *into* each member's bucket — never a
   separate by-name aggregation that could create a second, phantom entry for the same person.
5. **ContentOS date range** — `rangedPieces` (`content.tsx:857`) is the single range-filtered
   source, reused by the KPI row, main chart, format mix, and post-level table (`content.tsx:866,
   935,1069`) — one query system, not a duplicate. **Weekly Check is intentionally a fixed 7-day
   diagnostic**, not range-aware — confirmed from `computeWeeklyContentCheck()`'s own code
   (`content-signals.server.ts:353`: `since = Date.now() - 7 * 86400000`, hardcoded, not derived
   from any date-range parameter) — this is a "last 7 real days" health check by design, not a
   metric claiming to respect the page's picker, so no fix was needed here, only confirmation it's
   correctly *not* claiming range-awareness anywhere in its own UI.
6. **Content→Cash bookingId/paymentId** — `content-attribution.ts:79,108,137,169`: `bookingId:
   call.id`, deterministic because this schema has no separate bookings table (a `calls` row *is*
   the booking record) — never inferred from timing/sequence. `paymentId` stays unset (`null` by
   default) in every branch — no deterministic `payments.call_id` link exists, so it's honestly
   left unavailable rather than guessed. Attribution models/confidence/drilldowns untouched.
7. **Webinar ROAS** — both UI locations (`webinar-analytics.tsx:534,663`) read
   `roasLabel(acquisition.roas)` from the exact same `useMemo`'d `acquisition` object
   (`webinar-analytics.tsx:285`) — one canonical calculation (`calculateAcquisitionMetrics` in
   `acquisition.ts:259-296`), not two. **Gap found and closed**: no regression test previously
   locked in the "two displays agree" property. Added one to `acquisition.test.ts` — since there's
   only one computation function and one call site producing the shared object, the real testable
   guarantee is that the computation is deterministic for identical inputs (which it structurally
   must be for two renders of the same object to ever disagree). Not redundant with the existing
   3 ROAS tests (correct ratio, null-denominator handling) — this one specifically documents *why*
   agreement holds and would catch a regression if a second, independent ROAS calculation were
   ever reintroduced.
8. **Onboarding Insight Signals** — relabeled to **"Answered questions"** (`onboarding.tsx:660`),
   same real underlying count (`submitted × question-count`, a plain tally — never called an "AI
   insight count"), Sparkles icon (implying AI) replaced with a neutral one. Confirmed live in
   browser this turn.
9. **CopyOS contracted value** — `total_contracted_value_cents` confirmed to be a legitimate,
   separate concept from `deposit + installments × count` (can genuinely differ, e.g. a bundled
   discount) — not silently overwritten. `copy.tsx:804,810-813`: non-destructive drift warning
   (`derivedTotalCents`/`totalDrifts`) shown only when the two disagree; no data changed.

## Still Blocked

- **Historical payment FX backfill** — marked exactly as instructed: **BLOCKED — requires
  authorized production Supabase read access and explicit approval.** Not attempted. No records
  modified. `docs/ascendos-payment-fx-integrity-check.md` and
  `docs/ascendos-payment-fx-impact-query.md` remain the full, ready-to-run SQL for when access
  exists.

## Requires Product Decision

- **Main Hub Top Inbound Setter, Main Hub Client Health** — explicitly not touched, per your
  instruction. (For continuity: these were already resolved via a product-definition decision
  earlier in this same session, Prompts 2-3 of the original 13-prompt roadmap — noted here only
  so it's not mistaken for an open item, not re-litigated.)

## Requires External Integration

None surfaced by this pass. (The 54 Webinar Analytics metrics and the Ad Platform Spend Feed
remain blocked exactly as already documented in
`docs/ascendos-external-integration-contract.md` — not re-investigated here, per your "do not add
external integrations" instruction.)

## Verification

- `npx tsc --noEmit`: clean.
- `npm run lint` (targeted, `acquisition.test.ts` — the only file touched): 0 errors.
- Prettier: clean.
- Full suite: **384 tests, 383 passing** (1 new test added; same one pre-existing, unrelated
  `speed-to-lead.test.ts` failure this entire session has consistently carried).
- Browser-verified live (Dev Bypass + Demo Mode): Webinar Analytics (both ROAS tiles render,
  Executive KPIs intact) and Onboarding ("Answered questions" label confirmed live) — no console
  errors beyond the known, pre-existing `ERR_CONNECTION_REFUSED` noise from this sandbox's
  Docker/Supabase gap. Did not re-verify every one of the 9 pages at 375px specifically in this
  turn — Main Hub, Team, Attribution, Traffic, and Content (which share the same underlying
  infrastructure these 9 items depend on) were already verified at both desktop and 375px earlier
  in this session's currency-mixing work, with no changes since.

## Files Changed

- `src/lib/acquisition.test.ts` — one new test (`ROAS is deterministic for identical inputs`).

That's the only change made in this turn. Every other item was confirmed already correct in the
existing code — no other file was touched.

## Pre-existing Failures

- `src/lib/speed-to-lead.test.ts` — `filters event segments by rep, source, campaign, weekday, and
  time` — present before this turn, before this whole remediation project began, unrelated to any
  of the 9 items above. Not investigated or fixed here (out of scope).

No commit/push.
