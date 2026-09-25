-- connector_registry carried 18 rows against the 12 connector cards the UI
-- actually renders (src/components/connections-panel.tsx). The extra six fall
-- into two different categories, so they get two different treatments.
--
-- Nothing breaks today, because the panel drives off its own hardcoded list
-- rather than iterating the registry. This matters for anything that *does*
-- iterate it — which is the natural way to write the next feature that needs
-- "every connector this workspace could use".

-- 1. `meta_ads` is a straight duplicate of `meta`. The app reads `meta`
--    everywhere (meta-ads.server.ts:38 and :65, connections-panel.tsx:829);
--    nothing anywhere reads `meta_ads`. Two rows both named "Meta Ads" is a
--    trap for exactly the iterating-code case above.
--
--    Guarded on having no connections: connector_connections.connector_id is a
--    FK to this table with no ON DELETE clause, so a dependent row would abort
--    the migration rather than cascade. The guard makes that an explicit
--    no-op instead of a failure, and makes this safe to re-run.
delete from public.connector_registry r
 where r.id = 'meta_ads'
   and not exists (
     select 1 from public.connector_connections c where c.connector_id = r.id
   );

-- 2. These five are not duplicates — they are real connectors that have no
--    endpoint behind them yet. There is no src/routes/api/public/* route and
--    no card for any of them, so `is_available = true` advertises something
--    that cannot complete. That is precisely what this flag is for: the
--    Calendly connector sat at false for the same reason until
--    20260924120000 implemented it and flipped it true.
--
--    Deliberately not deleted. They are a roadmap, and flipping the flag back
--    is how a connector ships here.
update public.connector_registry
   set is_available = false
 where id in ('gohighlevel', 'instagram', 'slack', 'tiktok', 'youtube')
   and is_available is distinct from false;
