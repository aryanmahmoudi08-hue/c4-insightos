-- Typeform partial responses: one lead per response, marked until it
-- completes.
--
-- With a Partial Submit Point on the form, Typeform sends a
-- form_response_partial delivery when someone gets past it and a
-- form_response when they finish. The handler did not look at which, so a
-- partial created a lead and posted it as a new application, and the
-- completion then created a second lead and posted again.
--
-- typeform_response_token is the response's token, shared by its partial
-- and complete deliveries — what lets the completion find and finish the
-- lead the partial started. Unique per workspace; NULLs are distinct, so
-- every lead from any other source is unaffected.
--
-- application_partial marks a lead whose application was started but not
-- submitted. It is what /leads and the CRM filter on, and what keeps these
-- leads out of every "applications submitted" count.
alter table public.leads
  add column if not exists typeform_response_token text,
  add column if not exists application_partial boolean not null default false;

create unique index if not exists leads_org_typeform_token_key
  on public.leads (org_id, typeform_response_token);

create index if not exists leads_org_application_partial_idx
  on public.leads (org_id)
  where application_partial;

comment on column public.leads.typeform_response_token is
  'Typeform form_response.token — shared by a response''s partial and completed deliveries.';
comment on column public.leads.application_partial is
  'Application started (a Typeform partial) but not submitted. Excluded from application counts.';
