-- EOD Reports currency selector (post-implementation corrections pass).
-- setter_activity.cash_collected_cents/total_revenue_cents and
-- calls.cash_collected_cents/contract_value_cents have always stored
-- whatever amount was typed into the EOD form with no currency metadata at
-- all (implicitly assumed USD). This adds an explicit original_currency tag
-- so a rep can select the dashboard's own DISPLAY_CURRENCIES (USD/CAD/EUR/
-- GBP) when logging cash/revenue, without silently pretending a non-USD
-- amount is USD. No FX conversion here (unlike payments.original_currency +
-- fx_rate) — the cents columns keep storing the amount exactly as entered;
-- this is purely a provenance tag so aggregation can tell mixed-currency
-- rows apart instead of summing them as if they were all one currency.

alter table public.setter_activity
  add column if not exists original_currency text not null default 'USD';

alter table public.calls
  add column if not exists original_currency text not null default 'USD';
