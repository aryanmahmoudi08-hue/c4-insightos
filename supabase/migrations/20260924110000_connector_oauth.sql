-- OAuth capability for the connector system.
--
-- Every existing connector authenticates with a webhook secret the user pastes
-- in, which is why connector_connections.config was a fine home for it. Ad
-- platforms don't work that way: Meta/TikTok/YouTube/LinkedIn all require an
-- OAuth authorization-code flow, which the registry had no way to express.
-- This adds the two pieces that flow needs.
--
-- SECURITY, and the reason tokens do NOT live in connector_connections.config:
-- connector_connections carries an "org members read" RLS policy, and the
-- Connections panel already selects `config` straight into the browser. A
-- pasted webhook secret being visible to org members is one thing; a live ads
-- API access token is another. Both tables below are therefore service-role
-- only — RLS is enabled and deliberately NO policy is created, so PostgREST
-- returns nothing to `authenticated` no matter who asks. Only supabaseAdmin
-- (which bypasses RLS) can read or write them.

create table if not exists public.connector_oauth_states (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connector_id text not null references public.connector_registry(id),
  -- The CSRF nonce handed to the provider and echoed back unchanged. Unique so
  -- a replayed callback can't match a second row.
  state text not null unique,
  -- Pinned at issue time: the provider requires the exchange to use the exact
  -- same redirect_uri as the authorize call, and it must not be attacker-chosen.
  redirect_uri text not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  -- Single-use: set on first successful callback so a replay is rejected.
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists connector_oauth_states_lookup_idx
  on public.connector_oauth_states (state);

create table if not exists public.connector_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connector_id text not null references public.connector_registry(id),
  access_token text not null,
  token_type text,
  -- Null means "no expiry" — Meta issues non-expiring long-lived tokens to
  -- apps with Standard access to the Marketing API, so null is a real state
  -- here rather than unknown.
  expires_at timestamptz,
  scope text,
  -- The provider-side account this token is good for (e.g. Meta ad account).
  external_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, connector_id)
);

alter table public.connector_oauth_states enable row level security;
alter table public.connector_oauth_tokens enable row level security;

-- No policies on purpose (see header). Revoke the default grants so a future
-- blanket "grant to authenticated" elsewhere can't silently expose these.
revoke all on public.connector_oauth_states from anon, authenticated;
revoke all on public.connector_oauth_tokens from anon, authenticated;
grant all on public.connector_oauth_states to service_role;
grant all on public.connector_oauth_tokens to service_role;

create trigger tg_connector_oauth_tokens_updated
  before update on public.connector_oauth_tokens
  for each row execute function public.tg_set_updated_at();

-- Meta is the first consumer. acquisition_spend (provider-neutral, idempotent
-- on (org_id, provider, external_record_id)) is already the destination for
-- the spend this unlocks — no new destination table needed.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values
  ('meta', 'Meta Ads', 'advertising', 'oauth2', 'Campaign-level ad spend from Meta Marketing API', 'megaphone', true)
on conflict (id) do nothing;
