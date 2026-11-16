-- Discord ops channels (Aryan, 2026-11-15):
--   #payment-follow-ups   — what the closer still has to collect, from the post-call form
--   #todays-calls / #eod-no-show — tag reps by their Discord user
--   #pre-call-assets      — which of the lead's pre-call assets they opened
--   #calls-confirmed      — the invitee accepted the Google Calendar invite
-- Every statement is idempotent so a retried push is safe.

-- 1. Payment follow-up, captured on the closer post-call form when a deposit
--    was taken or the deal is on a payment plan.
alter table public.calls
  add column if not exists payment_followup_at timestamptz,
  add column if not exists payment_followup_amount_cents bigint,
  add column if not exists payment_followup_method text,
  add column if not exists payment_followup_notes text;
create index if not exists calls_payment_followup_at_idx
  on public.calls (org_id, payment_followup_at)
  where payment_followup_at is not null;

-- 2. A rep's Discord user, so a message can @ them by name.
alter table public.team_members
  add column if not exists discord_user_id text;

-- 3. Which pre-call assets a lead opened from their pre-call page. One row per
--    lead per asset: the first open is what counts, later ones are ignored.
create table if not exists public.precall_asset_clicks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  asset_index smallint not null check (asset_index between 0 and 4),
  clicked_at timestamptz not null default now(),
  unique (org_id, lead_id, asset_index)
);
alter table public.precall_asset_clicks enable row level security;
drop policy if exists "org members read precall asset clicks" on public.precall_asset_clicks;
create policy "org members read precall asset clicks"
  on public.precall_asset_clicks for select to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = auth.uid()));
grant select on public.precall_asset_clicks to authenticated;
grant all on public.precall_asset_clicks to service_role;

-- 4. Google Calendar: read-only access to the calendar Calendly writes to, so
--    an invitee accepting the invite can mark the call confirmed.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values ('google_calendar', 'Google Calendar', 'scheduling', 'oauth2',
        'Reads invite responses so an accepted invite confirms the call', 'calendar', true)
on conflict (id) do nothing;

-- Google issues a short-lived access token plus a long-lived refresh token.
alter table public.connector_oauth_tokens
  add column if not exists refresh_token text;

-- What Google last said about the invitee's response, so a call is confirmed
-- once and "declined" is visible rather than silently ignored.
alter table public.calls
  add column if not exists google_event_id text,
  add column if not exists google_rsvp_status text,
  add column if not exists google_rsvp_checked_at timestamptz;
