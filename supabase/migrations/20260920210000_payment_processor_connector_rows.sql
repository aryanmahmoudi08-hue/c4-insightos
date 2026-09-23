-- The four remaining real payment processors (Wise, PayPal, Fanbasis/Commas,
-- Whop) had no connector_registry row at all — connecting any of them would
-- throw "Connector is not in the registry yet" before reaching any real
-- logic, same gap as the missing 'zapier' row fixed in the prior migration.
-- 'fanbasis' (not 'commas') matches the existing payments.processor CHECK
-- constraint value — Commas is Fanbasis's current external brand name only.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values
  ('whop', 'Whop', 'payments', 'webhook', 'Membership/product payments — HMAC-signed webhooks', 'credit-card', true),
  ('fanbasis', 'Fanbasis (Commas)', 'payments', 'webhook', 'Installment-plan payments — HMAC-signed webhooks', 'credit-card', true),
  ('wise', 'Wise', 'payments', 'webhook', 'International transfers/balance credits — RSA-signed webhooks', 'credit-card', true),
  ('paypal', 'PayPal', 'payments', 'oauth2', 'Captured payments — verified via PayPal''s own signature-check API', 'credit-card', true)
on conflict (id) do nothing;
