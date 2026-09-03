# InsightOS Requirement Audit

**Audit basis:** `pasted_content_41.txt` and the Attribution Confidence + Webinar Profit addendum, continued by `pasted_content_42.txt`.

**Baseline:** branch `upgrade/localhost-8081-command-center`, commit `ec17857`, isolated working tree. No production database or `main` branch was touched.

## Status definitions

| Status | Meaning |
|---|---|
| **DONE** | The requirement is implemented in the current UI and backed by the current data/event model. |
| **PARTIAL** | A meaningful UI or data-model slice exists, but one or more requested dimensions, drill-downs, or workflow actions are missing. |
| **NOT IMPLEMENTED** | There is no implementation sufficient to claim the requirement. |
| **BLOCKED BY INTEGRATION** | The product state can be represented honestly, but completion requires a provider, event stream, credential, or source that is not connected. |

## 1. Structural removals and terminology

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Remove C4 Sentinel | **DONE** | Sentinel navigation and route are removed. | No Sentinel-specific data is required by the remaining routes. | None. | None for the removal scope. |
| Remove in-app Connectors | **DONE** | Connectors route, Settings shortcut, sidebar item, and command-palette shortcut are removed. | External integration functions remain available for provider workflows. | n8n/Zapier or equivalent remains external. | None for removal; external setup UI is intentionally absent. |
| Remove CopyOS except Client DNA | **PARTIAL** | CopyOS generation navigation was removed/reduced; Client DNA remains available through the existing copy surface. | Existing content/copy data remains. | External creation workflow is not connected to Content Calendar. | Verify every retired CopyOS generation surface and add creator handoff later. |
| Rename Clients to Mentees | **PARTIAL** | Sidebar, command palette, page title, tabs, headings, cards, and empty states use Mentee terminology. | Underlying tables and mutation names remain `clients` for additive compatibility. | None. | Remaining source-level `Client*` identifiers are compatibility names; broader profile/health terminology still needs cleanup. |
| Remove Main Hub Level 5 | **DONE** | Level 5 Action & Intelligence block is removed. | Existing analytics sources remain untouched. | None. | None for the requested removal. |
| Remove Team Calendar Work Blocks | **DONE** | Work Blocks week-grid and BlockDialog are removed; Google Calendar connection list remains. | Calendar connection data remains. | Google Calendar remains the source for work-block visibility. | Live Google sync quality still depends on connected calendars. |
| Remove Webinar Master Funnels Active Analysis Stage | **DONE** | Master Funnel section and component are removed. | Webinar event analytics remain. | None for removal. | None for the requested removal. |

## 2. Legacy Leads

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Historical lead record view | **DONE** | Searchable, filterable lead table with detail dialog, status, priority, qualification, pre-call video, email, phone, handle, and notes. | Reads the `leads` table and preserves existing fields. | None. | None for the existing record scope. |
| Exact opt-in/entry date and time | **DONE** | Date and localized time are shown for every lead. | Uses `leads.created_at` as the entry timestamp. | None. | A distinct provider opt-in timestamp is not modeled; `created_at` is the honest available proxy. |
| Calendar/date filtering and specific-day opt-ins | **DONE** | Date input filters leads by `created_at` date. | Client-side filter over fetched lead records. | None. | Server-side date pagination can be added for larger workspaces. |
| Separate assigned setter and closer | **PARTIAL** | Two separate columns are present. They display `Unavailable` rather than merging or guessing ownership. | Legacy lead query has no assigned-setter/assigned-closer fields in its selected model. Call records have setter/closer IDs, but a reliable lead-level join is not currently implemented in this view. | Requires assignment source or reliable lead-call join. | Add explicit lead assignment fields or a verified join and replace the unavailable states. |
| Lead drill-down | **DONE** | Existing detail dialog exposes timeline, notes, transcript, tags, and qualification context where available. | Existing lead notes/timeline/transcript sources remain. | Transcript completeness depends on source. | None for current scope. |

## 3. DM Setter

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Qualified conversations, sets, booked calls, closes, cash, revenue | **DONE** | Shared KPI band, funnel instruments, rates, money instrument, leaderboard, heatmap, and detail panels. | Backed by `setter_activity` and existing trend aggregation. | None for manually logged activity. | Per-conversation identity is not present in daily rollups. |
| Inbound/outbound DMs sent | **BLOCKED BY INTEGRATION** | Coverage cards show `Not connected`; no fabricated numbers. | No separate inbound/outbound DM event fields are in `setter_activity`. | Requires DM provider/webhook or normalized messaging event source. | Ingest and identity-link DM sent events. |
| Follow-ups sent | **BLOCKED BY INTEGRATION** | Coverage card shows `Not connected`. | No follow-up event count exists in the current activity model. | Messaging/CRM event source required. | Add event ingestion and a follow-up attribution key. |
| Links sent | **DONE** | Links Sent metric exists for setter activity. | Backed by `setter_activity.links_sent`. | None for manually logged records. | Link-level click identity is missing. |
| Links clicked, post-booking visits, pre-call video watches | **BLOCKED BY INTEGRATION** | Explicit `Not connected` states. | No reliable event fields in current setter activity query. | Requires tracked links, page events, and video events. | Add event ingestion and person-level joins. |
| Setter Performance flow | **PARTIAL** | Leaderboard and funnel show setter-level activity and qualified/set progression. | Aggregates daily rows by team member. | None for current activity source. | A selectable setter → qualified → booked flow with record-level drill-down and offer/content filters is incomplete. |
| Setter filters by setter/date/source/platform | **PARTIAL** | Date range, team member, platform, and source filters exist and apply to current/prior activity and Speed-to-Lead. | Uses `setter_activity.lead_source`, optional `source_platform`, date, and team-member fields. | Content/campaign/offer fields are not connected to this route. | Add content, campaign, and offer dimensions where identity exists. |
| DM attribution paths and DM Setter VSL path | **NOT IMPLEMENTED** | No complete selectable multi-path attribution journey is exposed in the DM Setter route. | Supporting lifecycle/content/event primitives exist elsewhere, but are not joined into this route. | Requires normalized DM, content, VSL, booking, close, and payment events. | Implement journey views and record drill-downs. |
| Outbound terminology | **PARTIAL** | Current new coverage labels use inbound/outbound terminology; legacy dialer-specific language remains in the Dialer route where it describes actual call activity. | No cold/warm outbound classification was added. | None. | Audit remaining copy labels across all routes. |

## 4. Inbound Dialer, Speed-to-Lead, and alerts

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Speed-to-Lead box | **PARTIAL** | Speed-to-Lead instrument has weekday/time filters, median/average/fastest/slowest, buckets, uncontacted count, and comparison. | Reads `lead_response_events` and uses `first_attempt_at`/connection fields. | Calling/CRM source must populate events. | Full eligible-lead qualification filter and SLA action queue are incomplete. |
| Follow-up tracking | **BLOCKED BY INTEGRATION** | Not-connected activity coverage state exists. | No follow-up event field in current source. | Calling/CRM source required. | Ingest follow-up events and due/completed states. |
| Active leads split high-ticket/low-ticket | **NOT IMPLEMENTED** | No active dial queue split is currently rendered. | Lead offer/ticket classification is not joined into Dialer queue. | Requires offer/product or lead qualification source. | Add queue query, ticket classification, and actionable records. |
| Average call length/talk time | **BLOCKED BY INTEGRATION** | Explicit Not connected cards are shown. | No duration/talk-time fields in `setter_activity`. | Close/calling provider or transcript source required. | Ingest call duration and talk/listen data. |
| Callback requested → due → completed → booked → closed → cash | **NOT IMPLEMENTED** | No complete callback pipeline exists. | No normalized callback lifecycle table is used by Dialer. | Calling/CRM event source required. | Add callback events, due-date queue, completion state, and drill-down. |
| Cancellation/reschedule/no-show/recovery rates | **PARTIAL** | Closer has call status/disposition support; Dialer does not expose the requested appointment-quality panel. | Calls include status/showed fields; recovery history is not modeled as a separate event. | Calendar/calling source required for complete rates. | Add rate calculations and recovery event history. |
| Five-minute urgency threshold and hot-lead alerts | **PARTIAL** | Speed calculations and event-backed response model exist. | `lead_response_events` stores timestamps and lifecycle flags. | Discord/notification connector is required for delivery. | Create server-side eligible-lead SLA job/notification, exclude spam/unqualified leads, include owner/source/action URL, and verify connector delivery. |
| Dialer source attribution | **PARTIAL** | Platform/source filtering exists in shared activity and broader attribution surfaces. | Event foundation includes source, campaign, content, and lifecycle fields. | Complete source requires connected capture/campaign events. | Build the full source → campaign/content → capture → cash drill-down. |

## 5. Closer

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Calls, offers, deposits, cash, contract value | **PARTIAL** | Closer dashboard, KPI band, call table, deposits, cash, contract value, objection panels, and follow-up table exist. | Calls include offer, deposit, cash, contract, status, recording, and summary fields. | None for existing call records. | Deposit-quality ratios and payment-plan outcomes are incomplete. |
| Deposit conversion, amount, average deposit %, deposit-to-full-payment | **PARTIAL** | Deposit count is present. | Call/payment fields support some calculations, but a complete deposit lifecycle is not exposed. | Payment provider needed for full-payment confirmation. | Add metrics and payment joins without double-counting. |
| Payment-plan uptake, failed/default, on-time, future scheduled cash | **PARTIAL** | Payment-plan fields exist in Mentees and call/client models; not a complete Closer quality panel. | Existing clients/payments tables support parts of the model. | Payment provider/scheduler required for failed/on-time states. | Add scheduled payment events and Closer-linked payment quality analytics. |
| Post-call dispositions | **DONE** | Multiple call status/disposition options include closed, no-show, follow-up, rescheduled, and other close states. | Call status and disposition-like fields are stored. | None for manual entry. | Full requested 11-option disposition taxonomy and detailed notes should be normalized and verified. |
| Active/overdue follow-ups, expected closes, no-show recovery | **PARTIAL** | Follow-up table and overdue age display exist; no-show/rescheduled statuses exist. | Calls store dates/statuses. | Calendar/calling event history needed for recovery attribution. | Add expected-close and recovered-show/close metrics. |
| Sales activity quality and coaching | **PARTIAL** | Objection analysis and call recording links exist. | Call summaries, key moments, recording URL, objections, and clustering primitives exist. | Fathom/transcript provider is not fully connected. | Add reviewed-call records, coaching form, talk/listen ratio, and recurring gap rollups. |
| Closer lifecycle attribution | **PARTIAL** | Existing calls and lifecycle primitives can expose portions of the path. | Lifecycle ingestion and event tables include content/source/call/payment references. | Full original-source and retention/refund linkage requires connected event sources. | Build the no-double-counting path view and confidence metadata. |

## 6. Mentees & Renewals

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Clickable mentee profiles | **PARTIAL** | Kanban mentee names and table rows open the existing edit/profile dialog. | Existing `clients` record includes financial, renewal, payment-plan, notes, and pre-close fields. | None. | Expand the dialog into a dedicated read-only profile drawer with full ledger/activity/attribution tabs. |
| Collected vs contracted vs forecasted LTV | **PARTIAL** | Contracted LTV, paid collections, forecast next 30d, and outstanding balance are separated. | Contracted value/invested fields, expected next payment, and payments table support the current calculations. | Payment scheduler required for full forecast. | Add full forecast horizon, refunds, and realized-vs-contracted reconciliation. |
| Renewal stages and next action | **PARTIAL** | Kanban uses Not Started, Outreach Started, Renewal Conversation, Proposal / Payment Link Sent, Renewed, Churned; cards expose renewal date and next-step status. | Existing `renewal_stage`, renewal date, conversation flag, status, and notes are preserved. | Communication provider needed for scheduled actions. | Add explicit next-action/date/owner fields and remove remaining generic conversation semantics from all surfaces. |
| Portfolio cash health KPIs | **PARTIAL** | Active mentees, renewals due, at-risk, paid collections, open plans, forecast, and outstanding balance cards exist. | Clients/payments data backs current values. | Payment provider needed for failed/retry/overdue states. | Add overdue, due-next-7d, failed/retry, collection rate, at-risk future cash, and transparent reasons. |
| Expected vs actual collections chart | **NOT IMPLEMENTED** | No chart currently compares scheduled expected cash with actual collected cash by range. | Current fields can support a basic version; payment-event schedule is incomplete. | Scheduled-payment source required. | Add time-range controls and event-backed chart. |
| Payment Recovery Queue and actions | **NOT IMPLEMENTED** | Collections ledger is read-only; no recovery queue/actions. | Payments include status/collected date, but no retry/promise/follow-up event model. | Payment provider plus notification/task source required. | Add queue categories, ownership, actions, audit trail, and notifications. |
| Mentee table financial/payment/health expansion | **PARTIAL** | Existing table includes contract, payment plan, renewal, stage, offer, start date, and notes. | Client fields support some columns. | Payment/health/event sources required for full expansion. | Add payment cadence/progress, last/next payment, balances, owner, health, and next-action columns. |
| Transparent health score and reasons | **PARTIAL** | At-risk reason is renewal-proximity based; a health score is intentionally not displayed because the stored `health_score` was not computed. | `health_score` exists but is not authoritative; risk helper uses renewal conditions. | Activity/payment/engagement sources required for defensible health. | Build reason-coded health scoring with data freshness and filters. |
| Scheduled payment-plan notifications | **BLOCKED BY INTEGRATION** | Payment-plan fields and forecast card exist; notifications are not active. | No schedule/event table is used for every expected installment. | Payment scheduler and email/SMS/Discord delivery required. | Add installment schedule, due/missed/overdue events, and notification category. |
| Mentee lifecycle attribution | **PARTIAL** | Existing broader attribution/lifecycle primitives exist but are not surfaced in profile. | Lifecycle events support source/content/call/payment/client references. | Retention/refund/upgrade sources required. | Add profile-level drill-down and model confidence. |

## 7. Content Command Center and unified attribution

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Consolidate Content, Traffic, Lead Attribution | **PARTIAL** | Content Command Center includes pipeline, content performance, signals, taxonomy/intelligence, and Content-to-Cash/Sankey-style sections; Traffic and Attribution routes still exist. | Content performance, acquisition-source, taxonomy, lifecycle, and event primitives exist. | Actual platform/campaign event completeness varies. | Finish migration of useful Traffic/Lead Attribution views and eliminate remaining overlap. |
| Real platform filters and icons | **PARTIAL** | Canonical platform helpers and filters include Instagram, TikTok, YouTube, LinkedIn, Meta, Email, Referral, Other; platform labels are normalized. | `source_platform`/acquisition helpers exist. | Platform APIs/ad data required for complete metrics. | Add platform icons consistently and verify all source labels against actual records. |
| Content-to-cash hierarchy | **PARTIAL** | Content performance and attribution modules expose portions of the hierarchy. | Lifecycle events include content, campaign, platform, call, client, payment references. | Complete identity/campaign/capture event coverage required. | Build one canonical path model with dedupe rules and drill-down records. |
| Attribution confidence/strength addendum | **NOT IMPLEMENTED** | Existing attribution screens do not consistently expose model, confidence, touchpoint count, support events, or sample warnings per revenue outcome. | Event foundations can support references, but no canonical confidence calculation/view model is wired across routes. | Requires complete event identity and model-specific touchpoint data. | Implement `direct/partial/inferred/unavailable`, model, strength, touchpoints, supporting events, sample-size warnings, and drill-down. |
| Content Signals | **DONE** | Content Signals remains available as requested. | Existing server-backed signals and tests remain. | Data quality depends on content events. | Later review whether to embed or keep standalone. |

## 8. VSL/Wistia

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Preserve five video categories | **DONE** | Main VSL, Webinar VSL, Post-booking Confirmation, Testimonial Videos, FAQ/Objection Videos are represented. | Existing VSL kind model supports categories. | None for categories. | None. |
| Wistia media IDs and analytics | **BLOCKED BY INTEGRATION** | VSL page has analytics surfaces and honest unavailable/mock distinctions. | No connected Wistia event ingestion for all requested media/heatmap/CTA dimensions. | Wistia API/media IDs and privacy/embed configuration required. | Connect Wistia and replace unavailable states where data exists. |
| Video-to-revenue funnel | **PARTIAL** | VSL funnel concepts and metrics exist for available sources. | Lifecycle/event primitives support some stages. | Wistia/page/CRM/payment joins required. | Complete every stage with count, conversion, prior-period change, target, impact, and records. |
| Main VSL retention/leaks/AI evidence | **PARTIAL** | Retention and analytics panels exist. | Transcript/AI primitives exist but evidence linkage is incomplete. | Wistia/Fathom/transcript source required. | Add timestamped evidence, sample size, segment, confidence, and recommendation status. |
| Viewer/CTA/source attribution | **BLOCKED BY INTEGRATION** | Some source/attribution UI exists; no complete viewer journey. | Event foundation has source/content/campaign fields. | Wistia identity and page/CRM event source required. | Connect and expose known-viewer journeys without overclaiming. |
| Video Action Queue | **NOT IMPLEMENTED** | No complete queue for the seven requested conditions. | No normalized action-queue record model. | Wistia/CRM/content events required. | Add evidence-backed queue with action states. |

## 9. Webinar Analytics and Webinar Profit addendum

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Remove Master Funnel Active Analysis Stage | **DONE** | Removed and build-validated. | Webinar analytics event model remains. | None. | None. |
| Interactive polished webinar charts/tooltips | **PARTIAL** | Traffic funnel, retention curve, comparison tables, and interactive chart surfaces exist. | Webinar event analytics helpers and event pipeline exist. | Real webinar event source required for non-mock data. | Verify every chart tooltip is source-backed and complete across all required panels. |
| Paid/organic leads, live attendees, retention/pitch | **PARTIAL** | Webinar summary and retention metrics exist. | Webinar events and aggregation helpers exist. | Registration/attendance source required. | Add paid-vs-organic split and complete pitch-retention evidence. |
| Refunds, upsells, total sales, during/after pitch split | **PARTIAL** | Sales/revenue/closing panels exist; some values are unavailable when not modeled. | Revenue events and payment references exist, but refund/upsell/pitch-phase fields are not complete. | Checkout/payment/webinar timing source required. | Add distinct event-backed categories and dedupe rules. |
| CPL, CPA, ROAS separated | **PARTIAL** | Acquisition/revenue panels separate concepts in available analytics. | Acquisition spend foundation exists. | Spend/lead/attribution source required for reliable values. | Verify every metric is independently sourced and not blended. |
| Contracted revenue vs cash collected | **PARTIAL** | Existing webinar revenue surfaces show revenue/cash-related metrics, but a canonical financial panel is not complete. | Calls/payments/revenue event models support both dimensions in parts of the app. | Payment/contract source required. | Add explicit labels and unified webinar-level aggregation. |
| Refunds and upsell revenue | **BLOCKED BY INTEGRATION** | Honest unavailable states are available where source data is missing. | No complete webinar-linked refund/upsell event model is wired. | Payment/checkout provider required. | Ingest and link refund/upsell events. |
| Direct attributable costs | **BLOCKED BY INTEGRATION** | Cost data must remain unavailable when not connected; no profit number should be claimed. | Acquisition spend foundation exists but may not cover all direct webinar costs. | Ad-spend/cost connectors required. | Connect cost sources and reconcile attributable cost scope. |
| Net Profit and Profit Margin | **BLOCKED BY INTEGRATION** | Required state is `Net Profit: Unavailable — cost data not connected` when direct cost data is absent; no unsupported profit calculation is claimed. | Revenue/cash primitives exist; cost completeness is not established. | Direct attributable cost source required. | Add net profit/margin only after costs, refunds, and realized revenue are source-backed. |

## 10. Objection Intelligence and transcript-backed intelligence

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Multiple-choice objection categories | **PARTIAL** | Closer objection options, objection instrument, clustering, and heatmap surfaces exist. | `call_objections` and objection clustering primitives exist. | None for manual logging. | Normalize the full requested category set and support call position. |
| Objection call position, notes, disposition | **PARTIAL** | Notes and dispositions exist in closer workflows. | Objection rows and call fields exist, but position/disposition linkage is incomplete. | Transcript provider helps infer position. | Add explicit position and final-outcome fields. |
| Fathom/transcript journey, ICP, decision factors | **BLOCKED BY INTEGRATION** | Transcript-related panels and raw transcript surfaces exist where available. | Transcript fields and AI analysis primitives exist. | Fathom or equivalent transcript connector required. | Connect source, evidence timestamps, and confidence. |
| Reuse objection intelligence in Content/VSL/Webinar | **PARTIAL** | Objection instruments and FAQ/video concepts exist in multiple modules. | Shared objection/clustering primitives exist. | Transcript and content identity sources required. | Build canonical cross-module objection dataset and drill-downs. |

## 11. Access Center and notifications

| Requirement | Status | Current UI | Data/event model | External integration | Missing |
|---|---|---|---|---|---|
| Email authentication and RBAC | **PARTIAL** | Permissions route, server-side role checks, and EOD RBAC exist. | Permission helpers and role/member records exist. | Auth provider is Supabase Auth. | Full email invite/access-request workflow needs verification. |
| Role-specific invites/access requests | **NOT IMPLEMENTED** | Access control UI exists but not a complete invite/request workflow. | No complete request/audit record flow verified. | Email delivery required. | Implement request lifecycle, role, client/workspace, expiry, and audit trail. |
| Single-use scoped codes only as onboarding fallback | **NOT IMPLEMENTED** | No complete scoped code workflow is exposed. | No verified one-time code model is wired. | Email/auth delivery required. | Add secure code model and expiry. |
| InsightOS notifications and Discord SLA alerts | **PARTIAL / BLOCKED BY INTEGRATION** | Dispatch/notification primitives exist; connector presence and delivery are not guaranteed. | Lifecycle/dispatch functions exist. | Discord connector and background scheduler required. | Implement eligible-lead SLA job, connector capability check, delivery audit, and fallback state. |

## Completion summary

| Area | Overall status |
|---|---|
| Structural removals | **DONE / PARTIAL** — removals are complete; CopyOS and terminology cleanup retain compatibility identifiers. |
| Legacy Leads | **PARTIAL** — historical view/date filter are done; verified setter/closer assignment linkage is missing. |
| DM Setter | **PARTIAL / BLOCKED BY INTEGRATION** — daily activity analytics are solid; message/content/click journeys require event sources. |
| Inbound Dialer and SLA | **PARTIAL / BLOCKED BY INTEGRATION** — Speed-to-Lead analytics exist; queue, callback, urgency job, and provider delivery remain. |
| Closer | **PARTIAL** — call/deposit/objection/follow-up foundations exist; payment quality, coaching, and lifecycle confidence remain. |
| Mentees & Renewals | **PARTIAL** — terminology, profile entry point, collections ledger, and core financial separation exist; scheduled-payment/recovery/health systems remain. |
| Content Command Center | **PARTIAL** — strong reporting foundation exists; unified canonical attribution and confidence are not complete. |
| VSL/Wistia | **BLOCKED BY INTEGRATION** — architecture and honest states exist; Wistia connection is absent. |
| Webinar Analytics/Profit | **PARTIAL / BLOCKED BY INTEGRATION** — analytics foundation exists; pitch/refund/upsell/cost/profit completeness requires sources. |
| Objection Intelligence | **PARTIAL / BLOCKED BY INTEGRATION** — manual/clustering foundation exists; transcript-backed evidence is not connected. |
| Access Center | **PARTIAL** — RBAC exists; full invite/request/audit flow remains. |

## Highest-value next implementation order

1. Build the canonical attribution-path model with explicit model, strength, touchpoint count, supporting events, status, sample-size warning, and dedupe rules.
2. Add event-backed Speed-to-Lead eligibility/SLA processing and notification delivery checks.
3. Normalize closer dispositions, deposits, payment schedules, coaching reviews, and objection positions.
4. Add scheduled Mentee installment events, recovery queue, transparent health reasons, and profile tabs.
5. Connect Content Command Center to one canonical Content-to-Cash drill-down.
6. Connect Wistia and transcript providers only after credentials/media IDs are available.
7. Add Webinar financial reporting; show `Net Profit: Unavailable — cost data not connected` until direct costs are connected.
8. Finish Access Center invites/requests and auditability.

This audit deliberately does not classify a placeholder or `Not connected` state as completion.


## Addendum: pasted_content_43 reconciliation and changes in this pass

The prior attribution-confidence row remains **FOUNDATION/PARTIAL**, not DONE. Metadata types and helpers alone do not constitute an end-to-end canonical attribution system.

| Change | Result | Evidence |
|---|---|---|
| Shared canonical lifecycle path object | **FOUNDATION IMPLEMENTED** | `src/lib/acquisition.ts` now defines `CanonicalLifecycleAttributionPath` with source, platform, campaign, content, setter/dialer, closer, booking/call, offer, payment, retention/refund, events, and evidence fields. |
| Deterministic deduplication | **FOUNDATION IMPLEMENTED** | `canonicalAttributionDeduplicationKey` and `deduplicateCanonicalAttributionPaths` deduplicate by person, outcome, payment, and call; regression coverage passes. |
| Canonical evidence evaluator | **FOUNDATION IMPLEMENTED** | Direct/partial/inferred/unavailable coverage, strength, known touchpoints, sample warnings, and drill-down keys are evaluated without promoting inferred credit. |
| Lead Attribution wiring | **PARTIAL** | Lead Attribution path rows display coverage/model, touchpoint count, and sample warning. The route still needs end-to-end joins to setter, closer, booking, offer, payment, and retention events. |
| Content Command Center wiring | **FOUNDATION/PARTIAL** | Sankey flow metadata accepts confidence/coverage/touchpoint/sample-warning fields, but the current flow data does not yet provide complete canonical lifecycle evidence for every path. |
| Five-minute SLA evaluator | **FOUNDATION IMPLEMENTED** | `evaluateSpeedToLeadSla` produces met/breached/pending/ineligible/unavailable states, excludes spam/ineligible leads, and returns notification-ready owner/source/action metadata. |
| SLA operational queue and delivery | **NOT IMPLEMENTED / BLOCKED BY INTEGRATION** | No server scheduler, duplicate-alert persistence, in-app queue, or Discord delivery audit has been wired yet. Connector-unavailable handling remains required. |

### Current validation after pasted_content_43

The acquisition and Speed-to-Lead targeted suites pass; formatting, ESLint, and TypeScript pass for changed files. The repository remains on `upgrade/localhost-8081-command-center` at `ec17857`, with no merge, reset, production data mutation, or credential changes.

### Updated classification rule

A requirement is only **DONE** when its UI, underlying data model, and behavior operate end-to-end. A placeholder, a helper type, a `Not connected` state, or an unconsumed data-model field is classified as **FOUNDATION/PARTIAL** or **BLOCKED BY INTEGRATION**, never DONE.


## Addendum: pasted_content_44 end-to-end wiring pass

| Surface | Current canonical wiring status | Genuine evidence boundary |
|---|---|---|
| Lead Attribution | **PARTIAL** | Uses shared evidence evaluation and exposes coverage/model/strength/touchpoints/sample warnings. Complete person-to-payment-to-retention joins are not yet available from the current route query. |
| Content Command Center | **PARTIAL** | Shared flow metadata supports canonical confidence fields and tooltips. Current Sankey path data still needs canonical lifecycle rows for every flow value. |
| DM Setter / Inbound Dialer | **PARTIAL / HONESTLY UNAVAILABLE** | Shared activity detail explicitly shows aggregate rows as unavailable for person-level canonical joins; no provider events are invented. |
| Closer | **PARTIAL** | Selected outcome tables now consume the shared attribution evaluator using verified call/lead evidence; booking→offer→deposit→payment joins remain incomplete where schema links are absent. |
| Mentee lifecycle | **PARTIAL** | Profile evidence panel links verified client/payment records and separates contracted, collected, outstanding, forecasted amounts; source/setter/closer/call/offer/refund remain unavailable without verified joins. |

The shared canonical model now includes a builder, deterministic deduplication, evidence evaluation, and route-level consumers. It is intentionally not marked DONE because full end-to-end joins and behavior are not present across every surface.

The operational Speed-to-Lead layer includes the evaluator and in-app actionable queue builder with exact threshold, owner/source/action metadata, missing-owner state, and duplicate-notification prevention. Connector capability checks and persisted Discord delivery audit remain **NOT IMPLEMENTED / BLOCKED BY INTEGRATION**.

Latest validation: Prettier, TypeScript, production build, ESLint with zero errors, and 16 Vitest files / 95 tests pass. Two existing non-blocking Closer hook-dependency warnings remain. No main branch, production database, production credentials, merge, or reset was touched.


## Addendum: pasted_content_45 evidence-backed operating-system pass

| Requirement | Status | UI Evidence | Data Evidence | Integration Boundary | Remaining Work |
|---|---|---|---|---|---|
| Reusable canonical evidence presentation | **PARTIAL** | New shared `AttributionEvidencePanel` presents model, coverage, strength, touchpoints, supporting events, sample warning, and drill-down key; used in Mentee lifecycle and Closer outcome details. | Consumes the existing `AttributionEvidence` evaluator output. | Some routes still expose aggregate-only or route-local summaries. | Replace remaining route-local evidence strings with the shared panel where the row type supports it. |
| Content → Lead → Call → Close canonical path | **PARTIAL** | Content Command Center receives the count of verified canonical paths and existing flow metadata remains inspectable. | Live Content route builds paths only when `leads.first_touch_content_id` and `closed_calls.lead_id` are both present; deterministic deduplication is applied. | Setter, booking, offer, payment, retention, and refund joins are not proven by the current Content route query. | Add those stages only when verified event IDs are available and feed supporting records into drill-down. |
| Mentee payment integrity | **PARTIAL** | Mentee lifecycle profile continues to separate contracted, collected, outstanding, and forecasted amounts. | Shared `deduplicatePaymentRecords` now prevents repeated payment IDs from inflating collected totals and paid-collections KPIs; regression coverage added. | Refunds, failed/overdue/on-time provider states, and expected-vs-actual schedule events are not fully modeled. | Connect provider payment status and refund events when authorized data is available. |
| Closer evidence UX | **PARTIAL** | Selected outcome details now use the shared evidence panel. | Evidence is based only on verified lead email/call row identity; no temporal or name-based join is used. | Setter, booking, offer, deposit, payment-plan, and retention joins remain incomplete. | Wire only schema-backed IDs and add call/payment aggregation tests for each new join. |
| Speed-to-Lead operational queue | **PARTIAL** | Inbound Dialer now shows an actionable five-minute queue with lead ID, source, owner, SLA state, and delivery state. Missing owner is visible as `Owner unavailable`. | Queue consumes `lead_response_events`, uses exact five-minute evaluator, excludes ineligible/spam events, and supports persisted audit inputs. | Connector capability is explicitly `connector-unavailable`; no alert is claimed as delivered. | Add authorized notification persistence and Discord capability audit before marking delivery complete. |
| Speed-to-Lead delivery states | **FOUNDATION/PARTIAL** | Queue can render `ready`, `owner-missing`, `already-notified`, `connector-unavailable`, `sent`, and `failed`. | Queue accepts delivery-audit records and prevents duplicate notification claims. | No active notification connector or persisted audit table is wired in this pass. | Connect the approved provider and persist delivery audit records. |
| Unified attribution UX | **PARTIAL** | Shared evidence panel is reusable across major route surfaces; aggregate DM/Dialer rows remain explicitly unavailable. | All displayed states derive from the shared evaluator rather than fabricated confidence. | Lead Attribution and Content still contain some table/tooltip-specific presentation. | Consolidate remaining route-specific evidence renderers. |

Validation for this pass: Prettier passed; ESLint completed with zero errors and two existing non-blocking Closer hook-dependency warnings; TypeScript passed; production build passed; full Vitest suite passed with 16 files and 97 tests. Targeted acquisition and Speed-to-Lead tests passed with 17 tests. No production database, credentials, external connector, `main` branch, merge, reset, or rebase was touched.

The milestone remains intentionally **PARTIAL**. The new Content and Speed-to-Lead behavior is genuinely consumed, but provider-backed notifications and several setter/booking/offer/payment/retention joins remain unavailable and are not represented as complete.
