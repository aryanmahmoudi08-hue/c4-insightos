-- Global display-currency support (InsightOS command-center follow-up pass).
-- Additive only: payments.amount_cents/currency keep their current meaning
-- (canonical USD) so every existing consumer is untouched. original_*/fx_*
-- are pure provenance for the source transaction, per the requirement to
-- never overwrite the original transaction currency.

alter table public.payments
  add column if not exists original_amount_cents bigint,
  add column if not exists original_currency text,
  add column if not exists fx_rate numeric(18,8),
  add column if not exists fx_rate_date date,
  add column if not exists fx_source text;

-- Backfill existing rows as identity conversions (all currently USD by
-- default): original == canonical, rate == 1.0. Existing USD records stay
-- USD with a 1.0 normalization relationship, never retroactively guessed.
update public.payments
set
  original_amount_cents = amount_cents,
  original_currency = currency,
  fx_rate = 1.0,
  fx_rate_date = collected_at::date,
  fx_source = 'identity'
where original_amount_cents is null;

alter table public.payments
  alter column original_amount_cents set not null,
  alter column original_currency set not null,
  alter column fx_rate set not null,
  alter column fx_source set not null;

-- Real-source FX rate cache (Frankfurter.app, ECB reference rates). Reference
-- data, not org-scoped — every workspace shares the same USD->X rate for a
-- given day, so it's readable by any authenticated user, written only by the
-- service-role client.
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null default 'USD',
  quote_currency text not null,
  rate numeric(18,8) not null,
  rate_date date not null,
  source text not null default 'frankfurter',
  created_at timestamptz not null default now(),
  unique (base_currency, quote_currency, rate_date)
);
create index on public.fx_rates (base_currency, quote_currency, rate_date desc);

alter table public.fx_rates enable row level security;
create policy "authenticated read fx_rates" on public.fx_rates
  for select to authenticated using (true);
