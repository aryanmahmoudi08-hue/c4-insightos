-- Client DNA becomes the source of truth for ticket-tier / offer / payment-
-- plan configuration and lead classification (InsightOS refinement pass).
-- Additive only: no existing column is altered destructively, and existing
-- 'high'/'low' ticket_tier values on leads remain valid (seeded below as
-- real configured tiers, not orphaned by the new open-ended tier list).

-- Ticket tiers are no longer hardcoded to exactly two values.
alter table public.leads drop constraint if exists leads_ticket_tier_check;

create table if not exists public.offer_tiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tier_key text not null,
  price_cents bigint,
  pricing_type text not null default 'single' check (pricing_type in ('single', 'mrr')),
  currency text not null default 'USD',
  is_active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, tier_key) references public.offer_tiers (org_id, key) on delete restrict
);

create table if not exists public.offer_payment_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  label text not null,
  cadence text not null check (cadence in ('single', 'weekly', 'biweekly', 'monthly', 'mrr', 'custom')),
  installment_amount_cents bigint,
  installment_count int,
  total_contracted_value_cents bigint,
  deposit_cents bigint,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ordered, evaluated-in-priority-order classification rules (spec: "support
-- an ordered rule structure rather than embedding business logic directly
-- into the UI"). typeform_field_key matches whatever field ref/id/title the
-- Typeform webhook handler keyed the raw answer under — free text, since
-- Typeform fields are per-form and not knowable in advance.
create table if not exists public.lead_classification_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  priority int not null default 0,
  typeform_field_key text not null,
  operator text not null check (operator in ('lt', 'lte', 'gt', 'gte', 'eq')),
  threshold_cents bigint not null,
  tier_key text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (org_id, tier_key) references public.offer_tiers (org_id, key) on delete restrict
);

-- Classification audit trail on the lead itself — which rule fired, off
-- which raw response, and when. Null when a tier was set manually (or not
-- at all) rather than by a rule, so "never guess" stays auditable both ways.
alter table public.leads
  add column if not exists ticket_tier_raw_value text,
  add column if not exists ticket_tier_rule_id uuid references public.lead_classification_rules(id) on delete set null,
  add column if not exists ticket_tier_classified_at timestamptz;

create index if not exists offer_tiers_org_idx on public.offer_tiers (org_id, sort_order);
create index if not exists offers_org_idx on public.offers (org_id, is_active);
create index if not exists offer_payment_plans_offer_idx on public.offer_payment_plans (offer_id);
create index if not exists lead_classification_rules_org_idx on public.lead_classification_rules (org_id, priority) where is_active;

alter table public.offer_tiers enable row level security;
alter table public.offers enable row level security;
alter table public.offer_payment_plans enable row level security;
alter table public.lead_classification_rules enable row level security;

-- Read: any org member (Dialer/Closer/reporting surfaces all need to read
-- tier/offer labels). Write: admin/sales_manager/growth_ops — the same
-- roles the app-level permission catalogue already grants "copy" (Client
-- DNA) edit access to.
create policy "members read offer tiers" on public.offer_tiers
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write offer tiers" on public.offer_tiers
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

create policy "members read offers" on public.offers
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write offers" on public.offers
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

create policy "members read offer payment plans" on public.offer_payment_plans
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write offer payment plans" on public.offer_payment_plans
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

create policy "members read classification rules" on public.lead_classification_rules
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write classification rules" on public.lead_classification_rules
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

-- Seed the two tiers every existing 'high'/'low' ticket_tier value on leads
-- already implies, so historical records keep resolving to a real
-- configured tier instead of becoming orphaned by the open-ended tier list.
insert into public.offer_tiers (org_id, key, label, sort_order)
select id, 'low', 'Low Ticket', 1 from public.organizations
on conflict (org_id, key) do nothing;
insert into public.offer_tiers (org_id, key, label, sort_order)
select id, 'high', 'High Ticket', 2 from public.organizations
on conflict (org_id, key) do nothing;
