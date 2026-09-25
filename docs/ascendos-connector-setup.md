# AscendOS — connector setup runbook

Live at <https://ascendos.aryanmahmoudi.workers.dev>. Everything below was
verified against that deployment on 2026-09-25, not inferred from the code.

## How connections work

One database, many workspaces. Every table is scoped by `org_id`, so a second
client connects **their own** Close/Typeform/Calendly accounts through the same
cards, with no new code and no separate deployment. Nothing you connect is
visible to them, and nothing they connect is visible to you.

Each connector gets its own webhook URL containing a `connection_id`:

```
https://ascendos.aryanmahmoudi.workers.dev/api/public/<connector>?connection_id=<uuid>
```

That `connection_id` is what routes an inbound payload to the right workspace.
The URL is generated from the live request origin, so it is always correct for
whatever domain the app is served from.

Every inbound payload is written to `raw_payloads` with `processed_at` and
`process_error` before anything else happens — so a delivery that arrives but
fails to map is visible rather than lost. That table is what **Ops → Event Bus**
reads.

## Verified working (2026-09-25)

All nine webhook endpoints are live and reject correctly:

| Endpoint | No `connection_id` | Unknown `connection_id` |
| --- | --- | --- |
| stripe, whop, fanbasis, wise, paypal | 400 | 404 |
| typeform, calendly, close, webinarjam | 400 | 404 |

The unknown-connection check runs *before* signature verification, so an
attacker cannot use the endpoint as a signature oracle.

The automation ingest endpoint was tested end to end with the real workspace
token: it accepted a `closer_call` event, wrote the row, and returned
`{"ok":true}`. (The test row was deleted afterwards.)

## Ready to connect right now

Nothing is blocking these. Settings → Connections, then follow the on-card
steps — each card states the exact order, which matters because some services
give you the secret only *after* you create the webhook.

- **Close CRM** — one-way mirror. Leads created/updated in Close appear here.
  Close stays the system of record; AscendOS never writes back to it and never
  changes a lead's status from Close data.
- **Typeform** — submissions land as real leads, with qualification notes and
  automatic ticket-tier classification.
- **Calendly** — booked calls, cancellations and reschedules land on the Team
  Calendar with the UTMs the invitee arrived on.
- **Stripe / Whop / Fanbasis / Wise / PayPal** — payments land in the ledger.
- **Zapier / Discord** — outbound. Real app events fan out to a Zap or a channel.

Two ordering traps worth knowing:

- **Typeform and WebinarJam**: you invent the secret first, connect, and only
  *then* does the app show you the webhook URL to paste back.
- **Close, Calendly, Stripe, Whop, Wise, PayPal**: the URL exists immediately;
  the secret comes from them afterwards.

## Not ready — and exactly why

### Meta Ads — blocked on you
Needs a Meta app, plus `META_APP_ID` and `META_APP_SECRET` set as Worker
secrets. Currently only three secrets exist on the Worker (`SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), so the "Connect with
Meta" button cannot complete OAuth. The redirect URI to register in the Meta app
is exactly:

```
https://ascendos.aryanmahmoudi.workers.dev/api/public/oauth/meta
```

Until this is set: Ad Spend, ROAS, CPC, CPL and CPA have no source and honestly
report "Not tracked".

### AI insight panels — blocked on a key
`LOVABLE_API_KEY` is not set on the Worker. Every AI panel degrades to "AI is
not configured" rather than failing. Nothing else is affected.

### Wistia (VSL) and Google Forms (hiring) — no connector card
Neither has a first-class card. Both go through the **automation inbound
endpoint** instead (Settings → Connections → Automation inbound endpoint), which
is already live and tested. Point a Zap or n8n flow at:

```
POST https://ascendos.aryanmahmoudi.workers.dev/api/public/ingest/<your-token>
Content-Type: application/json

{ "event_type": "...", "data": { ... } }
```

Accepted `event_type` values:

| `event_type` | Use it for |
| --- | --- |
| `vsl_metric_snapshot` | Wistia play/retention numbers |
| `hiring_application` | Google Forms hiring applications |
| `closer_call` | A logged closing call |
| `dm_setter_day` | A setter's end-of-day numbers |
| `inbound_dialer_day` | A dialer's end-of-day numbers |
| `content_post` | A published content piece |
| `onboarding_response` | A client onboarding response |

The token is on that same card, with a **Rotate token** button. Rotating
invalidates the old one immediately, so update your Zaps in the same sitting.

### WebinarJam — connect it, but expect one round of mapping
The endpoint is live and will capture deliveries verbatim into `raw_payloads`.
The exact field mapping into Webinar Analytics is unconfirmed until a real
payload arrives, because the docs don't pin the shape. Connect it, fire one
real registration, then check Ops → Event Bus to see what actually came in.

## Day-to-day use

- **What your team fills in manually**: EOD reports (setter/dialer) and
  post-call reports (closer). That is by design — those numbers have no API to
  pull from.
- **Where to look when something seems missing**: Ops → Event Bus. If a payload
  arrived, it is in `raw_payloads`. `process_error` tells you why it did not map.
- **Adding a teammate**: they sign up, then request access; an admin approves
  under Team. Email confirmations are ON and there is no custom SMTP yet, so
  either configure SMTP or confirm them by hand in Supabase → Authentication →
  Users.

## Known data-integrity note

`connector_registry` has 18 rows, but the UI renders 13 cards. Two of those rows
are duplicate Meta entries — `meta` and `meta_ads`. The app uses `meta`
(`meta-ads.server.ts:38`, `connections-panel.tsx:829`); `meta_ads` is an orphan
that nothing reads. Five more (`gohighlevel`, `instagram`, `slack`, `tiktok`,
`youtube`) are flagged available but have no endpoint behind them. None of this
breaks anything today — the UI drives off its own list — but a future change
that iterates the registry instead would surface connectors that cannot work.
