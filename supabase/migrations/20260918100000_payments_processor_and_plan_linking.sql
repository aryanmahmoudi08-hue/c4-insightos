-- Payments: which real-world money rail processed it, and what kind of
-- payment it was. Both nullable — populating historical rows is a future
-- reconciliation project, not something to backfill by guessing.
alter table public.payments
  add column if not exists processor text
    check (processor in ('wise', 'paypal', 'fanbasis', 'whop', 'stripe', 'bank_transfer', 'other')),
  add column if not exists payment_type text
    check (payment_type in ('deposit', 'installment', 'pif', 'renewal', 'other')),
  add column if not exists failure_reason text;

create index if not exists payments_processor_idx
  on public.payments (org_id, processor) where processor is not null;
create index if not exists payments_payment_type_idx
  on public.payments (org_id, payment_type) where payment_type is not null;

-- Clients: optional link to a configured, catalog-sourced payment plan
-- (cadence / installment_count / installment_amount_cents / deposit_cents
-- all become real structured data instead of re-derived guesses). Nullable
-- — unlinked clients keep using the existing flat installment fields and
-- are labeled "Custom" in the UI, never silently treated as matching a
-- plan they were never actually assigned to.
alter table public.clients
  add column if not exists offer_payment_plan_id uuid
    references public.offer_payment_plans(id) on delete set null;

create index if not exists clients_offer_payment_plan_idx
  on public.clients (offer_payment_plan_id) where offer_payment_plan_id is not null;
