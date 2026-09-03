# InsightOS Priority 3 — Content Taxonomy and Content Signals Normalization

## Scope and safety

Priority 3 from `pasted_content_32.txt` was applied to the existing `upgrade/localhost-8081-command-center` working tree. The existing Webinar Event Pipeline was not rebuilt or modified. No production data, production Supabase, or `main` branch was touched.

The implementation reuses the existing four-mechanism framework and existing Content Signals recommendation engine. It does not create a second recommendation layer or fabricate taxonomy, demand, frequency, answer status, or historical attribution.

## Taxonomy

Added `src/lib/content-taxonomy.ts` as the shared analytical taxonomy contract. It reuses `MECHANISMS`, `MECHANISM_KEYS`, and the existing mechanism-specific variation definitions from `src/lib/content-mechanisms.ts`.

| Dimension | Canonical source | Normalized values | Unknown handling |
|---|---|---|---|
| Funnel stage | Existing `content_pieces.funnel_stage` | `tof`, `mof`, `bof` | `unknown` |
| Mechanism | Existing `content_pieces.mechanism` and `MECHANISMS` | Educational, Credibility, Authoritative, Relatability | `unknown` |
| Variation | Existing `content_pieces.variation` and mechanism variation definitions | Existing mechanism-specific values | `unknown` |
| Platform | Existing `content_pieces.platform` | Existing database platform enum/string values | `unknown` |
| Format | Existing `content_pieces.post_format` | Existing stored format values | `unknown` |

The normalizer accepts common funnel-stage spellings such as `TOF`, `top_of_funnel`, and `bottom_of_funnel`, but does not assign a stage when the source is absent. It likewise leaves unknown mechanism, variation, platform, and format values explicit instead of forcing a classification.

## Signal sources

The existing Content Signals engine now emits a normalized `signals` collection while preserving its existing scoring and recommendation behavior.

| Source | Existing table/field inputs | Normalized output | Honesty rule |
|---|---|---|---|
| FAQ | `faq_videos.title`, `question`, `mechanism`, `clicks`, `plays`, `created_at` where available | Source `FAQ`, raw question/title text, legitimate frequency when clicks/plays exist | Frequency and answer state remain null/unknown when fields are absent |
| Client Onboarding | `onboarding_responses.responses`, `mechanism_signals`, `submitted_at`, `created_at` | Source `Client Onboarding`, raw response text, stored mechanism where present | No synthetic topic, recurrence, or unanswered label |
| Setting Calls | `setter_call_signals.setter_name`, `call_date`, `limiting_beliefs`, `objections`, `mechanism`, `ai_summary`, `notes` | Source `Setting Calls`, source detail, raw objection/belief text, stored mechanism where present | Existing text is preserved; no inferred frequency |
| Content Performance | Existing `content_pieces` plus `content_metrics` and shared performance baselines | Source `Content Performance` in existing drivers | Uses the established performance classifier only |
| Content Coverage | Existing weekly coverage check | Existing weekly check and missing mechanism outputs | No coverage claim when the query fails |
| Platform Performance | Existing content platform and metrics data | Available through taxonomy aggregation and existing performance views | No forced paid/organic or platform outcome attribution |

The user-visible driver labels are now consistently `FAQ`, `Client Onboarding`, `Setting Calls`, and `Content Performance`, while the existing demand mix, scoring weights, and cold-start gating remain intact.

## Aggregations

Added `aggregateContentByTaxonomy(...)` to `src/lib/content-taxonomy.ts`. It supports grouping by any combination of funnel stage, mechanism, variation, platform, and format, including the requested cross-dimension combinations such as funnel-stage plus mechanism and platform plus format.

For legitimate metric fields, each aggregate exposes content pieces, views, reach, interactions, leads, clients, closes, cash cents, and average retention/watch value when a retention metric is present. Missing metrics remain zero for additive counts and zero samples for retention; the UI continues to use established unavailable states where appropriate.

## Content Command Center

Updated `src/routes/_authenticated.content.tsx` to request the existing `content_pieces.post_format` field in the Content Command Center query. Updated `src/components/content-command-center.tsx` to carry `funnel_stage` and `post_format` and added a compact filter row for:

- Funnel stage.
- Mechanism.
- Variation.
- Platform.
- Format.

The filter values are derived from the records actually returned by the query. Selecting filters recalculates the existing KPI, trend, platform distribution, and sorted content views from the filtered records without altering the underlying metric definitions. The existing Sankey, intelligence cards, and visual hierarchy were preserved.

## Tests

Added `src/lib/content-taxonomy.test.ts`, covering:

- Funnel-stage and mechanism normalization.
- Unknown/unclassified handling.
- Cross-dimension aggregation.
- FAQ source labeling and missing-frequency behavior.
- Client Onboarding source labeling.
- Setting Calls source labeling.
- Null output for records with no usable signal text.

Final deterministic test result after the Priority 3 changes: **9 test files, 62 tests passed**. This includes all prior lifecycle, webinar, content-performance, content-mechanism, speed-to-lead, client-risk, and content-signals suites.

## Validation

| Check | Result |
|---|---:|
| Prettier on edited files | Passed |
| Focused ESLint on new taxonomy/test/Command Center files | Passed — 0 errors, 0 warnings |
| TypeScript `tsc --noEmit` | Passed |
| Development build | Passed |
| Full Vitest suite | Passed — 62/62 |
| `git diff --check` | Passed |
| Webinar Event Pipeline | Preserved |
| Production Supabase | Not touched |
| `main` branch | Not merged or modified |

## Browser validation

The authenticated browser navigated to both `/content` and `/content-signals` after the changes. The browser artifact collector returned no interactive elements and no screenshot for either route; the follow-up browser view was unavailable because the connected extension URL could not be accessed by the collector. Consequently, click-level filter testing and visual verification of the Sankey, source badges, recommendation mix, root-cause panel, and coverage panel could not honestly be claimed.

No synthetic records were inserted to force browser output. The code-level route/query/build/test validation passed.

## Remaining gaps

The current repository does not expose a dedicated canonical content-format enum beyond the existing `post_format` field, so the implementation preserves stored values rather than introducing a competing format taxonomy. Historical pieces with missing funnel stage, mechanism, variation, platform, or format remain unknown/unclassified.

FAQ answer status, recurrence over time, rising-question detection, onboarding recurrence, and formal content-gap ranking remain unavailable unless the underlying tables supply timestamps, repeated records, answer status, or structured topic fields. The current implementation retains raw source text and existing scoring but does not infer unsupported attributes.

A complete Content → Webinar → Lead → Call → Close → Cash path is only available when explicit IDs exist in the existing attribution fields. Timing-only joins remain intentionally disabled.

## Files changed for Priority 3

- `src/lib/content-taxonomy.ts`
- `src/lib/content-taxonomy.test.ts`
- `src/lib/content-signals.server.ts`
- `src/components/content-command-center.tsx`
- `src/routes/_authenticated.content.tsx`

The complete implementation standard remains:

> **SOURCE → NORMALIZATION → SERVER LOGIC → AGGREGATION → FILTER → UI → BROWSER**

The browser artifact failure prevents claiming the final browser step as complete, but the source, normalization, server, aggregation, filter, and UI layers are implemented and validated in the working tree.
