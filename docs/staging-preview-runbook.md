# Sales CRM Staging Preview Runbook

## Isolated Staging Target

The staging preview uses the standalone Supabase project **`c4-insightos-staging`** (`zyptvdzlayoheqtxcljx`) in `us-east-1`. The user's separate project `utdejyqjygasqufbuqpd` was identified as a different project and was not inspected, queried, migrated, or modified during staging preparation.

## Schema Application

The staging project initially had no public tables. The repository's complete ordered migration history, including the base application schema and the three additive Sales CRM migrations, was applied only to `c4-insightos-staging` in one staging-specific migration named `c4_insightos_complete_staging_schema`.

The verified staging schema includes the legacy-compatible application structures (`organizations`, `memberships`, `leads`, `lead_notes`, `conversations`, `messages`, `calls`, `clients`, and `payments`) plus CRM tables (`crm_contacts`, `crm_companies`, `crm_company_contacts`, `crm_pipelines`, `crm_pipeline_stages`, `crm_opportunities`, `crm_tasks`, `crm_activities`, `crm_notes`, communication tables, saved views, bulk-operation audit records, and automation definitions). RLS is enabled on the listed public tables.

## Provider Safety

No Gmail or Twilio account records, access tokens, phone numbers, callback configuration, or provider secrets are configured in staging. The CRM inbox therefore remains provider-neutral, and no email, SMS, call, or automation dispatch can occur during visual inspection.

## Synthetic Fixture and Integrity Checks

The staging organization `C4 CRM Staging` is owned by a synthetic staging user and contains only sanitized, non-production records. The fixture includes three legacy leads, two preserved conversations, three messages, one closed call, one client, one payment, two native CRM contacts, one company, one pipeline with five stages, two open opportunities, two open tasks, two CRM notes, two CRM activities, one saved view, and one automation-rule definition.

Read-only verification confirmed that every fixture relationship resolves: the linked CRM contact points to an existing legacy lead, each opportunity points to an existing pipeline stage, each linked task points to an existing opportunity, and each activity target points to an existing CRM activity. The staging organization has zero `crm_communication_accounts` and zero enabled automation rules.

## Preview Validation

The preview was launched from an untracked local staging environment file containing only the isolated staging project URL, staging publishable key, and a server-only staging secret. The browser preview authenticated through the synthetic staging account and verified the main Sales CRM workspace, pipeline board, task and activity metrics, provider-safe inbox, reports, inactive automations, contact record workspace, and saved-view dialog.

During visual validation, three source-only UI/runtime corrections were made: the CRM server-function module now imports its server-function factory, the Saved Views dialog uses the existing `FormField` component, and the Sales CRM has an explicit index route with an outlet-only parent so its inbox, reports, automations, and contact-record child routes render correctly. These corrections do not modify any legacy data structures or communication-provider configuration.

