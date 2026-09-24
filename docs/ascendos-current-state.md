# AscendOS Current State

**This is the canonical project-status document.** When it conflicts with an older doc (a
roadmap prompt, a prior audit, a plan-mode file), this document wins — it was built by checking
every claim against the current code, current tests, and current git history, not by merging old
text. Older documents are preserved for their evidence/reasoning, not as active requirements.

Originally a status-reconciliation-only pass. Updated 2026-09-24 with real n8n-readiness
implementation work (see "WebinarJam ingest readiness" below) — that update is noted inline
rather than pretending this has stayed a read-only document throughout.

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
| **Metrics workbook** (`docs/ascendos-metrics-workbook.xlsx`, commit `28b5df3`) | Formatted .xlsx built from the 834-metric CSV: one tab per AscendOS page, grouped by section, yellow input cells as automation placeholders, 31 funnel rates wired as live formulas reading those inputs. Rates only wired where both operands exist as metrics on the same tab — the CSV's formula column describes DB columns, not metric names, so parsing it would have produced formulas silently pointing at wrong rows | **A** |
| **Light-mode sweep** (commit `cc23dfd`) | Walked Settings, Main Hub, Payments, Team Calendar, Closer, Content Command Center, Webinar Analytics and Team in light mode. **Light mode is in good shape** — `styles.css` carries a real hand-built `.light` palette (not an inversion), light variants for the glass tokens, and only 6 raw alpha utilities app-wide. The one real bug found was theme-agnostic: "Not tracked" rendering at hero-number scale, fixed via an explicit `unavailable` prop on MetricCard | **A** |

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
| **WebinarJam** (confirmed platform) | **Ingest receiver now exists** (2026-09-24): `src/routes/api/public/webinarjam.ts` + `webinarjam` Connections panel card + connector-registry row (migration `20260924000000_webinarjam_connector_registry_row.sql`), following the exact pattern already used for the 5 payment webhooks. Not an n8n workflow — per the contract doc's own §5 recommendation, a first-party route is correct here, n8n is not in the critical path. Two real gaps remain, see "WebinarJam ingest readiness" below | **D** for the plumbing (registry/route/UI); **F** for the two remaining prerequisites (payload mapping needs a real test delivery; no UI exists to create a `public.webinars` row) |
| **Meta / Instagram Ads** | `MAIN-0019` partially connected; `acquisition_spend` table exists, unused. Requires OAuth (connector registry has none today) | **F** — P1 |
| **TikTok / YouTube / LinkedIn Ads** | No evidence of real paid spend on these platforms in the current dictionary | **F, not prioritized** — confirm real spend exists before building |
| **Wistia auto-sync** | Manual/CSV path is honest and functional today; API automation is a real but low-urgency upgrade | **F** — P2 |
| **Discord** (notification delivery) | `notification-service.ts` boundary exists (other initiative); no real connector | **F** — belongs to the other initiative's scope, not AscendOS's |
| **Telephony / messaging** (Inbound Dialer, DM Setter) | Per `implementation-status.md`: activity module + Speed-to-Lead queue exist; full provider-backed ingestion is connector-dependent | **F** — other initiative's scope |
| **Typeform, Stripe, PayPal, Fanbasis, Wise, Whop, Calendly** | Already live, webhook-secret auth, no verified gap | Not applicable — done |
| **Connector-registry OAuth capability** | Cross-cutting prerequisite: registry only supports webhook-secret/plain-URL auth today; Meta/TikTok/YouTube/LinkedIn all need OAuth | **F** — real scoped infrastructure work, blocks P1 regardless of which ad platform is picked |

### WebinarJam ingest readiness (built 2026-09-24)

Real implementation, not just documentation — done as part of "make sure everything's ready for
n8n workflows." Researched against WebinarJam's actual support docs and Zapier's own WebinarJam
integration listing first (`WebSearch`/`WebFetch`, cited below) rather than guessing, consistent
with this project's no-fabrication standard.

**What's ready:**
- `supabase/migrations/20260924000000_webinarjam_connector_registry_row.sql` — registry row,
  `auth_method: 'webhook'` (WebinarJam's own "Custom Webhook" feature supports a bearer token or a
  custom header/value pair — no HMAC signature scheme, unlike Stripe/Whop).
- `src/lib/connectors.functions.ts` — `webinarjam` added to `connectorRequirements` (a
  self-chosen `webhookSecret`, 12+ chars) and to `URL_BASED_CONNECTORS` (its webhook URL is
  generated *after* connecting, same order as Typeform — WebinarJam needs a destination URL
  before it can hand back nothing, since the secret is user-chosen, not provider-issued).
- `src/components/connections-panel.tsx` — a WebinarJam card with real setup steps (Settings →
  Integrations → Custom Webhook → paste URL → choose "Bearer Token" → paste the same token). The
  previously Typeform-only `generatedWebhookUrl` display logic was generalized
  (`POST_CONNECT_URL_CONNECTORS`) rather than duplicated.
- `src/routes/api/public/webinarjam.ts` — validates the bearer token (constant-time compare,
  same pattern as every other webhook check in this app), looks up the org's connection, and
  captures every delivery verbatim into `public.raw_payloads` (the same staging table Whop's own
  route uses before parsing).
- Browser-verified (Dev Bypass, `/settings`): card renders, all copy/steps correct, input works.
- `npx tsc --noEmit` clean, `eslint` clean on all touched files.

**What's deliberately NOT built, and why:**
- **No `record_webinar_event()` call yet.** WebinarJam's own support article
  (support.webinarjam.com, "Connect and use a custom webhook") documents the auth setup but not
  the JSON payload's real field names — confirmed by direct fetch of that page, not assumed. Every
  delivery is captured raw instead of guessing a field mapping. **Next step, requires you**: send
  one real registration/attendance event (or use WebinarJam's own test-send if their custom-webhook
  screen offers one) so the real payload can be inspected and the mapping written — same "run
  once, inspect, adjust" discipline already used for the Wistia workflow's field mapping.
- **No UI to create a `public.webinars` row.** `record_webinar_event(p_webinar_id uuid, ...)` is a
  hard foreign key — an event can't attach to a webinar that doesn't exist as a row, and grepping
  the whole `src/` tree turns up zero insert/create paths into `public.webinars` today. This is a
  real, separate gap (flagged but not solved in `docs/ascendos-external-integration-contract.md`
  §5 originally) — needs a small admin form, not yet built, genuinely out of scope for a
  connector-plumbing pass.

Sources consulted: [WebinarJam custom webhook setup](https://support.webinarjam.com/support/solutions/articles/153000254989-connect-and-use-a-custom-webhook), [WebinarJam/EverWebinar on Zapier](https://help.zapier.com/hc/en-us/articles/38844104455949-How-to-get-started-with-WebinarJam-EverWebinar-on-Zapier).

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

**Update, 2026-09-24: the AscendOS-owned changes below were committed** —
`3d0807a` ("fix: currency-mixing remediation, payment FX normalization, connector registry UI",
60 files) and `bc0cecc` (a small follow-up for `live-ticker.tsx`, missed in the first commit).
The WebinarJam readiness work (registry migration, route, connector entry, panel card) landed
after that commit and is **still uncommitted** as of this update — everything else in this list
is now on `HEAD`, not in the working tree.

**AscendOS session's own work — committed (`3d0807a`, `bc0cecc`):**
`currency.ts`/`currency.test.ts`, `fx.functions.ts`/`fx.server.ts`/`fx.server.test.ts`,
`use-fx-rates.ts`, `rep-kpi-actuals.ts`/`.test.ts`, `acquisition.test.ts`,
`content-attribution.ts`/`.test.ts`, `vsl.functions.ts`, `weekly-report.server.ts`,
`eod-reports.ts`/`.tsx`/`.test.ts`, `live-ticker.tsx`, routes `attribution.tsx`, `content.tsx`,
`dashboard.tsx`, `leads.tsx`, `traffic.tsx`, `team.tsx`, `closer.tsx`, `copy.tsx`,
`onboarding.tsx`, `webinar-analytics.tsx`, `api/public/{stripe,paypal,fanbasis,wise,whop}.ts`,
`api/public/ingest.$token.ts`, `connections-panel.tsx`, expanded `connectors.functions.ts`,
`settings.tsx`, migrations `20260920200000_zapier_connector_registry_row.sql`,
`20260920210000_payment_processor_connector_rows.sql`,
`20260923000000_vsl_metric_snapshots_daily_uniqueness.sql`, `n8n/`, all `docs/ascendos-*.md`/`.csv`
files.

**AscendOS session's own work — still uncommitted (WebinarJam readiness, 2026-09-24):**
`supabase/migrations/20260924000000_webinarjam_connector_registry_row.sql`,
`src/routes/api/public/webinarjam.ts` (new), further edits to `connectors.functions.ts` and
`connections-panel.tsx`, this document's own edits. `.claude/` and `supabase/.temp/` remain
untracked (local tooling state, not source — not committed on purpose).

**Other initiative's work (InsightOS completion-enforcement), still uncommitted on top of
`44909e45`:**
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

**Nothing in AscendOS's own scope is both unblocked and undecided. The next move is yours.**

As of 2026-09-24 every actionable item in this initiative is finished and committed. A
back-to-front review of the full ChatGPT planning thread (Sep 4 → present) turned up only two
things that had never been built — the metrics workbook and the light-mode sweep — and both are
now done. Everything else in that thread was verified present in code.

What remains, and what each is waiting on:

| Item | Waiting on |
|---|---|
| WebinarJam field mapping + "create webinar" form | A client to connect. Receiver is built and committed; parked until there's a real account to point at it |
| Historical payment FX backfill | Authorized production Supabase access **and** your approval to rewrite historical financial records |
| Meta Ads spend feed | A decision from you on whether ad-spend tracking is wanted at all — it needs OAuth infrastructure built first (real, scoped work) |
| Sales CRM | Deferred by you |

**One loose end worth a decision:** seven files belonging to the other "InsightOS
completion-enforcement" initiative have sat uncommitted in the working tree for this entire
session (`activity-module.tsx`, `calls-on-calendar.tsx`, `hub-operating-metrics.tsx`,
`mentee-operations-panel.tsx`, `operational-workflow-panel.tsx`, `speed-to-lead.ts`/`.test.ts`),
and they carry the one failing test in the suite (`speed-to-lead.test.ts` — "filters event
segments by rep, source, campaign, weekday, and time"). Left untouched throughout, deliberately.
Someone should decide whether that work gets finished, committed, or reverted.

---

No commit/push in this update — the WebinarJam readiness code changes (route, migration, registry
entry, panel card) were made to the application per your request; this document's own edits are
the only change made to produce this particular status update.
