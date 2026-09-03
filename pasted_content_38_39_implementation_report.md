# InsightOS Paired Pass — VSL Analytics and Main Hub Filters

## VSL Analytics implementation

The existing VSL route remains the single source of truth for Main VSL, Webinar VSL, Post-booking Confirmation, Testimonial Videos, and FAQ Videos. No second video storage or analysis system was introduced.

### Post-booking Confirmation

The development VSL fixture now includes a clearly synthetic `post_booking` record. It is rendered through the existing `VslCard`, which is the same shared shell used by Main VSL and Webinar VSL. Consequently, Post-booking uses the existing header/actions, Wistia/video placeholder, KPI cards, sparkline snapshots, AI Analyze action, transcript/script editor, auto-transcribe path, and honest empty/loading states. No unsupported Post-booking metric was invented.

### Testimonial Videos

The development fixture now includes three independent testimonial records under the existing `vsls` model with `kind: "testimonial"`. The route’s Testimonial Videos tab now uses a dedicated FAQ-style collection wrapper:

| Capability | Status |
|---|---|
| Multiple testimonial records | Implemented |
| Arbitrary catalog length | Implemented through array-backed rendering |
| Individual selection | Implemented |
| Switching between testimonials | Implemented |
| Shared individual analytics | Implemented through keyed `VslCard` |
| Independent metrics | Implemented through ID-derived mock snapshots |
| Independent transcript/script state | Implemented through per-video keyed remount and fixture transcript data |
| AI Analyze | Reused existing `VslCard` workflow |
| Add another testimonial | Reused `NewVslButton` with `kind: "testimonial"` |
| Edit/delete | Reused existing VSL actions and shared persistence path |
| No-testimonial empty state | Implemented |

Each selected testimonial is rendered with `key={selected.id}`, forcing the shared card and editor state to reset when switching videos. The fixture transcripts and snapshot values are intentionally different per video, so one testimonial does not display another testimonial’s data.

The real persistence model remains unchanged: testimonials continue to use `vsls` and `vsl_metric_snapshots`, and no separate testimonial table or ingestion system was created.

## Main Hub filter implementation

The Main Hub now has two additive controls in its existing Executive Command Center control area:

| Control | Options |
|---|---|
| Social Platform | All Platforms, Instagram, YouTube, TikTok, X / Twitter, LinkedIn, Facebook, Other, Unknown / Unattributed |
| Acquisition Source | All Sources, Meta Ads, Google Ads, TikTok Ads, Organic, Referral, Direct, Other, Unknown / Unattributed |

Meta Ads is intentionally a separate acquisition selector and is not treated as a social platform. The shared canonical platform taxonomy from `src/lib/social-platform.ts` is reused. The new `src/lib/acquisition-source.ts` helper promotes only explicit acquisition evidence; an Instagram or Facebook record is not automatically treated as Meta Ads.

On the real Main Hub query path, platform and acquisition predicates are applied to lead and call rows before the current period aggregation calculates new leads, booked calls, showed, offers, closes, contract value, and call-level cash. Rows without a defensible platform/source remain unknown. Payments, setter activity, and content metrics do not expose the required row-level dimensions in the current query/model, so when a filter is active those unsupported surfaces are not silently attributed; the existing calculations remain intact for the all-sources state and unsupported filtered values remain honest.

The controls are part of the Main Hub query key, so changing them refetches/recalculates the analytical dataset instead of merely hiding a display row. Combined selections use AND semantics in the shared predicate. Raw values such as `Instagram Spiderweb`, `Keyword`, `Referral`, `Inbound`, `Ads`, and `Other` remain unchanged in source fields.

## Files changed

- `src/routes/_authenticated.vsl.tsx`
- `src/lib/dev-mock-data.ts`
- `src/routes/_authenticated.dashboard.tsx`
- `src/lib/acquisition-source.ts`
- `src/lib/acquisition-source.test.ts`

## Validation

Final validation passed:

| Check | Result |
|---|---:|
| Prettier | Passed |
| Focused ESLint | Passed with 0 errors |
| TypeScript | Passed |
| Development build | Passed |
| Full tests | **15 files, 86 tests passed** |
| `git diff --check` | Passed |

The added filter tests cover explicit Instagram normalization, unknown-source handling, explicit Meta Ads recognition, non-inference of Meta Ads from organic Instagram, AND semantics, and raw-source preservation. Existing VSL and lifecycle test suites remained green.

## Browser validation

The authenticated browser navigated to:

- `/vsl`
- `/dashboard`

Both routes resolved to the InsightOS shell and returned `Loading workspace…`. The screenshot and DOM artifact collector again returned no interactive elements or screenshot, so click-level verification of the VSL tabs, testimonial switching, transcript/AI state, Main Hub selector options, and filter-driven visible metric changes could not honestly be claimed. No destructive action, form submission, deletion, provider connection, or data write was performed.

The implementation is covered by source-level behavior, deterministic fixtures, tests, typecheck, and build validation. Visual browser acceptance remains blocked by the connected browser collector rather than by a reported route exception.

## Safety and preservation

No production data or credentials were used. No real provider was connected. No VSL records were deleted or migrated. No existing metric calculation was intentionally replaced. No duplicate video storage or platform taxonomy was introduced. The existing Content Command Center, Sales dashboards, date controls, attribution fields, and routes were preserved. `main` was not merged or modified.

## Remaining limitation

The current Main Hub’s delegated `HubOperatingMetrics` module owns several Level 2 calculations independently and does not yet accept the new route-level filter state. The top-level Main Hub period query now applies supported filters before aggregation, while delegated Traffic → VSL, Applications, Operating Rates, and Rep Efficiency surfaces preserve their existing behavior until their row-level source dimensions can be added safely. This was left explicit rather than fabricating attribution for unsupported rows.
