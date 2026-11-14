-- Make connector idempotency keys usable by an upsert.
--
-- Every Calendly booking failed in production with
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
-- The booking handler upserts calls ON CONFLICT (org_id, source_connector,
-- external_id), and the only unique index on those columns was PARTIAL
-- (where external_id is not null and source_connector is not null). Postgres
-- infers a partial index for ON CONFLICT only when the statement repeats its
-- WHERE clause, and PostgREST's upsert cannot. The Close connector upserts
-- leads the same way against the same shape of index, so it has the same
-- failure waiting.
--
-- A plain unique index enforces exactly what the partial one did. Unique
-- indexes treat NULLs as distinct, so calls and leads logged by hand or
-- through an EOD — external_id or source_connector null — still never
-- collide with each other. And because the partial index already made every
-- non-null triple unique, building this one cannot fail on existing rows.
--
-- Built before the partial index is dropped, so there is no moment without
-- the guarantee.

create unique index if not exists calls_connector_external_key
  on public.calls (org_id, source_connector, external_id);
drop index if exists public.calls_connector_external_uidx;

create unique index if not exists leads_connector_external_key
  on public.leads (org_id, source_connector, external_id);
drop index if exists public.leads_connector_external_uidx;
