-- Scheduled events, Discord role pings, and a once-only guarantee for both.
--
-- Several Discord channels depend on something becoming due rather than
-- something being submitted: a call nobody confirmed, a dialer callback whose
-- time has come, a closer's follow-up date, the nightly sales report. Nothing
-- in the app could notice time passing — every event was a side effect of a
-- request. This adds the clock.
--
-- Why pg_cron and not a Vercel cron: the project is on Vercel's Hobby plan,
-- which only runs crons once a day. "Call this lead now" needs minutes.
-- pg_cron runs inside the database on any Supabase plan and pg_net makes the
-- HTTP call, so the clock lives next to the data it reads.

------------------------------------------------------------------------------
-- 1. Who a subscription pings
------------------------------------------------------------------------------
-- Discord role IDs, rendered as <@&id> and whitelisted in allowed_mentions.
-- Per subscription because the roles are per Discord server: a callback
-- channel pings setters, a follow-up channel pings closers.
alter table public.webhook_subscriptions
  add column if not exists mention_role_ids text[] not null default '{}';

comment on column public.webhook_subscriptions.mention_role_ids is
  'Discord role IDs to @mention on every delivery. Ignored for non-Discord targets.';

------------------------------------------------------------------------------
-- 2. Fire once
------------------------------------------------------------------------------
-- The scheduler ticks every minute and re-reads what is due, so without a
-- record of what it already sent it would ping the same unconfirmed call
-- sixty times an hour. A claim is inserted before dispatch; the unique key
-- makes the second attempt a no-op. fire_key carries the due time, so a
-- callback moved to a new time fires again for the new time.
create table if not exists public.scheduled_event_fires (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null,
  fire_key text not null,
  fired_at timestamptz not null default now(),
  unique (org_id, event_type, fire_key)
);

create index if not exists scheduled_event_fires_org_fired_idx
  on public.scheduled_event_fires (org_id, fired_at desc);

alter table public.scheduled_event_fires enable row level security;

drop policy if exists "org members read scheduled_event_fires" on public.scheduled_event_fires;
create policy "org members read scheduled_event_fires"
  on public.scheduled_event_fires for select
  using (public.is_org_member(auth.uid(), org_id));
-- No insert/update/delete policy: only the service role writes claims.

------------------------------------------------------------------------------
-- 3. The clock
------------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- The tick endpoint is public, so it checks a bearer token. The token is
-- generated here, inside the database, and never leaves it except in the
-- request pg_net makes: it is not in this file, the repo, an env var, or
-- anyone's chat history. The endpoint verifies it through the function
-- below rather than holding its own copy.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'scheduler_tick_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'scheduler_tick_secret',
      'Bearer token pg_cron sends to /api/public/scheduler-tick'
    );
  end if;
  -- The URL is kept in Vault too, so moving the app to another domain is an
  -- update to one secret rather than a new migration.
  if not exists (select 1 from vault.secrets where name = 'scheduler_tick_url') then
    perform vault.create_secret(
      'https://ascendos-app.vercel.app/api/public/scheduler-tick',
      'scheduler_tick_url',
      'Endpoint pg_cron calls every minute'
    );
  end if;
end $$;

create or replace function public.verify_scheduler_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(length(p_secret), 0) >= 32
     and exists (
       select 1
         from vault.decrypted_secrets
        where name = 'scheduler_tick_secret'
          and decrypted_secret = p_secret
     );
$$;

revoke all on function public.verify_scheduler_secret(text) from public, anon, authenticated;
grant execute on function public.verify_scheduler_secret(text) to service_role;

-- cron.schedule upserts by job name, so re-running this replaces the job
-- rather than adding a second one.
select cron.schedule(
  'ascendos-scheduler-tick',
  '* * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_tick_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'scheduler_tick_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);
