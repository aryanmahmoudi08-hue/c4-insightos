
ALTER TABLE public.webhook_subscriptions
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.webhook_subscriptions.category IS
  'Optional category filter: hooks, reels, email, story, long-form, lead, sale, digest. NULL = receives all categories for matching event_types.';

CREATE INDEX IF NOT EXISTS webhook_subscriptions_org_active_idx
  ON public.webhook_subscriptions(org_id, active);

CREATE OR REPLACE VIEW public.lead_attribution_v AS
SELECT
  l.id                              AS lead_id,
  l.org_id,
  l.full_name,
  l.email,
  l.handle,
  l.status,
  l.created_at                      AS lead_created_at,
  l.source_connector,
  l.first_touch_content_id,
  cp.title                          AS first_touch_title,
  cp.platform                       AS first_touch_platform,
  cp.hook                           AS first_touch_hook,
  c.id                              AS call_id,
  c.scheduled_for                   AS call_scheduled_for,
  c.showed                          AS call_showed,
  c.closed                          AS call_closed,
  c.closer_name                     AS closer_name,
  c.cash_collected_cents            AS call_cash_cents,
  setter.name                       AS setter_name,
  COALESCE(p_sum.payments_total_cents, 0) AS payments_total_cents,
  p_sum.last_payment_at             AS last_payment_at
FROM public.leads l
LEFT JOIN public.content_pieces cp
  ON cp.id = l.first_touch_content_id
LEFT JOIN LATERAL (
  SELECT c1.id, c1.scheduled_for, c1.showed, c1.closed, c1.closer_name,
         c1.cash_collected_cents, c1.setter_id
  FROM public.calls c1
  WHERE c1.org_id = l.org_id
    AND (c1.lead_id = l.id
         OR (c1.lead_email IS NOT NULL AND l.email IS NOT NULL
             AND lower(c1.lead_email) = lower(l.email)))
  ORDER BY c1.scheduled_for DESC NULLS LAST
  LIMIT 1
) c ON true
LEFT JOIN public.team_members setter
  ON setter.id = c.setter_id
LEFT JOIN LATERAL (
  SELECT SUM(p1.amount_cents)::bigint AS payments_total_cents,
         MAX(p1.collected_at) AS last_payment_at
  FROM public.payments p1
  WHERE p1.org_id = l.org_id
    AND p1.call_id = c.id
) p_sum ON true;

GRANT SELECT ON public.lead_attribution_v TO authenticated;
GRANT SELECT ON public.lead_attribution_v TO service_role;
