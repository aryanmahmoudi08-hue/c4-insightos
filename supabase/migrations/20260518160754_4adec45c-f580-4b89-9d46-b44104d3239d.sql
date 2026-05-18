
alter table public.setter_activity add column if not exists links_sent int default 0;
alter table public.calls add column if not exists deposit_cents bigint default 0;
