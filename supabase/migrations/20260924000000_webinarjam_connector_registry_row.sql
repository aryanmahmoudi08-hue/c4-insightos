-- WebinarJam connector registry row — the org has confirmed WebinarJam as
-- their webinar platform (docs/ascendos-external-integration-contract.md §5,
-- P0 priority). WebinarJam's own "Custom Webhook" feature (Settings →
-- Integrations → Custom Webhook, per WebinarJam's support docs) authenticates
-- via a bearer token or a custom header/value pair — no HMAC signature
-- scheme is offered, unlike Stripe/Whop/Wise — so this is a shared-secret
-- connector, same shape as Typeform, not a signature-verified one.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values
  ('webinarjam', 'WebinarJam', 'webinars', 'webhook', 'Registration/attendance events via WebinarJam''s custom webhook — bearer-token authenticated', 'video', true)
on conflict (id) do nothing;
