-- connectWorkspaceConnector() (src/lib/connectors.functions.ts) has real, working,
-- signature-verified connect logic for 'zapier' — but no connector_registry row for
-- it was ever seeded, so every call throws "Connector is not in the registry yet"
-- before it can reach that logic. This is the one missing row.
insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available)
values ('zapier', 'Zapier', 'automation', 'webhook', 'Catch Hook automation — fan real app events out to any Zap', 'zap', true)
on conflict (id) do nothing;
