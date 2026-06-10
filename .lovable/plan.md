This is a 40+ item gameplan. I'll execute it in waves so you can review and course-correct between them rather than getting one giant black-box drop. Each wave is independently shippable.

## Wave 1 — Data integrity (fix the lies on the dashboard first)
Nothing else matters if the numbers are wrong.
- Fix Month-End Pace ($0 while Cash = $4,090): recompute as `cash_to_date / days_elapsed * days_in_month` from the same payments source as the KPI tile.
- Fix Offers Made = 0 while Closes = 5: when a call is logged Closed Won, auto-set `offer_made = true`. Backfill existing rows.
- Fix Funnel Stage bars (rendering as 2px): derive widths from real counts with a min-width floor so non-zero stages always show.
- Fix Lead Attribution ↔ Leads CRM disconnect: when a `content_pieces` row saves `leads_generated > 0`, upsert placeholder `leads` rows tagged `source=content`, `content_piece_id=…`, `status=new`. Backfill the 45 missing leads.
- Fix Closer Scorecard "No closers in range": scorecard query is filtering by a field the manual log doesn't set — switch to grouping by `closer_name` from `calls` directly.
- Fix Momentum 7d showing 0%: replace 30d-window average with rolling last-7-calendar-days from today.
- Fix Objection chart: filter null/empty/"0" from objection labels; scale x-axis to real frequency.
- Fix Team page header counts (0/0/0/0): count from `team_members` roster, not a separate members table.
- Fix Active Clients counter (2/2 vs 1 active): filter `status = active`.

## Wave 2 — Navigation & structure
- Move Leads under Sales Tracking dropdown.
- Inside Sales Tracking add two sub-groups: **Team** (Team Members, Hiring) and **Activity** (DM Setter, Inbound Dialer, Closer, Leads CRM).
- Promote **Story Sequences** to a top-level CopyOS item with its own page (remove from Long-form).
- Keep Content Tracker under CopyOS.
- Decide on Swipe Library: keep + upgrade with images (per your message).

## Wave 3 — Story Sequences module (KJ-style 7-day cadence)
Build a dedicated `/copy/sequences` page modeled after your Miro deliverable:
- **Day templates** (editable, defaults seeded): Sunday Flexible/Any, Monday Story Poll #1, Tuesday Wins Nurture (Win Intro → Proof → Context → Shift → Result → Lesson → Reflection), Wednesday YouTube Vid (Hook → Problem → Value Tease → Key Insight → Preview → Watch CTA), Thursday Story Poll #2, Friday IG Story Funnel (Pattern Interrupt → Relatability → Authority → Lifestyle → Social Proof → Testimonials → Opportunity → Scarcity → CTA), Saturday Personal Story (Hook → Situation → Struggle → Realization → Turning Point → Result → Lesson → Reflection/CTA).
- Each saved sequence stores: day, template type, per-slide copy, client_id, status, performance notes.
- AI generation fills all slides at once given a brief; each slide is editable individually.
- New tables: `story_sequence_templates`, `story_sequences`, `story_sequence_slides`.

## Wave 4 — CopyOS pipeline + Discord per-channel routing
- Add `status` to `content_pieces`: draft → in_review → approved → ready_to_post → posted.
- Content Tracker becomes a 5-column kanban; admin-only "advance to ready_to_post" enforced via `has_role`.
- `webhook_subscriptions` already exists; add a `category` column (hooks/reels/email/story/long-form) and route ready_to_post events to matching Discord webhook URLs.
- Generation history panel on every Generate sub-page: timestamp, copy type, voice, first 80 chars, actions: Copy / Edit / Save to Pipeline / Regenerate (persists in `copy_generations`, already exists — just surface it).
- Client DNA: drop the client selector — show only the workspace's single client profile.

## Wave 5 — Swipe Library upgrade (text + images)
- Add `image_urls text[]` to `copy_swipes` and a Storage bucket `copy-swipes`.
- Upload UI: drag-drop, paste-from-clipboard, multiple images per swipe.
- "Save to Swipes" button on top-performing hooks in Content Intelligence (one-click).
- Filter by tag, source, has-image.

## Wave 6 — SMS / Email outreach
- Tables: `outreach_lists` (name, kind: sms|email), `outreach_list_members`, `outreach_messages` (subject, body, list_id, scheduled_for, status, sent_at).
- UI under Sales Tracking → "Outreach": compose, pick list, schedule, send-now.
- Scheduled send via pg_cron + an `/api/public/cron/outreach-tick` route that flushes due messages.
- Email send through Resend (or your existing provider — ask if you want a different one); SMS via Twilio when you add the secret.

## Wave 7 — Closer/setter attribution database
- Already partially modeled in `calls` and `setter_activity`. Add a reporting view `lead_attribution_v` that joins `leads → setter_activity → calls → payments` so any lead's setter and closer are queryable. Surface on Leads CRM and Closer Scorecard.

## Wave 8 — n8n connector wiring
Now that n8n is a connector, expose these app→n8n triggers:
- new ready_to_post content
- new lead created
- call logged as Closed Won
- weekly digest generated
Each trigger POSTs to a configurable n8n webhook stored in `connector_connections` — users build whatever automations they want (Slack, Notion, GSheet, etc.) without us touching code per integration.

## Wave 9 — Dashboard polish (visual upgrade pass)
- KPI tiles: replace "100% vs prior" text with inline 7-pt sparkline, color-coded.
- All charts: tooltips, gridlines, axis labels, consistent green/red/amber.
- Replace big gold banner with slim header (icon + title + date filter + 3px gold left border) across all dashboard pages.
- Closer dashboard banner: red → gold.
- Empty states: icon + sentence + primary action everywhere.
- Weekly Digest card on Executive Command Center.
- AI Insights: already split bottlenecks vs double-down; bump from 3 to 5–8 each; add insights-overlay toggle on onboarding form (red/green left borders on questions tied to active insights).
- Client Results: real Progress Checkpoints (goals from intake + dated updates that bump health score).
- Content → Cash river: log scaling so all stages are visible.
- Per-rep daily targets with progress bars on DM Setter dashboard.
- Global search: wire it across clients, leads, content, copy, team.

## Order I'll execute and where to pause
1. **Wave 1 + Wave 2** in one shot (data fixes + nav). Pause for you to verify the numbers now make sense.
2. **Wave 3 + Wave 5** (Story Sequences module + Swipe images). Pause for visual check.
3. **Wave 4 + Wave 8** (Pipeline + Discord/n8n routing). Pause to test a real publish.
4. **Wave 6 + Wave 7** (Outreach + attribution view).
5. **Wave 9** (full visual polish pass — done last so we're polishing the final structure, not in-progress junk).

## One question before I start
**Email sending provider for Wave 6**: do you want Resend (cleanest, needs RESEND_API_KEY), or hold off on email send and just build the scheduler UI + queue so you can wire any provider later? Default if you don't answer: build the queue + scheduler, leave the send adapter as a stub I can switch to Resend the moment you add the key.

Reply "go" and I'll start Wave 1 immediately. Reply "go, skip X" to drop a wave.