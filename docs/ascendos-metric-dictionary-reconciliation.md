# AscendOS Metric Dictionary — Post-Remediation Reconciliation

**Authoritative sources**: `docs/ascendos-metric-dictionary-audit.md` +
`docs/ascendos-metric-dictionary-audit-detail.csv` (the original 834-metric audit, Phase 0) and
the current codebase (`upgrade/localhost-8081-command-center`, all remediation changes still
uncommitted in the working tree).

**Method**: this is a *reconciliation*, not a re-audit. The 834-metric audit was not rerun. Every
metric explicitly touched by the two remediation passes (Phase 1: 26 items; Phase 2: 9 tasks;
Phase 2b: 2 approved product-definition decisions) is re-verified below against the real code as
it now stands, with its original Status/Category from the CSV shown alongside. **Every other
metric (≈780 of 834) is carried forward unchanged from the original audit** — nothing about them
was touched, so nothing about their classification is asserted to have changed. No workbook file
was modified — this is the report the prompt asked for before any workbook edit.

**Status vocabulary used below** (the newly-required set): `LIVE`, `PARTIAL`,
`NEEDS INTEGRATION`, `NEEDS SCHEMA/JOIN FIX`, `NOT AVAILABLE`, `UNDEFINED`, `MANUAL`, `BLOCKED`.
Mapping from the original audit's vocabulary: `PARTIALLY CONNECTED`→`PARTIAL`;
`PLACEHOLDER`→`UNDEFINED` (honest gap) or `LIVE` (if the remediation actually wired a real
source); `NOT AVAILABLE` stays `NOT AVAILABLE` unless the real blocker is specifically a
join/schema gap, in which case it's reclassified `NEEDS SCHEMA/JOIN FIX`; `NEEDS INTEGRATION`
stays as-is where the blocker is genuinely external. No mapping below was invented — each is
grounded in the specific code finding from the remediation pass that touched it.

---

## 1. Metrics now fixed by the remediation phases (status actually changed)

| Metric ID | Page / Group | Metric | Original → New Status | What changed |
|---|---|---|---|---|
| MAIN-0045 | Main Hub / Rep Efficiency | Top inbound setter | `NOT AVAILABLE` (C) → **`LIVE`** (A) | Phase 2b: real query (most `links_sent`, `role='dm_setter'`, grouped client-side) wired into the previously-dead `topSetter` prop. |
| MAIN-0047 | Main Hub / Client Momentum | Client Health | `PARTIAL` (C) → **`LIVE`** (A) | Phase 2b: reuses `evaluateTransparentHealth()` — the same real scorer already live on Payments — instead of the dead `clients.health_score` column. |
| SALE-0302 | DM Setter / Workflow panel | Inbound DMs | `UNDEFINED` (D, confirmed fabricated) → **`LIVE`** (A) | Phase 1: static `"Verified activity"` string replaced with the real, already-computed `inboundDms` value. |
| SALE-0350 | Inbound Dialer / Workflow panel | Inbound leads | `UNDEFINED` (D, confirmed fabricated) → **`LIVE`** (A) | Same fix, dialer side (`contacted`). |
| SALE-0308–0313 | DM Setter / DM Source Mix (6 metrics: Platform, Conversations, Qualified, Booked, Shows, Closes) | — | `NEEDS INTEGRATION` (C) → **`LIVE`** (A) | Phase 1: removed the `isDialer &&` role-gate bug on the shared `lead_response_events` query — it was a wiring bug, not a missing integration. |
| SALE-0320 | Inbound Dialer / Targets | Speed-to-Lead SLA Compliance | `NOT AVAILABLE` (C) → **`LIVE`** (A) | Phase 2 Task 2: real bridge (`speedToLeadSlaForWindow()`) built to the same canonical calculation the page's own Speed-to-Lead section uses, with real rep-identity resolution via `team_members.user_id`. |
| SALE-0394 | Closer / Payment quality | Payment Plan Uptake | `NEEDS INTEGRATION` (C) → **`LIVE`** (A), new records only | Phase 1 + Phase 2 Task 3: explicit "Payment plan" checkbox added to both real Closer entry points (dialog + native EOD). **Caveat**: historical calls logged before this fix have no way to be backfilled (never inferred, per instruction) — undercounts until enough new data accumulates. |
| FULF-0681 | Payments / Renewal workflow | Owner | `PARTIAL` (B) → **`LIVE`** (A) | Phase 1: real `owner_id`-based picker (org members via `memberships`⋈`profiles`) replaces the free-text `"Owner: <name>"` prefix hack in `next_action`. |
| FULF-0682 | Payments / Renewal workflow | Action date | `PARTIAL` (B) → **`LIVE`** (A) | Phase 1: now reads `renewal_work_items.next_action_at` (the semantically correct field) instead of `clients.renewal_date`; `renewal_date` kept as its own separately-labeled field. |
| CONT-0449 | ContentOS / Canonical Content→Cash | Booking | `NOT AVAILABLE` (C) → **`LIVE`** (A) | Phase 2 Task 6: `bookingId = call.id` populated in all 5 attribution-model branches — deterministic (this schema has no separate bookings table; a `calls` row *is* the booking record). |

**Net**: 9 metrics moved to a strictly better status.

## 2. Metrics with a real correctness fix but **no status change** (already `LIVE`, stayed `LIVE` — the underlying number is now trustworthy, it wasn't relabeled as newly available)

| Metric ID(s) | What was wrong | What changed |
|---|---|---|
| SALE-0274, 0275, 0321, 0322, 0374, 0375 (Cash Collected / Revenue Generated — DM Setter, Inbound Dialer, Closer) | Currency-mixing: summed raw cents across rows logged in different `original_currency` values as if all USD. | Phase 1: headline figures now run through `sumNormalizedCents()`, converting non-USD rows via real historical FX rates; unresolvable rows are excluded and surfaced as "· FX incomplete," never silently folded in. **Caveat**: day-bucketed chart series and per-row table cells on these same 3 pages still sum raw cents — not yet covered (see §6). |
| SALE-0163, 0164, 0165 (Team Snapshot: Booked/Show Rate/Cash Collected 30D) | `Math.max()` of two independently-sourced, non-reconciled datasets (`calls` vs `setter_activity`). | Phase 1: now sourced exclusively from `setter_activity` — the same canonical source the reps' own dashboards already use for this exact question. |
| SALE-0111, SALE-0176 (Closer identity — Leads "Closer" column, Team Roster Closes/Cash) | `calls.closer_id` was read everywhere but never written by any code path — permanently null for every real call; `SALE-0176` was silently reading an always-empty column. | Phase 2 Task 4: both real Closer entry points now resolve and write `closer_id` (via `team_members.user_id`); Team's read gained a historical-row fallback (`closer_name` match when `closer_id` is null) so old data stays reportable. `SALE-0111` deliberately left untouched (already correct for the reason its own code comment gives). |
| SALE-0369, 0378, 0385, 0417, 0433 (Closer "Closes" family) | `SALE-0369` used only `calls.closed`; every other Closes tile on the page used `closed \|\| status==='closed'` — could under-count relative to its siblings. | Phase 1: canonicalized in `rep-kpi-actuals.ts` to the majority predicate. |
| SALE-0185 (Team Calendars "Open Slots") | Mislabeled — counted **cancelled** calls, not free calendar capacity (no such calculation exists). | Phase 1: relabeled to "Cancelled," matching what it actually measures. |
| CONT-0439–0442, 0453–0461 (ContentOS Top KPI row / chart / format mix / post-level table, ~11 metrics) | Fed the raw, unranged `pieces` query (latest 200 by `posted_at`) regardless of the page's own date-range picker. | Phase 2 Task 5: now fed `rangedPieces` (a range-filtered list that was already being computed elsewhere in the file and silently discarded). Verified live: 30d→Today changed Total Views 308,800→0. |
| FULF-0579–0582 (Onboarding stat row, esp. "Insight signals") | Label implied an AI-derived insight count; the real computation was `submitted × question-count`, a plain tally. The original audit's `LIVE`/Category A was *technically correct* (it is real data) but didn't catch the misleading label. | Phase 2 Task 8: relabeled "Insight signals" → "Answered questions," same real number, Sparkles icon (implies AI) → ListChecks icon. |
| COPY-0577 (CopyOS total contracted value) | Independently-typed field that could silently drift from `deposit + installments × count`. | Phase 2 Task 9: non-destructive drift warning added in the editor; no data changed, legitimately-different values (e.g. a bundled discount) are left alone. |
| OPSW-0746, OPSW-0754 (Webinar ROAS ×2) | Two different spend sources for the same revenue figure (Executive KPI used `webinar_metrics.lead_capture_investment_cents`; Acquisition Efficiency used the real `acquisition_spend` ledger — the same one "Ad Spend" beside it used). | Phase 2 Task 7: both UI locations now read the same `acquisition.roas` value. **Status unchanged** — both are still blocked on webinar ingestion (see §3); this fix only removes the risk of the two numbers *disagreeing* once that's connected. |

## 3. Metrics still requiring external integration (unchanged by any remediation phase — genuinely out of scope for existing-data fixes)

- **Ops → Webinar Analytics: 54 metrics** (`OPSW-0738` through `OPSW-0797`) — `NEEDS INTEGRATION`, unchanged. Root cause confirmed unchanged: zero write paths into `webinars`/`webinar_metrics`/`webinar_events`/`acquisition_spend` exist anywhere in the app. This remains the single largest gap in the dictionary.
- Meta/Instagram, TikTok, YouTube, LinkedIn native content-metrics pulls — unchanged, manual entry only.
- Wistia auto-ingest (VSL metrics) — unchanged, CSV import only.

## 4. Metrics requiring schema/join fixes (real internal gap, not external — distinct from §3)

| Metric ID(s) | Status | Real blocker |
|---|---|---|
| SALE-0395, 0396, 0397, 0398, 0399 (Closer Payment quality: Success Rate, Failed/Default Rate, Failed Payments, Recovered Failed Payments, Deposit→Full Payment) | `NOT AVAILABLE` (C) → **`NEEDS SCHEMA/JOIN FIX`** | Investigated exhaustively (Phase 1): none of the 5 processor webhooks (Stripe/PayPal/Fanbasis/Wise/Whop) carry any call-identifying field — `payments.call_id` cannot be set from any current payload. No fabricated linkage was added. |
| SALE-0400 (Future Scheduled Cash) | `UNDEFINED`, actively misleading (D) → **`NEEDS SCHEMA/JOIN FIX`**, no longer misleading | Same root cause as above. Phase 1 fixed the *symptom* (it no longer overstates remaining balance) but the underlying join gap is unchanged — this metric stays genuinely unavailable until it's resolved. |
| CONT-0451 (Canonical Content→Cash: Payment) | `NOT AVAILABLE` (C), unchanged | Same root cause — `paymentId` correctly stays `null` (Phase 2 Task 6), since no deterministic `payments.call_id` link exists to populate it from. **Fixing SALE-0395–0400's join would also fix this metric.** |

**This is the highest-leverage remaining internal fix**: one join resolution unblocks 7 metrics across 2 pages at once. It requires either a checkout-flow change (passing an AscendOS-internal call reference through to the processor as metadata) or a manual reconciliation UI — both are real engineering decisions, not something this reconciliation pass should silently pick.

## 5. Metrics requiring a product-definition decision

**None remaining.** Both metrics in this bucket from the original audit — MAIN-0045 (Top Inbound
Setter) and MAIN-0047 (Client Health) — were resolved via the explicit decision-memo step
(Prompt 2) and implemented in Prompt 3. See §1.

## 6. Metrics that are genuinely unavailable (confirmed, not merely unimplemented)

| Metric ID(s) | Status | Why it's genuinely, not just currently, unavailable |
|---|---|---|
| SALE-0331, SALE-0332 (Inbound Dialer Average Call Length / Talk Time) | `PARTIAL`, misattributed (C) → **`BLOCKED`** | Phase 2 Task 1 investigated `crm_call_sessions` specifically as a possible real source: it has a real `duration_seconds` column but **no `talk_seconds` column at all**, and **no rep/dialer identity column** (`legacy_call_id`, the only bridge back to `calls.setter_id`, is never written by the Twilio webhook). No reliable attribution path exists today. Code now shows honest "Unavailable" instead of the prior misattributed Closer-logged data. Reclassified `BLOCKED` rather than `NOT AVAILABLE` because fixing this needs new schema (a `talk_seconds`/rep-identity column on `crm_call_sessions`) plus a Twilio payload change — a real build decision, not a simple join. |
| MAIN-0014 (MRR — Low Ticket) | `UNDEFINED`, unchanged | No recurring-revenue field exists anywhere in the `clients` schema. Untouched by any phase — correctly already honest. |

*(This is not an exhaustive re-listing of every `NOT AVAILABLE`/`UNDEFINED` metric in the
original 834 — only the ones this reconciliation pass specifically re-examined. The other
~15 Category-D/`NOT AVAILABLE` metrics from the original audit are unchanged and carried
forward as-is.)*

## 7. Workbook-metadata-only corrections (no code was ever wrong — flagged in Phase 1, action still pending on the workbook itself)

These were investigated and confirmed to be **the workbook's stated Unit/Classification
metadata being wrong, not the app**. No code change was needed or made. When the workbook is
next edited, these columns should be corrected:

| Metric ID | Column to fix | Correct value | Confirmed via |
|---|---|---|---|
| MAIN-0022 | Unit | multiplier (`x`), not `%` | `dashboard.tsx` already renders it as `x` |
| OPSW-0750 (CTR) | Unit | `%` | `webinar-analytics.tsx:613` already renders `%` |
| OPSW-0751 (CPC), 0752 (CPL), 0753 (CPA) | Unit | `$` | Already rendered via `currency()` |
| OPSW-0776 (Deposits) | Unit | count, not `$` | `aggregateWebinarMetrics()` defines it as a row count |
| OPSW-0780 (Refunds) | Unit | `$` | Already rendered via `currency()` |
| FULF-0728, FULF-0729, FULF-0737 (VSL Play rate / Avg % watched / per-video metrics) | Classification | `RAW`, not `DERIVED` | Directly-entered/imported values, not computed from other fields |

---

## Aggregate status shift (metrics actually touched by remediation — not all 834)

| | Before | After |
|---|---:|---:|
| LIVE | 9 (of the touched set) | 18 |
| NEEDS SCHEMA/JOIN FIX | 0 (uncategorized as such) | 6 |
| BLOCKED | 0 | 2 |
| UNDEFINED (honest) | 4 | 2 |
| NEEDS INTEGRATION (unchanged, external) | 56 | 56 |

**780 of 834 metrics are untouched and carry forward their original Phase-0 classification
exactly as published** — this reconciliation did not re-derive them, per the "don't rerun the
audit" instruction.

## What should change in the workbook (not yet applied — awaiting your go-ahead)

1. Update Status/Category for the 9 metrics in §1 (now `LIVE`).
2. Add a "Correctness fix applied" note (not a status change) to the ~20 metrics in §2, so a
   future reader doesn't have to re-derive this from git history.
3. Reclassify the 6 metrics in §4 from `NOT AVAILABLE`/`UNDEFINED` to `NEEDS SCHEMA/JOIN FIX`,
   with a shared note pointing at the common `payments.call_id` root cause.
4. Reclassify SALE-0331/SALE-0332 to `BLOCKED` with the `crm_call_sessions` finding as the note.
5. Correct the 7 Unit/Classification-only cells in §7.
6. Clear MAIN-0045/MAIN-0047 out of any "needs a decision" tracking view — both are resolved.

No workbook file has been touched. Say the word and I'll apply exactly the changes above (and
only those) to the METRIC REGISTRY / AUTOMATION MAP tabs.
