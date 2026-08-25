# CRM Source Audit — C4 InsightOS

**Method**: This document was produced by reading every file in `supabase/migrations/*.sql`
(37 files, chronological, none skipped) and resolving the final schema state by tracing every
`CREATE`/`ALTER` across the full history. **No production database was queried.** Two prior
attempts to audit a live database in this same task were abandoned: one target
(`nnfihxlikgfyxalfcddz`, the ref baked into this repo's `.env`/`supabase/config.toml`) is not
reachable from the operator's Supabase account; the other reachable project
(`utdejyqjygasqufbuqpd`) was confirmed to be the operator's only Supabase project and carries an
auto-generated default name, not a deliberately-provisioned production project — it was treated
as unverified and never queried for data. This audit is therefore schema-only, sourced entirely
from version-controlled migration history, per explicit instruction.

**Verified fact about the migration history itself**: grepping all 37 files for
`DROP TABLE|DROP COLUMN|RENAME|DROP TYPE` returns zero matches (one `CREATE OR REPLACE VIEW`
is the only "replace" of anything, and it was only ever created/replaced once). The schema
below is a straightforward superset — nothing in this history was ever renamed, dropped, or
recreated, so there is no early-state-vs-final-state ambiguity to resolve.

---

## 0. Migration Inventory (37 files, chronological)

| # | Migration (timestamp prefix) | What it does |
|---|---|---|
| 1 | `20260518151934` | **Initial schema.** `pgcrypto` extension; 10 enums (`app_role`, `content_platform`, `content_angle`, `awareness_stage`, `lead_status`, `call_status`, `payment_status`, `alert_severity`, `connector_state`, `metric_scope`); 34 core tables (see §1); helper functions `is_org_member`, `has_org_role`, `current_user_orgs`; `handle_new_user()` trigger on `auth.users` insert (auto-provisions profile + workspace + owner membership); RLS enabled + policies on every table; seed data for `connector_registry`, `formula_variables`, `metric_definitions`. |
| 2 | `20260518154118` | Security hardening: pins `search_path` on `tg_set_updated_at`; revokes broad `EXECUTE` on the SECURITY DEFINER helper functions from `PUBLIC`/`anon`/`authenticated`. |
| 3 | `20260518160304` | New table `setter_activity`. `calls` gains `closer_name`, `lead_email` (text, not FK). |
| 4 | `20260518160754` | `setter_activity` gains `links_sent`; `calls` gains `deposit_cents`. |
| 5 | `20260518161416` | New table `team_members`. |
| 6 | `20260518162952` | Data-only: `UPDATE connector_registry SET is_available = true` (all rows). |
| 7 | `20260518165120` | Re-`GRANT EXECUTE` on `has_org_role`/`is_org_member`/`current_user_orgs` to `authenticated` **and** `anon` (partially reverses #2 for these three). |
| 8 | `20260518203640` | `content_pieces` gains `hook_score`; `setter_activity` gains `lead_source`. |
| 9 | `20260518205208` | `clients` gains `renewal_stage` (default `'not_started'`) + index. |
| 10 | `20260525173112` | `clients` gains `phone`, `invested_to_date_cents`, `expected_next_payment_cents`, `expected_next_payment_date`, `pre_close_summary`, `pre_close_raw`; `app_role` enum extended (guarded) with `setter`, `closer`, `sales_manager`, `growth_ops`; new table `membership_requests` (initially open `anon`+`authenticated` INSERT policy). |
| 11 | `20260526144429` | `clients` gains `installment_amount_cents`. |
| 12 | `20260527172334` | New function `submit_membership_request()` (SECURITY DEFINER); drops the open INSERT policy on `membership_requests` (function becomes the sole insert path); `membership_requests` added to `supabase_realtime` publication; `connector_registry`/`formula_variables`/`metric_definitions` read policies narrowed from public to `authenticated`-only, `anon` revoked. |
| 13 | `20260527211318` | New functions `approve_membership_request()` / `reject_membership_request()` (v1, SECURITY DEFINER). |
| 14 | `20260527212141` | `approve_membership_request()` replaced (v2): also upserts a `team_members` row when the approved role is `setter`/`closer`. |
| 15 | `20260527212320` | Restricts `EXECUTE` on approve/reject functions to `authenticated` only. |
| 16 | `20260530225026` | New table `hiring_applicants`. |
| 17 | `20260606013236` | CopyOS tables: `copy_clients`, `copy_swipes`, `copy_generations`. |
| 18 | `20260610031508` | `copy_swipes` gains `image_urls`; new tables `story_sequences`, `outreach_lists`, `outreach_recipients`, `outreach_messages` (email/SMS scaffolding). |
| 19 | `20260610031543` | Storage policies for the `copy-swipes` bucket. |
| 20 | `20260611000726` | `content_pieces` gains `pipeline_status` + CHECK constraint + backfill + index. |
| 21 | `20260612143531` | `webhook_subscriptions` gains `category`; new view `lead_attribution_v`. |
| 22 | `20260612143552` | `lead_attribution_v` set to `security_invoker = true`. |
| 23 | `20260614041308`* | `leads` gains `application_data`, `notes`; new tables `lead_notes`, `client_wins`, `role_permissions`. |
| 24 | `20260615052906` | `leads` gains `pipeline_stage`, `priority`, `precall_video_watched`, `precall_assets_sent_at`; new table `member_permissions`. |
| 25 | `20260704064935`* | New enum `vsl_kind`; new tables `vsls`, `vsl_metric_snapshots`. |
| 26 | `20260804001512` | `content_pieces` gains `scheduled_date`, `scheduled_time`, `post_format`, `repurpose_plan`, `voice_notes`, `why_it_works`, `posting_instructions` + index. |
| 27 | `20260806235759`* | `copy_clients` gains ~16 "client DNA" columns; `hiring_applicants` gains Loom columns; new tables `daily_wins`, `team_calendars`, `work_blocks`. |
| 28 | `20260806235843` | Storage policies for the `win-proof` bucket (allows anon INSERT — public check-in form). |
| 29 | `20260809235545`* | New tables `faq_videos`, `setter_call_signals`; `content_metrics`/`content_pieces`/`onboarding_responses` gain several columns. |
| 30 | `20260811120000` | `daily_wins` gains `source` + CHECK (`manual`/`typeform`). |
| 31 | `20260811130000` | `hiring_applicants` gains cash-related columns from Loom grading. |
| 32 | `20260811140000` | `content_pieces` gains `variation_answers`. |
| 33 | `20260815120000` | New table `lead_video_links`. |
| 34 | `20260815130000` | Data-only: backfills `digest.weekly` onto two specific named `webhook_subscriptions` rows. |
| 35 | `20260821120000` | `hiring_applicants` gains `portfolio_url`/`audio_url`/`resume_url`; storage policies for `applicant-resumes`. |
| 36 | `20260821130000` | `leads` gains `tags`; new table `lead_call_transcripts`. |
| 37 | `20260821140000` | `traffic_sources` gains UTM columns. |

\* Migration #23's file content is thematically about leads/notes/permissions (not what its
timestamp neighbors #22/#24 suggest); #25/#27/#29 are similarly content-driven, non-sequential
feature drops rather than one-topic-per-day. Flagged here only so a reviewer isn't confused
cross-referencing dates against feature names.

**37 migration files analyzed. 58 tables, 1 view, 11 enums, 3 storage-bucket policy sets
discovered.**

---

## 1–2. Full Table Inventory & CRM/Sales System Identification

Every table below is `public.<name>` unless noted. "Org FK?" flags whether `org_id` is a
declared foreign key to `organizations(id)` — see §3 for why this matters.

### Identity & Access

| Table | Columns (final state) | PK | Org FK? | Notes |
|---|---|---|---|---|
| `organizations` | id, name, slug (unique), plan default `'starter'`, settings jsonb, created_at, updated_at | id | — | Root tenant. |
| `profiles` | id (=`auth.users.id`, FK cascade), display_name, avatar_url, timezone default `'UTC'`, created_at, updated_at | id | — | 1:1 with `auth.users`. |
| `memberships` | id, org_id→organizations cascade, user_id→auth.users cascade, role (`app_role`) default `'viewer'`, created_at; unique(org_id,user_id) | id | ✅ | Org↔user join with role. |
| `membership_requests` | id, org_id, email, full_name, requested_role (`app_role`), status default `'pending'`, admin_email, decided_by, decided_at, created_at, updated_at | id | ❌ no FK | Realtime-enabled (`supabase_realtime` publication). Insert path is exclusively the `submit_membership_request()` function, not direct table INSERT. |
| `role_permissions` | id, org_id→organizations cascade, role (`app_role`), resource, can_view default true, can_edit default false, updated_at; unique(org_id,role,resource) | id | ✅ | Role-level permission matrix. |
| `member_permissions` | id, org_id→organizations cascade, user_id (**no FK**), resource, can_view, can_edit, updated_at; unique(org_id,user_id,resource) | id | ✅ | Per-user override layer on top of `role_permissions`. |
| `team_members` | id, org_id (**no FK**), name, role, active default true, user_id (**no FK**, nullable), created_at, updated_at; unique(org_id,role,name) | id | ❌ no FK | Named roster slots; `user_id` is optionally linked to a real login. |

### Leads / Sales Pipeline (core CRM)

| Table | Columns (final state) | PK | Org FK? | Notes |
|---|---|---|---|---|
| `leads` | id, org_id→organizations cascade, handle, full_name, email, phone, traffic_source_id→traffic_sources set null, first_touch_content_id→content_pieces set null, first_touch_at, status (`lead_status`) default `'dm_received'`, assigned_setter_id→**auth.users** set null, qualification_notes, intent_score, engagement_score, estimated_close_probability, beliefs, objections_raised text[], external_id, source_connector, application_data jsonb, notes, pipeline_stage, priority default `'normal'`, precall_video_watched default false, precall_assets_sent_at, tags text[] default `'{}'`, created_at, updated_at | id | ✅ | The single lead record. `objections_raised` (text[]) predates the dedicated `setter_call_signals.objections`. `tags` is a plain array, deliberately *not* routed through the generic `tags`/`taggables` catalog (explicit design note in migration #36). |
| `lead_events` | id, lead_id→leads cascade, org_id→organizations cascade, event_type, occurred_at, payload jsonb, created_at | id | ✅ | Generic lifecycle-event log per lead. |
| `lead_notes` | id, org_id→organizations cascade, lead_id→leads cascade, author_id→auth.users set null, body, kind default `'note'`, created_at | id | ✅ | Free-text notes. |
| `lead_content_touches` | id, lead_id→leads cascade, content_id→content_pieces cascade, org_id→organizations cascade, touched_at, touch_type default `'view'`; unique(lead_id,content_id,touch_type,touched_at) | id | ✅ | Content-attribution touchpoints. |
| `lead_video_links` | id, org_id→organizations cascade, lead_id→leads cascade, token (unique), vsl_kind default `'post_booking'`, opened_at, created_at | id | ✅ | Tokenized pre-call video delivery link + click tracking. Only SELECT/INSERT have RLS policies; the UPDATE grant exists but no RLS UPDATE policy — `opened_at` is set via `service_role` from an unauthenticated public "resolve" endpoint, not by an RLS-gated authenticated write (explicit in the migration's own comment). |
| `lead_call_transcripts` | id, org_id→organizations cascade, lead_id→leads cascade, call_type default `'setting'` CHECK(`setting`/`closing`), transcript, source, created_at, updated_at | id | ✅ | Per-lead transcripts, distinct from `setter_call_signals` below. |
| `conversations` | id, org_id→organizations cascade, lead_id→leads cascade (nullable), setter_id→**auth.users** set null, channel default `'instagram_dm'`, external_thread_id, status default `'open'`, source_tag, last_message_at, first_response_seconds, created_at, updated_at | id | ✅ | DM/message thread container. |
| `messages` | id, conversation_id→conversations cascade, org_id→organizations cascade, direction, sent_by→auth.users set null, body, sent_at, external_id, raw jsonb | id | ✅ | Individual messages. |
| `calls` | id, org_id→organizations cascade, lead_id→leads set null, setter_id→**auth.users** set null, closer_id→**auth.users** set null, scheduled_for, status (`call_status`) default `'booked'`, showed, offer_made, closed, cash_collected_cents, contract_value_cents, payment_plan, recording_url, call_summary, key_moment, time_to_close_seconds, closer_name (text), lead_email (text), deposit_cents, created_at, updated_at | id | ✅ | Sales calls. Has both FK identity (`setter_id`/`closer_id`→auth.users) *and* denormalized text identity (`closer_name`, `lead_email`) — see §3 orphan-risk note. |
| `call_objections` | id, call_id→calls cascade, org_id→organizations cascade, objection, resolved default false, created_at | id | ✅ | Objections raised on a specific call. |
| `setter_call_signals` | id, org_id→organizations cascade, lead_id→leads set null, setter_name (text, no FK), call_date default current_date, source default `'manual'`, transcript, notes, limiting_beliefs text[], objections text[], mechanism, ai_summary, created_at, updated_at | id | ✅ | A *second*, content-strategy-oriented objections/transcript log — keyed by setter name, not the `calls`/`call_objections` pair. |
| `clients` | id, org_id→organizations cascade, lead_id→leads set null, full_name, email, phone, start_date default current_date, offer_name, contract_value_cents, payment_plan, installments_remaining, installment_amount_cents, renewal_date, renewal_stage default `'not_started'`, health_score default 100, status default `'active'`, notes, renewal_conv_started, invested_to_date_cents, expected_next_payment_cents, expected_next_payment_date, pre_close_summary, pre_close_raw jsonb, created_at, updated_at | id | ✅ | Post-close client record. |
| `payments` | id, org_id→organizations cascade, client_id→clients cascade, call_id→calls set null, amount_cents not null, currency default `'USD'`, status (`payment_status`), collected_at default now(), source_connector, external_id, raw jsonb, created_at | id | ✅ | Revenue ledger. |
| `client_wins` | id, org_id→organizations cascade, client_id→clients cascade, title, body, screenshot_url, magnitude default `'minor'`, occurred_at, created_by→auth.users set null, created_at, updated_at | id | ✅ | Client-success log. |
| `onboarding_responses` | id, org_id→organizations cascade, client_id→clients cascade, share_token (unique, random hex), submitted_at, responses jsonb, mechanism_signals jsonb, created_at | id | ✅ | Public share-token-based onboarding form responses. |

### Content / Attribution

| Table | Notes |
|---|---|
| `content_pieces` | Platform/angle/awareness-stage-tagged content items. Grew a `pipeline_status` CHECK-constrained workflow, scheduling fields, and mechanism/variation strategy fields over time. |
| `content_metrics` | Per-content-piece metric snapshots (views, retention, followers, DMs, leads, cash — all in one row). |
| `story_slides` / `slide_metrics` | Per-slide breakdown of story-sequence content. |
| `story_sequences` | The 7-day story cadence planner (org_id **does** have a real FK — inconsistent with the CopyOS tables it references). |
| `traffic_sources` | Source catalog, later extended with UTM fields + a base tracking URL. |
| `tags` / `taggables` | Generic polymorphic tagging catalog — `taggables.taggable_id`/`taggable_type` is a soft (non-FK) polymorphic reference; nothing in the migration history actually attaches a `taggables` row to `leads` (leads use their own plain `tags text[]` column instead, per §migration #36's explicit note). |
| `vsls` / `vsl_metric_snapshots` | VSL Analytics — script/transcript store + per-snapshot play/retention metrics. Write access is role-gated (owner/admin/sales_manager/growth_ops), unlike most other org tables. |
| `faq_videos` | Post-booking objection-handling video library with click/play counters. |

### Team / Hiring / Copy / Scheduling

| Table | Notes |
|---|---|
| `setter_activity` | Manual daily rep-activity log (dials, connections, sets, closes, cash). `org_id`/`user_id` are plain `uuid`, **not FKs**. |
| `hiring_applicants` | Recruiting pipeline with AI-scored Loom submissions, cash-history fields, resume/portfolio/audio links. `org_id` **not FK**. |
| `copy_clients` / `copy_swipes` / `copy_generations` | CopyOS: client "DNA" profiles, a swipe-file library, and an AI-generation log. All three have `org_id` **not FK** (this is the only feature area where every table in it lacks the FK). |
| `daily_wins` | Unified check-in log — same table serves both authenticated in-app entries and a public no-login Typeform-style submission (distinguished by a `source` column), matching the app's separate `daily-win.tsx` public route. |
| `team_calendars` | Per-member **external calendar embed reference** (iCal URL / Google embed URL) — not a native appointment/booking table. |
| `work_blocks` | Manually-entered schedule blocks; `start_time`/`end_time` are plain `text`, not `timestamptz`. |
| `outreach_lists` / `outreach_recipients` / `outreach_messages` | Provider-neutral email/SMS scaffolding (see §7). |

### Platform / Ops

| Table | Notes |
|---|---|
| `events` | Generic, polymorphic (`subject_type`/`subject_id`, no FK) event-bus log. |
| `alerts` | Rule-based alerts, polymorphic subject, ack workflow. |
| `ai_insights` | AI-generated narrative insights per module. |
| `dashboard_widgets` / `segments` | Per-user dashboard configuration / saved filter segments. |
| `webhook_subscriptions` / `webhook_deliveries` | Outbound webhook fan-out (Slack/Discord/Zapier) + delivery log. Two specific named subscriptions (`Discord event alerts`, `Zapier fan-out`) are referenced by name in a data migration, confirming those exact rows exist as seeded/auto-created connector output in whatever database this schema is deployed against. |
| `connector_registry` / `connector_connections` / `connector_sync_status` / `raw_payloads` / `ingestion_jobs` | Generic third-party-connector framework (Instagram/TikTok/YouTube/Stripe/Calendly/GoHighLevel/Typeform/Slack/Discord/Meta Ads seeded as catalog rows, all with real API integration marked `is_available` but with no evidence in migrations of Twilio or a generic email/SMS provider ever being added to this catalog). |
| `formula_variables` / `metric_definitions` | Metric-formula catalog (system-wide seed rows + org-custom rows). |

### View

- **`lead_attribution_v`** (`security_invoker = true`) — joins `leads` → `content_pieces` (first-touch) → latest matching `calls` row (matched by `lead_id` OR case-insensitive `lead_email`) → `team_members` (by `calls.setter_id`) → aggregated `payments` (by `call_id`). **This view's own join is a live orphan-risk**: `calls.setter_id` is declared `references auth.users(id)`, but the view joins it directly to `team_members.id` (a separate, unrelated UUID space) — see §3.

### Requested categories not found

Per the brief's explicit instruction not to assume anything exists: **contacts**, **companies**,
**prospects**, **opportunities**, **configurable pipelines/pipeline-stage tables**, **tasks**,
**activities** (as a first-class entity type), **sequences** (automation, not the content
story-sequence table), **automation rules**, **saved views/filters** (beyond `segments`),
**custom fields** (beyond ad-hoc `jsonb` columns), **email accounts/threads**, **SMS
threads/delivery status**, **call-recording storage** (a `recording_url` column exists on
`calls`, but no dedicated recordings table), and **Twilio or any telephony-provider table** are
all: **Not found in migration history.**

---

## 3. Relationship Map

Only relationships actually declared via `REFERENCES` in the migrations are drawn as solid
lines. Dotted/bracketed notes call out same-shape-but-not-FK relationships.

```
organizations
  ├── memberships ──→ auth.users / profiles (role: app_role)
  ├── membership_requests  [org_id: NOT FK-enforced]
  ├── role_permissions (role, resource) → can_view/can_edit
  ├── member_permissions (user_id: NOT FK-enforced, resource)
  ├── team_members  [org_id: NOT FK-enforced; user_id: NOT FK-enforced, nullable]
  │
  ├── traffic_sources
  ├── content_pieces ──→ content_metrics
  │        ├──→ story_slides ──→ slide_metrics
  │        └──→ [lead_content_touches.content_id, leads.first_touch_content_id]
  ├── story_sequences → copy_clients (nullable)
  │
  ├── leads
  │     ├── lead_events
  │     ├── lead_notes
  │     ├── lead_content_touches → content_pieces
  │     ├── lead_video_links
  │     ├── lead_call_transcripts
  │     ├── conversations
  │     │      └── messages
  │     ├── calls  [lead_id nullable; also matched by lead_email text]
  │     │      └── call_objections
  │     ├── setter_call_signals  [lead_id nullable]
  │     └── clients  [lead_id nullable — a lead need not have converted]
  │            ├── payments  ←── calls (payments.call_id, independent of client_id's own lead link)
  │            ├── client_wins
  │            ├── onboarding_responses
  │            └── daily_wins  [client_id nullable]
  │
  ├── hiring_applicants  [org_id: NOT FK-enforced]
  ├── copy_clients / copy_swipes / copy_generations  [org_id: NOT FK-enforced on all three]
  ├── outreach_lists ──→ outreach_recipients
  │                  └─→ outreach_messages
  ├── setter_activity  [org_id, user_id: NOT FK-enforced]
  ├── team_calendars / work_blocks
  ├── vsls ──→ vsl_metric_snapshots
  ├── faq_videos
  ├── dashboard_widgets / segments
  ├── events  [polymorphic: subject_type + subject_id, no FK]
  ├── alerts  [polymorphic: subject_type + subject_id, no FK]
  ├── ai_insights
  ├── webhook_subscriptions ──→ webhook_deliveries → events (nullable)
  ├── connector_connections ──→ connector_registry (catalog)
  │        ├── connector_sync_status
  │        ├── raw_payloads
  │        └── ingestion_jobs
  ├── tags ──→ taggables  [polymorphic: taggable_type + taggable_id, no FK to any target table]
  └── metric_definitions  [org_id nullable — null = system-wide default]
```

### Indirect / polymorphic relationships (no formal FK)
- `taggables.taggable_id` + `taggable_type` — generic tag attachment to any entity; **nothing in
  migration history actually creates a `taggables` row against `leads`** (leads use their own
  `tags text[]` column instead), so this catalog appears to be attached to a different, unknown
  set of entities, or simply unused.
- `events.subject_id` + `subject_type`, `alerts.subject_id` + `subject_type` — generic event/alert
  targets, same pattern.
- `raw_payloads.connector_id` is a plain `text` column, while `connector_connections.connector_id`
  is a real FK to `connector_registry.id` — the raw-ingest table doesn't enforce the same
  reference.

### Organization-scoping gap (real, DB-level)
`org_id` is declared as an enforced foreign key to `organizations(id)` on the large majority of
tables, but **is a plain, unconstrained `uuid` column** on: `setter_activity`, `team_members`,
`membership_requests`, `hiring_applicants`, `copy_clients`, `copy_swipes`, `copy_generations`.
Nothing in the database stops one of these seven tables from holding an `org_id` that doesn't
correspond to any real organization row — isolation for them is enforced only by RLS policy
logic (`is_org_member`) and application code, not by the schema itself.

### User-identity gap (real, DB-level)
Most "who did this" columns are `references auth.users(id)` (e.g. `leads.assigned_setter_id`,
`calls.setter_id`/`closer_id`, `conversations.setter_id`, `messages.sent_by`,
`lead_notes.author_id`). But several are plain, unconstrained `uuid` with no FK at all:
`team_members.user_id`, `membership_requests.decided_by`, `copy_generations.created_by`,
`member_permissions.user_id`, and both `org_id`/`user_id` on `setter_activity`.

### Concrete orphan risk: `calls.setter_id` vs. `team_members`
`calls.setter_id uuid references auth.users(id) on delete set null` — the column's *only*
enforced target is `auth.users`. But `lead_attribution_v` (migration #21) does:
```sql
LEFT JOIN public.team_members setter ON setter.id = c.setter_id
```
`team_members.id` is its own independently-generated `gen_random_uuid()` primary key, in no way
constrained to equal any `auth.users.id`. For this join to ever produce a real match, whatever
writes to `calls.setter_id` would have to be inserting a `team_members.id` value into a column
whose FK constraint requires it to exist in `auth.users` — those two ID spaces only coincide by
accident (e.g., if a team member also happens to have a login and someone deliberately wrote
their `auth.users.id`, not their `team_members.id`, into `calls.setter_id`). The more likely
reality, corroborated by `calls` also carrying a plain `closer_name text` column added in
migration #3 specifically because a name-based identity was needed, is that **this view's setter
join does not reliably resolve** and the application relies on denormalized text fields
(`closer_name`, `lead_email`) for calls involving reps who aren't `auth.users` records. Manus
should not assume `lead_attribution_v.setter_name` is populated or trustworthy.

---

## 4. RLS / Security Model

Every one of the 58 tables has `ENABLE ROW LEVEL SECURITY` (verified — no table skips this).
Three SECURITY DEFINER helper functions (`search_path` pinned to `public`, defined in migration
#1, tightened in #2 and #7) do all the real work:

```sql
create or replace function public.is_org_member(_user_id uuid, _org_id uuid) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.memberships where user_id=_user_id and org_id=_org_id); $$;

create or replace function public.has_org_role(_user_id uuid, _org_id uuid, _roles public.app_role[]) returns boolean
  language sql stable security definer set search_path = public as
  $$ select exists (select 1 from public.memberships where user_id=_user_id and org_id=_org_id and role = any(_roles)); $$;

create or replace function public.current_user_orgs() returns setof uuid
  language sql stable security definer set search_path = public as
  $$ select org_id from public.memberships where user_id = auth.uid(); $$;
```

**Two idioms, same effect**: tables from migration #1 gate on `is_org_member(auth.uid(), org_id)`
directly; tables added from migration #23 onward (`lead_notes`, `client_wins`,
`role_permissions`, `member_permissions`) instead use `org_id IN (SELECT current_user_orgs())`.
Functionally equivalent — just an author/era style difference, not a security difference.

**The dominant pattern** (most tables) — generated programmatically in migration #1 via a `DO`
block looping over ~27 table names:
```sql
create policy "org members read <table>"   on public.<table> for select using (is_org_member(auth.uid(), org_id));
create policy "org members insert <table>" on public.<table> for insert with check (is_org_member(auth.uid(), org_id));
create policy "org members update <table>" on public.<table> for update using (is_org_member(auth.uid(), org_id));
create policy "org members delete <table>" on public.<table> for delete using (is_org_member(auth.uid(), org_id));
```
Under this pattern **any member of an org — any role — can read, write, and delete every row**
scoped to that org. There is no role gate inside these four policies.

**Role-gated exceptions** (`has_org_role(..., ARRAY[...]::app_role[])` used in the `USING`/`WITH
CHECK` clause instead of plain membership):
- `organizations` UPDATE — `owner`/`admin` only.
- `memberships` ALL (insert/update/delete) — `owner`/`admin` only.
- `role_permissions` write — `owner`/`admin` only (read is any member).
- `member_permissions` write — `owner`/`admin` only (read is any member).
- `membership_requests` SELECT/UPDATE — `owner`/`admin` only (INSERT is not a direct-table
  policy at all — see below).
- `vsls` / `vsl_metric_snapshots` write — `owner`/`admin`/`sales_manager`/`growth_ops` (read is
  any member). This is the only feature area gating writes to a *role list* rather than just
  owner/admin.

**Function-mediated writes** (no direct INSERT/UPDATE policy — the only path in is a SECURITY
DEFINER function that re-checks authorization internally):
- `membership_requests` INSERT → `submit_membership_request(admin_email, email, full_name,
  requested_role)`. Looks up the *admin's* org by email, not the caller's — the caller need not
  even be authenticated (`GRANT ... TO anon, authenticated`). This is the request-access flow.
- Approving/rejecting a request → `approve_membership_request(request_id, role)` /
  `reject_membership_request(request_id)`. Each independently re-checks
  `has_org_role(auth.uid(), org.id, ARRAY['owner','admin'])` inside the function body before
  doing anything — RLS on `membership_requests` itself doesn't gate these, the function does.
  `approve_membership_request` additionally inserts the `memberships` row and (v2, migration
  #14) upserts a `team_members` slot, all inside one SECURITY DEFINER transaction.

**Public / unauthenticated exceptions**:
- `storage.objects` bucket `win-proof`: `anon` **and** `authenticated` can INSERT (the no-login
  Daily Win check-in form); only `authenticated` can SELECT/DELETE.
- `storage.objects` bucket `applicant-resumes`: `authenticated`-only for all operations (no
  `anon`), unlike `win-proof`.
- `storage.objects` bucket `copy-swipes`: `authenticated`-only for all operations.
- `lead_video_links`: SELECT/INSERT policies exist for `authenticated` org members; there is
  **no UPDATE policy** even though an UPDATE grant exists at the table-privilege level — with RLS
  enabled and no matching policy, that UPDATE grant is currently inert for any RLS-checked
  session. The migration's own comment confirms marking `opened_at` happens via `service_role`
  from an unauthenticated public "resolve" endpoint, bypassing RLS entirely (as `service_role`
  does), not via a client-side authenticated update.
- `connector_registry`, `formula_variables`: originally `USING (true)` for anyone, tightened in
  migration #12 to `authenticated`-only with `REVOKE SELECT ... FROM anon`.

**Not fully determinable from migrations alone**: baseline `GRANT`/`REVOKE` privileges that
Supabase applies to `anon`/`authenticated`/`service_role` at project-provisioning time are not
part of migration history — a few tables carry explicit `GRANT SELECT, INSERT, UPDATE, DELETE ON
... TO authenticated` statements (mostly tables added from migration #16 onward) while earlier
tables have no explicit GRANT at all. This audit cannot tell from the repo alone whether that
reflects a real difference in effective privilege or just documentation style; RLS is the
enforced boundary either way for anything reachable by client code following this repo's own
`.functions.ts`/`.server.ts` convention (writes go through `supabaseAdmin`, which is
`service_role` and bypasses RLS by design).

**Soft-delete**: **Not found in migration history.** No table has a `deleted_at`/`is_deleted`
column anywhere. All deletion is hard-delete, propagated by `ON DELETE CASCADE`/`ON DELETE SET
NULL` foreign-key behavior.

---

## 5. Existing Leads System — What Must Be Preserved

The current `leads` table and its satellite tables already encode a full — if single-pipeline —
sales-tracking system:

- **Identity & contact**: `handle`, `full_name`, `email`, `phone`.
- **Source attribution**: `traffic_source_id` → `traffic_sources` (with UTM fields as of
  migration #37), `first_touch_content_id`/`first_touch_at` → `content_pieces`, plus the full
  `lead_content_touches` history table for *every* touch, not just the first.
- **Owner/assignment**: `assigned_setter_id` (→ `auth.users`, with the same reliability caveat
  as `calls.setter_id` in §3).
- **Status & stage**: `status` (`lead_status` enum: `dm_received → qualified →
  pre_call_assets_sent → call_booked → showed → closed`, plus `disqualified`/`follow_up`/
  `no_show`/`ghosted`), and a separate free-text `pipeline_stage` column added later —
  **two parallel stage concepts coexist** (the enum and the free-text field); migrations never
  reconcile them.
- **Qualification / scoring**: `qualification_notes`, `intent_score`, `engagement_score`,
  `estimated_close_probability`, `beliefs`.
- **Objections**: `objections_raised text[]` directly on the lead, *and* the separate
  `setter_call_signals.objections`/`limiting_beliefs` log (call-level, not lead-level), *and*
  `call_objections` (tied to a specific `calls` row). Three overlapping objection-capture
  mechanisms exist.
- **Priority**: `priority` text, default `'normal'`.
- **Pre-call video**: originally just `precall_video_watched boolean` (a manual toggle);
  migration #33 replaced this with a real mechanism — `lead_video_links` (tokenized link +
  `opened_at` click tracking) — but the old boolean column was never dropped, so both exist.
- **Content attribution**: as above, both first-touch and full-touch history.
- **Lifecycle events**: `lead_events` (generic, typed, timestamped).
- **Conversations**: `conversations` → `messages`, channel-tagged (default `instagram_dm`).
- **Calls**: `calls` (→ `call_objections`), plus the separate `setter_call_signals` and
  `lead_call_transcripts` tables layering more call-derived data onto the same lead.
- **Client conversion**: `clients.lead_id` (nullable — a client need not trace back to a lead
  row, and a lead need not have converted).
- **Payment/revenue**: `clients` → `payments`, and `payments.call_id` independently links back
  to the originating `calls` row.
- **Timestamps**: `created_at`/`updated_at` (auto-maintained via `tg_leads_updated` trigger) on
  the lead itself; every satellite table has its own timestamp columns.
- **Notes**: both a `notes text` column directly on `leads` (added migration #23) and the
  separate `lead_notes` table (multi-row, authored, timestamped) — two note-capture mechanisms.
- **Custom tagging**: `leads.tags text[]` (migration #36), deliberately kept separate from the
  generic `tags`/`taggables` catalog.
- **Application data**: `application_data jsonb` — an open-ended bag for intake-form answers.

### Which existing tables should remain authoritative vs. which could be adapted
- **Must remain authoritative as-is**: `leads`, `lead_events`, `lead_notes`,
  `lead_content_touches`, `clients`, `payments`, `calls`, `call_objections` — these carry the
  actual sales history and revenue ledger; nothing about a Close-style rebuild requires changing
  their meaning, only building new surfaces on top of them.
- **Reasonable candidates for adapter/consolidation, not deletion**: the three overlapping
  objection stores (`leads.objections_raised`, `call_objections`, `setter_call_signals.objections`),
  the two stage concepts (`leads.status` enum vs. `leads.pipeline_stage` text), and the two note
  stores (`leads.notes` vs. `lead_notes`) are real duplication a Close-style CRM will want to
  unify — but the unification is a Manus design decision, not something this audit resolves.
- **Identity gap to design around, not silently paper over**: `assigned_setter_id`/`setter_id`/
  `closer_id` point at `auth.users`, while the human-readable rep roster lives in `team_members`
  (not FK-linked to those columns) — any new CRM assignment model needs to pick one identity
  space and migrate the other into it deliberately.

---

## 6. Gap Analysis for a Close.io-Style CRM

| Capability | Status | Basis |
|---|---|---|
| Contacts (person, independent of a sales-pipeline lead) | **DOES NOT EXIST** | Only `leads` (pipeline-bound) and `clients` (post-close) model a person; neither is a general-purpose contact record. |
| Companies | **DOES NOT EXIST** | No table anywhere. |
| Opportunities (deal object) | **PARTIALLY EXISTS** | `calls` carries deal-shaped fields (`contract_value_cents`, `cash_collected_cents`, `closed`, `offer_made`) but is modeled as a call event, not a standalone, stage-tracked deal object that can outlive/precede a call. |
| Configurable pipelines | **DOES NOT EXIST** | `lead_status` is a fixed Postgres enum (schema change required to add a stage); `pipeline_stage` is free-text with no backing stage-definition table. |
| Pipeline stages (as data, not enum) | **DOES NOT EXIST** | See above — no `pipeline_stages` table anywhere. |
| Activities (generic timeline entries: call logged, email sent, note added, etc.) | **PARTIALLY EXISTS** | `lead_events` is generic and typed, but nothing else writes into it uniformly — `lead_notes`, `calls`, `messages`, `client_wins` etc. are each their own table/timeline, not funneled through one activity feed. |
| Tasks / reminders | **DOES NOT EXIST** | No table. |
| Unified timeline (one feed of everything for a record) | **DOES NOT EXIST** as a table; **PARTIALLY EXISTS** as a queryable join — `lead_attribution_v` demonstrates the join pattern (lead → content → call → payments) that a real timeline view would need to generalize. |
| Custom fields | **PARTIALLY EXISTS** | Several tables carry an open `jsonb` bag (`leads.application_data`, `content_pieces` has none, `onboarding_responses.responses`) but there's no generic custom-field-definition mechanism. |
| Saved views / filters | **PARTIALLY EXISTS** | `segments` (org_id, user_id, name, entity, filter jsonb, is_shared) is exactly this pattern, but only for whatever "entity" values the app code chooses to support — not verified against dashboard code as part of this schema-only audit. |
| Bulk actions | **UNCLEAR** | Not a schema-level concept; would be an application-layer feature regardless of schema, so migrations can't confirm or deny it. |
| Email accounts / threads | **DOES NOT EXIST** | `outreach_messages`/`outreach_lists` are broadcast-style (one row can target a list), not a connected mailbox or a threaded conversation model. |
| SMS threads / delivery status | **PARTIALLY EXISTS** | `outreach_messages.kind = 'sms'` exists as a category, but there is no per-recipient delivery-status tracking, no provider message ID column, and no inbound-SMS/thread model — see §7. |
| Provider-neutral communications | **PARTIALLY EXISTS** | `outreach_lists`/`outreach_messages` are provider-neutral in that they don't name a vendor, but they also don't have a `provider` column or external correlation ID, so today they're neutral by omission rather than by design. |
| Call integrations (live dialer state) | **DOES NOT EXIST** | `calls` records outcomes of calls that already happened; no columns for an in-progress call, a provider call SID, or ringing/connecting state. |
| Sequences (multi-step automated outreach) | **DOES NOT EXIST** | `story_sequences` is a content-calendar cadence for social posts, unrelated to outreach automation despite the name overlap. |
| Automation / assignment rules | **DOES NOT EXIST** | No table. |
| CRM search | **UNCLEAR** | Application/infra concern, not resolvable from schema. |
| CRM reporting | **PARTIALLY EXISTS** | `metric_definitions`/`formula_variables`/`dashboard_widgets` form a real, working metrics framework already, reusable for CRM reporting rather than needing to be rebuilt. |

No implementation details for any "DOES NOT EXIST" row are proposed here, per instruction — this
is a status inventory only.

---

## 7. Twilio / Email Readiness

**What exists that's relevant**: `outreach_lists` (kind: `email`|`sms`), `outreach_recipients`
(email, phone, full_name, list_id), `outreach_messages` (kind, subject, body, scheduled_for,
sent_at, status, error). This is a genuine start at provider-neutral messaging — the `kind` CHECK
constraint deliberately covers both channels in one shape, and there's no vendor name anywhere
in these three tables.

**What's missing for real Twilio/email integration**, stated as gaps only (no implementation
proposed):
- No `provider` column on `outreach_messages` (or a separate `providers`/`communication_channels`
  table) to record which vendor actually sent a given message, or to let more than one provider
  coexist.
- No external/provider message ID column (e.g. a Twilio `MessageSid`/`CallSid` or an email
  provider's message ID) on `outreach_messages` or `calls` — nothing to correlate an outbound
  send with an inbound status-callback webhook.
- No per-recipient delivery tracking — `outreach_messages` appears to be list/broadcast-level
  (one row, one `status`), not one row per recipient with its own delivered/failed/bounced state.
- No inbound-message table — nothing models a reply arriving from a lead via SMS or email outside
  the existing Instagram-DM-shaped `conversations`/`messages` pair (whose `channel` column is
  free-text and defaults to `instagram_dm`, so it *could* accept `'sms'`/`'email'` values today,
  but nothing in the schema enforces or documents that as an intended use).
- No call-recording table — `calls.recording_url` is a single text column per call, not a table
  that could hold multiple recordings, transcription status, or a provider reference, and there
  is no separate table for live/in-progress call state (ringing, connecting, on-hold) the way a
  real-time dialer integration would need.
- `connector_registry` (the generic third-party-integration catalog) has no Twilio or generic
  email-provider row seeded anywhere in migration history — the closest existing entries are
  `stripe` (payments), `calendly` (scheduling), and `gohighlevel` (a CRM, listed as a data
  *source* to sync from, not an outbound channel).

The existing `conversations`/`messages` pair is the most reusable building block for a
provider-neutral unified inbox, since its `channel` column is already free-text rather than an
enum — extending it to carry SMS/email in addition to Instagram DMs would not require a schema
migration to the column itself (though correlating it with delivery-status webhooks still would,
per the gaps above).

---

## 8. Non-Negotiable Data Preservation Requirements

Based strictly on what's declared in the migrations:

- **Existing tables must not simply be deleted.** `leads`, `lead_events`, `lead_notes`,
  `lead_content_touches`, `conversations`, `messages`, `calls`, `call_objections`, `clients`,
  `payments`, `client_wins`, `onboarding_responses` collectively hold the entire sales and
  revenue history of the business; deleting or truncating any of them destroys data no other
  table replicates.
- **Existing IDs must remain traceable.** Every table above uses a stable `uuid` primary key with
  real foreign-key relationships (except the specific unconstrained columns flagged in §3) —
  any rebuild that regenerates IDs instead of preserving them breaks every downstream reference,
  including the payment-to-call-to-lead chain that constitutes the revenue audit trail.
- **Existing lead history must remain accessible** — `lead_events` and `lead_content_touches` are
  the only record of how a lead moved through the funnel and what content touched them; there is
  no way to reconstruct this after the fact from other tables.
- **Existing calls must remain accessible** — `calls` plus `call_objections` and the two
  additional call-adjacent logs (`setter_call_signals`, `lead_call_transcripts`) are the sales
  team's only record of what was actually said and decided on each call.
- **Existing conversations/messages must remain accessible** — the only DM/messaging history in
  the system.
- **Existing client/payment relationships must remain intact** — `payments.client_id` and
  `payments.call_id` together are the only link between a specific sale and the revenue actually
  collected against it; breaking either FK chain corrupts revenue reporting.
- **Existing organization boundaries must remain intact** — every tenant's data is scoped by
  `org_id` and gated by RLS as described in §4; a rebuild that weakens or bypasses this exposes
  one organization's leads/calls/payments to another.
- **Existing ownership relationships must remain intact** — `assigned_setter_id`, `setter_id`,
  `closer_id`, `created_by`, `author_id` fields (with the FK caveats noted in §3) attribute work
  to specific people; losing these breaks commission/attribution history, not just cosmetic
  display.

---

## 9. Production Data Limitation

**This audit describes the database architecture defined by the repository's migration history.
It does NOT represent a live production database dump and therefore does not provide verified
production row counts, current production records, or current production data relationships
beyond those encoded in the schema.**

No row counts are included anywhere in this document. No data from the previously-inspected
`utdejyqjygasqufbuqpd` project (confirmed to be an unrelated/default Supabase project, never
verified as this application's production database) is referenced or reused anywhere above.

---

## 10. Instructions for Manus

Use this audit as the source-of-truth for understanding the existing CRM/database architecture
of C4 InsightOS. Specifically:

1. **Preserve existing data.** Every table in §1–2 that isn't explicitly called out in §6 as
   missing represents real, load-bearing structure — treat it as production functionality.
2. **Preserve existing organization/RLS boundaries.** Reuse `is_org_member`/`has_org_role`/
   `current_user_orgs` and the `org_id`-scoped RLS pattern described in §4 rather than inventing
   a parallel authorization model.
3. **Preserve existing sales workflows.** The lead lifecycle described in §5 (status enum,
   pipeline_stage, qualification, objections, notes, conversion to client, payment) is what
   sales reps use today — a rebuild that removes any of these fields without a replacement breaks
   an existing, in-use workflow, not a legacy one.
4. **Avoid destructive migrations.** No `DROP TABLE`/`DROP COLUMN`/rename appears anywhere in this
   app's own migration history (see §0) — that additive discipline should continue.
5. **Build the new CRM additively where possible** — new tables/columns alongside the existing
   ones, following this repo's own established pattern of pure-addition migrations.
6. **Use compatibility/adapter layers when replacing existing structures** — e.g., if
   `pipeline_stage` is unified with `status`, or the three objection stores are consolidated,
   provide a read/write path that keeps existing consumers (this app's own `.functions.ts`/
   `.server.ts` layer, per this repo's `CLAUDE.md`) working, rather than a hard cutover.
7. **Treat the existing Leads system as existing production functionality, not disposable legacy
   code.** It is a working, if single-pipeline, sales-tracking system today (§5), not a stub.
8. **Build a Close.io-style Sales CRM workspace inside InsightOS**, using §6's gap analysis as the
   list of what genuinely needs to be added (contacts, companies, real opportunities, configurable
   pipelines/stages, tasks/activities, a unified timeline, custom fields).
9. **Integrate Twilio for calling/SMS** using §7's gap list — there is no existing Twilio-shaped
   structure to conflict with, but the `outreach_*` tables and the `channel`-flexible
   `conversations`/`messages` pair are reasonable extension points.
10. **Integrate email** the same way — extend rather than replace `outreach_lists`/
    `outreach_messages`, adding the provider/delivery-tracking columns §7 identifies as missing.
11. **Provide a unified CRM timeline** — `lead_events` and the `lead_attribution_v` view (§2, §3)
    are the closest existing precedents for what a generalized activity feed would need to
    aggregate; note the `lead_attribution_v` setter-join reliability caveat in §3 before reusing
    that view as-is.
12. **Preserve all historical communication, call, lead, client, and payment information**, per
    §8's non-negotiable list — no rebuild step should require truncating or discarding rows from
    `leads`, `lead_events`, `lead_notes`, `conversations`, `messages`, `calls`,
    `call_objections`, `clients`, or `payments`.
