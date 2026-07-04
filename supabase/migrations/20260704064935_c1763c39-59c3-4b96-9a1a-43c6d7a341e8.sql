
do $$ begin
  if not exists (select 1 from pg_type where typname = 'vsl_kind') then
    create type public.vsl_kind as enum ('main', 'webinar', 'post_booking');
  end if;
end $$;

create table if not exists public.vsls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind public.vsl_kind not null,
  name text not null,
  wistia_video_id text,
  sheet_url text,
  script text not null default '',
  transcript_json jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.vsls to authenticated;
grant all on public.vsls to service_role;
alter table public.vsls enable row level security;

drop policy if exists "vsls org read" on public.vsls;
create policy "vsls org read" on public.vsls for select to authenticated
  using (public.is_org_member(auth.uid(), org_id));
drop policy if exists "vsls org write" on public.vsls;
create policy "vsls org write" on public.vsls for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));

drop trigger if exists vsls_updated on public.vsls;
create trigger vsls_updated before update on public.vsls
  for each row execute function public.tg_set_updated_at();

create table if not exists public.vsl_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  vsl_id uuid not null references public.vsls(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_name text,
  total_plays integer not null default 0,
  unique_viewers integer not null default 0,
  play_rate numeric not null default 0,
  avg_percent_watched numeric not null default 0,
  page_loads integer not null default 0,
  engagement_json jsonb,
  captured_at timestamptz not null default now(),
  source text not null default 'manual'
);
create index if not exists vsl_snap_vsl_idx on public.vsl_metric_snapshots (vsl_id, captured_at desc);
grant select, insert, update, delete on public.vsl_metric_snapshots to authenticated;
grant all on public.vsl_metric_snapshots to service_role;
alter table public.vsl_metric_snapshots enable row level security;

drop policy if exists "vsl snap read" on public.vsl_metric_snapshots;
create policy "vsl snap read" on public.vsl_metric_snapshots for select to authenticated
  using (public.is_org_member(auth.uid(), org_id));
drop policy if exists "vsl snap write" on public.vsl_metric_snapshots;
create policy "vsl snap write" on public.vsl_metric_snapshots for all to authenticated
  using (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  with check (public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]));
