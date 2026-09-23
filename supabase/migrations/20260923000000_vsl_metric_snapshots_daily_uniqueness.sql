-- Prompt 6 (docs/ascendos-supabase-canonical-data-contract.md §3) found
-- vsl_metric_snapshots has no unique index at all, so an automated poller
-- (Prompt 7's Wistia n8n workflow) could write duplicate same-day snapshots
-- per video if a run ever fires twice. Manual/CSV rows are excluded from the
-- constraint (source <> 'api') since a user may legitimately log more than
-- one manual entry for the same video/day; only the new automated path needs
-- day-level dedup.
create unique index if not exists vsl_metric_snapshots_api_daily_uidx
  on public.vsl_metric_snapshots (vsl_id, (captured_at::date))
  where source = 'api';
