-- The Discord link to a lead's post in #new-1on1-applicants, saved when it
-- posts, so every later message about the lead can link back to their full
-- application answers ("View application").
alter table public.leads
  add column if not exists application_message_url text;
