-- Group a pipeline's stages so a wide board can be read a screen at a time.
--
-- Sales is 11 columns. On a laptop you see about four, and the stages you
-- scroll past most are the terminal ones, which grow forever while the live
-- columns stay roughly constant.
--
-- Why this is a column and not a rule in the UI: the split is three-way —
-- live work, money in but not finished, and done — and the table only
-- carries two booleans. Deriving three groups from `is_closed_won` /
-- `is_closed_lost` would put Deposit in with Closed, which is wrong: a
-- deposit means the balance is still being chased, so it is live work.
--
-- Flipping Deposit's `is_closed_won` to fix that is not an option either.
-- That flag feeds won/lost reporting, and `LEAD_STATUS_MAP` already records
-- a Deposit as `call_status = 'closed', closed = true`. Changing it would
-- move the close-rate number to fix a layout problem. An explicit segment
-- keeps the board honest and leaves every existing metric untouched.
--
-- Segments are per stage, so a workspace that renames or adds stages can put
-- them where they belong instead of inheriting a guess from two booleans.

alter table public.crm_pipeline_stages
  add column if not exists board_segment text not null default 'in_play'
    constraint crm_pipeline_stages_board_segment_check
      check (board_segment in ('in_play', 'partial', 'closed_out'));

-- Backfill from what the flags already say: anything terminal is closed out.
update public.crm_pipeline_stages
   set board_segment = 'closed_out'
 where (is_closed_won or is_closed_lost)
   and board_segment = 'in_play';

-- Then the one exception the flags cannot express.
update public.crm_pipeline_stages
   set board_segment = 'partial'
 where name = 'Deposit';

-- New workspaces have to get the same grouping, so the seeder sets it
-- directly rather than relying on the backfill above, which only ran once.
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
  insert into public.crm_pipelines (org_id, name, description, is_default)
  values
    (p_org, 'Applications', 'Before a call is booked — form submissions and qualification.', false),
    (p_org, 'Sales', 'From booked call through to the closer''s outcome.', true),
    (p_org, 'Cancelled calls', 'Calls that were booked and then did not happen.', false)
  on conflict (org_id, lower(name)) do nothing;

  select id into v_applications from public.crm_pipelines where org_id = p_org and lower(name) = 'applications';
  select id into v_sales        from public.crm_pipelines where org_id = p_org and lower(name) = 'sales';
  select id into v_cancelled    from public.crm_pipelines where org_id = p_org and lower(name) = 'cancelled calls';

  insert into public.crm_pipeline_stages
    (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost, board_segment)
  values
    (p_org, v_applications, 'Partial Submit',          1, false, false, 'in_play'),
    (p_org, v_applications, 'Unqualified Application', 2, false, true,  'closed_out'),
    (p_org, v_applications, 'Qualified Application',   3, false, false, 'in_play'),
    (p_org, v_applications, 'Follow-Up',               4, false, false, 'in_play'),
    (p_org, v_applications, 'DQ',                      5, false, true,  'closed_out')
  on conflict (pipeline_id, name) do nothing;

  insert into public.crm_pipeline_stages
    (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost, board_segment)
  values
    (p_org, v_sales, 'Booked',                   1,  false, false, 'in_play'),
    (p_org, v_sales, 'Confirmed',                2,  false, false, 'in_play'),
    (p_org, v_sales, 'No Show',                  3,  false, false, 'in_play'),
    (p_org, v_sales, 'Follow Up (short term)',   4,  false, false, 'in_play'),
    (p_org, v_sales, 'Follow Up (long term)',    5,  false, false, 'in_play'),
    (p_org, v_sales, 'Deposit',                  6,  true,  false, 'partial'),
    (p_org, v_sales, 'Closed',                   7,  true,  false, 'closed_out'),
    (p_org, v_sales, 'No Close',                 8,  false, true,  'closed_out'),
    (p_org, v_sales, 'Bad Fit',                  9,  false, true,  'closed_out'),
    (p_org, v_sales, 'DQ',                      10,  false, true,  'closed_out'),
    (p_org, v_sales, 'IGNORE',                  11,  false, true,  'closed_out')
  on conflict (pipeline_id, name) do nothing;

  insert into public.crm_pipeline_stages
    (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost, board_segment)
  values
    (p_org, v_cancelled, 'Cancelled by Lead',     1, false, true,  'closed_out'),
    (p_org, v_cancelled, 'Disqualified',          2, false, true,  'closed_out'),
    (p_org, v_cancelled, 'Didn''t Answer',        3, false, false, 'in_play'),
    (p_org, v_cancelled, 'Requested',             4, false, false, 'in_play'),
    (p_org, v_cancelled, 'Follow-Up',             5, false, false, 'in_play'),
    (p_org, v_cancelled, 'Cancelled on Calendly', 6, false, true,  'closed_out')
  on conflict (pipeline_id, name) do nothing;

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
      ('Cancelled',               v_cancelled, 'Cancelled by Lead'),
      ('Rescheduling',            v_cancelled, 'Requested')
    ) as m(legacy_value, pipeline_id, stage_name)
  join public.crm_pipeline_stages s
    on s.pipeline_id = m.pipeline_id and s.name = m.stage_name
  on conflict (org_id, legacy_entity_type, legacy_value) do nothing;
end;
$$;
