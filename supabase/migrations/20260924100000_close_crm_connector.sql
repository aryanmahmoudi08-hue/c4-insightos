-- Close (close.com) CRM connector. The business has made Close the system of
-- record for leads; AscendOS mirrors it one-way (Close -> AscendOS) and never
-- writes back. This supersedes docs/ascendos-external-integration-contract.md
-- §15, which concluded there was no external CRM to sync against.
--
-- Close authenticates its webhooks with an HMAC signature rather than OAuth
-- (close-sig-hash / close-sig-timestamp), so it fits the existing
-- webhook-secret connector shape — no OAuth capability needed.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values
  ('close', 'Close CRM', 'crm', 'webhook', 'One-way lead mirror from Close — Close stays the system of record', 'users', true)
on conflict (id) do nothing;

-- Idempotency for the mirror. Close retries a failed delivery for up to 72
-- hours with exponential backoff, so the same lead event can legitimately
-- arrive more than once; the receiver upserts on this key rather than
-- inserting a duplicate lead each time.
--
-- Partial, so it constrains only connector-sourced rows: leads created in the
-- app (and every historical row) leave external_id null and are unaffected.
create unique index if not exists leads_connector_external_uidx
  on public.leads (org_id, source_connector, external_id)
  where external_id is not null and source_connector is not null;
