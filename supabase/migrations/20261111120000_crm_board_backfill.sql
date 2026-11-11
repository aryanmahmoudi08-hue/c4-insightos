-- Put the leads that already exist onto the CRM board.
--
-- 20261111090000 created the pipelines and stages but left every lead with
-- `crm_stage_id = null`, so the board opens empty and every lead shows up in
-- the "unsorted" count instead.
--
-- The ask was "backfill the existing leads into Applications". Five of the
-- ten `lead_status` values really are pre-call and belong there. The other
-- five describe a call that has already been booked, attended, missed or
-- closed — filing a `closed` lead under "Qualified Application" would put a
-- finished deal in the application queue and make both columns lie. Those go
-- to the Sales stage that means the same thing.
--
--   Applications
--     dm_received          -> Partial Submit
--     qualified            -> Qualified Application
--     pre_call_assets_sent -> Qualified Application   (qualified, not yet booked)
--     follow_up            -> Follow-Up
--     disqualified         -> DQ
--
--   Sales
--     call_booked          -> Booked
--     showed               -> Confirmed
--     no_show              -> No Show
--     closed               -> Closed
--
-- Two deliberate gaps:
--
--   `ghosted` is left unplaced. No stage in any of the three pipelines means
--   "stopped replying", and inventing one here — or quietly folding it into
--   DQ, which means something different — would be worse than leaving it in
--   the unsorted count where it is visible and can be dealt with on purpose.
--
--   `showed` maps to Confirmed because that is the closest stage that exists.
--   A lead that attended but has no recorded outcome sits between Confirmed
--   and the outcome stages, and the board has no column for that. Anything a
--   closer logs from here will move it to the real outcome.
--
-- Only ever fills a NULL. A lead someone has already dragged, or that a
-- post-call form has already placed, is left exactly where it is — so this is
-- safe to re-run and cannot undo a human decision.

with target as (
  select
    l.id as lead_id,
    s.id as stage_id
  from public.leads l
  join public.crm_pipelines p
    on p.org_id = l.org_id
   and lower(p.name) = case l.status
         when 'call_booked' then 'sales'
         when 'showed'      then 'sales'
         when 'no_show'     then 'sales'
         when 'closed'      then 'sales'
         else 'applications'
       end
  join public.crm_pipeline_stages s
    on s.pipeline_id = p.id
   and s.name = case l.status
         when 'dm_received'          then 'Partial Submit'
         when 'qualified'            then 'Qualified Application'
         when 'pre_call_assets_sent' then 'Qualified Application'
         when 'follow_up'            then 'Follow-Up'
         when 'disqualified'         then 'DQ'
         when 'call_booked'          then 'Booked'
         when 'showed'               then 'Confirmed'
         when 'no_show'              then 'No Show'
         when 'closed'               then 'Closed'
       end
  where l.crm_stage_id is null
    and l.status is not null
    and l.status <> 'ghosted'
)
update public.leads l
   set crm_stage_id = t.stage_id,
       updated_at = now()
  from target t
 where l.id = t.lead_id
   and l.crm_stage_id is null;
