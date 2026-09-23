# AscendOS Current State

**This is the canonical project-status document.** When it conflicts with an older doc (a
roadmap prompt, a prior audit, a plan-mode file), this document wins — it was built by checking
every claim against the current code, current tests, and current git history, not by merging old
text. Older documents are preserved for their evidence/reasoning, not as active requirements.

Status reconciliation only — no product behavior, schema, UI, or integration changed to produce
this document. No commit/push.

---

## Repository State

- **Branch:** `upgrade/localhost-8081-command-center`
- **HEAD:** `47e7d21` — "feat: role SOPs + Help center, real access-control matrix, Main Hub
  layout pass" (2026-09-20 18:49 -0400)
- **Working tree:** ~35 modified files + ~30 untracked files (docs, test files, new webhook
  routes, new migrations, `n8n/`, `.claude/`). Full list captured under **Uncommitted Work**
  below, classified by which initiative each belongs to.
- **Known unrelated/concurrent work:** this branch also carries a second, larger implementation
  pass — described in `docs/implementation-status.md` and `docs/claude-code-handoff.md` — that is
  **not part of this AscendOS session's own history**. Its handoff doc references a different
  worktree (`/home/ubuntu/insightos-localhost`) and a different remote Supabase project ref
  (`zyptvdzlayoheqtxcljx`) than the one this session has been checking against
  (`nnfihxlikgfyxalfcddz`), strongly indicating a separate Claude Code session/environment
  working the same branch. Its own last commit affecting those files is `44909e45`
  (2026-09-03), and several of its files carry further **local, uncommitted** edits on top of
  that (`speed-to-lead.ts`, `hub-operating-metrics.tsx`, `activity-module.tsx`,
  `calls-on-calendar.tsx`, `mentee-operations-panel.tsx`, `operational-workflow-panel.tsx`).
  Those files were not modified to produce this document, per instruction.

---

## Completed

Verified against current code (file:line or command evidence), not against what a doc claims.

| Item | Evidence | Classification |
|---|---|---|
| Main Hub — Top Inbound Setter | `hub-operating-metrics.tsx` — `topSetter` logic, live, 22 real references (grep-confirmed, not a stub) | **A** |
| Main Hub — Client Health | `hub-operating-metrics.tsx` — `evaluateTransparentHealth()` returns healthy/watch/at-risk/unavailable with reason codes; corroborated independently by `docs/implementation-status.md` line 22 ("Mentee transparent health — DONE (code-completable)") | **A** |
| Currency-mixing remediation (dashboard, attribution, traffic, team, leads, live-ticker, VSL, rep-kpi-actuals) | `src/lib/currency.ts` (`usdCentsForRow`), `src/hooks/use-fx-rates.ts`, per-file fixes across 9+ files, 21+ new tests, all cited with file:line in `docs/ascendos-currency-mixing-remediation.md` and re-verified in `docs/ascendos-internal-remediation-status-check.md` | **A** |
| `payments.amount_cents` FX handling (write path) | All 5 webhooks (`stripe.ts`/`paypal.ts`/`fanbasis.ts`/`wise.ts`/`whop.ts`) call `normalizePaymentToUsd()`; 8 new tests in `fx.server.test.ts` | **A** |
| Weekly Report currency bug (Prompt 13) | Fixed and documented in `docs/ascendos-weekly-report-final-upgrade.md` | **A** |
| Wistia n8n workflow | `n8n/wistia-vsl-stats-sync.workflow.json` + `n8n/README.md`; partial-unique-index migration `20260923000000_vsl_metric_snapshots_daily_uniqueness.sql` | **A** |
| Payments page: full audit + redesign (recovery-queue consolidation, stat-row split, Payment Notifications, Expected vs. Actual chart, merged LTV tables, promoted Renewal Pipeline & Workflow) | **Already implemented and committed** — see "Historical / Superseded Work" below. Verified via `grep`: `recovery-queue-panel.tsx` exists, tracked since commit `ba303ff` (2026-09-19), wired into `_authenticated.payments.tsx:37,1187`; `mentee-operations-panel.tsx`'s own comment documents the exact consolidation ("Payment recovery used to live here too; it moved to `RecoveryQueuePanel`... one recovery workflow on the page, not two"); `payments.tsx` contains `Payment Notifications` (req. #1) and `Expected vs. actual collections` (req. #4/§D) sections with comments citing the plan's own requirement numbers; `mentee-renewal-panel.tsx`'s tab strip is down to 4 tabs (All mentees / At-risk / LTV by offer / Retention analytics) with "Collected LTV by offer moved into the 'LTV by offer' tab" — matching the plan's §C merge exactly | **A** (superseded plan file, not a pending task) |
| Lifecycle event model, notification-service boundary, EOD RBAC (as of commit `44909e45`) | Per `docs/implementation-status.md`; files exist on disk (`lifecycle-events.ts`, `notification-service.ts`) | **B** — real code, part of the other initiative, not independently re-verified by this reconciliation (out of scope to re-audit another initiative's work); current copies have further *uncommitted* edits not covered by that doc's own verification snapshot |
| **Content Signals architecture decision** | Resolved — see "Final Content Signals Architecture" below | **A** |

---

## Completed But Needs Future Enhancement

- **Wistia VSL sync** — real, honest manual/CSV import path works today (`vsl.tsx` self-discloses
  "never a live API sync"). Automatable via the Wistia Stats API (P2 in the external integration
  contract) but not broken as-is.
- **Content→Cash `paymentId` linkage** — `bookingId` is deterministic (`content-attribution.ts`),
  `paymentId` is honestly left `null` (no `payments.call_id` join exists yet). Tracked as an
  internal schema/join gap in the metric-dictionary reconciliation report, not an external gap.
- **`payments.call_id` never populated** — blocks `SALE-0395–0400`/`CONT-0451`; internal work, not
  an integration gap (see external integration contract §7-11).

---

## Technically Ready

No product decision or external integration blocks these — implementable from existing
data/code:

- **Connections panel / connector-registry UI** (`src/components/connections-panel.tsx`, expanded
  `src/lib/connectors.functions.ts`, wired into `settings.tsx`) — **now browser-verified** (Dev
  Bypass, `/settings`). All 8 connector cards (Whop/Fanbasis/Wise/Stripe/PayPal/Typeform/Zapier/
  Discord) plus the Ingest Endpoint card render correctly; form inputs accept text; state badges
  correctly read "Not connected" (never fake "Connected") once the `connector_connections` query
  settles; the pre-connect webhook-URL sub-query shows an honest, specific error
  ("Couldn't generate a webhook URL... dev bypass can't reach this") rather than hanging or
  crashing; the Ingest Endpoint card correctly short-circuits to `dev-bypass-token` under Dev
  Bypass and disables "Rotate token" in that mode. Clicking "Connect" (tested on Typeform) fires
  the mutation, gets a 401 Unauthorized (expected — Dev Bypass carries no real session token for
  `requireSupabaseAuth`-gated server functions), and the app deliberately suppresses that specific
  toast (`[dev-bypass] suppressed toast: Unauthorized...`) rather than showing a misleading error.
  **What remains unverifiable in this environment**: an actual successful connect/disconnect
  round-trip against a live `connector_connections` row — blocked by this sandbox's two
  pre-existing, unrelated limits (no reachable local Supabase; Dev Bypass has no real auth token),
  not by any defect found in the panel's own code. Reclassified **A** for rendering/error-handling
  correctness; the live-write round-trip stays **B** (needs a real session + reachable Supabase to
  finish verifying, outside this sandbox's reach).
- **Historical payment FX backfill script** — logic is fully specified and deterministic
  (`docs/ascendos-payment-fx-integrity-check.md` §"Proposed backfill logic"), reuses the exact
  shipped `normalizePaymentToUsd()` function. Classified **D**, not G — the *logic* is technically
  ready; what's actually blocking is data access + approval (see **Blocked**), a different axis
  than "is this buildable."

---

## Final Content Signals Architecture

**Resolved — embedded in Content Command Center, not standalone.** This is the opposite of Prompt
11's original recommendation, but it is now the deliberate, completed, documented state of the
code, not an open question.

Verified directly in `src/components/app-sidebar.tsx:141-151`:

> *"Content Signals retired as a standalone page — its Root Cause Chain, recommended-mix driver
> drill-down, weekly diagnosis, drivers log, AI Bottleneck Read and Setter Signals all now live
> inside Content Command Center (see `content-signals-panel.tsx`). Route/component were deleted,
> not hidden — grep the deleted `_authenticated.content-signals.tsx` in git history if this ever
> needs revisiting."*

Confirmed structurally, not just by comment:

- No `content-signals` route file exists under `src/routes/` (`find`/`ls` both empty) and
  `src/routeTree.gen.ts` has zero `content-signals` route entries — a standalone route was tried
  and explicitly removed, not merely never built.
- The full feature set (Root Cause Chain, recommended-mix drill-down, weekly diagnosis, drivers
  log, AI Bottleneck Read, Setter Signals) lives inside `content-signals-panel.tsx`, rendered by
  `_authenticated.content.tsx` and reached via the existing `/content?section=content-signals`
  deep link — the same `?section=` idiom Traffic and Attribution already use on that page.
- The sidebar's `CONTENT_NAV` entry for "Content Signals" (`app-sidebar.tsx:168-174`) points at
  `/content` with `search: { section: "content-signals" }`, `sub: true` — a deep-link, not a
  standalone destination, matching the comment exactly.

No further product decision remains here. If this is ever revisited, the deleted standalone route
is recoverable from git history per the code's own comment — nothing was destructively lost.

---

## Product Decisions Required

None currently open. The only item previously listed here — Content Signals embedded vs.
standalone — is resolved; see "Final Content Signals Architecture" above.

---

## External Integrations Required

Grouped by provider, per `docs/ascendos-external-integration-contract.md` (research doc, no code
written) cross-checked against current code — not re-audited from scratch here.

| Integration | Status | Priority |
|---|---|---|
| **WebinarJam** (confirmed platform) | No writer exists into `webinar_events`/`webinars`; `n8n/` contains only the Wistia workflow. Explicitly **deferred by user** ("skip to 13 for now") | **F + H** — P0 when resumed (unlocks 54 blocked Webinar Analytics metrics, zero new schema needed) |
| **Meta / Instagram Ads** | `MAIN-0019` partially connected; `acquisition_spend` table exists, unused. Requires OAuth (connector registry has none today) | **F** — P1 |
| **TikTok / YouTube / LinkedIn Ads** | No evidence of real paid spend on these platforms in the current dictionary | **F, not prioritized** — confirm real spend exists before building |
| **Wistia auto-sync** | Manual/CSV path is honest and functional today; API automation is a real but low-urgency upgrade | **F** — P2 |
| **Discord** (notification delivery) | `notification-service.ts` boundary exists (other initiative); no real connector | **F** — belongs to the other initiative's scope, not AscendOS's |
| **Telephony / messaging** (Inbound Dialer, DM Setter) | Per `implementation-status.md`: activity module + Speed-to-Lead queue exist; full provider-backed ingestion is connector-dependent | **F** — other initiative's scope |
| **Typeform, Stripe, PayPal, Fanbasis, Wise, Whop, Calendly** | Already live, webhook-secret auth, no verified gap | Not applicable — done |
| **Connector-registry OAuth capability** | Cross-cutting prerequisite: registry only supports webhook-secret/plain-URL auth today; Meta/TikTok/YouTube/LinkedIn all need OAuth | **F** — real scoped infrastructure work, blocks P1 regardless of which ad platform is picked |

---

## Blocked

- **Historical payment FX backfill** — `docs/ascendos-payment-fx-integrity-check.md` /
  `ascendos-payment-fx-impact-query.md`. Exact blocker: no database access in this environment
  (local Supabase needs Docker, unavailable; remote project `nnfihxlikgfyxalfcddz` has no
  credentials here) **and** explicit business approval required before rewriting historical
  financial records (see the docs' "What requires explicit approval" section). SQL is fully
  prepared and ready to run once both conditions are met. **G**.

---

## Deferred / Intentionally Not Current

- **WebinarJam n8n integration** — platform known, build deferred by explicit user instruction.
- **Sales CRM** — per `docs/implementation-status.md`: "Intentionally not expanded beyond the
  existing deferred/foundation state." Pre-existing docs `CRM-SOURCE-AUDIT.md`,
  `crm-communication-setup.md`, `crm-foundation-audit.md`, `sales-crm-implementation-plan.md`
  belong to this deferred track, not to AscendOS's active scope. **H**.

---

## Historical / Superseded Work

- **`~/.claude/plans/quirky-sleeping-bee.md`** ("Payments page: full audit + redesign pass") —
  **superseded, not pending.** This plan-mode file proposes work that is already implemented and
  committed: `recovery-queue-panel.tsx` (committed `ba303ff`, 2026-09-19), the stat-row/Portfolio
  split, Payment Notifications, the revived Expected vs. Actual Collections chart, and the merged
  LTV-by-offer tabs are all present in the current `payments.tsx`/`mentee-renewal-panel.tsx`, with
  in-code comments citing the plan's own requirement numbers (`req. #1`, `req. #4/§D`). The plan
  file is a leftover artifact from the planning session that did this work — **do not execute it**,
  it would re-do already-shipped work. **I**.
- **`docs/ascendos-metric-dictionary-audit.md` / `-detail.csv` / `-final-status.csv` /
  `ascendos-final-metric-audit.md` / `ascendos-metric-dictionary-reconciliation.md`** — the
  834-metric audit and its Phase reconciliation. Still the valid evidence base for "which metrics
  are genuinely blocked" — **not rerun here**, referenced as-is.
- **`docs/ascendos-payment-fx-integrity-check.md` / `-impact-query.md`** — still active (the
  backfill remains blocked, not superseded).

---

## Uncommitted Work

Not modified to produce this document. Classified by apparent origin only.

**AscendOS session's own work (this initiative), uncommitted:**
`currency.ts`/`currency.test.ts`, `fx.functions.ts`/`fx.server.ts`/`fx.server.test.ts`,
`use-fx-rates.ts`, `rep-kpi-actuals.ts`/`.test.ts`, `acquisition.test.ts`,
`content-attribution.ts`/`.test.ts`, `vsl.functions.ts`, `weekly-report.server.ts`,
`eod-reports.ts`/`.tsx`/`.test.ts`, routes `attribution.tsx`, `content.tsx`, `dashboard.tsx`,
`leads.tsx`, `live-ticker.tsx`, `traffic.tsx`, `team.tsx`, `closer.tsx`, `copy.tsx`,
`onboarding.tsx`, `webinar-analytics.tsx`, `api/public/{stripe,paypal,fanbasis,wise,whop}.ts`,
`api/public/ingest.$token.ts` (Prettier reformat, Prompt 7), `connections-panel.tsx` (new),
expanded `connectors.functions.ts`, `settings.tsx` (+8 lines, wires `ConnectionsPanel`),
migrations `20260920200000_zapier_connector_registry_row.sql`,
`20260920210000_payment_processor_connector_rows.sql`,
`20260923000000_vsl_metric_snapshots_daily_uniqueness.sql`, `n8n/`, all `docs/ascendos-*.md`/`.csv`
files, `.claude/`.

**Other initiative's work (InsightOS completion-enforcement), uncommitted on top of `44909e45`:**
`activity-module.tsx`, `calls-on-calendar.tsx`, `hub-operating-metrics.tsx`,
`mentee-operations-panel.tsx`, `operational-workflow-panel.tsx`, `speed-to-lead.ts`/`.test.ts`.
**Not inspected in depth or modified** — per instruction, these are treated as belonging to a
different initiative unless proven otherwise, and this reconciliation only needed to know *that*
they exist and *whose* they likely are, not their diff content.

**Ambiguous / generated, no action needed:**
- `content-command-center.tsx` (+4 lines only — small enough that either initiative could own it;
  not attributed).
- `src/integrations/supabase/types.ts` — carries the `// This file is automatically generated. Do
  not edit it directly.` header per `CLAUDE.md`; its diff is a side effect of schema changes
  (either initiative's new migrations), not hand-authored by anyone.
- `src/routeTree.gen.ts` — auto-regenerated by the TanStack Router plugin on every dev/build per
  `CLAUDE.md`; not meaningfully attributable to either initiative.
- `supabase/.temp/` — local Supabase CLI scratch state, not source.

None of the above were changed to produce this document.

---

## Current Recommended Next Task

**Decide whether to commit the accumulated uncommitted AscendOS work.**

Content Signals is resolved and the Connections panel is now browser-verified (rendering and
error-handling confirmed correct; only the live-write round-trip remains untestable in this
sandbox, for environmental reasons, not a code defect). Every other open item in this document is
either already shipped (Main Hub, currency/FX remediation, the Payments page), correctly blocked
on something outside this session's control (historical FX backfill needs data access + approval;
WebinarJam and Meta both need external integration/OAuth work), or correctly deferred by your own
prior instruction (Sales CRM, WebinarJam). There is no remaining technically-ready, undecided,
unblocked implementation task left in this initiative's scope — what's left is a standing-rule
decision only you can make: this session has real, tested, verified work (currency/FX remediation,
payment webhook fixes, the Connections panel, several new migrations) sitting uncommitted. Per
this project's own standing rule, nothing gets committed without an explicit ask — so the next
step is you saying whether to commit it now, not more implementation.

---

No commit/push. No files outside this document were changed.
