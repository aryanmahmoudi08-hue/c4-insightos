-- DM lead ownership: a lead a DM setter brought in belongs to that setter,
-- and dialers leave it alone.
--
-- Two ways a lead becomes a DM lead:
--   * link  — it applied through a setter's tracked link (utm_medium=dm,
--             utm_content=dm-<name>), which the site now remembers 30 days;
--   * claim — the setter logged the lead (name / handle / email / phone)
--             when they sent the link, and the application matched it. This
--             is what catches a lead who switched phone or browser.
--
-- Ownership lives in its own columns rather than leads.assigned_setter_id,
-- which is an auth.users FK some screens read as a roster id; it is still
-- set when the setter has a login, so payment alerts tag them.

alter table public.leads add column if not exists dm_owned_via text
  check (dm_owned_via in ('link', 'claim'));
alter table public.leads add column if not exists dm_setter_member_id uuid
  references public.team_members(id) on delete set null;
alter table public.leads add column if not exists dm_setter_name text;
alter table public.leads add column if not exists dm_owned_at timestamptz;

create index if not exists leads_org_dm_owned_idx on public.leads (org_id, dm_owned_via);

create table if not exists public.dm_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid default auth.uid(),
  setter_member_id uuid references public.team_members(id) on delete set null,
  setter_name text,
  lead_name text,
  platform text,
  handle text,
  email text,
  phone text,
  notes text,
  matched_lead_id uuid references public.leads(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists dm_claims_org_created_idx on public.dm_claims (org_id, created_at desc);

alter table public.dm_claims enable row level security;

drop policy if exists "members read dm claims" on public.dm_claims;
create policy "members read dm claims" on public.dm_claims
  for select to authenticated using (public.is_org_member(auth.uid(), org_id));

-- Claims are written through the server (createDmClaim), which also runs the
-- match; members may delete their own mistaken claim, managers any.
drop policy if exists "members delete own dm claims" on public.dm_claims;
create policy "members delete own dm claims" on public.dm_claims
  for delete to authenticated
  using (
    public.is_org_member(auth.uid(), org_id)
    and (created_by = auth.uid()
      or public.has_org_role(auth.uid(), org_id, array['owner','admin','sales_manager','growth_ops']::app_role[]))
  );
