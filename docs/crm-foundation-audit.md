# Sales CRM Foundation Audit

**Status:** Source-level audit complete; live-database inventory and backup are required before migration execution.

## Existing Application Foundation

C4 InsightOS is a multi-tenant TanStack Start application backed by Supabase Postgres, with RLS enabled on business tables. The authenticated product shell already provides role-aware navigation and server-side function boundaries. The existing permission catalogue defines sales-specific roles—Admin, Sales manager, DM setter, Closer, and Viewer—which should be extended for CRM resources rather than replaced.

The existing `leads` record is a valid migration source, not a disposable legacy table. It has an organization relationship, owner assignment through `assigned_setter_id`, contact details, social handle, source attribution, original content touchpoint, lead status, qualification notes, scoring, objections, connector provenance, and timestamps. Subsequent migrations add the structured application payload, free-form notes, priority, pre-call-video state, and pipeline-stage value.

## Data Preservation Inventory

| Existing source | Preserve in the CRM foundation | Migration / compatibility treatment |
|---|---|---|
| `leads` | Identity, contact data, source, owner, status, scoring, qualification data, notes, priority, pre-call state, original stage | Retain table; introduce CRM profile/relationship adapters and a stable CRM lead record keyed to the existing lead ID. |
| `lead_events` | Historical lead lifecycle events | Backfill or expose as CRM activities without deleting the source events. |
| `lead_notes` | Existing operator notes | Retain as the note source; expose through the unified record timeline and backfill normalized activities. |
| `lead_content_touches` | Content attribution and buying journey | Preserve as immutable attribution activities attached to the CRM lead/contact timeline. |
| `conversations` and `messages` | Existing DM conversation threads and message history | Treat as a pre-existing communication channel; map to provider-neutral communication threads and message activities. |
| `calls` and `call_objections` | Scheduled/closed calls, revenue, recordings, summaries, objections, rep ownership | Retain as the legacy sales-call source; map to CRM calls and opportunity/revenue activities. |
| `clients` and `payments` | Post-sale client and realized revenue relationships | Keep existing client/fulfillment operations intact; relate winning opportunities to the existing client and payment records. |
| `memberships`, profiles, permissions | Workspace tenancy, team ownership, access rules | Extend the existing role/resource catalogue. Do not create a separate rep or team model. |
| `events` and webhook delivery records | Auditable event stream and outbound-delivery history | Reuse as the domain-event/audit foundation, with CRM-specific event types and idempotent external-event records. |

## Current Capabilities That Can Be Reused

The application already has authenticated server-function patterns, a service-role Supabase client reserved for backend work, org-scoped RLS policies, a `tg_set_updated_at` trigger, tags and generic taggables, source attribution, basic lead notes, call records, conversation/message records, and a generic event stream. Its current public ingest endpoint also establishes a useful pattern for validated payloads, server-only writes, and event logging.

## Target Foundation Architecture

The CRM foundation should be additive. It should introduce CRM-native contacts, companies, opportunities, pipelines, pipeline stages, tasks, normalized activities, record links, custom-field definitions/values, saved views, audit records, provider-neutral communication accounts/threads/messages, and external-event idempotency records. Existing tables remain authoritative for their present operational domains until each compatibility adapter has been validated.

The future Gmail and Twilio layers will write provider-neutral communication data and normalized CRM activities. Gmail and Twilio credentials must remain server-side. Twilio callback endpoints must be HTTPS-only, validate the provider signature, record events idempotently, and attach each event to the matched CRM record before surfacing it in the timeline.

## Migration Rules

1. No existing sales table is dropped, renamed, or destructively altered in the foundation milestone.
2. New tables receive organization scoping, foreign keys, indexes, timestamps, RLS, and least-privilege policies before any UI is connected.
3. Every migration is forward-only and idempotent where feasible.
4. Existing record IDs are retained in explicit compatibility relationships rather than copied without traceability.
5. Backfills are logged, reversible by adapter disablement, and validated with row-count and relationship checks.
6. The current Leads route continues operating until the replacement CRM workspace has passed regression validation.

## Live Database Audit Required Before Migration Execution

The sandbox clone intentionally has no `.env` or Supabase credentials, so it can audit source migrations but cannot truthfully inventory the live database or create a backup. Before applying the first migration, obtain a read-only schema/data inventory and a database backup from the production Supabase project. The audit must confirm actual table counts, current enum values, nullability, indexes, RLS policies, orphaned references, organization coverage, and the presence/shape of recent lead, call, conversation, client, and payment records.

No production migration should be executed until this evidence is captured and reviewed.
