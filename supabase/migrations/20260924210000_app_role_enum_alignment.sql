-- The `app_role` enum has been unchanged since the initial schema
-- (20260518151934, line 4): ('owner','admin','closer','setter','va','viewer').
-- The application's role taxonomy moved on without it. `ROLES` in
-- src/lib/permissions.ts is now admin / sales_manager / growth_ops / setter /
-- inbound_dialer / closer / viewer, and the public request-access form offers
-- Inbound Dialer, Sales Manager and Growth / Ops as choices.
--
-- Those three were never addable: submit_membership_request() and
-- approve_membership_request() both take an `app_role` argument, so choosing
-- any of them failed with `invalid input value for enum app_role`. The break
-- was invisible in TypeScript because both call sites cast the role through a
-- literal (`role as "setter"`) rather than a real union.
--
-- This aligns the enum to the taxonomy the app actually implements. Additive
-- only: 'owner' and 'va' stay, since 'owner' is in live use (it is the
-- bootstrap role for the first member of a workspace) and dropping an enum
-- value would require rewriting every dependent column regardless.
alter type public.app_role add value if not exists 'sales_manager';
alter type public.app_role add value if not exists 'growth_ops';
alter type public.app_role add value if not exists 'inbound_dialer';
