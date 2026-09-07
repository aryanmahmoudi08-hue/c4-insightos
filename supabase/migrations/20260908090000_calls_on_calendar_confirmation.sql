-- Calls on Calendar + confirmation workflow (InsightOS attribution +
-- calendar consolidation pass). Additive only. Reuses `calls` as the sole
-- appointment source of truth — no separate booking table.

alter table public.calls
  add column if not exists meeting_link text;

-- Org-level, configurable confirmation policy — never a hard-coded cutoff.
-- auto_cancel_enabled defaults to false: unconfirmed calls reach and stay at
-- "at_risk" (a human must act) until an admin explicitly turns on
-- auto-cancellation. This is a deliberate safety default, not an oversight —
-- see the confirmation_policy read/write server fns for the same guard.
create table public.confirmation_policy (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  overdue_after_hours numeric not null default 24,
  at_risk_after_hours numeric not null default 4,
  auto_cancel_enabled boolean not null default false,
  auto_cancel_minutes_before numeric not null default 30,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.confirmation_policy enable row level security;
create policy "org members read confirmation_policy" on public.confirmation_policy
  for select to authenticated using (is_org_member(auth.uid(), org_id));
create policy "org admins write confirmation_policy" on public.confirmation_policy
  for insert to authenticated with check (has_org_role(auth.uid(), org_id, array['owner','admin']::public.app_role[]));
create policy "org admins update confirmation_policy" on public.confirmation_policy
  for update to authenticated using (has_org_role(auth.uid(), org_id, array['owner','admin']::public.app_role[]));

-- One row per call. Every *_sent_at is a manual "rep marked this sent" log —
-- this repo has no outbound SMS/messaging integration today (confirmed: the
-- Twilio webhook is inbound-only), so nothing here is ever auto-marked as
-- delivered/opened/watched. The *_scheduled_at columns exist so a future
-- real integration can populate a genuine "queued to send" state without a
-- schema change; they stay null until such an integration exists.
create table public.call_confirmations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,

  night_before_scheduled_at timestamptz,
  night_before_sent_at timestamptz,

  morning_scheduled_at timestamptz,
  morning_sent_at timestamptz,
  morning_reason_for_change text,
  morning_goal_1 text,
  morning_goal_2 text,
  morning_goal_3 text,
  morning_response_notes text,
  morning_responded_at timestamptz,

  one_hour_scheduled_at timestamptz,
  one_hour_sent_at timestamptz,

  thirty_min_scheduled_at timestamptz,
  thirty_min_sent_at timestamptz,
  thirty_min_confirmed boolean not null default false,
  thirty_min_confirmed_at timestamptz,

  ten_min_scheduled_at timestamptz,
  ten_min_sent_at timestamptz,

  overall_status text not null default 'awaiting'
    check (overall_status in ('awaiting','confirmed','overdue','at_risk','cancelled','rescheduled')),
  confirmed_at timestamptz,
  cancelled_reason text,

  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on public.call_confirmations (org_id, overall_status);

alter table public.call_confirmations enable row level security;
create policy "org members read call_confirmations" on public.call_confirmations
  for select to authenticated using (is_org_member(auth.uid(), org_id));
create policy "org members write call_confirmations" on public.call_confirmations
  for insert to authenticated with check (is_org_member(auth.uid(), org_id));
create policy "org members update call_confirmations" on public.call_confirmations
  for update to authenticated using (is_org_member(auth.uid(), org_id));

create trigger tg_call_confirmations_updated
  before update on public.call_confirmations
  for each row execute function public.tg_set_updated_at();
