# InsightOS Priority 8 — Synthetic Webinar Analytics Workspace

## Mock webinars created

The development-only Webinar Analytics path now uses a deterministic fixture from `src/lib/webinar-mock-data.ts` when `devBypass` is active. It does not write to Supabase, does not query a real organization, and is time-stable because the fixture uses a fixed development base timestamp.

| Fixture | Name | Profile | Explicit demo marking |
|---|---|---|---|
| Webinar A | The $10K/Month Growth System · MOCK / DEMO | High registration volume, weaker downstream conversion | `source: "mock"`, metadata `{ demo: true }` |
| Webinar B | How We Generate Qualified Leads Every Week · MOCK / DEMO | Stronger attendance and closing profile | `source: "mock"`, metadata `{ demo: true }` |
| Webinar C | The Client Acquisition Masterclass · MOCK / DEMO | Strong engagement, weaker sales profile | `source: "mock"`, metadata `{ demo: true }` |

Webinar A is selected by default in development bypass mode. Webinar B is the default comparison selection in development bypass mode. In normal authenticated production/staging mode, the previous behavior remains: the route starts with no webinar selected and uses real Supabase data.

## Event-backed mock counts

The counts below are derived from the generated `webinar_events`-shaped records through the existing `webinarEventCounts` and `aggregateWebinarMetrics` functions. No dashboard number is hardcoded in the UI.

| Webinar | Registrations | Live attendees | Pitch | Applications | Booked calls | Shows | Closes | Deposits | Sales |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A | 120 | 75 | 55 | 18 | 15 | 11 | 4 | 6 | 4 |
| B | 150 | 110 | 70 | 30 | 26 | 22 | 10 | 18 | 10 |
| C | 80 | 60 | 35 | 14 | 12 | 8 | 3 | 7 | 3 |

All event timestamps are deterministic and intentionally ordered across registration, live attendance, pitch, engagement, application, booking, show, offer, close, deposit, sale, replay, and exit milestones. Live attendance never exceeds registration, pitch never exceeds live attendance, shows never exceed booked calls, and closes never exceed booked calls.

## Acquisition and financial mock data

Each fixture has two `acquisition_spend`-shaped records with explicit webinar, content, platform, campaign, source type, provider, currency, spend date, impressions, clicks, and paid-visit fields. The provider is `mock-demo`, campaigns are visibly marked `MOCK / DEMO`, and metadata includes `{ demo: true, source: "mock" }`.

| Webinar | Spend | Impressions | Clicks | Paid visits | Platforms | Remarketing distinction |
|---|---:|---:|---:|---:|---|---|
| A | $2,800 | 285,000 | 7,800 | 6,150 | Instagram, YouTube | Final source row marked separately |
| B | $3,350 | 380,000 | 12,000 | 9,800 | YouTube, TikTok | Final source row marked separately |
| C | $2,000 | 205,000 | 8,000 | 6,150 | TikTok, X / Twitter | Final source row marked separately |

The existing `calculateAcquisitionMetrics` helper receives these spend records and the actual event-backed paid-lead, customer, and revenue outputs. It calculates CTR, CPC, CPL, CPA, and ROAS from the records rather than hardcoded display values. Currency is preserved as USD and no currency conversion is performed.

## Content and platform attribution

The fixture preserves explicit IDs rather than timing-based joins:

- Webinar A uses content ID `00000000-0000-4000-8000-000000000101`, Instagram and YouTube campaign records, and explicit campaign IDs.
- Webinar B uses content ID `00000000-0000-4000-8000-000000000102`, YouTube and TikTok campaign records, and explicit campaign IDs.
- Webinar C uses content ID `00000000-0000-4000-8000-000000000103`, TikTok and X / Twitter campaign records, and explicit campaign IDs.

Registration and downstream events carry the same explicit webinar, content, campaign, platform, format, and synthetic lead identifiers. No real content, lead, call, payment, account, or provider record is used. The existing Content Command Center was not redesigned or seeded with Supabase rows; its route remains intact, and the mock relationship is available through the canonical event fixture for future UI drilldown work.

## UI behavior

When `devBypass` is active, `/webinar-analytics` now receives:

> **Mock fixture → existing query-shaped data → existing event aggregation → existing retention calculation → existing acquisition calculations → existing UI components**

The page should therefore show the populated executive KPI layer, master funnel, audience retention, acquisition efficiency section, closing and return panel, and Webinar A/B comparison. Changing the webinar selector changes the selected metrics, event stream, retention curve, acquisition spend, and revenue profile. Changing the comparison selector changes the comparison dataset.

The production path is not changed: real Webinar Analytics still queries `webinars`, `webinar_metrics`, `webinar_events`, and `acquisition_spend` from Supabase when dev bypass is false.

## Tests

Added `src/lib/webinar-mock-data.test.ts` with five deterministic fixture tests covering:

1. Three independent synthetic webinars and explicit demo marking.
2. Registration, attendance, pitch, application, booking, show, and close consistency.
3. Retention generation from actual event timestamps with different webinar profiles.
4. Acquisition calculations using mock spend records and actual mock revenue/customer denominators.
5. Explicit platform, campaign, content, and webinar ID preservation.

Final validation result: **14 test files, 83 tests passed**. Focused ESLint, TypeScript, development build, formatting, and `git diff --check` passed.

## Browser validation

The authenticated development browser navigated to:

- `/webinar-analytics`
- `/content`

Both routes resolved to the InsightOS shell and returned `Loading workspace…`. The browser screenshot and DOM artifact collector returned no interactive elements or screenshots, so the actual selected Webinar A state, KPI population, retention rendering, acquisition cards, comparison selection, date-range interaction, and Content Command Center mock relationship could not honestly be verified through click-level browser evidence. No form was submitted and no data was written.

The fixture integrity tests and route build validation passed, but this report does not claim visual browser acceptance where the browser collector failed to expose the rendered workspace.

## Safety confirmations

| Requirement | Status |
|---|---|
| Real client data | Not used |
| Real webinar provider | Not connected |
| Real leads, calls, payments, campaigns, or ad accounts | Not used |
| Production database | Not touched |
| Production credentials | Not used |
| External provider activation | Not performed |
| Separate application/database | Not created |
| `main` branch | Not merged or modified |
| Canonical production data model | Not changed for demo records |

## Files changed

- `src/lib/webinar-mock-data.ts`
- `src/lib/webinar-mock-data.test.ts`
- `src/routes/_authenticated.webinar-analytics.tsx`

The mock layer is development-only and source-controlled. It is not a database seed, does not alter production schemas, and is intentionally isolated from real Supabase query execution.
