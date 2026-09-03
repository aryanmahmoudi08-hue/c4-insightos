# InsightOS Technical Gap Audit

**Scope.** This audit evaluates the current working tree against the complete InsightOS expansion specification and deliberately makes no speculative code or schema changes. The repository was inspected for routes, Supabase migrations, query sources, server functions, VSL systems, webinar systems, content analytics, signals, attribution, financial data, campaigns, and response timestamps.

> **Conclusion:** The current branch has substantial UI and analytics foundations, but several requirements are only partially connected because the repository lacks event-level source data. The correct next action is to connect source systems and capture missing events, not to add more placeholder analytics.

## A. Complete Requirement Matrix

| Requirement | Current Status | Existing Source | Can Complete Now? | Missing Data/Event | External Integration Needed? | Exact Next Step |
|---|---|---|---|---|---|---|
| Main VSL | Implemented | Existing VSL route and VSL data functions in `src/routes/_authenticated.vsl.tsx` and `src/lib/vsl.functions.ts` | Yes, for current data | None for current feature set | No | Keep; validate visual family with other VSL tabs |
| Webinar VSL | Implemented as VSL kind/tab | Existing VSL kind system | Yes | Webinar-specific event linkage is separate | Webinar provider only if attendance/event telemetry is required | Keep the existing VSL family and connect webinar IDs when available |
| Post-booking Confirmation | Existing but visual consistency is partial | Existing post-booking route/component | UI-only completion is possible | None for styling; source linkage is separate | No for styling | Apply shared VSL layout tokens/components and browser-verify |
| Testimonial Videos | Implemented | Added `testimonial` kind to existing VSL system | Yes | None for basic VSL workflow | No | Keep; visually align with Main/Webinar/Post-booking/FAQ |
| FAQ Videos | Existing FAQ/VSL data path | FAQ video records and Content Signals query | Yes for click/play/watch analytics | Structured question text and dates may be incomplete by record | No for existing records | Normalize question/objection fields where present; do not infer missing history |
| Webinar awareness: paid visits, CPC, CTR, investment | Partial/unavailable | `webinar_metrics` supports metric fields; no verified ad-spend source found | Only where metric rows already contain values | Attributable spend, impressions, clicks, paid visits | Meta Ads, Google Ads, TikTok Ads, or manual spend ingestion | Connect one approved advertising source or create a governed manual spend import |
| Webinar capture: conversion, paid/organic leads, CPL | Partial | `webinar_metrics` and aggregation utility | Yes where rows contain paid/organic/leads/spend | Historical source attribution and paid capture visits | Advertising/traffic provider if missing | Populate `webinar_metrics` from approved source; retain unavailable states otherwise |
| Webinar groups/email: group conversion, open rate, CTOR | Missing/partial | No confirmed event-level email/group tables in current tree | No, unless existing connector data is mapped | Group membership, send, delivery, open, click, CTOR events | Email provider such as Gmail/Resend/Mailchimp/etc. | Select provider and ingest message/campaign events keyed to webinar/lead |
| Webinar attendance and notifications | Partial | `webinars`, `webinar_events`, `webinar_metrics`; retention utility exists | Yes when events exist | Registration, live, pitch, SMS/API/call notification events | Webinar provider and Twilio/SMS provider where applicable | Ingest provider attendance and notification events into `webinar_events` |
| Webinar sales setting | Partial | `webinar_metrics` supports deposits/pitch conversion | Yes where metric rows contain values | Lead-list linkage, remarketing spend | Ads/CRM/payment source as applicable | Link lead/call IDs to webinar registration and setting outcomes |
| Webinar closing and financials | Partial | Existing payments/cash fields in activity/client/payment paths; webinar metric fields support refunds/bumps/upsells | Only where attributable rows exist | Webinar-to-order linkage, refund/order-bump/upsell event identity | Payment processor/CRM if current records do not carry webinar ID | Reuse existing financial ledger and add nullable webinar attribution to future orders |
| Webinar ROAS | Honest unavailable unless both sides exist | `aggregateWebinarMetrics` calculates only from attributable revenue and spend | Yes for rows with both values | Attributable ad spend | Advertising provider or governed spend import | Connect spend source; never substitute zero or synthetic spend |
| Webinar comparison | Implemented | Independent Webinar A/B metric queries and aggregation | Yes | None for UI; data changes only when independent rows exist | No | Browser-test both selectors and date-range behavior with two real webinars |
| Webinar retention | Implemented with honest empty state | `webinar_events` and `retentionCurve` | Yes when events exist | Event-level registration/live/pitch timestamps | Webinar provider if events are not in InsightOS | Ingest provider events; preserve chart and no-data state |
| Content TOF/MOF/BOF | Foundation implemented | `content_pieces.funnel_stage`, content form, migration/index | Yes | Historical rows may be null | No | Use nullable values; do not backfill historical stage without evidence |
| Four content pillars | Existing mechanism system | `src/lib/content-mechanisms.ts`, Content Signals prompt/data | Yes for existing tagged/derived rows | Semantically reliable tags for old untagged content | No | Keep canonical four-pillar enum and expose filters/aggregation |
| Variations | Partial | Content piece mechanism/variation fields where present | Yes for populated records | Variation field completeness | No | Add controlled variation selector and preserve nulls |
| Platform and format | Partial | Content fields, `traffic_sources`, activity lead source, VSL kinds | Yes for populated records | Canonical cross-table dimension mapping | Instagram/YouTube/TikTok APIs only for richer platform telemetry | Define mapping table; do not equate free-text lead source with platform universally |
| Content analytics | Implemented for current content metrics | Content performance utilities, Content Command Center, Content Signals | Yes where metric rows exist | Historical retention/reach/client/cash joins may be absent | No for current fields | Add governed dimension filters and aggregations over populated records |
| FAQ → Content Signals | Partial, not fully structured | Existing FAQ video click/play/watch query in `src/lib/content-signals.server.ts` | Partially | Normalized question text, objection/topic labels, event dates, unanswered indicator | No if FAQ records contain the fields; otherwise FAQ system export/API | Normalize source rows into existing signal input; retain `source: FAQ` |
| Onboarding → Content Signals | Partial | Existing intake/onboarding query and mechanism scoring in `content-signals.server.ts` | Partially | Structured pain/question/outcome/objection/roadblock fields and dates | CRM/onboarding provider only if records are external | Extract only explicit fields; emit `source: Client Onboarding` into existing engine |
| Setting calls → Content Signals | Existing partial integration | Setter/call signal rows and objections/limiting beliefs | Yes where notes/objections exist | Call-note normalization and topic timestamps | CRM/call recording provider if notes are external | Normalize note fields and source attribution in current engine |
| Coverage and platform signals | Existing content-performance/coverage inputs | Content Signals server query and content performance utilities | Yes for current data | Reliable coverage denominator and platform event joins | Platform analytics only if platform metrics are external | Keep existing baseline-relative calculations and add source labels |
| Unified Content Signals outputs | Existing engine, source attribution incomplete | `computeDemand` and `content-signals.server.ts` | Yes for available source rows | Structured FAQ/onboarding signal records | Only if source records are external | Extend current input payload; do not create recommendation engine |
| Content Command Center chain | Partial | Existing Command Center props, content metrics, traffic/attribution paths, Sankey | Only where joins exist | Cross-system content→webinar→lead→rep→call→cash foreign keys | Provider integrations if upstream IDs are external | Add nullable IDs and server aggregation for future attributable records |
| Content → Webinar attribution | Partial/unavailable | Webinar tables and content tables exist independently | Only for rows with shared content/webinar/source IDs | Registration source/content ID, attendee→lead identity, lead→call/order IDs | Webinar provider/CRM/payment provider if missing | Ingest stable attribution IDs; do not infer historical paths |
| DM Setter platform filtering | Implemented for current activity rows | `setter_activity.lead_source` filter | Yes | Canonical platform field for historical rows | No for current rows | Keep filter; migrate future entries to canonical platform/source fields |
| Inbound Dialer platform filtering | Implemented for current activity rows | ActivityModule filter plus `lead_response_events.source_platform` | Yes | Historical source normalization | No for current rows | Keep; capture platform/lead source/campaign at event creation |
| Closer platform filtering | Implemented for canonical call source fields | Closer route and additive `calls` fields | Yes for populated values | Historical calls have nullable attribution | No for internal capture | Preserve nulls and require attribution on future call events |
| Speed to Lead calculation | Implemented | `lead_response_events`, `calculateSpeedToLead`, `speedDistribution` | Yes for event rows | None for response-time calculation when timestamps exist | No | Keep calculation precedence: assignment, then creation |
| Speed to Lead segmentation | UI foundation implemented | Event fields and filtering utility | Yes for rep/platform/source/campaign/date/day/time where fields exist | Rep identity and event outcome completeness | No for internal fields | Finish wiring selected rep and campaign controls to event query, not only activity rows |
| Speed to Lead conversion comparison | UI implemented with honest unavailable outcomes | `compareSpeedBuckets` and Inbound Dialer table | Yes when outcome booleans exist | Downstream connection/qualification/set/book/show/close events | CRM/call system if outcomes are external | Populate outcome fields from actual lead/call events and test with real rows |
| Post-booking VSL family consistency | Partial, UI-only | Existing VSL components and shared video utilities | Yes | None for styling | No | Refactor Post-booking to shared VSL shell/tokens and browser-verify all five views |

## B. Existing Data Sources

| Existing source | What it supports now | Limitations |
|---|---|---|
| `content_pieces` and content performance records | Content, platform, format, mechanism, variation, funnel stage, views, reach/interactions, leads/calls/cash where populated | Historical dimension fields can be null; cross-system IDs are not universally present |
| Content Signals server layer | Content performance, FAQ video metrics, VSL snapshots, setting-call signals, onboarding mechanism tags, coverage/baseline analysis, demand mix, recommendations | FAQ/onboarding are not yet normalized into a complete event-level demand table with dates and source-labelled question objects |
| `setter_activity` | DM Setter and Inbound Dialer daily activity, rep/member filtering, source filtering, KPI/funnel/chart calculations | Daily rollups do not provide per-lead timestamps or canonical platform identity for historical rows |
| `leads` | Lead identity and newly added nullable attribution fields for platform, format, content, campaign | Existing historical rows may lack attribution; lead-to-webinar/call/order joins are not universal |
| `calls` | Call identity/outcome and newly added nullable attribution fields; Closer filtered analytics | Historical calls may lack platform/content/webinar linkage; response timestamps are not guaranteed on calls |
| `lead_response_events` | Assignment/creation, first attempt, first connection, rep, source platform, lead source, campaign, and downstream outcome fields | It is an additive event table; current safe environment may contain no production events, and backfill is not legitimate without source evidence |
| `webinars`, `webinar_events`, `webinar_metrics` | Webinar selector, six-stage aggregation, retention curve, comparison, revenue/ROAS safety | Source rows/events must be populated; ad/email/notification/provider data is not automatically present |
| Existing payment/client/activity records | Existing cash, revenue, client, deposits/closing-related metrics where routes already query them | Webinar attribution and order-level refund/bump/upsell identity are not guaranteed across existing records |
| `traffic_sources` and related traffic/attribution routes | Existing traffic and attribution dashboards, lead-source/UTM dimensions where populated | No verified universal ad-spend table keyed to webinar/content was found |
| VSL/FAQ systems | Main/Webinar/Testimonial/FAQ kinds, video metrics, transcripts/analysis paths | Post-booking visual family needs UI consistency pass; external video/provider events may be absent |
| Workspace settings/connectors/Typeform configuration | Existing Settings, EOD/Typeform placeholders, connector framework | Provider credentials/events are not automatically present in the local safe environment |

## C. Missing Internal Events

InsightOS needs to capture the following internal events for the remaining requirements to become fully data-backed:

| Event | Required fields | Enables |
|---|---|---|
| Content published/performance snapshot | content ID, platform, format, mechanism, variation, funnel stage, captured date, views/reach/interactions/retention | Taxonomy analytics, platform performance, Content Command Center |
| Content attribution touch | content ID, session/lead ID, timestamp, UTM/source/campaign, webinar ID when applicable | Content → registration → lead chain |
| Webinar registration | webinar ID, lead/contact ID, content/source ID, platform, campaign, timestamp | Content → webinar and capture metrics |
| Webinar attendance milestone | webinar ID, lead/contact ID, milestone (`registered`, `live`, `pitch`, `exit`), timestamp | Attendance and retention |
| Notification delivery/open/click | webinar ID, lead/contact ID, channel (`SMS`, `API`, `call`, `email`), status, timestamp | Notification and email metrics |
| Lead assignment | lead ID, rep ID, assigned timestamp, source/platform/campaign | Speed to Lead and rep segmentation |
| First attempt/connection | lead ID, rep ID, timestamp, channel, outcome | Speed to Lead calculation and connection rate |
| Qualified conversation | lead ID, call/conversation ID, timestamp, qualification outcome | Qualified conversation rate |
| Set/booked/show/close | lead ID, call ID, timestamp, outcome, rep ID, webinar/content attribution | Speed-to-lead downstream comparison and full attribution chain |
| Order/payment attribution | order/payment ID, lead/client ID, webinar/content/campaign IDs, amount, type, refund status, timestamp | Revenue, refunds, bumps, upsells, ROAS |
| FAQ demand event | FAQ ID, normalized question/objection/topic, source date, count/interaction, answered flag | Recurring/rising/unanswered FAQ signals |
| Onboarding demand event | client/intake ID, normalized pain/question/outcome/objection/roadblock/training topic, source date | Client Onboarding signals |

## D. Required External Integrations

| Provider/system | Needed data | Requirements unlocked |
|---|---|---|
| Meta Ads / Google Ads / TikTok Ads | campaign/ad/ad-set IDs, impressions, clicks, spend, dates, landing-page visits, conversion IDs | Webinar investment, CPC, CTR, paid visits, CPL, CPA, remarketing spend, ROAS |
| Instagram / YouTube / TikTok analytics | post/video IDs, platform, format, impressions/reach, views, watch time/retention, interactions, dates | Platform and content performance; requires stable content IDs and consented API access |
| Webinar provider | registration, attendance milestones, pitch/exit timestamps, webinar/session IDs | Webinar attendance, retention, content→webinar attribution |
| Email provider | campaign/send/delivery/open/click events, recipient/lead IDs, timestamps | Confirmation open rate, CTOR, group and email conversion |
| SMS/notification provider such as Twilio | message delivery/open/click/reply, lead and webinar IDs, timestamps | SMS notification metrics and response linkage |
| CRM/call provider | lead assignment, call attempts, connection, qualification, set/book/show/close outcomes, rep IDs, timestamps | Complete Speed to Lead outcomes and platform/rep/call chain |
| Payment processor | order ID, lead/client ID, webinar/content attribution, gross/net amount, refunds, product line, bump/upsell | Financial linkage, refunds, order bumps, upsells, attributable revenue |
| Typeform/onboarding system | response ID, question key, answer, client ID, timestamp | Structured onboarding demand signals |
| Gmail/Calendar or booking provider | confirmation/open or booked/show timestamps where not internal | Email metrics and calendar/show linkage |

No integration should be enabled until its stable identifiers and retention/privacy rules are defined. The current code should continue rendering unavailable states when a provider is not connected.

## E. Historical Limitations

Historical records cannot be reconstructed legitimately when they lack a source identifier or timestamp. Specifically:

1. Historical content cannot be reliably linked to a webinar registration, lead, call, close, or cash payment when the original record has no content ID, UTM, campaign, or source event.
2. Historical calls and leads with null platform/content/campaign fields cannot be assigned a platform or content relationship without an external source-of-truth export.
3. Historical Speed to Lead cannot be calculated where assignment, creation, first-attempt, or first-connection timestamps were never captured.
4. Historical `<5 min` versus `30+ min` outcome comparison cannot be calculated without both response timing and downstream outcome events for the same lead.
5. Historical webinar retention cannot be reconstructed without milestone-level `webinar_events`; a total attendee count is not enough to derive a retention curve.
6. Historical ROAS cannot be calculated without attributable ad spend keyed to the same webinar/content/campaign and attributable revenue keyed to the same chain.
7. Historical email open/CTOR, SMS notification, order-bump, upsell, and refund metrics cannot be inferred from aggregate revenue or lead counts.
8. Historical FAQ and onboarding demand cannot be classified as recurring, rising, unanswered, or objection-driven without dated source text/interaction records.

## F. Recommended Build Order

1. **Source contract and identifiers.** Define canonical IDs for content, platform, format, funnel stage, webinar, lead, rep, call, order, campaign, FAQ item, and onboarding response.
2. **Internal event capture.** Start writing lead-response, webinar milestone, content-attribution, notification, outcome, and order-attribution events for all new records.
3. **FAQ/onboarding normalization.** Add server-side source adapters into the existing Content Signals input layer, preserving source labels and semantic classifications only when evidence exists.
4. **Attribution joins.** Add nullable, future-safe links from content/traffic to webinar registration, lead, call, order, and cash; leave historical nulls unchanged.
5. **Speed to Lead completion.** Populate downstream outcome fields from the actual CRM/call path and wire rep/campaign selectors to the event query.
6. **Webinar source integrations.** Connect the approved advertising, webinar, email, SMS, and payment sources one at a time, starting with stable IDs and date-scoped ingestion.
7. **Financial linkage and ROAS.** Reuse the existing financial records, add attribution only where legitimate, and calculate ROAS only when both attributable numerator and denominator exist.
8. **UI consistency pass.** Finish Post-booking VSL visual alignment and browser-test all required tabs/routes after real event data is available.
9. **End-to-end acceptance.** Test source → event → server function → aggregation → filter → UI for each requirement, including empty and unavailable states.

## G. Current Completion Percentage

**Estimated functional completion: approximately 68%.** This is weighted by end-to-end capability rather than file count. The percentage reflects that most requested surfaces, core visual systems, initial aggregations, filters, retention, comparison, VSL kinds, and event foundations exist, while the remaining high-value gaps are the actual source/event connections: cross-system attribution, normalized FAQ/onboarding demand, external campaign/email/webinar/payment telemetry, and complete downstream Speed to Lead outcomes.

This estimate intentionally does not count a placeholder card or a successful HTTP response as a completed requirement.

## Recommended immediate decision

The next implementation should not be another broad UI pass. Choose the first source connection to make authoritative—**CRM/call events**, **webinar provider**, or **advertising spend**—then implement its stable event contract and end-to-end path through the existing systems. Without that decision, the remaining metrics cannot be completed truthfully.

## Repository evidence inspected

- `src/lib/content-signals.server.ts`
- `src/lib/content-mechanisms.ts`
- `src/lib/speed-to-lead.ts`
- `src/lib/webinar-analytics.ts`
- `src/routes/_authenticated.vsl.tsx`
- `src/routes/_authenticated.webinar-analytics.tsx`
- `src/routes/_authenticated.content.tsx`
- `src/routes/_authenticated.closer.tsx`
- `src/components/activity-module.tsx`
- `src/components/content-command-center.tsx`
- `supabase/migrations/20260827090000_analytics_expansion_foundation.sql`
- Existing traffic, attribution, lead, call, client, payment, settings, connector, Typeform, calendar, and EOD routes/components
