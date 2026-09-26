-- A workspace created after 20260904090000 ran has no offer tiers.
--
-- That migration seeded them with `select id from public.organizations`, which
-- covers every org existing at migration time and nothing afterwards. Any
-- workspace created later — including the first one in a freshly provisioned
-- database, which is created by hand after migrations are applied — starts
-- with an empty offer_tiers table.
--
-- The consequence is not cosmetic. `offers.tier_key` carries
--   foreign key (org_id, tier_key) references public.offer_tiers (org_id, key)
-- so with no tier rows, creating ANY offer fails the foreign key. Client DNA
-- is unusable, and because dealClassification reads the offer catalogue to
-- decide MRR-ness, low_ticket_mrr can never be detected either — every
-- payment-plan client silently classifies as high ticket.
--
-- Fixed the same way handle_new_user handles auth: seed on insert, so the
-- guarantee holds for every future workspace rather than only the ones that
-- happened to exist when a migration ran.

create or replace function public.seed_default_offer_tiers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.offer_tiers (org_id, key, label, sort_order)
  values (new.id, 'low', 'Low Ticket', 1), (new.id, 'high', 'High Ticket', 2)
  on conflict (org_id, key) do nothing;
  return new;
end;
$$;

drop trigger if exists tg_seed_offer_tiers on public.organizations;
create trigger tg_seed_offer_tiers
  after insert on public.organizations
  for each row execute function public.seed_default_offer_tiers();

-- Backfill every workspace that is already missing them, including this one.
insert into public.offer_tiers (org_id, key, label, sort_order)
select o.id, 'low', 'Low Ticket', 1 from public.organizations o
on conflict (org_id, key) do nothing;

insert into public.offer_tiers (org_id, key, label, sort_order)
select o.id, 'high', 'High Ticket', 2 from public.organizations o
on conflict (org_id, key) do nothing;
