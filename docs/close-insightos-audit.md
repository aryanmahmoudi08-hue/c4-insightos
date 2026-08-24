# Close CRM Trial Audit and InsightOS Sales CRM Roadmap

**Prepared for:** C4 InsightOS  
**Prepared by:** Manus AI  
**Audit mode:** Read-only authenticated Close trial review, compared with the current isolated InsightOS Sales CRM staging build and repository source  
**Audit date:** August 23, 2026

## Executive Summary

Close presents a mature, activity-first sales operating system. Its strongest product decisions are a consistently reusable list grammar, deep cross-object filtering, a high-density communication and task inbox, configurable pipelines, saved reporting surfaces, and a governance layer that treats permissions, integrations, telephony, email capacity, developer access, and workflow execution as connected operational concerns. The trial had no lead, contact, opportunity, call, email, template, custom-object, custom-field, API-key, OAuth-app, or webhook records. That limitation prevented inspection of populated record-detail states and live execution flows, but it also permitted a safe, repeatable audit of Close’s navigation, configuration, empty states, creation entry points, and non-destructive menus without accessing customer data or sending communications. [1] [2] [3]

InsightOS already has a strong **compatibility-first CRM foundation**. It preserves legacy lead, call, conversation, client, payment, team, and tracking structures; renders native CRM contacts beside legacy lead context; provides companies, configurable pipelines and stages, opportunities, tasks, normalized activity, CRM notes, saved views, reporting, provider-neutral communication tables, and automation audit records. The inspected staging environment demonstrates that these foundations work together visually and relationally. However, much of the current product depth remains intentionally narrow: communication is read-only until providers are configured; task and opportunity management is shallow; search and views are limited; reporting is compact; automation is modeled but non-executing; and settings are not yet a full operating layer. [14] [15] [16]

The recommended strategy is **not** to copy Close’s visual identity or reproduce every capability. InsightOS should retain its legacy-preservation advantage and use Close as a reference for faster operator workflows. The immediate product priority is to make the current foundation decisive in daily work: complete task and opportunity flows, structured filtering and saved views, a usable unified inbox lifecycle, and record-level relationship editing. Telephone provisioning, Gmail, bulk outbound, predictive dialers, AI voice agents, and generic marketplace breadth should remain deliberately deferred until the fundamentals are robust and the required provider, consent, compliance, and billing controls are explicitly approved.

> **Audit control:** No Close records, templates, workflows, custom fields, custom objects, phone numbers, email accounts, integrations, API keys, OAuth applications, webhooks, settings, billing controls, or communications were created, changed, sent, or activated. No InsightOS production or local database was accessed or modified. All InsightOS validation referenced the existing isolated staging environment only.

## Method and Evidence Boundary

The audit followed the user’s recursive exploration standard where the trial made a surface available. I opened the major application routes, visible child routes, filter menus, action menus, empty states, creation dialogs that could be closed safely, reporting templates, configuration pages, and developer tabs. I recorded controls and hierarchy without submitting destructive or externally effective actions. The browser session briefly encountered a transient resource-loading interruption; it subsequently recovered and continued at the authenticated Leads area. Findings below distinguish **observed product behavior** from **not observable in an empty trial**.

| Evidence class | Scope | Treatment in this report |
|---|---|---|
| Authenticated Close observation | Current trial routes and menus explored in the connected browser | Treated as direct product evidence and cited by the inspected Close route. |
| InsightOS source review | Current routes, server functions, schema design, and completion documentation | Treated as implementation evidence, with file paths named in the affected-area columns. |
| InsightOS isolated staging verification | Synthetic, relational staging fixture and visual preview inspected before this audit | Treated as confirmation that the current CRM foundation renders and functions with safe data. |
| Unavailable trial state | Populated record details, live sending/dialing, active workflow runs, and configured provider controls | Identified as limitations rather than inferred as missing Close capabilities. |

## Complete Close Product Sitemap Observed

The following sitemap records all major application areas and meaningful child surfaces observed in the authenticated trial. It reflects the actual account rather than an assumed Close edition or plan.

| Page | Tab, subpage, or nested control | Resulting screen or function |
|---|---|---|
| **Global shell** | Profile menu | Account, Import data, Invite people, Product updates, Log out, Mac app, and Classic/Light/Dark/System appearance choices. |
|  | Global Search | A persistent CRM search entry point visible in the shell. The empty trial did not permit evaluation of populated result ranking. |
|  | Chloe Chat | New chat, placement, history, suggested CRM questions, prompt entry, transcription, and send controls. No prompt was sent. |
|  | Voice Agents | Agents, Upcoming calls, Recent calls; New Agent; assignment through a workflow or bulk call assignment. No setup entered because it may lead to real calling. |
|  | Getting Started | Welcome, demo registration, email verification, contact/email/calendar sync, phone setup, and lead/contact import. |
| **Inbox** | Current, Done, Future | Work queues organized by time state. |
|  | Primary, Emails, Calls, Messages, Tasks, Reminders, Potential Contacts | Type-specific queue segmentation with owner scope, selection, filter, and due-date ordering. |
|  | Filters | Lead Status, Opportunities, Smart View. |
| **Opportunities** | Pipeline | Pipeline selector, close-date/lead/user filters, value basis, Needs attention, board options, copy link, drag-to-stage intent. |
|  | List | Smart View, user, status, time period, group-by, sort, and export controls. |
| **Leads** | List | List-type selector; email, call, more actions; Save as; filters; limit; sort; columns; create and import entry points. |
|  | Create Lead | Company name, contact name, phone, email; import and potential-contact alternatives. |
|  | Filter builder | Cross-object families: Leads, Contacts, Opportunities, Addresses, Emails, Calls, Meetings, SMS, Communication, Notes, Tasks, Call Tasks, Workflows, Imports, Custom Activities, Custom Objects, and Form Submissions. |
| **Contacts** | List | Same operating grammar as Leads, with contact-scoped list results and lead-creation entry points. |
| **Activities** | Type chooser | Calls, Emails, SMS, WhatsApp, Meetings, Notes, Custom Activities, and Forms. |
|  | Calls / Emails | Dedicated activity queues with Save as, More, filter, limit, date ordering, and columns. |
| **Conversations** | History | Phrase search, match operator, user/agent scope, lead scope, More filters, Save as, and copy link. |
|  | Live Calls | All Users selector plus active-call and today’s-meetings monitoring. |
| **Workflows** | Active, Chloe, Credit Usage, Archived | Search, owner selector, columns for call tasks, statistics, and last activity. |
|  | New Workflow | Start from scratch; Cold Outreach, Customer Onboarding, Demo Follow-up, Lead Nurturing, Missed Demo, and Renewal Campaign templates; natural-language intended-workflow prompt. |
| **Reports** | Activity Overview | Saved-report selector, save, date range, compare, lead/user scope, metric tiles, leaderboard, tile creation. |
|  | Activity Comparison | Save As, time/compare/lead/user controls, metric comparison table, per-measure menus. |
|  | Opportunity Funnels | Outcome state, period, comparison, pipeline, user, Smart View, metric basis, funnel calculations. |
|  | Additional visible report links | Calls, Status Changes, Explorer, Sent Email. These were visible in navigation but not fully opened before the account-level audit pivoted to settings. |
| **Smart Views / Saved Views** | Catalogue | Type, sharing, creator filters; text search; sortable metadata; row-level menus; private default report views. |
| **Settings** | General | Account, Appearance, Memberships. |
|  | Organization | General, Team Management, Roles & Permissions. |
|  | Customization | Custom Activities, Custom Fields, Custom Objects, Shared Fields, Integration Links, Scheduling, Statuses & Pipelines, AI Knowledge Sources. |
|  | Communication | Phone & Voicemail, Playbooks & Outcomes, Notetaker, Email, Templates & Snippets, Send As, Blackout Dates. |
|  | Connect | Forms, Integrations, Accounts & Apps, Developer. |
|  | Billing | Plan, Telephony Usage, AI Credit Usage. |
| **Developer** | API Keys | Key list and New API Key. |
|  | OAuth Apps | Registered-app list and Create App. |
|  | Webhooks | Active/Paused subscription views, Event Log, developer documentation. |

## Close Object and Workflow Findings

### Leads and Contacts

Close uses Leads as the principal account-like sales record and Contacts as related people, while retaining a single operational list grammar across both. Lists foreground search, filters, column selection, sort, result limits, saved-view persistence, multi-select context, and direct communication actions. The Lead creation form is intentionally sparse: company name, contact name, phone, and email, with import and potential-contact flows placed beside it rather than hidden elsewhere. This reduces friction in early funnel capture while treating richer enrichment as an incremental process. [1]

The filtering model is especially material. A contact list can be constrained not only by contact fields, but by lead lifecycle, opportunity state, addresses, communication history, tasks, workflow status, imports, custom activities, custom objects, and form submissions. The observed Lead condition set includes lifecycle, lifecycle dates, authorship, source, contact-method counts, activity counts, local time, Smart View membership, name, description, URL, and custom fields. A generic text condition uses an operator selector with `contains exact words…` as the visible default. [1]

### Opportunities and Pipelines

Close’s pipeline board treats stage as the organizing principle and supporting data as optional overlays. The trial board includes stage columns for Demo Completed, Proposal Sent, and Contract Sent, with options to display lead status, contact, notes, suggested actions, last touchpoint, and custom fields. Outcome stages Won and Lost sit within the same configured pipeline and drive funnel analytics. The opportunity list is a reporting-friendly complement to the board, with user, status, time, grouping, sort, Smart View, and export controls. [2]

### Tasks, Activities, and Conversations

Close separates working queues from historical evidence. Inbox prioritizes *what should be handled now* and supports Current, Done, and Future states; activity-type tabs; owner and due-date controls; potential contacts; and smart filters. Activities provides type-specific operational lists for calls, emails, SMS, WhatsApp, meetings, notes, custom activities, and form submissions. Conversations provides a phrase-searchable history and a distinct live-call monitor. This division avoids a single overloaded timeline while preserving a shared data model behind the views. [3] [4]

### Reporting, Saved Views, and Workflows

Close’s reporting is composed from saved report views rather than a single static dashboard. Activity Overview supplies time, comparison, lead scope, and user/agent scope across discrete metric tiles. Activity Comparison converts the same measurements into a cross-user grid, and Sales Funnel converts configured opportunity statuses into velocity, conversion, weighted value, time-to-advance, and loss analysis. [5] [6]

Saved Views are an organization-level catalogue across record and report contexts, with sharing metadata, creator, recency, and searchable sortable administration. Workflows provide templates and natural-language assistance, but the product also separates Active, archived, credit-use, and agent-related states to make automation observable and governable. [7] [8]

## Product and UX Principles Derived from Close

| Principle | Observed design decision | Why it matters for InsightOS |
|---|---|---|
| **One list grammar, multiple operational objects** | Leads, Contacts, activities, and saved views reuse filters, limit, sort, columns, and Save as. | Build one reusable CRM list engine rather than bespoke tables for contacts, companies, deals, tasks, and communications. |
| **Two complementary work surfaces** | Inbox answers what is due; activity and conversation history answer what happened. | Keep InsightOS’s unified timeline, but add a real execution queue rather than using contact detail as the sole next-action surface. |
| **Progressive disclosure** | Pipelines show stage/value first; board options expose context only when needed. | Preserve InsightOS’s clean CRM board and add configurable card context rather than permanently increasing density. |
| **Configuration is part of the product** | Pipelines, lead statuses, fields, roles, limits, compliance, and integrations are visible operating surfaces. | Ship CRM administration selectively for the objects that support daily selling; do not hide critical lifecycle configuration in code. |
| **Safety is operational UX** | Sending limits, unsubscribe configuration, predictive-dialer abandonment messages, role models, and API/webhook governance are explicit. | Keep Gmail/Twilio disabled until credentials and policies exist, then make opt-out, ownership, limits, audit, and consent first-class. |
| **Empty states teach the next action** | Every empty list or queue identifies why it is empty and offers a safe next step. | Retain InsightOS’s good staged empty states; add task-oriented links that never urge unsafe provider activation. |
| **Metrics are derived from the same configuration used to operate** | Pipeline stages drive board and funnel calculations; user and Smart View scopes persist across reports. | Do not create a separate reporting model. Extend the current CRM pipeline/task/activity source of truth and add filters and drill-downs. |

## Capability Comparison: Close and Current InsightOS

The matrix below is a product comparison, not a request to imitate Close indiscriminately. “Available” means present in current InsightOS source and confirmed in the existing safe staging preview; “partial” means data model or interface exists but lacks the operating depth observed in Close; “defer” means the capability should remain unavailable until provider credentials, policy decisions, and compliance controls are explicitly approved.

| Capability | Close observed behavior | InsightOS current state | Assessment and recommended direction | Primary InsightOS areas |
|---|---|---|---|---|
| **Legacy preservation** | Close is a standalone CRM with its own lead/contact model. | **Available and differentiated.** Legacy leads, calls, conversations, clients, payments, team, and tracking data remain intact; CRM uses additive links and adapter views. | Preserve this advantage. Never make a Close-inspired migration destructive, rename legacy tables, or force a legacy record into a native CRM record. | `supabase/migrations/20260822130000_sales_crm_foundation.sql`; `docs/crm-foundation-audit.md` |
| **Lead/contact list** | Dense lists with reusable search, filters, columns, sort, limit, save, and action patterns. | **Partial.** `/sales` exposes a native/legacy contact list with local text filtering and bulk lifecycle update for native contacts. | Replace local-only filtering with a reusable, server-backed list engine; preserve a clear native-versus-legacy source badge and read-only legacy behavior. | `src/routes/_authenticated.sales.tsx`; `crm-foundation.server.ts` |
| **Record detail** | Not populated in trial; Close’s list grammar implies deep object-based records. | **Partial, strong foundation.** Contact workspace unifies CRM activity/notes, legacy notes/events/calls/conversations, companies, opportunities, and tasks. Native contacts can be edited and linked; legacy leads remain preserved/read-only. | Keep this unified historical context. Add opportunity and company record pages; deepen task, owner, relationship, and activity controls. | `src/routes/_authenticated.sales.contacts.$id.tsx` |
| **Companies/accounts** | Leads act as company-like records with associated contacts. | **Partial.** Companies and contact links exist; creation and contact association are available. | Add company list/detail, related contacts/deals/tasks, ownership, and filtering before introducing custom objects. | `crm_foundation` schema and server functions |
| **Pipelines/stages** | Configurable board, values, stage context, and funnel use the same stage model. | **Partial.** Native pipelines/stages, stage movement, status derivation, probabilities, and board are available. | Add manager-only stage editor/reorder, stable pipeline settings, card-context preferences, and deal detail before drag/drop. | `crm_pipeline*`; `/sales` board; `moveCrmOpportunityStage` |
| **Opportunities** | Board and list with rich filters, date/user/status grouping, exports, and funnel tie-in. | **Partial.** Create, render by stage, link to contacts/companies, and move stage. | Add opportunity detail, inline amount/close-date/owner/source edits, close/win/loss review, loss reasons, and related task/activity panels. | `crm_opportunities`; `/sales`; `crm-foundation.server.ts` |
| **Tasks and work queue** | Inbox separates Current/Done/Future and activity types, owner, due date, filters, reminders, and task execution. | **Partial.** Tasks have priorities, due dates, linked context, server status mutation, and a compact open-task queue. | Treat this as **highest product gap**: add my/team queues, overdue/due-today/future states, assignment, reopen/cancel, reminders, bulk follow-up creation, and record context. | `crm_tasks`; `/sales`; `updateCrmTaskStatus` |
| **Activities/timeline** | Dedicated activity lists by call, email, SMS, meeting, note, custom activity, and form. | **Partial.** Normalized activities exist; contact detail merges native and legacy evidence. | Add filterable activity views and rich typed activity rendering. Do not break legacy chronology or duplicate historical records. | `crm_activities`; contact workspace |
| **Conversations and inbox** | Separate historical search, live calls, and a task-oriented inbox. | **Partial and intentionally safe.** Provider-neutral threads plus legacy conversations render in a unified, read-only inbox; channels filter locally. | Add thread detail, state/ownership, internal notes, and queue semantics first. Keep send/reply/call/SMS unavailable until Gmail/Twilio setup is approved. | `/sales/inbox`; `crm_communications_foundation.sql` |
| **Email account and send controls** | Account connections, automated-workflow sender selection, secret forwarding address, signature, tracking, limits, unsubscribe link. | **Deferred by design.** Gmail is not enabled; no communications accounts are seeded in staging. | Preserve deferment. If enabled later, ship account connection, consent/opt-out, sender identity, rate limits, audit log, failure recovery, and role checks together. | `crm_communication_accounts`; provider setup documentation |
| **Telephony and SMS** | Phone numbers, voicemail drop, dialer, blocked numbers, compliance, regulated predictive-dialer message, live calls, voice agents. | **Deferred by design.** Twilio callback architecture only; no SDK, number, account, token, webhook activation, or sending/calling UI. | Do not prioritize. Require provider credentials, consent policy, number ownership, opt-out, regional compliance, recording disclosure, and staging callback tests. | `src/routes/api/public/twilio.$event.ts`; `docs/crm-communication-setup.md` |
| **Global search** | Persistent global search, plus object-specific phrase search and cross-object filter builder. | **Partial.** CRM search spans adapter contacts, companies, opportunities, and tasks but returns a lightweight result model. | Expand to ranked, type-aware results with keyboard navigation; make results land on the exact record or filtered workspace rather than defaulting to `/sales`. | `searchCrmRecordsForUser`; `GlobalCrmSearchButton` |
| **Saved views** | Global catalogue with type, sharing, author, metadata, usage, and report/list variants. | **Partial.** Entity-scoped model supports filters, columns, and sort; current UI primarily consumes contact views. | Build shared/private view management across contacts, companies, opportunities, tasks, and inbox; add apply, duplicate, delete, default, owner, and last-used controls. | `crm_saved_views`; `/sales` Saved Views dialog |
| **Filtering and columns** | Deep filter builder and configurable list fields across many record relationships. | **Gap.** Current main workspace uses local text matching; fixed table columns dominate. | Create a typed filter AST and a safe server query compiler. Start with contact/company/opportunity/task fields, ownership, lifecycle, due date, and legacy/native source. Add advanced relationship filters after performance and RLS review. | New reusable CRM list/query module; server functions |
| **Reporting** | Saved reports, date and comparison controls, lead/user scopes, scorecards, comparison grids, funnel metrics, time-to-advance, velocity, loss analysis. | **Partial.** Staging report has real open/weighted pipeline, won totals, task health, stage rollups, and activity counts. | Add date range, owner/team, pipeline/stage, source, lifecycle, and view filters; then drilldowns and report saving. Do not fabricate funnel timing from missing historical data. | `/sales/reports`; `getCrmReportForUser` |
| **Automation/workflows** | Template/start-from-scratch builder, active/archived/credit states, ownership, statistics, natural-language intent. | **Modeled, non-executing.** Rule/runs schema, automation UI, inactive default, and audit reasoning exist. | Add a true rule builder, dry-run, eligibility preview, approval, run log, idempotency, and kill switch before any dispatcher. Provider actions must remain gated. | `/sales/automations`; `crm_automation_rules`; `crm_automation_runs` |
| **Custom fields** | Lead/contact/opportunity scoped fields, shared definitions, enrichment templates, auto-update guidance. | **Schema foundation exists, UX gap.** Custom fields are part of the CRM foundation but not an operating configuration surface. | Implement field definitions only after list engine and record forms are stable; keep tenancy, validation, and immutable migration properties explicit. Do not add AI auto-enrichment initially. | `crm_custom_fields`; contact/company/opportunity forms |
| **Custom activities and custom objects** | Configurable structured activities and business-specific object types. | **Not a current priority.** Native activity exists; generic custom object support is absent. | Defer. First prove the core contact-company-opportunity-task model. Add structured custom activities before arbitrary custom objects, and only for a demonstrated business need. | Future additive migrations only |
| **Teams and permissions** | User/group/domain management, system/custom roles, 2FA, send-as, call-record settings. | **Partial.** Existing role model plus a new `sales_crm` permission resource; server functions resolve workspace from authenticated user. | Add visible owner/assignee and CRM role UX; retain server-side authorization. Defer enterprise group/domain complexity until teams demand it. | `src/lib/permissions.ts`; authentication middleware |
| **Integrations and developer APIs** | Marketplace, REST API, MCP, API keys, OAuth apps, webhooks, event log. | **Foundation only.** Twilio webhooks and Supabase-backed app APIs are available; no generic public CRM API or user-managed integration UI. | Do not build a broad marketplace. Define a narrow outbound event contract and internal event log after workflow governance exists; use per-connector credentials outside client code. | Future event/outbox module; existing Twilio handler |
| **Onboarding** | Checklist guides email verification, data sync, phone, imports, and demo. | **Partial.** Staging preview and source documents exist, but no CRM onboarding checklist. | Add role-safe onboarding specific to InsightOS: review preserved leads, create a pipeline, create first native contact, link company, create follow-up task. Never put provider setup in the default checklist. | `/sales`; docs; new onboarding component |

## Material Product Gaps, Ordered by Value

### Priority 0: finish daily selling operations before adding channels

1. **Task operating system.** The most consequential Close pattern is not telephony or AI; it is the clear next-action queue. InsightOS should turn `crm_tasks` into Current / Due today / Overdue / Upcoming / Completed views, provide assignment and completion/reopen/cancel actions, preserve linked record context, and allow safe bulk creation. This converts CRM data from a dashboard into a workbench.

2. **Opportunity detail and lifecycle.** Current stage movement is valuable, but a salesperson still needs a place to understand a deal, change close expectations, capture loss reasons, see next actions, and view related people/company/history. Add a dedicated `/sales/opportunities/:id` workspace, with simple, auditable mutations rather than early drag-and-drop complexity.

3. **Reusable server-backed list engine.** Filters, sorting, paging, columns, and saved views should be shared infrastructure. Begin with conservative fields and explicit query bounds. Implementing this once is lower risk than recreating local filtering per page and is the prerequisite for Close-like speed.

4. **Record relationships and ownership.** Extend the current contact record with explicit owner, company primary-contact behavior, related opportunities/tasks, and source-aware identifiers. Build the company detail record at the same time. This makes relationship structure visible without modifying legacy sources.

### Priority 1: make the foundation measurably manager-ready

5. **Reporting controls and drilldowns.** Retain real calculations already present; add time, team/owner, pipeline/stage, lifecycle, and source scope, then link every chart/metric to a filtered list. Introduce saved reports only after report controls are predictable.

6. **Inbox lifecycle without provider activation.** Add a thread detail layout, read/unread and assignment state stored in CRM tables, internal note capability, source/channel filters, and links from messages to contact/deal/task context. Existing legacy conversations remain immutable evidence. Sending, SMS, calling, and external account connection remain deferred.

7. **Saved-view administration.** Extend the present contact-view UI to all CRM lists, private/shared visibility, default view selection, view ownership, duplicate/delete, and applied-filter chips. Use a typed filter format rather than raw JSON in the UI.

8. **Pipeline and lifecycle administration.** Add manager-only configuration for stages, stage probability, open/won/lost semantics, order, and archival. Existing opportunities must remain valid if a stage is retired; archive rather than delete referenced stages.

### Priority 2: safe scale and controlled customization

9. **Automation rule builder and dry-run.** Replace the current documented pending action with typed triggers, conditions, actions, eligibility preview, manual test data, idempotency keys, run records, errors, kill switch, and role-gated enablement. Start with internal actions: create task, notify owner, change lifecycle, or add note. Defer outbound communication actions.

10. **Custom fields and structured activities.** Add manager-governed fields for the native CRM objects only, record-level render/edit components, list filters, and exports. Introduce structured custom activities only once an actual operator workflow cannot fit notes/tasks/activities.

11. **An operator onboarding checklist.** Use the safe staged route, not provider upsell: review legacy records, configure pipeline, create native contact, link company, make follow-up task, inspect report. Add contextual help and empty-state actions as data remains sparse.

### Explicit Non-Priorities

The following Close features should **not** be implemented merely for parity: a marketplace catalog, predictive dialer, voice agents, mass email accounts, a general-purpose custom-object engine, AI enrichment, generic public OAuth apps, and contact import from production sources. Each can cause financial, compliance, data-quality, or support obligations that are disproportionate before the core daily operating loop is complete.

## Compatibility-First Implementation Roadmap

The roadmap below is deliberately additive. It sequences work so that every release produces a usable operating improvement, has a clear rollback story, and continues to preserve legacy sales evidence. Durations are sizing bands for product planning, not commitments; they assume the existing repository architecture, staging environment, authenticated-server-function boundary, and Supabase RLS model remain the implementation base.

| Release slice | User outcome | Additive data and service work | UI and interaction work | Legacy preservation and safety gate |
|---|---|---|---|---|
| **R1 — Task and deal operating loop** | A seller can see what is due, execute a next step, and manage a deal’s expected outcome. | Add optional task assignment/completion metadata only if not already captured; expand server mutations for task status and opportunity fields; append activities for every native update. | My Tasks / Team Tasks, overdue/due-today/upcoming/completed queues; task quick actions; new opportunity detail page; edit amount, close date, owner, source, and loss reason. | Existing legacy calls, notes, events, and conversations remain read-only. RLS verifies organization and assignee/manager access on each mutation. |
| **R2 — Unified lists, filters, and views** | A manager can work across contacts, companies, deals, and tasks without losing context or manually recreating a query. | Introduce a versioned typed filter AST, bounded server query compiler, paged result contracts, view audit events, and view lifecycle fields. | Reusable list header, filter chips, field chooser, sort, pagination, private/shared/default views, row selection, context actions. | Source badge and legacy adapter conditions prevent native-only mutations from touching legacy rows. Query plan/index review precedes release. |
| **R3 — Company and pipeline administration** | Ownership, account context, and stage configuration are explicit and manageable. | Add non-destructive stage archive/reorder fields; prevent stage deletion when referenced; add company detail/read model and ownership relations. | Company list/detail, relationship manager, pipeline settings, stage editor, board card-display settings, archival affordances. | Referenced stages are archived rather than deleted; legacy lead lifecycle is not remapped or overwritten. |
| **R4 — Reporting and inbox operations** | Managers can answer where pipeline and work are moving; sellers can triage history safely. | Add report scope and drilldown contracts; store inbox assignment/read/internal-note state only in CRM tables; improve activity-target queries and indexes. | Date/owner/pipeline/source filters, metric drilldowns, saved report presets; inbox thread detail, source/channel filters, assignment, internal notes. | No Gmail, Twilio, email, SMS, or call execution. Legacy communication content remains visible and immutable. |
| **R5 — Governed automation** | Repetitive internal CRM maintenance can run only when auditable and controllable. | Typed rule schema, event/outbox model, idempotency, eligibility evaluation, dry-run records, approval/enablement state, run logs, kill switch. | Rule builder, intent preview, dry-run results, run inspector, role-aware enable/disable confirmation. | Start with internal create-task/change-lifecycle/add-note actions. Outbound actions require separate provider-activation review. |
| **R6 — Optional provider activation** | Only if approved, accounts can securely communicate from InsightOS with visible limits and auditability. | Credential vault/connector configuration, account health, consent/opt-out model, provider webhook signature verification, delivery/retry state, rate limits. | Account connection/settings, channel composer, delivery state, template governance, explicit activation confirmation. | Separate staging certification; no production activation without credentials, compliance decision, consent handling, and user approval. |

### Workstream Acceptance Criteria

#### R1 — task and opportunity loop

A task must be explicitly attributable to an owner, linked to zero or more permitted native CRM contexts, and retain a complete state history. The UI must make due date, priority, current state, and related record obvious at a glance. Completion, reopening, cancellation, and assignment must result in normalized native activities. An opportunity detail view must show stage, amount, probability, expected close, owner, contacts, company, tasks, notes, and activities. Moving an opportunity to a terminal stage must derive won/lost state from stage semantics, store close metadata, and preserve a loss reason without changing legacy lead/call states.

#### R2 — list engine and views

Every list must use a bounded query contract with a hard maximum page size, deterministic sort, and organization-scoped RLS. Filters must be represented as typed clauses rather than arbitrary client JSON. A native action must be disabled for legacy adapter rows, and a legacy row must open its preserved context rather than an unsafe editable representation. Saved views need private/shared visibility, creator, created/updated timestamps, versioned filter data, and a non-destructive archive/delete policy. No browser-only filter state should become a business-critical view.

#### R3 — administration

Pipeline configuration should reuse the current stage model rather than introduce a second sales-status system. A manager can create a stage, edit a stage, reorder active stages, and archive a stage. The service must reject deleting a referenced stage and must return an actionable message. Company and contact relationships should use explicit association records with a primary marker, not inferred text fields. Ownership should use the existing membership/auth identity domain consistently and never the incompatible legacy `team_members.id` domain.

#### R4 — reports and inbox

Reports must calculate only from data available to the CRM and label the selected date interval, owner scope, pipeline scope, and metric definition. Drilldowns must show the underlying records subject to the same security constraints. Inbox changes must create native CRM activity/audit entries; they must not mutate legacy conversation payloads. The inbox needs a visible provider state so operators understand why compose actions are unavailable.

#### R5 and R6 — automation and providers

Automation must not become a silent system. Every enabled rule needs a named owner, documented scope, test path, audit/run history, explicit state, and immediate disable control. Provider activation must have independent staging evidence and a signed webhook test. Sending or calling must never be enabled simply because a database row exists; it requires confirmed account health, policy/consent, role permission, rate control, and an explicit active setting.

## Design and UX Direction for InsightOS

Close is dense and utilitarian. InsightOS should borrow the efficiency, not the visual treatment. The current Sales CRM staging preview already has a more spacious card-and-rail pattern and a valuable record workspace that combines new CRM context with preserved history. Maintain that visual hierarchy and make the operating state more obvious.

| Surface | Recommended InsightOS direction | Avoid |
|---|---|---|
| **Sales home** | Keep the current overview, but lead with a “My work” strip: overdue tasks, due today, unassigned leads, stalled deals, and recent messages. Follow with configurable list and board tabs. | A dashboard of static vanity metrics that does not lead to an action. |
| **List pages** | Use a shared toolbar: search, filters, sort, columns, view selector, save, and bulk actions. Keep source/legacy badges visible. | Copying Close’s dense control count before the list engine supports it. |
| **Record workspace** | Preserve the three-column pattern: identity/context, unified chronological activity, related work/deals/company. Add quick actions only when permission and record source allow them. | Hiding legacy information behind a migration screen or distributing history across unrelated tabs. |
| **Pipeline** | Continue a card board with stage totals and accessible move controls. Add optional card context settings and a deal-detail route. | Introducing drag-and-drop as the first or only stage-move interaction; it is not necessary for the first robust workflow. |
| **Inbox** | Show thread state, owner, source channel, related contact/deal, last activity, and explicit read-only/provider-disabled state. | A composer that appears active while no safe provider is configured. |
| **Reports** | Use metric cards with scope labels and drilldowns first; then add manager presets and comparisons. | Charts that cannot be reconciled to a filtered record list or that imply metrics absent from the data. |
| **Automations** | Make “inactive by default”, dry-run, owner, test data, and run history visible. | One-click activation, hidden background actions, or externally sending workflow templates. |

## Implementation Inventory

The following is a planning inventory, not a committed migration list. It shows where the next work should concentrate, preserving the current architecture rather than replacing it.

| Area | Existing foundation | Likely additive follow-up |
|---|---|---|
| `supabase/migrations/20260822130000_sales_crm_foundation.sql` | Contacts, companies, associations, pipelines, opportunities, tasks, activities, notes, custom fields, legacy links, RLS. | A new later-dated migration for task ownership/history if missing, opportunity detail metadata, stage archive/order, view-query versioning, inbox state, and reporting-support indexes. |
| `supabase/migrations/20260822140000_crm_communications_foundation.sql` | Provider-neutral accounts, threads, messages, deliveries, call sessions/recordings, legacy conversation adapter. | Internal note/read/assignment state and thread detail support may be added without provider activation. Sending/delivery provider work remains separate. |
| `supabase/migrations/20260822150000_crm_operations_foundation.sql` | Saved views, audited bulk operations, automation rules/runs, RLS. | Typed saved-view clauses, rule versions, approval/dry-run/audit expansion, event/outbox model. |
| `src/lib/crm-foundation.functions.ts` and `.server.ts` | Authenticated user/workspace resolution, CRM read/write boundaries, contact/company/pipeline/opportunity/task actions, inbox, report, search, saved views, automation. | New bounded list/query functions, company/opportunity detail read models, assignment/ownership mutations, report scope/drilldown functions, structured rule test handlers. |
| `src/routes/_authenticated.sales*.tsx` | Sales overview, contact record, inbox, reports, automations. | Add `/sales/companies`, `/sales/companies/:id`, `/sales/opportunities/:id`, task-focused route, list-view component, configuration routes, and targeted route tests. |
| `src/lib/permissions.ts` | `sales_crm` resource integrated with existing roles. | Granular capabilities for manager configuration, view sharing, reporting, automation enablement, and provider account control—only when each feature exists. |
| `src/routes/api/public/twilio.$event.ts` | Web Crypto signature verification and idempotent external events. | No change until a separately approved Twilio activation initiative. Keep any callback work staging-only. |

## Validation Plan

Every release should be evaluated with the following tests before an isolated staging preview is shown to users.

| Validation layer | Minimum evidence |
|---|---|
| **Schema and migrations** | Migration applies to a fresh staging schema; no legacy table is dropped, renamed, truncated, or rewritten; RLS is enabled for new tables; indexes support tested filters. |
| **Relational preservation** | Synthetic fixture includes legacy lead, note, call, conversation, message, client, payment, contact, company, opportunity, task, activity, view, and automation relationships. Count and join checks demonstrate zero broken seeded references. |
| **Authorization** | A user cannot read or mutate another organization; a non-manager cannot open manager-only configuration; a native-only mutation rejects legacy adapter identifiers. |
| **Workflow behavior** | Task completion/reopen/assignment, opportunity stage changes, company links, notes, filters, saved views, and report drilldowns emit expected activities/audits and update the correct screens. |
| **Provider safety** | Staging has zero configured communication accounts unless a separate provider activation test explicitly creates them; Gmail/Twilio controls remain disabled; no secrets appear in source, client bundles, logs, or reports. |
| **UX review** | At least one sparse and one realistic relational fixture are checked across desktop and responsive widths. Empty states explain next steps without suggesting unsafe connection/activation. |
| **Regression** | Existing test suite passes; production build passes; no local/production Supabase project is queried, migrated, or seeded during staging work. |

## Audit Limitations

The Close trial was empty. Therefore the audit does **not** claim to have inspected populated Lead, Contact, Opportunity, task, call, email, workflow-run, reporting drilldown, import, integration-authentication, or record-permission states. It also did not invoke communication, telephony, API key, OAuth, webhook, billing, phone-number, data-sync, or import actions. Where Close menu labels showed a capability, the report describes that visible surface; it does not infer undocumented behavior or underlying implementation.

The InsightOS comparison is grounded in the current repository and the existing isolated staging build, not production data. It intentionally recommends staging-only, synthetic, compatibility-first iteration. Production and local databases remain out of scope.

## Conclusion

InsightOS should aim to become a **safer and more context-rich sales operating system** than a superficial Close clone. The essential differentiator is already present: native CRM work can grow around legacy history without deleting or abandoning the system that generated that history. The next step is disciplined depth, not breadth. Build task and deal operations; unify list and view grammar; deepen relationships and reporting; make the inbox safe and useful before it sends; then add governed automation. Provider, AI, and telephony capabilities can follow when the core workflow is measurable, trusted, and operationally controlled.

## References

[1]: https://app.close.com/leads/ "Close Leads and Contacts lists — authenticated trial observed August 23, 2026"
[2]: https://app.close.com/opportunities/pipeline/ "Close opportunity pipeline — authenticated trial observed August 23, 2026"
[3]: https://app.close.com/tasks/inbox/ "Close Inbox — authenticated trial observed August 23, 2026"
[4]: https://app.close.com/conversations/history/ "Close Conversations history — authenticated trial observed August 23, 2026"
[5]: https://app.close.com/reporting/overview/ "Close Activity Overview — authenticated trial observed August 23, 2026"
[6]: https://app.close.com/reporting/opportunity-funnels/ "Close Sales Funnel — authenticated trial observed August 23, 2026"
[7]: https://app.close.com/saved-views/ "Close Saved Views — authenticated trial observed August 23, 2026"
[8]: https://app.close.com/workflows/ "Close Workflows — authenticated trial observed August 23, 2026"
[9]: https://app.close.com/settings/statuses/ "Close Statuses & Pipelines — authenticated trial observed August 23, 2026"
[10]: https://app.close.com/settings/custom-fields/lead/ "Close Custom Fields — authenticated trial observed August 23, 2026"
[11]: https://app.close.com/settings/email/ "Close Email Settings — authenticated trial observed August 23, 2026"
[12]: https://app.close.com/settings/phone/ "Close Phone & Voicemail Settings — authenticated trial observed August 23, 2026"
[13]: https://app.close.com/settings/developer/api-keys/ "Close Developer Settings — authenticated trial observed August 23, 2026"
[14]: ../docs/crm-foundation-audit.md "InsightOS CRM foundation and preservation rules"
[15]: ../docs/staging-preview-runbook.md "InsightOS isolated staging configuration and validation runbook"
[16]: ../src/lib/crm-foundation.functions.ts "InsightOS authenticated CRM function boundary"

