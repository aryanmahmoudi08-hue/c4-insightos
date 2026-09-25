-- Link click tracking for reps.
--
-- `lead_video_links` (20260815120000) already does this for one narrow case:
-- a pre-call video, for a lead that already exists, opened once. Three things
-- make it the wrong table to extend here:
--   * lead_id is NOT NULL — a setter DMs a link to someone who is not a lead yet
--   * opened_at is a single timestamp, not a count — "how many clicks" is the
--     whole question being asked
--   * the destination is always a VSL, never an arbitrary URL
-- So this is a sibling table, deliberately not a generalisation of that one.
-- `links_sent` is already captured on the EOD report; this is the other half.

create table if not exists public.tracked_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  -- Which rep owns the link, so clicks can be attributed on their dashboard.
  created_by uuid references auth.users(id) on delete set null,
  -- Optional: a link may be sent before the person is a lead at all.
  lead_id uuid references public.leads(id) on delete set null,
  token text not null unique,
  destination_url text not null,
  label text,
  -- Free text rather than an enum: a new link kind should not need a
  -- migration, and nothing branches on this value — it is for grouping only.
  kind text not null default 'dm_link',
  created_at timestamptz not null default now()
);
create index if not exists tracked_links_org_created_idx
  on public.tracked_links (org_id, created_at desc);
create index if not exists tracked_links_creator_idx
  on public.tracked_links (created_by, created_at desc);

-- One row per click, not a counter on the parent. A counter answers "how
-- many" and nothing else; rows answer "when", "how many times did the same
-- person come back", and let clicks be scoped to a date range the way every
-- other instrument on these pages already is.
create table if not exists public.tracked_link_clicks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  link_id uuid not null references public.tracked_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  referrer text,
  user_agent text
);
create index if not exists tracked_link_clicks_link_idx
  on public.tracked_link_clicks (link_id, clicked_at desc);
create index if not exists tracked_link_clicks_org_time_idx
  on public.tracked_link_clicks (org_id, clicked_at desc);

alter table public.tracked_links enable row level security;
alter table public.tracked_link_clicks enable row level security;

-- Reps read and create links inside their own workspace. The public redirect
-- writes the click through the service role, not through these policies —
-- the visitor has no session, exactly like daily_wins and the pcv resolve.
create policy "tracked_links_select" on public.tracked_links
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "tracked_links_insert" on public.tracked_links
  for insert to authenticated with check (public.is_org_member(auth.uid(), org_id));
create policy "tracked_links_update" on public.tracked_links
  for update to authenticated using (public.is_org_member(auth.uid(), org_id));
create policy "tracked_links_delete" on public.tracked_links
  for delete to authenticated using (public.is_org_member(auth.uid(), org_id));

create policy "tracked_link_clicks_select" on public.tracked_link_clicks
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));

grant select, insert, update, delete on public.tracked_links to authenticated;
grant select on public.tracked_link_clicks to authenticated;
grant all on public.tracked_links to service_role;
grant all on public.tracked_link_clicks to service_role;
