# AscendOS — Data Source Map

Where every page's data actually comes from, what's wired, and what's missing.

Written 2026-09-24 against the code, not from memory. This is the reference for
"how does this page get real data" — the question that kept getting
reconstructed from scratch.

---

## The core principle: it's already multi-tenant

This answers "how do I keep each client's data separate" — nothing needs
building for it.

Every business table has an `org_id` column, and every row-level security
policy scopes reads to the orgs you're a member of. So:

- Client A gets a workspace (an org). Client B gets a different one.
- **Same website, same code, same database — different `org_id`, completely
  separate data.** A new client's workspace starts blank on its own; there is
  nothing to "make blank."
- Each client's workspace connects **its own** accounts under Settings →
  Connections. No per-client code, no per-client deployment.

How data lands in the right workspace:

| Mechanism | How the org is resolved |
|---|---|
| Webhooks (Stripe, Close, Typeform, WebinarJam, …) | The generated URL carries `?connection_id=…`, unique to that workspace's connection row. Client A's Stripe posts to a URL that can only resolve to client A's org. |
| Generic ingest endpoint | The URL carries a per-workspace token: `/api/public/ingest/{token}`. |
| OAuth (Meta) | The token is stored per `(org_id, connector_id)`. Each client authorizes their own ad account. |

---

## The honest split: manual vs automated

The team only ever fills in **EOD reports** and **post-call reports**.
Everything else is either automated or isn't tracked. Of 834 audited metrics,
**690 read from tables this app already owns** — the question is only what
writes those tables.

| Writer | What it feeds | Built? |
|---|---|---|
| EOD report forms (in-app, one question at a time) | Daily rep activity: dials, connections, sets, closes, cash | ✅ |
| Post-call report (Closer) | Per-call outcome, offer made, cash collected | ✅ |
| Payment webhooks × 5 | `payments` — all cash metrics, ledger, recovery queue | ✅ |
| Typeform | `leads`, `onboarding_responses` | ✅ |
| Generic ingest endpoint | 7 event types (below) | ✅ |
| Mentee daily form (`/daily-win`, no login) | `daily_wins` → Mentee Results | ✅ |
| Close CRM webhook | `leads` mirror | ✅ built, needs API key |
| Meta OAuth + spend pull | `acquisition_spend` → ROAS/CPC/CPL/CPA | ✅ built, needs Meta app |
| WebinarJam webhook | `raw_payloads`, then `webinar_events` | ⚠️ receiver built, field mapping needs one real payload |
| Wistia poller (n8n) | `vsl_metric_snapshots` | ✅ workflow built, needs API token |
| Webinar metrics (manual/CSV) | `webinar_metrics` → Executive KPIs | ✅ |

### Generic ingest endpoint — the catch-all

`POST /api/public/ingest/{token}` with `{ event_type, data }`. Anything that
can send a webhook (Zapier, Make, n8n, a Google Form via Apps Script) can write
to AscendOS through it. Accepted types:

`closer_call` · `dm_setter_day` · `inbound_dialer_day` · `content_post` ·
`onboarding_response` · `vsl_metric_snapshot` · `hiring_application`

---

## Page by page

| Page | Source of truth | State |
|---|---|---|
| **Main Hub** | Aggregates of everything below | Live once its inputs are |
| — low/high ticket active | `clients.ticket_tier` + status, set from the offer catalogue in Client DNA | ✅ needs client records |
| — paid ad performance | Meta spend pull → `acquisition_spend` | ✅ needs Meta app |
| **EOD Reports** | In-app form | ✅ |
| **Closer** | Post-call report + `calls` | ✅ |
| — offer rate, show rate | `calls.offer_made` / `.showed`, from the post-call report | ✅ |
| **Inbound Dialer / DM Setter** | EOD report | ✅ |
| — call duration, talk time, talk/listen | `crm_call_sessions` (built, empty) | ❌ **needs a CRM feed — see gap 1** |
| — Speed-to-Lead SLA | `lead_response_events` | ✅ |
| **Leads** | Typeform / Close mirror / ingest | ✅ |
| **Team Calendars** | Calendly or Google Calendar | ⚠️ **see gap 2** |
| **Hiring** | Google Form → ingest `hiring_application` | ✅ just built |
| **Payments** | 5 processor webhooks | ✅ |
| **Mentee Onboarding** | Typeform → `onboarding_responses` | ✅ |
| **Mentee Results** | Daily form → `daily_wins` | ✅ |
| **VSL Analytics** | Wistia | ✅ needs API token |
| **Webinar Analytics** | WebinarJam events, or manual/CSV entry | ⚠️ aggregates work today via CSV; per-attendee needs the event feed |
| **Content Command Center** | Manual + `content_post` ingest | ⚠️ **see gap 3** |
| **Content Calendar** | In-app | ✅ |
| **Attribution / Traffic** | Derived from leads + calls + content | ✅ |

---

## The three real gaps

### 1. Call quality has no rep identity

`crm_call_sessions` exists with `duration_seconds`, `answered_at`,
`completed_at`, disposition, and a linked `crm_call_recordings` table. It's
keyed on `(provider, external_call_id)`, so a CRM can fill it.

**But it has no column identifying which rep made the call.** So even once Close
(or Twilio) populates it, average talk time can't be attributed to a specific
dialer. That's a one-column migration plus whatever the CRM sends as the agent
identifier — worth doing when the Close feed is real, not before, since the
column's shape depends on what Close actually sends.

Until then the Inbound Dialer page says these are unavailable rather than
showing a number derived from the Closer's manual logs, which would
misattribute them.

### 2. Calendly / Google Calendar is half-wired

- `calendly` is in the connector registry, marked **unavailable**
- `calls` already has `calendly_cancel_url` and `calendly_reschedule_url`
- Google Calendar has real infrastructure (`team-calendar-status.server.ts`)
  and the page prompts for calendar IDs

So the destination is ready and the connector is stubbed off. Calendly's
webhooks (`invitee.created`, `invitee.canceled`) map cleanly onto booked /
cancelled / rescheduled. This is the smallest remaining integration and
probably the highest daily value, since it drives the calendar everyone looks
at.

### 3. Content performance has no clean API

Worth being blunt: there is no good automated source for "how did my Instagram
reel perform." Meta's Content Publishing API only covers posts published
*through* it, not ones posted natively from the phone. Instagram/TikTok/YouTube
rows exist in the registry but are all marked unavailable.

Realistic options, in order of effort: keep logging posts manually via
`content_post` ingest (works today); publish through an API so metrics come
back; or accept that content stays partly manual. This one should stay manual
longest — automating it badly would fabricate numbers.

---

## What to actually do, in order

1. **Deploy** to a real host with a real Supabase project. Everything is local
   with no reachable database right now — that is the actual blocker, not API
   keys.
2. **Stripe webhook** — a secret, nothing more. Turns on the entire cash layer.
3. **Typeform** — lead intake and mentee onboarding.
4. **Team starts submitting EOD + post-call reports.** Single biggest data
   source in the product.
5. **Calendly** — gap 2, small and high daily value.
6. Then, per client as they land: Close API key, Meta System User token or
   OAuth, WebinarJam, Wistia.

### On Meta specifically

There are two valid paths and the simpler one is worth knowing:

- **System User token** (Business Manager → System Users → generate with
  `ads_read`): effectively a permanent API key. Fastest for **your own** ad
  account. Not built.
- **OAuth** (built): each client authorizes their own ad account. Required once
  you have clients, since a System User token only covers accounts you control.

---

## What is not a placeholder

Worth stating plainly, because empty tables and fake code look identical from
the outside. The metric dictionary remediation, the currency/FX correctness
work, the payment webhooks, the permission system and the multi-tenant scoping
are all real and tested — 436 tests passing across every timezone from UTC−11
to UTC+14. What's missing is **data in the tables**, not the wiring beneath
them.
