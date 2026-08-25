-- The weekly report dispatches "digest.weekly" (see weekly-report.server.ts —
-- renamed from the never-actually-dispatched "report.weekly" to match the
-- event type webhook-channels.tsx's UI already anticipated). Auto-created
-- Discord/Zapier subscriptions from connectors.functions.ts predate this
-- event type existing at all, so backfill it onto exactly the rows that
-- match the connector's own auto-created name (never touching a row a user
-- renamed or hand-built themselves).
UPDATE public.webhook_subscriptions
SET event_types = event_types || ARRAY['digest.weekly']
WHERE name = 'Discord event alerts'
  AND NOT ('digest.weekly' = ANY(event_types));

UPDATE public.webhook_subscriptions
SET event_types = event_types || ARRAY['digest.weekly']
WHERE name = 'Zapier fan-out'
  AND NOT ('digest.weekly' = ANY(event_types));
