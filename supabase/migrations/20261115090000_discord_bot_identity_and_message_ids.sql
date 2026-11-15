-- Discord rework: per-channel bot identity, and remembering what was posted.
--
-- bot_name / bot_avatar_url override the name and icon a Discord message
-- posts under. Both are optional: when empty, the app uses the default for
-- the event type (event-catalog.ts, DISCORD_BOT_IDENTITIES), so a channel
-- reads "CALL BOOKED" with a calendar icon without anyone typing it in.
--
-- delivered_messages records the Discord message each delivery created,
-- keyed by subscription id: { "<sub id>": { "message_id", "channel_id",
-- "guild_id" } }. Webhooks cannot post a native reply, so the "CALL THEM
-- ASAP" message posted when a callback comes due links the callback's
-- original message instead, and needs to know where that message is.
alter table public.webhook_subscriptions
  add column if not exists bot_name text,
  add column if not exists bot_avatar_url text;

alter table public.scheduled_event_fires
  add column if not exists delivered_messages jsonb not null default '{}'::jsonb;

comment on column public.webhook_subscriptions.bot_name is
  'Discord username to post as. Empty = the event type''s default.';
comment on column public.webhook_subscriptions.bot_avatar_url is
  'Discord avatar image URL to post with. Empty = the event type''s default.';
comment on column public.scheduled_event_fires.delivered_messages is
  'Discord messages this fire created, by subscription id: { message_id, channel_id, guild_id }.';
