# AscendOS — Final 834-Metric Production Audit

Research/synthesis document (Prompt 9). Final status for every metric in the original 834-metric
dictionary, and a consolidated defect list — no fixes applied, no code touched, no commit/push.

## Method

This is a **synthesis, not a re-audit** — per the standing rule for this remediation, the 834
metrics were not walked one-by-one again. Every metric explicitly touched by a remediation phase
(Phase 1, Phase 2, Phase 2b, Phase 4's own reconciliation) has its final status verified against
`docs/ascendos-metric-dictionary-audit-detail.csv`'s original row, cross-checked line-by-line
against the Phase 4 reconciliation report's own claims. **Every other metric (763 of 834) carries
forward its original Phase-0 classification unchanged** — nothing about them was touched by any
phase, so nothing about their status is asserted to have changed.

A derived, additive artifact — `docs/ascendos-metric-dictionary-final-status.csv` — was generated
from this pass: every one of the 834 original rows, plus `FinalStatus`/`ChangeType`/`Phase`/`Note`
columns. **The original audit CSV was not modified** — this is a new file alongside it, same
convention as every other report in this remediation (nothing gets applied to the real workbook
without an explicit go-ahead, which hasn't been given).

## A correction found while assembling this

Reconciling the Phase 4 report's own itemized lists against its own summary counts turned up a
real, repeated discrepancy: **the reconciliation report undercounted itself** by conflating "table
rows/bullet groups" with "individual metric IDs" in three places:

| Section | Stated count | Actual distinct metric IDs (verified against the CSV) |
|---|---:|---:|
| §1 (moved to LIVE) | "9 metrics" | **15** — `SALE-0308–0313` is 6 IDs in one bullet, not 1 |
| §2 (correctness fix, no status change) | "~20 metrics" | **37** — `CONT-0453–0461` alone is 9 IDs in one bullet |
| §7 (workbook metadata-only) | "7 corrections" | **10** — `OPSW-0751/0752/0753` and `FULF-0728/0729/0737` are each 3 IDs in one row |

None of the underlying findings were wrong — every individual metric ID and its real code citation
checks out (verified below, arithmetic confirmed against the live CSV). Only the summary counts
were off, from writing "9 rows in this table" where the true unit of counting should have been
"metric IDs." This document uses the corrected, itemized counts throughout.

**Corrected total touched by remediation: 71 individual metric IDs** (not ~54 as stated in Phase
4's own intro) — verified as 71 distinct, non-overlapping IDs, all confirmed present in the
original 834-row CSV.

## Final status distribution (all 834, verified arithmetic)

| Status | Original (Phase 0) | Final | Change |
|---|---:|---:|---:|
| `LIVE` | 690 | **705** | +15 |
| `NEEDS INTEGRATION` | 61 | **54** | −7 |
| `PARTIALLY CONNECTED` | 49 | **44** | −5 |
| `NOT AVAILABLE` | 23 | **14** | −9 |
| `PLACEHOLDER` | 11 | **8** | −3 |
| `NEEDS SCHEMA/JOIN FIX` | 0 | **7** | +7 (new category, Phase 4) |
| `BLOCKED` | 0 | **2** | +2 (new category, Phase 2/4) |
| **Total** | **834** | **834** | — |

Every row of the movement is individually traceable to a real code change or a real, cited
investigation finding — none of it is asserted without a specific source. The full per-metric
trace is in `docs/ascendos-metric-dictionary-final-status.csv`; the highlights:

- **15 metrics moved to `LIVE`**: `MAIN-0045`, `MAIN-0047`, `SALE-0302`, `SALE-0350`,
  `SALE-0308`–`0313` (6), `SALE-0320`, `SALE-0394`, `FULF-0681`, `FULF-0682`, `CONT-0449`. One
  caveat carried forward: `SALE-0394` (Payment Plan Uptake) is `LIVE` for new records only —
  historical calls logged before the fix have no way to be backfilled honestly.
- **7 metrics reclassified `NOT AVAILABLE`/`UNDEFINED` → `NEEDS SCHEMA/JOIN FIX`**:
  `SALE-0395`–`0400` + `CONT-0451`, all sharing one root cause (`payments.call_id` never set by
  any processor webhook) — see Defect List item 1.
- **2 metrics reclassified `PARTIALLY CONNECTED` → `BLOCKED`**: `SALE-0331`/`SALE-0332`
  (Inbound Dialer call duration) — `crm_call_sessions` confirmed to have no `talk_seconds` column
  and no rep-identity column at all; needs new schema + a Twilio payload change, not a join fix.
- **37 metrics kept their `LIVE` status but had a real correctness fix applied** (currency
  normalization, closer-identity write path, Closes-predicate canonicalization, Team Snapshot
  source reconciliation, ContentOS date-range wiring, Onboarding relabeling, CopyOS drift warning)
  — the number didn't newly appear, it became trustworthy. Two of these (`OPSW-0746`, `OPSW-0754`)
  are a partial exception: the fix (unifying two disagreeing spend sources into one) was applied,
  but the metrics themselves are **still `NEEDS INTEGRATION`**, not promoted — they were never
  `LIVE` to begin with, despite sitting in the "no status change" section of the Phase 4 report.
  This document corrects that placement; the CSV's `FinalStatus` for both is `NEEDS INTEGRATION`.
- **10 metrics had only their workbook Unit/Classification metadata corrected** — the app's own
  code was already right; the workbook's stated Unit (e.g. `%` vs `x`) or Classification (`RAW`
  vs `DERIVED`) was wrong. No status change, no code change.

## One build shipped since the last status pass, not yet reflected as a status change

Prompt 7 (n8n implementation) shipped real, working (uncommitted) code — a new
`vsl_metric_snapshot` ingest path and an importable n8n workflow — for `FULF-0726`/`FULF-0735`
(VSL Analytics, Wistia). **Their status stays `PARTIALLY CONNECTED`** in this document: the
automation exists in the repo but has not been activated (needs a real Wistia API credential in
n8n, a real video-ID list, a real ingest URL, and an actual run) — no real snapshot has been
written through it yet. Noted in the CSV (`Note` column) as "code shipped, pending activation" so
the next pass doesn't have to rediscover this.

## Consolidated defect list (every real, still-open issue across the full roadmap)

Everything below is already documented in its originating report; this is the single
cross-referenced list Prompt 9 asks for, not new investigation.

1. **`payments.call_id` is never set by any processor webhook** (Stripe/PayPal/Fanbasis/Wise/
   Whop) — blocks 7 metrics (`SALE-0395`–`0400`, `CONT-0451`, `NEEDS SCHEMA/JOIN FIX`). Flagged
   since Phase 1 as "the single highest-leverage remaining internal fix" — one join resolution
   unblocks all 7 at once. Needs a checkout-flow metadata passthrough or a manual reconciliation
   UI — a real engineering decision, correctly never silently picked by any phase so far.
2. **`crm_call_sessions` has no `talk_seconds` column and no rep-identity column** — blocks
   `SALE-0331`/`SALE-0332` (`BLOCKED`). Needs new schema plus a Twilio payload change.
3. **54 Webinar Analytics metrics (`OPSW-0738`–`0797`, minus the 2 unified-spend-source fixes
   above) remain `NEEDS INTEGRATION`** — zero write paths into `webinars`/`webinar_events`/
   `webinar_metrics` exist. Fully spec'd (Prompt 5/6); not built (Prompt 7 needs the user to name
   a real webinar platform first).
4. **Ad Platform Spend Feed (Meta/TikTok/YouTube/LinkedIn) blocked on missing OAuth support** in
   `connectors.functions.ts` — real architectural prerequisite, not provider-specific, affects
   `MAIN-0019` and the acquisition-efficiency subset of the Webinar Analytics group.
5. **`connector_registry` advertises `instagram`/`tiktok`/`youtube`/`meta_ads` as connectable
   (`is_available=true`) with zero matching `connectorRequirements` schema** — a live dead end in
   the Connections UI today (Prompt 6 finding). Not tied to a specific metric ID; a product-UX
   defect.
6. **`vsl_metric_snapshots` had no unique index** — fixed in Prompt 7
   (`20260923000000_vsl_metric_snapshots_daily_uniqueness.sql`, partial index on
   `(vsl_id, captured_at::date) WHERE source='api'`). Resolved, listed here only for the audit
   trail.
7. **Attribution's cash figures are closer-manual-entry, not the verified payments ledger**
   (Prompt 8 finding A) — same root cause as item 1; resolves for free once that join is fixed.
   Not tied to a specific metric ID; a cross-page trust gap between Attribution Command Center/
   Main Hub/ContentOS and the Payments page.
8. **`leads.first_touch_content_id` has no write path anywhere in the app** (Prompt 8 finding B)
   — always null in a live workspace; two dead fallback reads, one unrendered computed value.
   Confirmed **not** to affect any of the 5 real attribution models. Low-stakes cleanup, not
   blocking.
9. **22 metrics remain honestly `NOT AVAILABLE` (14) or `PLACEHOLDER` (8)**, unchanged by any
   phase — full list and original citations in `docs/ascendos-metric-dictionary-audit-detail.csv`
   (`StatusNorm` column). Not re-enumerated here since none of them were touched or re-verified
   by any remediation phase; re-deriving them would be exactly the re-audit this process is
   designed to avoid unless explicitly asked for.

## What's still true from Phase 4, unchanged

Product-definition decisions: **none remaining** — the only two the original audit flagged
(`MAIN-0045`, `MAIN-0047`) were resolved in Phase 2b and are `LIVE` above. Workbook file: **still
not modified** — the specific cell-level changes both this document and the Phase 4 report
describe remain awaiting an explicit go-ahead.

No code changes. No commit/push.
