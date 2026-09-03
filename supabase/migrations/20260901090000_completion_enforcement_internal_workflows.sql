-- InsightOS completion-enforcement pass.
-- Additive only: not applied to production by this task.

create table if not exists public.operational_work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  state text not null,
  owner_id uuid,
  due_at timestamptz,
  next_action text,
  next_action_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, entity_type, entity_id)
);

create table if not exists public.operational_audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  work_item_id uuid references public.operational_work_items(id) on delete cascade,
  action text not null,
  from_state text,
  to_state text,
  actor_id uuid,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sla_breach_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid,
  owner_id uuid,
  notification_key text not null,
  threshold_minutes integer not null default 5,
  breached_at timestamptz not null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved','unavailable')),
  resolution text,
  created_at timestamptz not null default now(),
  unique (org_id, notification_key)
);

create table if not exists public.notification_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  idempotency_key text not null,
  event text not null,
  recipient text,
  channel text not null,
  provider text,
  status text not null default 'queued' check (status in ('queued','sent','failed','unavailable')),
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

create table if not exists public.payment_recovery_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  payment_id uuid,
  amount_cents integer not null default 0,
  due_at timestamptz,
  status text not null default 'due' check (status in ('due','paid','missed','overdue','failed','retry','recovered','refunded')),
  owner_id uuid,
  next_action text,
  next_action_at timestamptz,
  provider_execution_status text not null default 'unavailable',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.renewal_work_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  owner_id uuid,
  stage text not null default 'not_started' check (stage in ('not_started','outreach_started','renewal_conversation','proposal_sent','renewed','churned')),
  renewal_date date,
  risk text not null default 'unavailable' check (risk in ('healthy','watch','at_risk','unavailable')),
  reason text,
  next_action text,
  next_action_at timestamptz,
  payment_outcome text,
  renewal_outcome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, client_id)
);

create table if not exists public.objection_intelligence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid,
  transcript_id uuid,
  speaker text,
  timestamp_seconds numeric,
  objection_category text,
  objection_position text,
  decision_factor text,
  outcome text,
  confidence numeric,
  evidence_ref text,
  created_at timestamptz not null default now()
);

create table if not exists public.eod_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  submitter_id uuid,
  form_provider text not null default 'typeform',
  external_submission_id text,
  submission_status text not null default 'received' check (submission_status in ('received','processing','processed','failed','unavailable')),
  processing_attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (org_id, form_provider, external_submission_id)
);

create index if not exists operational_work_items_org_state_idx on public.operational_work_items (org_id, state, due_at);
create index if not exists operational_audit_events_work_item_idx on public.operational_audit_events (org_id, work_item_id, created_at desc);
create index if not exists sla_breach_records_org_status_idx on public.sla_breach_records (org_id, status, breached_at desc);
create index if not exists notification_attempts_retry_idx on public.notification_attempts (org_id, status, next_retry_at);
create index if not exists payment_recovery_items_queue_idx on public.payment_recovery_items (org_id, status, due_at);
create index if not exists renewal_work_items_queue_idx on public.renewal_work_items (org_id, stage, renewal_date);
create index if not exists objection_intelligence_call_idx on public.objection_intelligence (org_id, call_id, created_at desc);
create index if not exists eod_submissions_queue_idx on public.eod_submissions (org_id, submission_status, received_at desc);

alter table public.operational_work_items enable row level security;
alter table public.operational_audit_events enable row level security;
alter table public.sla_breach_records enable row level security;
alter table public.notification_attempts enable row level security;
alter table public.payment_recovery_items enable row level security;
alter table public.renewal_work_items enable row level security;
alter table public.objection_intelligence enable row level security;
alter table public.eod_submissions enable row level security;

create policy "members read completion workflow rows" on public.operational_work_items for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write completion workflow rows" on public.operational_work_items for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
create policy "members read completion audit" on public.operational_audit_events for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write completion audit" on public.operational_audit_events for insert to authenticated with check (public.is_org_member(auth.uid(), org_id));
create policy "members read completion sla" on public.sla_breach_records for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write completion sla" on public.sla_breach_records for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
create policy "members read completion notifications" on public.notification_attempts for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write completion notifications" on public.notification_attempts for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','growth_ops']::app_role[]));
create policy "members read payment recovery" on public.payment_recovery_items for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write payment recovery" on public.payment_recovery_items for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
create policy "members read renewal workflow" on public.renewal_work_items for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write renewal workflow" on public.renewal_work_items for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
create policy "members read objection intelligence" on public.objection_intelligence for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write objection intelligence" on public.objection_intelligence for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
create policy "members read eod submissions" on public.eod_submissions for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "members write eod submissions" on public.eod_submissions for all to authenticated using (public.has_org_role(auth.uid(), org_id, array['owner','admin','growth_ops']::app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','growth_ops']::app_role[]));
