# Sales CRM Completion Matrix

## Implemented Foundation

The current repository contains an additive Sales CRM foundation, legacy lead and communication adapters, manager-governed creation actions, a contact detail workspace, a unified read model for legacy/new communications, a secure Twilio callback architecture, and audit structures for saved views, bulk operations, and automation rules. Existing Leads, calls, conversations, clients, payments, and team models are not modified.

## Remaining Product Work Before Staging

| Workstream | Present state | Required completion slice |
|---|---|---|
| Contact management | New CRM contacts can be created; legacy leads can be inspected through the contact adapter. | Add edit and archive actions, native contact notes, company association, tags/custom fields, ownership display, and pagination/filter controls. |
| Companies | Companies can be created. | Add company list, detail record, contact association, and related opportunities/tasks. |
| Opportunities | Opportunities can be created and displayed by stage. | Add a detail workspace, stage movement, win/loss handling, amounts/close-date edits, and linked tasks/activity. |
| Pipelines | Pipelines and initial stages can be created. | Add stage editor/reordering, stage movement actions, pipeline settings, and predictable pipeline reporting. |
| Tasks | Tasks can be created and listed. | Add assignment, task completion/reopen, due/overdue filtering, record context, and bulk follow-up creation. |
| Activity and notes | Core actions produce normalized activities; legacy history appears in the contact record. | Add native note creation, activity filtering, and linked timeline entries from all CRM updates. |
| Inbox | Legacy conversations are readable; provider-neutral CRM threads are modeled. | Add thread detail, provider-neutral draft/composer state, ownership, close/reopen, and email/SMS/call execution only after provider setup. |
| Search and views | Local list filtering and saved-view persistence exist. | Add server-backed global CRM search, configurable columns, saved-view listing/apply/delete, and pagination. |
| Automation | Rules/runs are modeled and disabled by default. | Add rule editor, manual test/dry-run, safe event dispatcher, run log, and gated durable execution integration. |
| Reporting | Dashboard metrics cover CRM counts only. | Add CRM pipeline, activity, rep, task, and conversion reporting derived only from real CRM/legacy source data. |
| Provider activation | Twilio callback architecture exists; Gmail tables are provider-neutral. | Add Gmail OAuth integration, Twilio send/call controls, account settings, credentials configuration, and staging callback verification. |
| Validation and preview | Build and existing test suite pass; migrations are source-only. | Run migrations in staging, seed or import sanitized relational data, execute workflow tests, then launch a safe preview. |

## Completion Order

The remaining source work will proceed as follows: first finish record editing and navigation; second finish task, deal, pipeline, inbox, note, and activity flows; third add search, saved views, bulk operation, reporting, and automation interfaces; and finally strengthen tests, perform source-only validation, and prepare the staging migration handoff. Provider credential activation and any migration application remain deferred until the end.
