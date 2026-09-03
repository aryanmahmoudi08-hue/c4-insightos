# InsightOS Priority 7 — Canonical Social Platform Filtering

## Canonical Platform Taxonomy

The rep dashboards now use one canonical social-platform dimension:

| Dropdown option |
|---|
| Platform: All |
| Instagram |
| YouTube |
| TikTok |
| X / Twitter |
| LinkedIn |
| Facebook |
| Other |
| Unknown / Unattributed |

The canonical options are defined once in `src/lib/social-platform.ts` and reused by the shared ActivityModule and Closer route. Raw lead-source values are no longer used as the prominent platform dropdown options.

## Normalization rules

`normalizeSocialPlatform(rawSource, explicitPlatform)` classifies only defensible platform evidence. An explicit platform field takes precedence when it is itself recognizable; otherwise the raw source is inspected.

| Raw source / explicit value | Canonical platform |
|---|---|
| `Instagram Spiderweb` | Instagram |
| `Instagram Organic` | Instagram |
| Any clearly Instagram-labelled variant | Instagram |
| `YouTube Short` | YouTube |
| Any clearly YouTube-labelled variant | YouTube |
| `TikTok organic` | TikTok |
| Any clearly TikTok-labelled variant | TikTok |
| `Twitter thread`, `X`, `X / Twitter` | X / Twitter |
| Any clearly LinkedIn-labelled variant | LinkedIn |
| Any clearly Facebook-labelled variant | Facebook |
| Exact `Other` | Other |
| `Keyword`, `Referral`, `Ads`, `Inbound`, null, or unrecognized values | Unknown / Unattributed |

The implementation intentionally does **not** map `Ads` to Meta, `Referral` to Instagram, or `Keyword` to YouTube. Unknown values remain unknown.

## Raw source preservation

Raw values remain unchanged in `setter_activity.lead_source` and the existing lead/call attribution fields. The ActivityModule continues to use the existing raw-source selector in the “Log Day” input, while the dashboard filter is explicitly labeled **Platform** and uses canonical values. Detail panels and activity tables continue to display the original raw `lead_source` value for investigation.

The normalization layer derives a comparison value; it does not overwrite, migrate, or backfill historical source fields.

## Dashboard filtering

The filter is applied to the analytical rows before aggregation:

- In the shared ActivityModule, current and prior `setter_activity` rows are filtered by canonical platform before KPI sums, rates, charts, funnel summaries, tables, and leaderboard data are derived.
- In Inbound Dialer, the same canonical value is applied to the Speed to Lead event dataset before bucket and conversion calculations.
- In Closer, current and prior call rows are filtered by canonical platform before booked, showed, offer, close, cash, revenue, rate, chart, table, and follow-up calculations are derived.

The routes covered are:

| Route | Implementation |
|---|---|
| `/dm-setter` | Shared `ActivityModule` canonical Platform filter |
| `/inbound-dialer` | Shared `ActivityModule` canonical Platform filter plus Speed to Lead filtering |
| `/closer` | Native Closer current/prior call filtering with canonical Platform options |

Selecting Instagram combines all defensibly Instagram-attributed sources, rather than treating `Instagram Spiderweb` and `Instagram Organic` as separate platform choices. Selecting YouTube does the same for YouTube sources. Selecting Unknown / Unattributed includes records for which no defensible platform exists.

## Files changed

- `src/lib/social-platform.ts`
- `src/lib/social-platform.test.ts`
- `src/components/activity-module.tsx`
- `src/routes/_authenticated.closer.tsx`

## Tests

Added `src/lib/social-platform.test.ts` with four deterministic tests covering:

1. Instagram, YouTube, TikTok, X/Twitter, LinkedIn, and Facebook normalization.
2. Non-guessing behavior for Ads, Keyword, Referral, and unknown values.
3. Raw-source non-destructive preservation.
4. Grouped filtering for Instagram, YouTube, and Unknown / Unattributed.

Final validation result: **13 test files, 78 tests passed**. Focused ESLint passed with zero errors and two pre-existing Closer hook warnings. TypeScript, development build, formatting, and `git diff --check` passed.

## Browser verification

The authenticated browser navigated to:

- `/dm-setter`
- `/inbound-dialer`
- `/closer`

The routes resolved to the InsightOS shell and reported `Loading workspace…`. The browser screenshot and DOM artifact collector returned no interactive elements or screenshots, so the actual dropdown options and click-level Instagram, YouTube, and Unknown / Unattributed interactions could not honestly be verified in the browser. No forms were submitted and no data was changed.

The code path and deterministic filtering tests provide coverage for the expected behavior, but this report does not claim live browser interaction success where the browser collector did not expose the controls.

## Remaining unknowns

The following values remain Unknown / Unattributed unless a source explicitly identifies a platform:

- `Keyword`.
- `Referral`.
- `Ads`.
- `Inbound`.
- Null or empty source values.
- Any unrecognized legacy source string.

The canonical platform dropdown includes all supported options even when a platform has no attributed records. No synthetic attribution was added to populate a choice. Content’s existing platform and format fields remain separate from raw lead-source normalization.

## Safety and compatibility

No production data was touched. No records were rewritten. No incompatible enum or duplicate taxonomy was created. `main` was not merged or modified. The existing attribution chain remains nullable and non-destructive: **Platform → Source → Campaign → Content → Format → Webinar → Lead → Rep → Call → Close → Cash**.
