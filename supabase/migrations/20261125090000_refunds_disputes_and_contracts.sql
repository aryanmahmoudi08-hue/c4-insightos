-- Refunds and disputes, from every processor, in one place — and the signed
-- contract on the closed call, so a dispute alert can carry the evidence.
--
-- Until now every payment handler recorded only "paid" and "failed": a refund
-- or a chargeback never reached AscendOS at all. Each processor handler (and
-- the Zapier ingest, for processors without one) now writes a row here and
-- announces it to #refunds-disputes.
--
-- One row per processor refund/dispute id. A dispute that moves from
-- needs_response to won updates the same row (and announces again).

create table if not exists public.payment_disputes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('refund', 'dispute', 'dispute_alert')),
  processor text not null,
  external_id text not null,
  -- The processor's id for the payment being refunded/disputed, and our row
  -- for it when we have one.
  payment_external_id text,
  payment_id uuid references public.payments(id) on delete set null,
  status text,
  reason text,
  amount_cents bigint,
  currency text not null default 'USD',
  original_amount_cents bigint,
  original_currency text,
  evidence_due_at timestamptz,
  email text,
  name text,
  phone text,
  product text,
  lead_id uuid references public.leads(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, processor, external_id)
);

create index if not exists payment_disputes_org_occurred_idx
  on public.payment_disputes (org_id, occurred_at desc);
create index if not exists payment_disputes_org_email_idx
  on public.payment_disputes (org_id, lower(email));

alter table public.payment_disputes enable row level security;

drop policy if exists "members read payment disputes" on public.payment_disputes;
create policy "members read payment disputes" on public.payment_disputes
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));

drop policy if exists "managers write payment disputes" on public.payment_disputes;
create policy "managers write payment disputes" on public.payment_disputes
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

-- The signed client agreement for a closed deal: a link (Drive, DocuSign…)
-- or a file the closer uploaded to the call-contracts bucket.
alter table public.calls add column if not exists contract_url text;
alter table public.calls add column if not exists contract_path text;

-- Private: a signed contract carries the client's name, address and
-- signature. Reads go through a signed URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'call-contracts',
  'call-contracts',
  false,
  20971520, -- 20 MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types,
      public = excluded.public;

-- Files live under <org_id>/..., so the first path segment scopes access.
drop policy if exists "members upload call contract" on storage.objects;
create policy "members upload call contract" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'call-contracts'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "members read call contract" on storage.objects;
create policy "members read call contract" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'call-contracts'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
