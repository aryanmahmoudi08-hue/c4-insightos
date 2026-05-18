
create table public.setter_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid,
  team_member_name text not null,
  activity_date date not null default current_date,
  role text not null default 'dm_setter',
  leads_contacted int default 0,
  qualified_convos int default 0,
  sets int default 0,
  calls_on_calendar int default 0,
  live_calls int default 0,
  closes int default 0,
  downsells int default 0,
  cash_collected_cents bigint default 0,
  total_revenue_cents bigint default 0,
  dials int default 0,
  connections int default 0,
  rate_today int check (rate_today is null or (rate_today between 1 and 10)),
  objections text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.setter_activity enable row level security;
create policy "org members read setter_activity" on public.setter_activity for select using (is_org_member(auth.uid(), org_id));
create policy "org members insert setter_activity" on public.setter_activity for insert with check (is_org_member(auth.uid(), org_id));
create policy "org members update setter_activity" on public.setter_activity for update using (is_org_member(auth.uid(), org_id));
create policy "org members delete setter_activity" on public.setter_activity for delete using (is_org_member(auth.uid(), org_id));
create trigger setter_activity_updated before update on public.setter_activity for each row execute function public.tg_set_updated_at();
create index setter_activity_org_role_date_idx on public.setter_activity (org_id, role, activity_date desc);

alter table public.calls add column if not exists closer_name text;
alter table public.calls add column if not exists lead_email text;
