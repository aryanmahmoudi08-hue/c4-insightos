-- Ticket tiers can now be safely archived (not just hard-deleted) when
-- referenced by existing offers/rules/leads, so deleting a tier from
-- Client DNA never silently orphans historical records.
alter table public.offer_tiers
  add column if not exists is_active boolean not null default true;
