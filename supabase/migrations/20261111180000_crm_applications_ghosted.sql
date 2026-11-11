-- A Ghosted stage on Applications, and the leads that belong in it.
--
-- 20261111120000 backfilled every lead onto the board except `ghosted` ones,
-- which were left unplaced on purpose: no stage meant "stopped replying",
-- and folding them into DQ would have said something different. This adds
-- the stage and finishes the backfill.
--
-- Flags stay false on purpose. `is_closed_lost` is an assertion that a lead
-- was lost for a known reason; a ghost is an unknown — they may resurface,
-- and nothing was ever decided about them. Nothing reads these flags for
-- revenue today, but crm-foundation passes them straight through, and a
-- stage that reports itself as a loss when nobody recorded one is the kind
-- of thing that quietly inflates a number later.
--
-- `board_segment` is what parks it, which is the second case where the
-- segment and the terminal flags legitimately disagree — Deposit was the
-- first. Ghosted is not active work, so it does not belong in the In play
-- queue, but it is not a loss either.

-- Position 5 is DQ's. Shift it down so Ghosted lands straight after
-- Follow-Up, where a lead actually goes quiet. Guarded on the current value
-- so re-running cannot walk DQ further down the board.
update public.crm_pipeline_stages s
   set position = 6
  from public.crm_pipelines p
 where p.id = s.pipeline_id
   and lower(p.name) = 'applications'
   and s.name = 'DQ'
   and s.position = 5;

insert into public.crm_pipeline_stages
  (org_id, pipeline_id, name, position, is_closed_won, is_closed_lost, board_segment)
select p.org_id, p.id, 'Ghosted', 5, false, false, 'closed_out'
  from public.crm_pipelines p
 where lower(p.name) = 'applications'
on conflict (pipeline_id, name) do nothing;

-- The leads 20261111120000 deliberately skipped. Same discipline as that
-- migration: only ever fills a NULL, so a lead someone has since placed by
-- hand stays where they put it.
update public.leads l
   set crm_stage_id = s.id,
       updated_at = now()
  from public.crm_pipelines p
  join public.crm_pipeline_stages s
    on s.pipeline_id = p.id and s.name = 'Ghosted'
 where p.org_id = l.org_id
   and lower(p.name) = 'applications'
   and l.status = 'ghosted'
   and l.crm_stage_id is null;

-- New workspaces have to get the stage too, so the seeder carries it rather
-- than depending on the one-off insert above.
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
    (p_org, v_applications, 'Ghosted',                 5, false, false, 'closed_out'),
    (p_org, v_applications, 'DQ',                      6, false, true,  'closed_out')
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
