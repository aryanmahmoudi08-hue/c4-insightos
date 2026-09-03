-- Phase 3 (InsightOS upgrade spec): Mentees & Renewals full upgrade.
-- Additive only. Reuses payment_recovery_items / renewal_work_items /
-- operational_work_items (created 20260901090000, previously unused by any
-- UI) rather than inventing parallel tables for the same concepts.

-- Strict per-installment payment-plan schedule (spec section 7): a
-- $500/month plan must show every expected $500 payment, not just an
-- aggregate "installments remaining" count.
create table if not exists public.payment_schedule_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  due_date date not null,
  amount_cents integer not null,
  status text not null default 'scheduled' check (status in ('scheduled','paid','missed','overdue')),
  payment_id uuid references public.payments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, client_id, due_date)
);

create index if not exists payment_schedule_items_due_idx
  on public.payment_schedule_items (org_id, status, due_date);

-- Per-mentee activity timeline (spec section 7's mentee profile drawer) —
-- append-only log of stage changes, recovery/renewal actions, and notes.
create table if not exists public.client_activity_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  body text,
  actor_id uuid,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists client_activity_events_client_idx
  on public.client_activity_events (client_id, created_at desc);

-- Renewal/payment-plan communication triggers (spec section 6's Proposal
-- Sandbox: "Email/SMS triggered by payment-plan due dates" / "renewal
-- dates"). send_status stays 'not_connected' until a real email/SMS
-- provider secret exists — never fabricated as sent.
create table if not exists public.scheduled_communications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('payment_due','renewal_due')),
  channel text not null check (channel in ('email','sms')),
  scheduled_for timestamptz not null,
  subject text,
  body text,
  send_status text not null default 'not_connected' check (
    send_status in ('not_connected','queued','sent','failed','cancelled')
  ),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduled_communications_queue_idx
  on public.scheduled_communications (org_id, send_status, scheduled_for);

alter table public.payment_schedule_items enable row level security;
alter table public.client_activity_events enable row level security;
alter table public.scheduled_communications enable row level security;

create policy "members read payment schedule" on public.payment_schedule_items
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write payment schedule" on public.payment_schedule_items
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

create policy "members read client activity" on public.client_activity_events
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write client activity" on public.client_activity_events
  for insert to authenticated with check (public.is_org_member(auth.uid(), org_id));

create policy "members read scheduled comms" on public.scheduled_communications
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "managers write scheduled comms" on public.scheduled_communications
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
