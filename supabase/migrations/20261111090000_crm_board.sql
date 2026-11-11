-- The CRM board: three lifecycle pipelines a lead moves through one at a time.
--
-- `crm_pipelines` / `crm_pipeline_stages` were built by
-- 20260822130000_sales_crm_foundation and have sat empty ever since, because
-- the page that used them was deleted in a merge and only the backend
-- survived. This migration finally seeds them, and connects them to the
-- `leads` rows the board actually draws.
--
-- Why the board is driven by `leads` rather than `crm_opportunities`:
-- the opportunities table is empty, and filling it would mean manufacturing
-- one opportunity per lead — a second copy of every lead, with no source of
-- truth for which copy is right. The stage definitions live in the CRM
-- tables (ordered, coloured, org-scoped, terminal flags); a lead's current
-- position is one FK on the lead itself. One row per lead, one stage per
-- lead.
--
-- Note on `leads.pipeline_stage`: that free-text column has existed since
-- June and is only ever SELECTed (hub-metrics and lead-insights include it
-- in a column list), never written by the app. The board does not read or
-- write it. It is left untouched here rather than quietly repurposed, but it
-- is dead weight and should be dropped once those two selects stop asking
-- for it.

-- ---------------------------------------------------------------------------
-- 1. "Lost" became "No Close" on the Closer's Lead Status question.
-- ---------------------------------------------------------------------------
-- `eod_lead_status` stores the Closer's exact choice verbatim as free text,
-- so renaming the option in code would leave historical rows reading "Lost"
-- and new rows reading "No Close" — the same outcome under two names, which
-- would split every report that groups by it.
update public.calls
   set eod_lead_status = 'No Close'
 where eod_lead_status = 'Lost';

-- ---------------------------------------------------------------------------
-- 2. A lead's position on the board.
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists crm_stage_id uuid
    references public.crm_pipeline_stages(id) on delete set null;

create index if not exists leads_crm_stage_idx
  on public.leads(org_id, crm_stage_id);

-- ---------------------------------------------------------------------------
-- 3. Seed the three pipelines, their stages, and the Lead Status mapping.
-- ---------------------------------------------------------------------------
-- Stage names in the Sales pipeline are deliberately identical to the
-- Closer's CLOSER_LEAD_STATUS_OPTIONS values. They are not a parallel
-- taxonomy that has to be kept in step with the form — they are the same
-- list, so a closer picking "No Close" and a manager dragging a card to
-- "No Close" are recording the one fact.
create or replace function public.seed_crm_board_for_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applications uuid;
  v_sales uuid;
  v_cancelled uuid;
begin
  -- Pipelines. Sales is the default: it is the one a lead spends most of its
  -- life in, and the one the board opens on.
  insert into public.crm_pipelines (org_id, name, description, is_default)
  values
    (p_org, 'Applications', 'Before a call is booked — form submissions and qualification.', false),
    (p_org, 'Sales', 'From booked call through to the closer''s outcome.', true),
    (p_org, 'Cancelled calls', 'Calls that were booked and then did not happen.', false)
  on conflict (org_id, lower(name)) do nothing;

  select id into v_applications from public.crm_pipelines where org_id = p_org and lower(name) = 'applications';
  select id into v_sales        from public.crm_pipelines where org_id = p_org and lower(name) = 'sales';
  select id into v_cancelled    from public.crm_pipelines where org_id = p_org and lower(name) = 'cancelled calls';

  -- Applications.
  insert into public.crm_pipeline_stages (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost)
  values
    (p_org, v_applications, 'Partial Submit',          1, false, false),
    (p_org, v_applications, 'Unqualified Application', 2, false, true),
    (p_org, v_applications, 'Qualified Application',   3, false, false),
    (p_org, v_applications, 'Follow-Up',               4, false, false),
    (p_org, v_applications, 'DQ',                      5, false, true)
  on conflict (pipeline_id, name) do nothing;

  -- Sales. Booked/Confirmed/No Show are call states; everything after is a
  -- Closer Lead Status, name for name.
  insert into public.crm_pipeline_stages (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost)
  values
    (p_org, v_sales, 'Booked',                   1,  false, false),
    (p_org, v_sales, 'Confirmed',                2,  false, false),
    (p_org, v_sales, 'No Show',                  3,  false, false),
    (p_org, v_sales, 'Follow Up (short term)',   4,  false, false),
    (p_org, v_sales, 'Follow Up (long term)',    5,  false, false),
    (p_org, v_sales, 'Deposit',                  6,  true,  false),
    (p_org, v_sales, 'Closed',                   7,  true,  false),
    (p_org, v_sales, 'No Close',                 8,  false, true),
    (p_org, v_sales, 'Bad Fit',                  9,  false, true),
    (p_org, v_sales, 'DQ',                      10,  false, true),
    (p_org, v_sales, 'IGNORE',                  11,  false, true)
  on conflict (pipeline_id, name) do nothing;

  -- Cancelled calls.
  insert into public.crm_pipeline_stages (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost)
  values
    (p_org, v_cancelled, 'Cancelled by Lead',     1, false, true),
    (p_org, v_cancelled, 'Disqualified',          2, false, true),
    (p_org, v_cancelled, 'Didn''t Answer',        3, false, false),
    (p_org, v_cancelled, 'Requested',             4, false, false),
    (p_org, v_cancelled, 'Follow-Up',             5, false, false),
    (p_org, v_cancelled, 'Cancelled on Calendly', 6, false, true)
  on conflict (pipeline_id, name) do nothing;

  -- Lead Status -> stage. This is what makes a Closer's post-call answer move
  -- the card. `crm_legacy_stage_mappings` was built for exactly this and has
  -- been empty since it was created.
  insert into public.crm_legacy_stage_mappings
    (org_id, legacy_entity_type, legacy_value, pipeline_id, pipeline_stage_id)
  select p_org, 'lead_status', m.legacy_value, m.pipeline_id, s.id
  from (values
      ('Closed',                  v_sales,     'Closed'),
      ('Deposit',                 v_sales,     'Deposit'),
      ('No Show',                 v_sales,     'No Show'),
      ('Follow Up (short term)',  v_sales,     'Follow Up (short term)'),
      ('Follow Up (long term)',   v_sales,     'Follow Up (long term)'),
      ('No Close',                v_sales,     'No Close'),
      ('Bad Fit',                 v_sales,     'Bad Fit'),
      ('DQ',                      v_sales,     'DQ'),
      ('IGNORE',                  v_sales,     'IGNORE'),
      -- A cancelled or rescheduling call leaves the Sales board entirely:
      -- the call did not happen, so its outcome belongs on Cancelled calls.
      ('Cancelled',               v_cancelled, 'Cancelled by Lead'),
      ('Rescheduling',            v_cancelled, 'Requested')
    ) as m(legacy_value, pipeline_id, stage_name)
  join public.crm_pipeline_stages s
    on s.pipeline_id = m.pipeline_id and s.name = m.stage_name
  on conflict (org_id, legacy_entity_type, legacy_value) do nothing;
end;
$$;

-- Same shape as seed_default_offer_tiers: seed on insert so the guarantee
-- holds for every future workspace, not only the ones that existed when this
-- migration ran.
create or replace function public.tg_seed_crm_board()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_crm_board_for_org(new.id);
  return new;
end;
$$;

drop trigger if exists tg_seed_crm_board on public.organizations;
create trigger tg_seed_crm_board
  after insert on public.organizations
  for each row execute function public.tg_seed_crm_board();

-- Backfill every workspace that already exists.
do $$
declare o record;
begin
  for o in select id from public.organizations loop
    perform public.seed_crm_board_for_org(o.id);
  end loop;
end;
$$;
