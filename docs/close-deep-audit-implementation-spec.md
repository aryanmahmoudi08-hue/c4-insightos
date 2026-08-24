# InsightOS CRM Completion Specification

**Status:** P0 implementation delivered and validated in isolated staging; the remainder of the roadmap is intentionally deferred.  
**Safety posture:** Additive, staging-compatible, provider-disabled, and legacy-preserving.

## Product Thesis

InsightOS should not replace its existing operating system with a generic CRM. Its differentiator is a native sales operating layer that can sit beside preserved lead, call, conversation, client, payment, team, and tracking evidence. Close is the benchmark for operational speed: consistent list controls, a strong task queue, concise stage-driven pipeline views, and explicit administration. InsightOS should adopt those principles while keeping a source-aware record model and safer provider boundaries.

## Target Navigation

| Navigation item | Primary job | Record safety |
|---|---|---|
| **Sales home** | My work, contact list, pipeline, activity, and saved views in one operating screen. | Legacy lead rows are visually source-badged and never edited through native mutations. |
| **Contacts** | Native contacts plus preserved lead adapter records. | Native edit/link/bulk actions only; legacy context stays visible and read-only. |
| **Companies** | Account context, relationships, related contacts, opportunities, tasks, and activity. | Native-only company records; no inferred rewrite of legacy clients. |
| **Opportunities** | Deal detail, forecast inputs, stage progression, related tasks and contacts. | Stage semantics derive open/won/lost state; terminal movement emits activity. |
| **Tasks** | Current / overdue / due today / upcoming / completed work queues. | Task status changes generate normalized activity and respect workspace membership. |
| **Inbox** | Read-only unified legacy/CRM communication history, then optional controlled provider workspaces. | No composer/sending until a provider account and policy is explicitly enabled. |
| **Reports** | Scoped pipeline, task, activity, and conversion outcomes with traceable drill-downs. | Metrics derived from CRM/legacy source data only. |
| **Automations** | Disabled-by-default rules, dry-run, audit log, explicit enablement. | No external action without separate staged provider activation. |
| **CRM settings** | Pipelines/stages, views, fields, permissions, and provider account health. | Manager-governed and additive; referenced configurations archive rather than delete. |

## Reusable CRM List Engine

A single list/query contract should eventually support contacts, companies, opportunities, tasks, and threads. The required shape is a versioned, typed filter AST—not a page-specific collection of arbitrary JSON flags.

```ts
type CrmListQuery = {
  entity: "contact" | "company" | "opportunity" | "task" | "thread";
  filters: Array<{
    field: string;
    operator: "eq" | "neq" | "contains" | "in" | "before" | "after" | "is_null" | "not_null";
    value?: string | number | boolean | string[];
  }>;
  sort: Array<{ field: string; direction: "asc" | "desc" }>;
  columns: string[];
  page: { size: number; cursor?: string };
};
```

The implementation must compile only an allow-listed field/operator set to organization-scoped queries. The UI should reuse the Close-inspired grammar—view selector, search, filter chips, sort, columns, result count, bulk actions—but it must retain InsightOS source badges and prevent native writes on adapter rows.

## P0 Implementation Slice

The current source already contains contacts, companies, pipelines, opportunities, tasks, activities, notes, saved views, search, and a provider-neutral inbox foundation. The highest-value missing operational depth that can be safely added now is:

1. **Opportunity workspace and lifecycle editing — delivered.** A native opportunity detail route resolves the stage/pipeline, related contact and company, tasks, and normalized activity. Existing stage movement remains authoritative for open/won/lost state and writes an activity event. Field-level deal editing beyond stage movement remains a later additive enhancement.
2. **Company workspace — delivered.** A native company detail route resolves explicit company-contact associations, related opportunities, tasks, and company-targeted activities. The association table remains the relationship source of truth.
3. **Task execution queue — delivered.** The home Tasks tab now reads all native CRM task states, provides Active/Open/In progress/Completed/Cancelled scopes, groups active work into Overdue/Today/Upcoming/No due date, and exposes authorized status transitions through the existing audited server mutation.
4. **Pipeline administration — delivered with integrity guardrails.** Managers can edit a stage name, probability, and display color. Terminal semantics can only change before a stage is referenced by an opportunity; referenced stages are never deleted or retroactively reclassified. Archive/retirement remains a future operation.
5. **Shared list controls — deferred.** The existing bounded contact search and saved views remain available, but the generalized toolbar and typed server-backed list-query contract remain the next safe implementation step rather than a claim of parity.

## Delivered P0 Evidence

| Area | Delivery | Integrity and authorization behavior |
|---|---|---|
| Opportunity navigation | `/sales/opportunities/$id` route linked from pipeline cards, contact related-deal cards, and global search. | Server resolves the active organization from authentication and tenant-checks every related record. |
| Company navigation | `/sales/companies/$id` route linked from opportunity and contact relationship cards plus global search. | Only explicit native CRM associations are read; no legacy client records are inferred or rewritten. |
| Task queue | State scopes, urgency groupings, and manager status selector. | Uses the existing manager-gated mutation, which appends task activity and updates only `crm_tasks`. |
| Pipeline stages | Manager-only edit dialog on each pipeline board column. | Terminal state changes are rejected for any referenced stage; no delete or destructive migration was added. |
| Staging validation | Production build passed and the existing automated suite passed (37/37). Visual staging checks covered sales home, time-grouped tasks, pipeline, opportunity detail, and company detail. | Synthetic fixture only; Gmail/Twilio remain unconfigured and no provider action was performed. |

## Non-Goals for This Slice

Gmail activation, Twilio activation, mass messaging, predictive dialers, voice agents, email/SMS compose, public API keys, OAuth apps, webhooks, AI enrichment, generic custom objects, and production migrations are intentionally out of scope. These are independent operational and compliance programs, not implementation shortcuts.

## Data and Authorization Decisions

* No legacy table, column, record, foreign key, tracking structure, or adapter view is dropped, renamed, overwritten, or used as the target of a native CRM mutation.
* Every new read or mutation resolves organization/workspace server-side from the authenticated user; no browser-supplied organization identifier is trusted.
* Manager-only configuration uses the existing `owner`, `admin`, and `sales_manager` boundary.
* Existing `crm_activities` and `crm_activity_targets` are the audit timeline for all native record changes. New task and deal operations must append activities rather than relying on client-only state.
* No provider settings, communication accounts, secrets, credentials, or webhooks will be created or stored.

## Validation Gates

The implementation compiled successfully and the existing automated suite passed (37/37). In the isolated C4 CRM Staging fixture, the sales home rendered preserved legacy source badges, the task queue showed overdue/today grouping and all state filters, pipeline cards opened both opportunity workspaces, and the company-linked deal opened the company workspace with its explicit contact and opportunity relationship. No stage or task mutation was executed during browser validation, so the synthetic fixture remains stable. No new migration was needed or applied; all additions use the existing CRM foundation schema. Gmail/Twilio remain disabled, and no communication account, provider credential, webhook, or automation enablement was created. The source patch passed `git diff --check`; legacy tables and structures were not changed.
