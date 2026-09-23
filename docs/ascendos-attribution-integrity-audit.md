# AscendOS — Attribution Integrity Audit

Research/audit document (Prompt 8). Full lifecycle trace of the 5 real attribution models
(`first_touch`, `lead_source`, `booking_source`, `last_touch`, `assisted_touch`) across every page
that renders them — the shared engine (`src/lib/acquisition.ts`), the model-building layer
(`src/lib/content-attribution.ts`), and all 3 independent query sites (Main Hub, Attribution
Command Center, Content Command Center). No code changes, no commit/push.

**Scope note**: only Wistia's VSL-stats feed shipped in Prompt 7 (P0 Webinar and P1 Ad Spend are
still blocked on decisions/work outside this session's control — see that phase's notes). Neither
feeds the attribution engine, so "post-integration" doesn't currently change anything about the
5 models' correctness — this audit evaluates the system as it stands today, which is also exactly
what it needs to hold up once real webinar/ad-spend data does start flowing through it.

## Method

Traced each of the 5 models from its query source through `buildAttributionPathsForModel()`
(`content-attribution.ts:52-208`) and `evaluateAttributionEvidence()`
(`acquisition.ts:173-215`), then out to every page that renders the result: `attribution.tsx`
(Attribution Command Center), `dashboard.tsx` (Main Hub Level 3), and `content.tsx` +
`content-command-center.tsx` (ContentOS canonical table). Cross-checked the three independent
query sites against each other for scoping/labeling consistency, and read the real test coverage
(`content-attribution.test.ts`, 14 tests; `acquisition.test.ts`, 8 tests) rather than assuming it
exists.

## What holds up (verified, not assumed)

1. **Evidence grading is internally consistent across all 5 models.** `assisted_touch` is
   hard-coded `inferred: true` → always `coverage: "inferred"` / `strength: "low"`, never
   promotable to direct credit — verified in the grading function itself, not just the doc
   comment above it. The 4 direct models require ≥2 real supporting events to earn `"direct"`
   coverage, and `"high"` strength additionally requires ≥3 known touchpoints — for
   `first_touch`/`last_touch` this correctly means strength scales with how many real touches a
   lead actually had, not a fixed grade.
2. **No double-counting on the 4 direct models, real multi-credit on the 5th, both by design and
   verified in tests.** The dedup key (`personKey:outcomeKey:paymentId:callId`) collapses to one
   path per call for `first_touch`/`last_touch`/`lead_source`/`booking_source`; `assisted_touch`
   deliberately uses a finer `(person, outcome, content)` key so one call's cash can legitimately
   appear against several assisting content pieces — and every place that renders it says so
   explicitly ("assisted credit — always inferred, never direct" in
   `content-command-center.tsx:720-721`; "assisted credit, not direct revenue credit" in the Main
   Hub KPI subtitle, `dashboard.tsx:2162`). `content-attribution.test.ts:114` specifically asserts
   a direct model's aggregate cash "never exceeds the real total cash of the calls it draws from."
3. **The 3 independent query sites (Main Hub, Attribution Command Center, ContentOS) use identical
   scoping** — `leads.created_at` and `calls.created_at` both bounded to the same selected date
   range, in all three. This was worth checking specifically (a mismatch here is exactly the kind
   of bug the Payments-page audit found for "Total Contracted" vs. "Contracted LTV") — it isn't
   present here; all three genuinely agree.
4. **A real edge case was checked and found already handled, not silently broken**: a call that
   closes inside the selected window but whose lead was created before it gets excluded from every
   attribution model (the lead row simply isn't in that query's result set), but this is not a
   silent undercount — `attribution.tsx`'s `totalCashCents` is computed independently of the
   lead-join (straight from `closedRows`, which is only scoped by `calls.created_at`), so the gap
   correctly lands in the honestly-labeled "Unattributed Cash" KPI (`attribution.tsx:432`,
   `totalCashCents - attributedCashCents`) rather than vanishing.
5. ~~No currency-mixing risk in any of this.~~ **Correction (found during Prompt 13, 2026-09-23):
   this was wrong.** The claim below was based on reading only `calls`' original `CREATE TABLE`
   statement and missing a later migration. See finding E.
6. **Cross-page model selection actually carries over, not just cosmetically.** Main Hub's
   attribution-model dropdown links to Attribution Command Center via
   `search={{ model: attributionModel }}` (`dashboard.tsx:2167`), and Attribution Command Center
   seeds its own state from that same search param on load (`attribution.tsx:126-128`) — confirmed
   wired, not merely intended.
7. **One shared evidence UI, not two.** Both Attribution Command Center's detailed-records table
   and Content Command Center's canonical table open the *same* `AttributionEvidencePanel`
   component for full evidence (coverage/strength/touchpoints/sample warning) — a deliberate reuse
   noted in `attribution.tsx:972-977`'s own comment, confirmed real by grep, not just claimed.
8. **Real test coverage, not just real code**: all 5 models have a dedicated test; the
   bookingId-always-real/paymentId-always-null guarantee from Phase 2 has 2 dedicated tests; the
   never-exceeds-total invariant for direct models and the intentional-spread invariant for
   `assisted_touch` are both explicitly tested, not just asserted in comments.

## Real gaps found

### A. Attribution's cash source is closer-entered, not the verified payments ledger — and this isn't cross-referenced anywhere

Every attribution page's cash figures come from `calls.cash_collected_cents`/
`contract_value_cents` — numbers a closer manually enters when logging a call
(`_authenticated.closer.tsx`'s "Log a sales call" dialog) — not from `public.payments` (the
processor-verified ledger the Payments page uses for its own totals). This isn't an oversight
attribution could easily fix: it's the same root cause tracked since Phase 1/4/5/6 —
`payments.call_id` is never set by any processor webhook, so there is no deterministic way to sum
*verified* payments per call today. Attribution has no choice but to use the manually-entered
number.

**What this means in practice**: Attribution Command Center's "Cash Collected" KPI and the
Payments page's "Total Collected" KPI can legitimately disagree (a closer's manual entry vs. a
processor-verified sum), and nothing on either page tells a user that or explains why. Each page's
own arithmetic is internally correct (verified above) — this is a cross-page trust gap, not a
within-page bug. It resolves automatically, for free, whenever the `payments.call_id` join gets
fixed (already flagged as "the highest-leverage remaining internal fix" in the Phase 4
reconciliation report) — no separate attribution-side fix is needed once that lands.

### B. `leads.first_touch_content_id` has no write path anywhere in the app — confirmed dead, but confirmed *not* used by the real `first_touch` model

Grepped every `.ts`/`.tsx` file and every migration in the repo: `leads.first_touch_content_id` is
**read** in `dispatch.functions.ts` (auto-dispatch content routing, as a fallback after
`source_content_id`), `traffic-hierarchy.ts` (same fallback pattern), and `content.tsx` (an
`attribution.attributed` lead count) — and **written nowhere**. In a live (non-seeded) workspace
this column is always `null`, so every `source_content_id ?? first_touch_content_id` fallback in
this app is functionally always just `source_content_id` — a safe no-op, not a crash or wrong
value, but dead code that looks like a real fallback and isn't.

**The good news, specifically for this audit's scope**: the actual `first_touch` *attribution
model* (`content-attribution.ts:129-157`) does **not** use this column at all — it independently
and correctly computes first touch from the earliest real row in `lead_content_touches`. So this
dead column does not compromise any of the 5 models' correctness. It's a confirmed, separate, real
finding — not an attribution-engine defect.

**One concrete, if low-stakes, consequence**: `content.tsx:556` computes
`attribution.attributed: leadRows.filter((lead) => lead.first_touch_content_id).length` — since
the column is always null, this value is always (or near-always) `0` in a live workspace. Checked
whether this misleadingly renders anywhere: it does not — grepped every use of
`.attribution.attributed` in `content.tsx` and found zero render call sites. It's computed and
discarded, not a visible broken metric. Worth cleaning up, but not urgent, and not something this
research-only prompt applies a fix for.

### C. "Unattributed Cash" is one undifferentiated bucket

`attribution.tsx`'s "Unattributed Cash" KPI is honest (never claims a specific cause it hasn't
verified — see item 4 above) but also undifferentiated: a call with no `source_content_id` at all,
a call whose lead falls outside the selected window, and a call whose only journey is
assisted-not-direct under the current model all land in the same number. A user asking "why is $X
unattributed" has no drill-down today. Not a defect — flagged as a real, minor product gap, same
spirit as the rest of this remediation's "flag, don't silently fix" convention.

### E. Correction to this document: `calls`/`setter_activity` DO have a real currency-mixing risk, and Attribution Command Center has the bug

Found and fixed while building the Weekly Report final upgrade (Prompt 13), which reuses the same
`calls`/`setter_activity` cash fields: this document's original item 5 claimed `public.calls` "has
no currency column at all," checked only against the table's base `CREATE TABLE` statement. A
later migration, `20260912090000_eod_original_currency.sql`, adds a real `original_currency`
column to **both** `calls` and `setter_activity` — exactly the same columns `attribution.tsx`
sums raw at lines 417/431/439 (`totalCashCents`, `attributedCashCents`,
`cashByAcquisitionSource`), with no `original_currency` even in its `calls` select list
(`attribution.tsx:214`) and no `sumNormalizedCents()` call anywhere in the file. This is a real,
previously-uncaught instance of the exact currency-mixing bug Phase 1 already fixed on the Closer/
DM Setter/Inbound Dialer dashboards (`_authenticated.closer.tsx`, via `sumNormalizedCents()` +
`collectFxPairs()`) — Attribution Command Center was simply never covered by that fix. **Not
corrected here** — this document's own scope is attribution-model integrity, not a code-change
pass; Prompt 13 fixed the same bug where it lives (Weekly Report) and flags this sibling instance
for its own follow-up rather than reaching into this page's file silently.

## Bottom line

The 5-model attribution engine itself is sound: consistent grading, no unintended double-counting,
consistent scoping across every page that queries it, a real and checked edge case that turns out
to be already handled honestly, and meaningful test coverage backing all of it. The gaps found are
mostly already-known-shaped problems from earlier phases wearing a new hat — (A) is the same
`payments.call_id` gap surfacing here as a cross-page cash-source mismatch, (B) is dead schema
(like `ingestion_jobs`/`acquisition_spend` before them) that happens to sit adjacent to attribution
without actually compromising it, and (E) is a real currency-mixing bug this document originally
missed, corrected above and cross-referenced to Prompt 13 where the same bug got fixed for Weekly
Report. None of this blocks moving forward; all of it is recorded for
whenever their respective root causes get addressed.

No code changes. No commit/push.
