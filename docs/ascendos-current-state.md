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
- **HEAD:** `158902c` — "fix: timezone-dependent date handling in schedules, trend buckets, and
  tests" (2026-09-24). Pushed; local and `origin` are in sync. `main` untouched.
- **Working tree:** clean. Only `.claude/` and `supabase/.temp/` remain untracked, both local
  tooling state that is deliberately not committed.
- **Test suite:** 384/384 passing, verified in every timezone from UTC−11 to UTC+14. The
  long-standing 383/384 state is resolved — see "Timezone date handling" below.
- **Known unrelated/concurrent work:** this branch also carries a second, larger implementation
  pass — described in `docs/implementation-status.md` and `docs/claude-code-handoff.md` — that is
  **not part of this AscendOS session's own history**. Its handoff doc references a different
  worktree (`/home/ubuntu/insightos-localhost`) and a different remote Supabase project ref
  (`zyptvdzlayoheqtxcljx`) than the one this session has been checking against
  (`nnfihxlikgfyxalfcddz`), strongly indicating a separate Claude Code session/environment
  working the same branch. Its last commit is `44909e45` (2026-09-03), and it is the origin of
  several files (`lifecycle-events.ts`, `notification-service.ts`, `operating-workflows.ts`,
  `speed-to-lead.ts`, `operational-workflow-panel.tsx`, and others).

  **Correction (2026-09-24):** an earlier revision of this document listed seven of those files
  as carrying *that* initiative's uncommitted edits. That was wrong, and it had a real
  consequence. The **files** originate from `44909e45`, but the uncommitted **diffs** sitting on
  them were this initiative's own metric-dictionary remediation — every one carried a
  `Remediation (metric-dictionary audit, …)` comment citing a specific metric ID. On that bad
  call they were deliberately excluded from commit `3d0807a`, which left ~596 lines of
  remediation — including the Main Hub Top Inbound Setter and Client Health implementations —
  out of `HEAD` while this document claimed they were complete. They were verified against the
  working tree, not `HEAD`. Now committed as `73d0a30`. Lesson worth keeping: **attribute by what
  a diff says, not by which commit created the file.**

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
| Lifecycle event model, notification-service boundary, EOD RBAC (as of commit `44909e45`) | Per `docs/implementation-status.md`; files exist on disk (`lifecycle-events.ts`, `notification-service.ts`) | **B** — real code, genuinely the other initiative's, not independently re-verified here (out of scope to re-audit another initiative's work). Note: `speed-to-lead.ts` and `operational-workflow-panel.tsx` also originate from `44909e45`, but the edits this session found on them were *this* initiative's — see the Correction under Repository State |
| **Content Signals architecture decision** | Resolved — see "Final Content Signals Architecture" below | **A** |
| **Metrics workbook** (`docs/ascendos-metrics-workbook.xlsx`, commit `28b5df3`) | Formatted .xlsx built from the 834-metric CSV: one tab per AscendOS page, grouped by section, yellow input cells as automation placeholders, 31 funnel rates wired as live formulas reading those inputs. Rates only wired where both operands exist as metrics on the same tab — the CSV's formula column describes DB columns, not metric names, so parsing it would have produced formulas silently pointing at wrong rows | **A** |
| **Webinar metrics entry** (commit `5b77d87`) | Manual + CSV entry for `public.webinar_metrics`. The page already read this table in two places; nothing could write to it, which is why its Executive KPI and Closing & Return groups had no data and 54 metrics sat blocked. This is the contract's own §5 degraded path — filling the day-level rollup lights those groups up with **no event-level integration at all**, the way VSL Analytics has always worked. Parsing/coercion is pure and unit-tested (11 tests); absent columns and blank cells stay null because 0 is a real measurement here and null is "not supplied". Header matching prefers exact over substring so `sales` can't be captured by the `upsell_sales` lookup; unrecognized headers are reported, not silently imported as nulls. CSV import shows a live preview of rows/columns matched before committing. `parseCSVLine`/`csvNumber` extracted to `csv.ts` and shared with `vsl.functions.ts` — one quoted-cell parser, not two | **A** |
| **Close CRM mirror** (commit `6aa094a`) | One-way Close → AscendOS lead mirror. Receiver at `/api/public/close` verifying Close's HMAC exactly as their reference implementation does (`signature_key` hex-decoded to bytes, signed string is `close-sig-timestamp` + raw body, hex digest, constant-time compare). Idempotent upsert on `(org_id, source_connector, external_id)` behind a new partial unique index, since Close retries a failed delivery for up to 72h. Connector registry row, requirements entry and Connections card included. Field names taken from Close's API docs, not guessed. **Two deliberate non-mappings:** status is not mirrored (see Product Decisions Required), and a lead `deleted` event does not delete — AscendOS leads are referenced by calls, payments and attribution rows that Close never owned. Both captured in `raw_payloads` | **A** (code); connecting it needs a Close API key |
| **Create/edit webinars** (commit `fe3f162`) | `WebinarFormDialog` — the first and only write path into `public.webinars`. Reachable from a "New" button beside the webinar selector and from the empty state's own action slot (already supported, previously unused — the page told users to "Create a webinar" with no way to do it). Gated on `useResourcePermissions().can_edit`, disabled under dev bypass with an explanation rather than failing on submit. Unblocks `record_webinar_event()`, whose `p_webinar_id` is a hard FK. Verified in both themes | **A** |
| **Timezone date handling** (commit `158902c`) | Three real date bugs, all one root cause: parsing a plain `YYYY-MM-DD` as *local* midnight then emitting it back through `toISOString()`, which shifts the calendar date a day earlier for anyone ahead of UTC. `generatePaymentSchedule` produced every installment due date a day early (feeds schedule items, the overdue calculation, and the recovery queue); `dailySeries`/`priorPeriod` shifted chart bucket keys and prior-period windows the same way on every dashboard. All three now parse and advance in UTC — a due date or bucket key is a calendar date, not an instant — which also removes DST sensitivity from the fixed-86400000ms day arithmetic. See "Timezone date handling" below for the two deliberately local-zone functions that were **not** changed | **A** |
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

### Close CRM status mapping (opened 2026-09-24)

The source-of-truth question is **answered: Close is authoritative, AscendOS mirrors it one-way,
no write-back.** The mirror is built (`6aa094a`) — see "Close CRM mirror" below. One real
decision remains before the mirror can carry lead *status*:

Close's `status_label` is **org-configured free text** — whatever pipeline stages were set up in
that Close account. `public.leads.status` is a fixed enum (`dm_received`, `qualified`,
`call_booked`, `showed`, `closed`, `disqualified`, `follow_up`, `no_show`, `ghosted`, …) and the
entire funnel — show rate, close rate, attribution — is computed from it. There is no defensible
automatic mapping between the two, so the receiver deliberately does not mirror status at all
rather than guess and quietly corrupt every downstream metric.

**What's needed from you:** the list of lead statuses actually configured in your Close account,
and which AscendOS status each corresponds to. With that, the mapping becomes a small config
table and status mirroring can be turned on. Until then every mirrored lead keeps the column
default, and the real Close label stays visible in `raw_payloads`.

Two smaller open questions, neither blocking:

- **Opportunities.** Close's Opportunity object has no clean counterpart in this schema. Captured
  raw, not mapped.
- **Existing AscendOS leads.** Rows created before the mirror have `external_id` null and are not
  linked to any Close lead. Whether to reconcile them is undecided; nothing reconciles them today.

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
| **Close CRM** | **Built** (`6aa094a`) — one-way lead mirror, Close authoritative. **Supersedes the contract's §15 "no external CRM" finding.** Needs a Close API key to create the webhook subscription, then the returned `signature_key` pasted into Settings → Connections. Status mirroring still needs a label mapping — see Product Decisions Required | **D** — connect it when you have the API key |
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

**Update, 2026-09-24: everything in this section is now committed.** `3d0807a`
("fix: currency-mixing remediation, payment FX normalization, connector registry UI", 60 files),
`bc0cecc` (`live-ticker.tsx`, missed in the first commit), `8e738fb` (WebinarJam readiness),
`28b5df3` (metrics workbook), `cc23dfd` (unavailable-state KPI rendering), `73d0a30` (the
seven misattributed remediation files) and `158902c` (timezone date handling). Nothing from this
initiative remains in the working tree — only `.claude/` and `supabase/.temp/`, both local
tooling state. All of it is pushed; local and `origin` are in sync.

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

**WebinarJam readiness — committed `8e738fb`:**
`supabase/migrations/20260924000000_webinarjam_connector_registry_row.sql`,
`src/routes/api/public/webinarjam.ts` (new), further edits to `connectors.functions.ts` and
`connections-panel.tsx`.

**The seven previously-misattributed files — committed `73d0a30`** (see the Correction under
Repository State). All were this initiative's metric-dictionary remediation, not another's:
- `hub-operating-metrics.tsx` — Main Hub **Top Inbound Setter** (ranks by links sent, DM Setter
  role only) and **Client Health** (the real `evaluateTransparentHealth()` scorer already live on
  Payments, replacing the dead `clients.health_score` column nothing writes); MAIN-0042's
  hardcoded "< 4 mins / 82%" replaced with an honest "Not tracked".
- `activity-module.tsx` + `speed-to-lead.ts`/`.test.ts` — Speed-to-Lead SLA on the Targets card
  routed to the canonical `speedToLeadSlaForWindow()` (SALE-0320); call duration/talk time left
  honestly unavailable rather than misattributed to dialers (SALE-0331/0332); DM Source Mix query
  fix (SALE-0308–0313).
- `mentee-operations-panel.tsx` — real `owner_id` uuid + team-member picker replacing the
  `"Owner: <name>"` `next_action` prefix hack, with a parse fallback for historical rows
  (FULF-0681/0682).
- `calls-on-calendar.tsx` — "Open Slots" relabeled to what it actually counts (cancelled
  bookings); no availability data exists to compute real free capacity.
- `operational-workflow-panel.tsx` — funnel stage definition fix (SALE-0302/0350).

`.claude/` and `supabase/.temp/` remain untracked (local tooling state, not source — deliberately
not committed).

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

**Start entering webinar metrics.** It's the only thing here that needs nothing external — no API
key, no client, no approval. Create a webinar, then use "Add metrics" to enter or paste a day's
numbers, and the Executive KPI and Closing & Return groups start reporting immediately.

Everything else is waiting on access or a decision from you.

Every item that could be built without a decision from you has been. A back-to-front review of
the full ChatGPT planning thread (Sep 4 → present) turned up two things never built — the metrics
workbook and the light-mode sweep — both now done; the "create webinar" form, previously
mis-filed as blocked behind WebinarJam, turned out to need nothing from WebinarJam at all and is
now built (`fe3f162`).

What remains, and what each is waiting on:

| Item | Waiting on |
|---|---|
| **Close CRM — connect it** | A Close API key, to create the webhook subscription pointed at the generated URL, then the returned `signature_key` pasted into Settings → Connections |
| **Close CRM — status mirroring** | Your list of Close lead statuses and what each maps to in AscendOS's enum. Everything else about the mirror works without it |
| WebinarJam field mapping | A client account, to send one real webhook so the payload shape can be read instead of guessed. Receiver and the webinar record it attaches to are both built |
| Historical payment FX backfill | Authorized production Supabase access **and** your approval to rewrite historical financial records |
| Meta Ads spend feed | Your decision on whether ad-spend tracking is wanted at all — it needs OAuth infrastructure built first (real, scoped work) |
| Metrics workbook automation | You, to upload `docs/ascendos-metrics-workbook.xlsx` to Google Sheets and point Typeform/Zapier at its input cells |
| Webinar Analytics event-level metrics | Nothing — the aggregate groups work today via manual/CSV entry. Only the per-attendee groups (Audience Retention, During/After-Pitch) still need a real event feed, since they need per-event granularity a daily rollup can't carry |

**Both loose ends previously listed here are now closed (2026-09-24):** the seven misattributed
files are committed as `73d0a30` (see the Correction under Repository State), and the suite's
long-standing failing test is fixed as part of `158902c` (see below). No loose ends remain.

---

## Timezone date handling

The suite's single failing test — `speed-to-lead.test.ts`, "filters event segments by rep,
source, campaign, weekday, and time" — had failed since commit `44909e45` and was assumed to be
the other initiative's problem. Investigating it turned up three genuine production bugs and two
bad tests. Worth recording in full, because the distinction between the two groups is the part
that's easy to get backwards.

**Fixed as bugs — parse-local, emit-UTC (three sites).** All shared one root cause: parsing a
plain `YYYY-MM-DD` as local midnight, then emitting it back through `toISOString()`. In Tokyo,
`new Date("2026-10-01T00:00:00")` is `2026-09-30T15:00Z`, so the date comes back out a day early.

- `generatePaymentSchedule` (`mentee-payments.ts`) — **every installment due date a day early**
  for anyone ahead of UTC. Feeds schedule items, the overdue calculation, and the recovery queue.
- `dailySeries` and `priorPeriod` (`trend.ts`) — chart bucket keys and prior-period comparison
  windows shifted the same way, on every dashboard.

All three now parse and advance in UTC (`T00:00:00Z`, `setUTCMonth`), since a due date or a
bucket key is a calendar date rather than an instant. This also removes DST sensitivity from
their fixed-86400000ms day arithmetic.

**Deliberately NOT changed — genuinely local-zone (two sites).** Both are correct as written, and
both now carry a comment saying so, because the obvious "fix" to each is wrong:

- `filterSpeedEvents` (`speed-to-lead.ts`) uses `getDay()`/`getHours()` because it backs weekday
  and time-of-day dropdowns — a user picking "Tuesday, 5–8pm" means their own working hours.
  Converting it to UTC would silently reinterpret every such filter.
- `daysUntilDate` (`client-risk.ts`) uses local midnight on *both* sides of its subtraction, which
  is the right semantic for "renewal due in 9d" shown to a person.

Their two tests were the defect: both pinned local-zone functions with `"…Z"` literals, which
only land on the intended local date in some zones. That is why the original failure passed at
`44909e45` — that commit's own timestamp is `+0000`, i.e. it was authored in a UTC environment.
Fixtures are now built from local components.

**Verification:** the full suite is run across nine zones spanning UTC−11 to UTC+14
(`Pacific/Midway` → `Pacific/Kiritimati`); 384/384 in all of them. Previously it was green only
near UTC. A single-timezone test run cannot catch this class of bug — worth remembering before
trusting a green suite on date logic.

---

Everything described above is committed and pushed to
`origin/upgrade/localhost-8081-command-center` (`47e7d21..158902c`, 9 commits, 76 files).
`main` is untouched.
