# Sales CRM Implementation Plan

**Status:** Approved architecture plan based on the repository and source-controlled migration history. It does not claim to represent unverified production row counts or live-data quality.

## Delivery Principle

The Sales CRM will be implemented **inside the existing C4 InsightOS application and Supabase project**. The work is additive: no existing sales table is dropped, renamed, truncated, or repurposed. The established organization, membership, RLS, role-permission, server-function, and event patterns remain the governing architecture.

The existing `leads` system remains a supported compatibility surface during the transition. New CRM records will maintain direct traceability to the current lead, call, conversation, client, payment, and team-ownership models. The original record IDs continue to be valid and queryable.

## Reconciled Repository Findings

| Area | Reusable foundation | Required CRM addition |
|---|---|---|
| Organization and access | `organizations`, `memberships`, `profiles`, role and member permission tables, org-scoped RLS helpers | CRM resources added to the existing permission catalogue; no new auth or rep system. |
| Lead history | `leads`, `lead_events`, `lead_notes`, content touches, video links, transcripts, setters’ call signals | Independent CRM contacts and normalized activity projections while keeping legacy lead data authoritative. |
| Conversations | Existing free-text `conversations.channel` and `messages` | Provider-neutral communication account, thread/message metadata, participant associations, delivery events, and external IDs. |
| Calls and revenue | `calls`, call objections, `clients`, `payments` | Opportunities, configurable pipelines/stages, call disposition metadata, and durable legacy-to-opportunity links. |
| Tags and custom data | Existing tags/taggables plus lead `tags` and application JSON | One CRM custom-field definition/value system; compatibility adapter for legacy lead tags and application data. |
| Operations | `events`, alerts, saved segments, webhook infrastructure | Normalized CRM activities, activity targets, CRM saved views, task system, and idempotent external-event layer. |
| Existing interface | Authenticated shell, sidebar, shadcn UI, TanStack Query and Start server functions | One Sales CRM workspace with contextual routes, fast list/detail workflows, pipeline board, inbox, and global CRM search. |

## Architecture Decisions

The existing `memberships.user_id` and `auth.users` identity space is the CRM ownership authority because it is already used by current team reporting and call metrics. `team_members` remains the operational roster and is presented as a related roster profile where available; no new CRM record will treat `team_members.id` as an interchangeable authentication user ID.

The two existing stage values are retained. `leads.status` stays the legacy contact-lifecycle value, while `leads.pipeline_stage` remains historical/free-text context. New opportunity stage state lives only in CRM pipeline-stage rows. An explicit mapping catalogue records the legacy value that informed any future opportunity creation, without overwriting either legacy field.

The three legacy objection stores and the two legacy note stores remain unchanged. New activities and CRM notes will reference their legacy source where one exists. New operator-entered notes use the CRM-native note/activity path. The unified timeline projects both old and new activity sources rather than copying historical text into multiple places.

## Foundation Data Model

| New structure | Purpose | Legacy relationship |
|---|---|---|
| `crm_contacts` | Independent people records, owning communication identity, lifecycle state, and CRM ownership | Optional unique `legacy_lead_id` FK to `leads`; existing leads may be backfilled idempotently without changing the lead row. |
| `crm_companies` and `crm_company_contacts` | Companies/accounts and many-to-many contact membership | New only; no company data is forced into `leads`. |
| `crm_pipelines` and `crm_pipeline_stages` | Configurable pipelines/stages, sort order, probability, color, archived state | New stage data; mapping table retains the relevant legacy status/pipeline-stage values. |
| `crm_opportunities` | Independent deals with owner, value, probability, status, source, expected close, won/lost detail | May link a contact/company and `legacy_call_id` / `legacy_client_id` for traceability, without changing calls or clients. |
| `crm_tasks` | Assigned, due-dated sales work with related CRM records and activity logging | New only; legacy calls and messages can create future linked tasks. |
| `crm_activities` and `crm_activity_targets` | Normalized event stream and polymorphic CRM targets for unified timelines | Stores source metadata and legacy IDs, while legacy records remain authoritative. |
| `crm_notes` | New notes linked to records and activities | Legacy `lead_notes` remain read-only timeline sources; `leads.notes` remains intact. |
| `crm_custom_field_definitions` and `crm_custom_field_values` | Governed custom fields for contacts, companies, and opportunities | Existing `leads.application_data` stays as legacy intake data. |
| `crm_saved_views` | User- and org-scoped filter/view definitions | Can coexist with current `segments`; no existing segment is overwritten. |
| `crm_external_events` | Provider event idempotency and webhook-processing log | Integrates with existing `events` rather than replacing it. |
| `crm_communication_accounts`, threads, messages, participants, deliveries, recordings | Provider-neutral Gmail/Twilio-ready architecture | Existing conversations/messages remain visible as legacy threads; provider data is introduced only when configured. |

## Navigation and Workspaces

The sidebar’s current Sales Tracking group becomes a single **Sales CRM** operating area. Its rollout starts with Inbox, Leads, Contacts, Companies, Opportunities, Pipeline, Tasks, Calls, Email, SMS, Activities, and CRM Settings. Existing Team, Rep dashboards, Attribution, Traffic, Clients, and current Outreach remain in their established product areas and are linked contextually, not duplicated.

The list workspace will use server-backed search, filters, pagination, configurable columns, saved views, safe selection/bulk flows, and fast record opening. The contact record follows a persistent-context layout: identity and lifecycle on the left, unified timeline in the center, and opportunity/tasks/owner/tags/custom fields on the right. Quick actions always create real records or valid provider-ready drafts; no fake communications are shown.

## Delivery Sequence

| Milestone | Scope | Safety boundary |
|---|---|---|
| **1. Foundation** | Add CRM schema, RLS, permissions, adapters, migration map, and CRM navigation. | Additive schema only; legacy tables untouched. |
| **2. Core operations** | Contacts, companies, opportunities, pipelines, tasks, activities, timeline, basic search/filtering/saved views. | Legacy lead/call/client/payment views remain functional and visible. |
| **3. Communications** | Provider-neutral inbox and composition flows; secure Gmail/Twilio server integrations when credentials are configured. | No provider credentials in client code; signed webhook validation and idempotency are mandatory. |
| **4. Sales automation** | Sequences, automations, bulk actions, and workflow notifications. | Actions are permission-checked and auditable. |
| **5. Reporting and hardening** | CRM reporting, rep performance, performance optimization, regression coverage, and operational documentation. | Reports derive from actual normalized/legacy data only. |

## Migration Guardrails

Every database migration will be forward-only, additive, organization-scoped, indexed, and protected with RLS. The migration will not use `DROP`, `TRUNCATE`, destructive `ALTER`, or record deletion. Any legacy backfill is idempotent, records its source relationship, and can be disabled or re-run safely. A separate live-production reconciliation remains required before any legacy surface is deprecated, even if the foundation migration itself is additive.

## First Implementation Slice

The first code slice will deliver the CRM foundation rather than a cosmetic screen: additive CRM tables with RLS and indexes, compatibility links to leads/calls/clients, a role-governed Sales CRM resource, a unified CRM navigation entry, and the first functional connected workspaces for contacts, companies, opportunities, pipelines, tasks, and timeline activities. Twilio and Gmail credentials are not required for this slice; only the secure provider-neutral architecture and interfaces will be introduced now.

## Communication Integration Evidence

Twilio’s official documentation confirms that Voice supports incoming-call webhooks, outbound-call status callbacks, and recording-status callbacks; Programmable Messaging supports inbound-message webhooks and outbound delivery-status callbacks. The communication foundation therefore treats these callbacks as append-only external events, creates idempotent CRM projections, and keeps delivery state separate from message content. Twilio signs its webhook requests using the `X-Twilio-Signature` header; the provider endpoint uses the official Node SDK validator, requires a configured HTTPS public callback base URL, and never accepts a webhook without a valid signature.

References:

- [Twilio Voice Webhooks](https://www.twilio.com/docs/usage/webhooks/voice-webhooks)
- [Twilio Messaging Webhooks](https://www.twilio.com/docs/usage/webhooks/messaging-webhooks)
- [Twilio Secure Webhooks](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
