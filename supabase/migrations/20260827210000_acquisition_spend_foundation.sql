-- Priority 6: provider-neutral acquisition spend foundation.
-- Additive only: no existing rows or financial ledgers are modified.
create table if not exists public.acquisition_spend (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  ad_account_id text,
  campaign_id text,
  campaign_name text,
  spend_date date not null,
  currency text not null default 'USD',
  spend_amount_cents bigint,
  impressions bigint,
  clicks bigint,
  paid_visits bigint,
  is_remarketing boolean not null default false,
  source_platform text,
  source_type text,
  webinar_id uuid references public.webinars(id) on delete set null,
  content_id uuid references public.content_pieces(id) on delete set null,
  external_record_id text not null,
  captured_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint acquisition_spend_currency_nonempty check (length(trim(currency)) > 0),
  constraint acquisition_spend_nonnegative_numbers check (
    (spend_amount_cents is null or spend_amount_cents >= 0)
    and (impressions is null or impressions >= 0)
    and (clicks is null or clicks >= 0)
    and (paid_visits is null or paid_visits >= 0)
  )
);

create unique index if not exists acquisition_spend_provider_record_uidx
  on public.acquisition_spend(org_id, provider, external_record_id);
create index if not exists acquisition_spend_scope_date_idx
  on public.acquisition_spend(org_id, spend_date, provider);
create index if not exists acquisition_spend_campaign_idx
  on public.acquisition_spend(org_id, campaign_id, spend_date);
create index if not exists acquisition_spend_webinar_idx
  on public.acquisition_spend(org_id, webinar_id, spend_date);
create index if not exists acquisition_spend_content_idx
  on public.acquisition_spend(org_id, content_id, spend_date);

comment on table public.acquisition_spend is 'Provider-neutral advertising spend and delivery facts. External records are idempotent by organization/provider/external_record_id; missing upstream dimensions remain null.';
comment on column public.acquisition_spend.spend_date is 'Provider-reported spend date; distinct from captured_at and downstream event dates.';
comment on column public.acquisition_spend.paid_visits is 'Provider-reported paid landing-page visits; never inferred from clicks.';
comment on column public.acquisition_spend.is_remarketing is 'Separates remarketing spend from acquisition spend without collapsing either category.';
