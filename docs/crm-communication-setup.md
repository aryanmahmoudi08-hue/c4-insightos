# Sales CRM Communication Setup

**Status:** Provider-neutral CRM communications are implemented in the application and database migrations. They are intentionally inactive until a manager configures a provider account and the required server-side environment values.

## Current Operating Boundary

The Sales CRM Inbox reads both preserved legacy conversations and new CRM communication threads. Existing conversations, messages, calls, recordings, outreach lists, and send queues are not migrated, renamed, or deleted. New provider-driven records live in the `crm_communication_*` tables, and the `crm_communication_legacy_adapter_v` view presents both record families in one read model.

The current inbox is deliberately read-only. It does not pretend to send through Gmail or Twilio before a connected provider account, secure server configuration, and callback endpoints exist.

| Capability | Current behavior | Activation prerequisite |
|---|---|---|
| Legacy conversations | Visible in the Sales CRM Inbox and linked to preserved lead context. | None; existing data remains read-only through the CRM adapter. |
| Twilio inbound SMS | Secure server endpoint and idempotent persistence path are present. | A CRM Twilio account row, a public HTTPS base URL, and an environment `TWILIO_AUTH_TOKEN`. |
| Twilio voice status and recording callbacks | Secure server endpoint and call/recording projections are present. | Same Twilio account and callback configuration. |
| Gmail mail sync/send | Provider-neutral email account, thread, participant, message, and delivery structures are present. | Google OAuth consent configuration, secure token vaulting, and a Gmail-specific server integration in the next provider phase. |
| Outbound calls/SMS/email | Not enabled by this migration. | Provider account configuration, authorization UI, and audited send endpoints. |

## Twilio Callback Configuration

Set `TWILIO_WEBHOOK_BASE_URL` to the exact public HTTPS origin used in the Twilio Console. The endpoint routes are:

| Callback | Route |
|---|---|
| Incoming SMS | `/api/public/twilio/sms` |
| Incoming Voice or Voice Status | `/api/public/twilio/voice` or `/api/public/twilio/voice-status` |
| Recording Status | `/api/public/twilio/recording` |

Set `TWILIO_AUTH_TOKEN` only in the server environment. It must never be added to the frontend, database row, source control, browser storage, or client request. The handler returns a safe acknowledgment for unconfigured numbers, requires an `X-Twilio-Signature`, validates the callback against the configured public URL, and records callbacks idempotently in `crm_external_events`.

Twilio supports incoming Voice webhooks, Voice status callbacks, recording status callbacks, incoming Messaging webhooks, and Messaging delivery callbacks. Its webhook signatures must be validated against the configured callback URL and request parameters. [1] [2] [3]

## Gmail Activation Boundary

The Gmail connection should be implemented as a server-side OAuth integration. Refresh tokens need encrypted server-side storage or a dedicated secrets provider; they must not enter `crm_communication_accounts.settings` or any browser-visible state. The CRM account row should contain only non-secret provider metadata such as account address, external account ID, connection status, and sync timestamps.

The Gmail inbox/send implementation should process push notifications or a controlled periodic synchronization job in a durable deployed service. It should create `crm_external_events` before materializing thread/message updates, making retries idempotent. Gmail activation is deliberately separate from the CRM foundation so a missing Google setup cannot compromise existing sales operations.

## References

[1]: https://www.twilio.com/docs/usage/webhooks/voice-webhooks "Twilio Voice Webhooks"
[2]: https://www.twilio.com/docs/usage/webhooks/messaging-webhooks "Twilio Messaging Webhooks"
[3]: https://www.twilio.com/docs/usage/webhooks/webhooks-security "Twilio Secure Webhooks"
