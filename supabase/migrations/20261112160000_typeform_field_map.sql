-- Per-connection mapping from a Typeform question to an application slot.
--
-- The 11 qualification slots (experience, income, capital, …) are AscendOS's
-- vocabulary. They were matched by normalising a question's title, which only
-- works when a form happens to be worded in that vocabulary. A real client
-- writes their own questions in their own words — "What are you earning now,
-- base salary?" will never normalise to `income` — so every slot arrived
-- empty while the form itself was perfectly fine.
--
-- Hardcoding one client's exact question strings would fix one form and fail
-- the next client entirely, since the whole point is that each client's
-- funnel is their own. The difference is per connection, so the mapping
-- belongs on the connection.
--
-- These are columns rather than keys inside `config` because Connect
-- rewrites `config` wholesale from the validated schema — re-pasting a
-- webhook secret would silently destroy a mapping stored there. It also
-- keeps a mapping, which is configuration, out of the object that holds
-- secrets.

alter table public.connector_connections
  -- slot key -> the field `ref` chosen for it, e.g. {"income": "a1b2-…"}.
  -- Empty by default: a connection nobody has mapped behaves exactly as
  -- before, falling back to ref/id/title matching.
  add column if not exists field_map jsonb not null default '{}'::jsonb,
  -- The most recent `form_response.definition` seen on a delivery, so the
  -- mapping UI can list the real questions without a Typeform API call or a
  -- token. Refreshed on every delivery, not just the first: a client who adds
  -- a question should see it, and a UI populated from a stale definition
  -- cannot offer what it never saw.
  add column if not exists form_definition jsonb;

comment on column public.connector_connections.field_map is
  'Application slot key -> Typeform field ref. Empty means fall back to ref/id/title matching.';
comment on column public.connector_connections.form_definition is
  'Last seen form_response.definition, used to populate the question-mapping UI.';
