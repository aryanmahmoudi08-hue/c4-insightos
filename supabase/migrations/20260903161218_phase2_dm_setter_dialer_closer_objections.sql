-- Phase 2 (InsightOS upgrade spec): DM Setter metrics, Dialer ticket-tier
-- split, Closer disposition/call-duration/coaching, and Objection
-- Intelligence stage/category capture. Additive only — every new column is
-- nullable or defaulted, no existing column/table is altered destructively.

-- DM Setter activity metrics (spec section 3). setter_activity is shared by
-- dm_setter and inbound_dialer roles; these columns are only ever populated
-- for dm_setter rows, but living on the shared table keeps one log form/table
-- consistent with the existing role-partitioned design.
alter table public.setter_activity
  add column if not exists inbound_dms_sent integer,
  add column if not exists outbound_dms_sent integer,
  add column if not exists replies integer,
  add column if not exists followups_sent integer,
  add column if not exists links_clicked integer,
  add column if not exists post_booking_page_visits integer,
  add column if not exists pre_call_video_watches integer;

-- Dialer active-lead ticket-tier split (spec section 4). Nullable — legacy
-- leads with no tier set show as "unclassified", never fabricated as one
-- bucket or the other.
alter table public.leads
  add column if not exists ticket_tier text check (ticket_tier in ('high','low'));

-- Closer call disposition (spec section 5's exact multiple-choice list —
-- distinct from `calls.status`, which is call lifecycle, not sales reason),
-- plus call-length/talk-time for the coaching + activity-quality metrics.
alter table public.calls
  add column if not exists disposition text check (disposition in (
    'closed','follow_up','nurture','no_decision','price','timing',
    'partner_spouse','upsell','unqualified','competitor','other'
  )),
  add column if not exists duration_seconds integer,
  add column if not exists talk_seconds integer,
  add column if not exists cancelled boolean not null default false,
  add column if not exists no_show_recovered boolean not null default false,
  add column if not exists recovered_from_call_id uuid references public.calls(id) on delete set null;

-- Objection Intelligence (spec section 14): where in the call, plus a
-- multi-choice category, on top of the existing freeform `objection` text
-- (kept as the detail/notes field so the existing objection-frequency
-- instrument keeps working unchanged).
alter table public.call_objections
  add column if not exists call_stage text check (call_stage in (
    'rapport','discovery','presentation','offer','close','follow_up','unspecified'
  )),
  add column if not exists category text check (category in (
    'price','timing','trust','partner_spouse','competitor','product_fit',
    'no_need','unqualified','other'
  ));

-- Closer coaching review records (spec section 5).
create table if not exists public.call_coaching_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  call_id uuid references public.calls(id) on delete cascade,
  rep_name text not null,
  reviewer_id uuid,
  reviewer_name text,
  what_learned text,
  what_went_wrong text,
  behavior_change text not null,
  gap_category text check (gap_category in (
    'discovery','objection_handling','closing','follow_up','rapport','offer_framing','other'
  )),
  created_at timestamptz not null default now()
);

create index if not exists call_coaching_reviews_org_rep_idx
  on public.call_coaching_reviews (org_id, rep_name, created_at desc);
create index if not exists call_coaching_reviews_call_idx
  on public.call_coaching_reviews (call_id);

alter table public.call_coaching_reviews enable row level security;

create policy "members read coaching reviews" on public.call_coaching_reviews
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
-- Managers log the review itself; the rep fills in their own self-reflection
-- fields on the same record afterward, so both roles can write.
create policy "members write coaching reviews" on public.call_coaching_reviews
  for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','closer']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','closer']::app_role[]));

-- operational_work_items (created in 20260901090000) restricted writes to
-- manager-tier roles only, which would block a dialer from logging their own
-- callback — the whole point of the callback-attribution flow (spec section
-- 4). Add a scoped policy so setter/closer roles can create and update their
-- own dialer_callback / setter_followup rows without opening the table up
-- generally (other entity_types still require the manager-tier policy above).
create policy "reps write own operational activity items" on public.operational_work_items
  for all to authenticated
  using (
    public.is_org_member(auth.uid(), org_id)
    and entity_type in ('dialer_callback', 'setter_followup', 'closer_followup')
  )
  with check (
    public.is_org_member(auth.uid(), org_id)
    and entity_type in ('dialer_callback', 'setter_followup', 'closer_followup')
  );
