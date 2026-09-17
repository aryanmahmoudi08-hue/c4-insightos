-- Canonical objection taxonomy sync (src/lib/objection-taxonomy.ts).
-- call_objections.category's original CHECK constraint (added in
-- 20260903161218_phase2_dm_setter_dialer_closer_objections.sql) allowed
-- 'price','timing','trust','partner_spouse','competitor','product_fit',
-- 'no_need','unqualified','other' — a list that mixed real objections with
-- disposition-shaped values ('unqualified') and had no equivalent for
-- "Think About It" or "DIY / Do It Themselves".
--
-- New canonical set: 'money' (renamed from 'price'), 'think_about_it',
-- 'partner_spouse', 'trust', 'competitor', 'timing', 'diy_themselves',
-- 'other'. The four retired legacy values ('price','product_fit','no_need',
-- 'unqualified') stay in the allowed set below so existing historical rows
-- are never invalidated — they're just no longer offered in any picker
-- (see LEGACY_OBJECTION_CATEGORY_LABELS / LEGACY_OBJECTION_ROLLUP).
ALTER TABLE public.call_objections DROP CONSTRAINT IF EXISTS call_objections_category_check;
ALTER TABLE public.call_objections ADD CONSTRAINT call_objections_category_check CHECK (category IN (
  -- canonical
  'money', 'think_about_it', 'partner_spouse', 'trust', 'competitor', 'timing', 'diy_themselves', 'other',
  -- legacy — preserved for historical rows only
  'price', 'product_fit', 'no_need', 'unqualified'
));
