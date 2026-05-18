
create extension if not exists "pgcrypto";

create type public.app_role as enum ('owner','admin','closer','setter','va','viewer');
create type public.content_platform as enum ('reel','tiktok','youtube','youtube_short','story_sequence','email','ad_creative','vsl','carousel','post','dm','other');
create type public.content_angle as enum ('authority','proof','educational','lifestyle','controversial','identity','origin_story','other');
create type public.awareness_stage as enum ('unaware','problem_aware','solution_aware','product_aware','most_aware');
create type public.lead_status as enum ('dm_received','qualified','pre_call_assets_sent','call_booked','showed','closed','disqualified','follow_up','no_show','ghosted');
create type public.call_status as enum ('booked','showed','no_show','offer_made','closed','disqualified','follow_up','rescheduled');
create type public.payment_status as enum ('paid','pending','failed','refunded','partial');
create type public.alert_severity as enum ('info','warning','critical');
create type public.connector_state as enum ('not_connected','connected','syncing','error','disabled');
create type public.metric_scope as enum ('org','content','lead','call','setter','closer','traffic_source','client');

create table public.organizations (id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, plan text not null default 'starter', settings jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, avatar_url text, timezone text default 'UTC', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.memberships (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role public.app_role not null default 'viewer', created_at timestamptz not null default now(), unique (org_id, user_id));
create index on public.memberships(user_id);
create index on public.memberships(org_id);

create or replace function public.is_org_member(_user_id uuid, _org_id uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.memberships where user_id=_user_id and org_id=_org_id); $$;
create or replace function public.has_org_role(_user_id uuid, _org_id uuid, _roles public.app_role[]) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.memberships where user_id=_user_id and org_id=_org_id and role = any(_roles)); $$;
create or replace function public.current_user_orgs() returns setof uuid language sql stable security definer set search_path = public as $$ select org_id from public.memberships where user_id = auth.uid(); $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare _org uuid; _slug text;
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  _slug := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'org_name','workspace'), '[^a-z0-9]+','-','g'));
  insert into public.organizations (name, slug) values (coalesce(new.raw_user_meta_data->>'org_name','My Workspace'), _slug || '-' || substr(new.id::text,1,8)) returning id into _org;
  insert into public.memberships (org_id, user_id, role) values (_org, new.id, 'owner');
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create table public.tags (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, category text not null, name text not null, color text default '#3B82F6', created_at timestamptz not null default now(), unique (org_id, category, name));
create index on public.tags(org_id, category);
create table public.taggables (id uuid primary key default gen_random_uuid(), tag_id uuid not null references public.tags(id) on delete cascade, taggable_type text not null, taggable_id uuid not null, created_at timestamptz not null default now(), unique (tag_id, taggable_type, taggable_id));
create index on public.taggables(taggable_type, taggable_id);
create index on public.taggables(tag_id);
create table public.traffic_sources (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, name text not null, category text not null default 'organic', is_active boolean not null default true, created_at timestamptz not null default now(), unique (org_id, name));
create table public.events (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, event_type text not null, actor_user_id uuid references auth.users(id) on delete set null, subject_type text, subject_id uuid, payload jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now(), created_at timestamptz not null default now());
create index on public.events(org_id, occurred_at desc);
create index on public.events(org_id, event_type, occurred_at desc);
create index on public.events(subject_type, subject_id);

create table public.content_pieces (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, created_by uuid references auth.users(id) on delete set null, platform public.content_platform not null, title text, url text, thumbnail_url text, hook text, body text, cta text, angle public.content_angle, awareness_stage public.awareness_stage, funnel_stage text, pain_point text, topic text, posted_at timestamptz, duration_seconds int, notes text, external_id text, source_connector text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.content_pieces(org_id, posted_at desc);
create index on public.content_pieces(org_id, platform);
create trigger tg_content_updated before update on public.content_pieces for each row execute function public.tg_set_updated_at();

create table public.content_metrics (id uuid primary key default gen_random_uuid(), content_id uuid not null references public.content_pieces(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, captured_at timestamptz not null default now(), views int default 0, reach int default 0, watch_time_seconds int default 0, avg_watch_pct numeric(5,2) default 0, shares int default 0, saves int default 0, likes int default 0, comments int default 0, profile_visits int default 0, followers_gained int default 0, qualified_followers_gained int default 0, dms_generated int default 0, leads_generated int default 0, calls_booked int default 0, closes int default 0, cash_collected_cents bigint default 0, hook_retention_pct numeric(5,2), three_sec_hold_pct numeric(5,2), ten_sec_retention_pct numeric(5,2), drop_off_seconds int, cta_conversion_pct numeric(5,2), follower_view_ratio numeric(8,4), qualified_follower_ratio numeric(8,4), leads_per_1k_views numeric(8,4), cash_per_1k_views_cents bigint, icp_attraction_score numeric(5,2), raw jsonb default '{}'::jsonb);
create index on public.content_metrics(content_id, captured_at desc);
create index on public.content_metrics(org_id, captured_at desc);

create table public.story_slides (id uuid primary key default gen_random_uuid(), content_id uuid not null references public.content_pieces(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, sequence_index int not null, caption text, cta text, posted_at timestamptz, created_at timestamptz not null default now());
create index on public.story_slides(content_id, sequence_index);

create table public.slide_metrics (id uuid primary key default gen_random_uuid(), slide_id uuid not null references public.story_slides(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, captured_at timestamptz not null default now(), views int default 0, exits int default 0, taps_forward int default 0, taps_back int default 0, replies int default 0, link_clicks int default 0, raw jsonb default '{}'::jsonb);
create index on public.slide_metrics(slide_id, captured_at desc);

create table public.leads (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, handle text, full_name text, email text, phone text, traffic_source_id uuid references public.traffic_sources(id) on delete set null, first_touch_content_id uuid references public.content_pieces(id) on delete set null, first_touch_at timestamptz, status public.lead_status not null default 'dm_received', assigned_setter_id uuid references auth.users(id) on delete set null, qualification_notes text, intent_score numeric(5,2) default 0, engagement_score numeric(5,2) default 0, estimated_close_probability numeric(5,2) default 0, beliefs text, objections_raised text[], external_id text, source_connector text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.leads(org_id, status);
create index on public.leads(org_id, assigned_setter_id);
create index on public.leads(org_id, created_at desc);
create trigger tg_leads_updated before update on public.leads for each row execute function public.tg_set_updated_at();

create table public.lead_events (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, event_type text not null, occurred_at timestamptz not null default now(), payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index on public.lead_events(lead_id, occurred_at desc);
create index on public.lead_events(org_id, occurred_at desc);

create table public.lead_content_touches (id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade, content_id uuid not null references public.content_pieces(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, touched_at timestamptz not null default now(), touch_type text default 'view', unique (lead_id, content_id, touch_type, touched_at));
create index on public.lead_content_touches(lead_id);
create index on public.lead_content_touches(content_id);

create table public.conversations (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, lead_id uuid references public.leads(id) on delete cascade, setter_id uuid references auth.users(id) on delete set null, channel text not null default 'instagram_dm', external_thread_id text, status text not null default 'open', source_tag text, last_message_at timestamptz, first_response_seconds int, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.conversations(org_id, setter_id);
create index on public.conversations(org_id, status);
create trigger tg_conv_updated before update on public.conversations for each row execute function public.tg_set_updated_at();

create table public.messages (id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, direction text not null, sent_by uuid references auth.users(id) on delete set null, body text, sent_at timestamptz not null default now(), external_id text, raw jsonb default '{}'::jsonb);
create index on public.messages(conversation_id, sent_at);

create table public.calls (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, lead_id uuid references public.leads(id) on delete set null, setter_id uuid references auth.users(id) on delete set null, closer_id uuid references auth.users(id) on delete set null, scheduled_for timestamptz, status public.call_status not null default 'booked', showed boolean default false, offer_made boolean default false, closed boolean default false, cash_collected_cents bigint default 0, contract_value_cents bigint default 0, payment_plan boolean default false, recording_url text, call_summary text, key_moment text, time_to_close_seconds int, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.calls(org_id, scheduled_for desc);
create index on public.calls(org_id, closer_id);
create index on public.calls(org_id, setter_id);
create index on public.calls(org_id, status);
create trigger tg_calls_updated before update on public.calls for each row execute function public.tg_set_updated_at();

create table public.call_objections (id uuid primary key default gen_random_uuid(), call_id uuid not null references public.calls(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, objection text not null, resolved boolean default false, created_at timestamptz not null default now());
create index on public.call_objections(call_id);

create table public.clients (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, lead_id uuid references public.leads(id) on delete set null, full_name text not null, email text, start_date date not null default current_date, offer_name text, contract_value_cents bigint default 0, payment_plan boolean default false, installments_remaining int default 0, renewal_date date, health_score numeric(5,2) default 100, status text default 'active', notes text, renewal_conv_started boolean default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.clients(org_id, status);
create trigger tg_clients_updated before update on public.clients for each row execute function public.tg_set_updated_at();

create table public.payments (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, client_id uuid references public.clients(id) on delete cascade, call_id uuid references public.calls(id) on delete set null, amount_cents bigint not null, currency text not null default 'USD', status public.payment_status not null default 'paid', collected_at timestamptz not null default now(), source_connector text, external_id text, raw jsonb default '{}'::jsonb, created_at timestamptz not null default now());
create index on public.payments(org_id, collected_at desc);
create index on public.payments(client_id);

create table public.onboarding_responses (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, client_id uuid references public.clients(id) on delete cascade, share_token text not null unique default encode(gen_random_bytes(16),'hex'), submitted_at timestamptz, responses jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index on public.onboarding_responses(org_id);

create table public.ai_insights (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, module text not null, title text not null, body text not null, confidence numeric(5,2) not null default 0, source_refs jsonb not null default '[]'::jsonb, recommendation text, generated_by text not null default 'gemini', dismissed boolean default false, saved boolean default false, created_at timestamptz not null default now());
create index on public.ai_insights(org_id, created_at desc);
create index on public.ai_insights(org_id, module);

create table public.alerts (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, rule_key text not null, severity public.alert_severity not null default 'info', title text not null, body text, subject_type text, subject_id uuid, payload jsonb default '{}'::jsonb, acknowledged boolean default false, acknowledged_by uuid references auth.users(id) on delete set null, acknowledged_at timestamptz, created_at timestamptz not null default now());
create index on public.alerts(org_id, created_at desc);
create index on public.alerts(org_id, acknowledged);

create table public.webhook_subscriptions (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, name text not null, target_url text not null, channel text not null default 'slack', event_types text[] not null default '{}', role_filter public.app_role[], signing_secret text, active boolean not null default true, created_at timestamptz not null default now());

create table public.webhook_deliveries (id uuid primary key default gen_random_uuid(), subscription_id uuid not null references public.webhook_subscriptions(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, event_id uuid references public.events(id) on delete set null, status text not null default 'pending', response_code int, response_body text, attempt int not null default 1, delivered_at timestamptz, created_at timestamptz not null default now());
create index on public.webhook_deliveries(subscription_id, created_at desc);

create table public.connector_registry (id text primary key, name text not null, category text not null, description text, auth_method text not null default 'oauth2', supports_events boolean default true, icon text, is_available boolean default false, created_at timestamptz not null default now());

create table public.connector_connections (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, connector_id text not null references public.connector_registry(id), display_name text, external_account_id text, config jsonb not null default '{}'::jsonb, state public.connector_state not null default 'not_connected', created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.connector_connections(org_id);
create trigger tg_conn_updated before update on public.connector_connections for each row execute function public.tg_set_updated_at();

create table public.connector_sync_status (id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.connector_connections(id) on delete cascade, org_id uuid not null references public.organizations(id) on delete cascade, resource text not null, last_sync_at timestamptz, next_sync_at timestamptz, cursor text, state public.connector_state not null default 'not_connected', last_error text, records_synced int default 0, updated_at timestamptz not null default now());
create index on public.connector_sync_status(connection_id, resource);
create trigger tg_sync_updated before update on public.connector_sync_status for each row execute function public.tg_set_updated_at();

create table public.raw_payloads (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, connector_id text not null, connection_id uuid references public.connector_connections(id) on delete cascade, resource text not null, external_id text, payload jsonb not null, received_at timestamptz not null default now(), processed_at timestamptz, process_error text);
create index on public.raw_payloads(org_id, connector_id, received_at desc);
create index on public.raw_payloads(connection_id, processed_at);

create table public.ingestion_jobs (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, connection_id uuid references public.connector_connections(id) on delete cascade, job_type text not null, status text not null default 'queued', scheduled_for timestamptz not null default now(), attempt int not null default 0, max_attempts int not null default 5, next_retry_at timestamptz, last_error text, payload jsonb default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.ingestion_jobs(org_id, status, scheduled_for);
create trigger tg_jobs_updated before update on public.ingestion_jobs for each row execute function public.tg_set_updated_at();

create table public.formula_variables (id text primary key, display_name text not null, description text, aggregation text not null default 'sum', source_table text not null, source_column text not null, scope public.metric_scope not null default 'org', is_currency boolean default false);

create table public.metric_definitions (id uuid primary key default gen_random_uuid(), org_id uuid references public.organizations(id) on delete cascade, key text not null, display_name text not null, description text, formula text not null, unit text default 'number', scope public.metric_scope not null default 'org', is_system boolean default false, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (org_id, key));
create index on public.metric_definitions(org_id);
create trigger tg_metric_updated before update on public.metric_definitions for each row execute function public.tg_set_updated_at();

create table public.dashboard_widgets (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, dashboard text not null default 'executive', title text not null, widget_type text not null, metric_key text, config jsonb not null default '{}'::jsonb, position int not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.dashboard_widgets(org_id, dashboard, position);
create trigger tg_widget_updated before update on public.dashboard_widgets for each row execute function public.tg_set_updated_at();

create table public.segments (id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade, name text not null, entity text not null, filter jsonb not null default '{}'::jsonb, is_shared boolean default false, created_at timestamptz not null default now());
create index on public.segments(org_id, entity);

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.tags enable row level security;
alter table public.taggables enable row level security;
alter table public.traffic_sources enable row level security;
alter table public.events enable row level security;
alter table public.content_pieces enable row level security;
alter table public.content_metrics enable row level security;
alter table public.story_slides enable row level security;
alter table public.slide_metrics enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;
alter table public.lead_content_touches enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;
alter table public.call_objections enable row level security;
alter table public.clients enable row level security;
alter table public.payments enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.ai_insights enable row level security;
alter table public.alerts enable row level security;
alter table public.webhook_subscriptions enable row level security;
alter table public.webhook_deliveries enable row level security;
alter table public.connector_registry enable row level security;
alter table public.connector_connections enable row level security;
alter table public.connector_sync_status enable row level security;
alter table public.raw_payloads enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.formula_variables enable row level security;
alter table public.metric_definitions enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.segments enable row level security;

create policy "members read org" on public.organizations for select using (public.is_org_member(auth.uid(), id));
create policy "owners update org" on public.organizations for update using (public.has_org_role(auth.uid(), id, array['owner','admin']::public.app_role[]));

create policy "users read own profile" on public.profiles for select using (auth.uid() = id);
create policy "users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "org members can view shared profiles" on public.profiles for select using (exists (select 1 from public.memberships m1 join public.memberships m2 on m1.org_id=m2.org_id where m1.user_id=auth.uid() and m2.user_id=profiles.id));

create policy "users see own memberships" on public.memberships for select using (user_id = auth.uid());
create policy "org members see siblings" on public.memberships for select using (public.is_org_member(auth.uid(), org_id));
create policy "owners manage memberships" on public.memberships for all using (public.has_org_role(auth.uid(), org_id, array['owner','admin']::public.app_role[])) with check (public.has_org_role(auth.uid(), org_id, array['owner','admin']::public.app_role[]));

do $$
declare t text;
begin
  for t in select unnest(array['tags','traffic_sources','events','content_pieces','content_metrics','story_slides','slide_metrics','leads','lead_events','lead_content_touches','conversations','messages','calls','call_objections','clients','payments','onboarding_responses','ai_insights','alerts','webhook_subscriptions','webhook_deliveries','connector_connections','connector_sync_status','raw_payloads','ingestion_jobs','dashboard_widgets','segments']) loop
    execute format('create policy "org members read %1$I" on public.%1$I for select using (public.is_org_member(auth.uid(), org_id))', t);
    execute format('create policy "org members insert %1$I" on public.%1$I for insert with check (public.is_org_member(auth.uid(), org_id))', t);
    execute format('create policy "org members update %1$I" on public.%1$I for update using (public.is_org_member(auth.uid(), org_id))', t);
    execute format('create policy "org members delete %1$I" on public.%1$I for delete using (public.is_org_member(auth.uid(), org_id))', t);
  end loop;
end $$;

create policy "taggables read" on public.taggables for select using (exists (select 1 from public.tags t where t.id=taggables.tag_id and public.is_org_member(auth.uid(), t.org_id)));
create policy "taggables write" on public.taggables for insert with check (exists (select 1 from public.tags t where t.id=taggables.tag_id and public.is_org_member(auth.uid(), t.org_id)));
create policy "taggables delete" on public.taggables for delete using (exists (select 1 from public.tags t where t.id=taggables.tag_id and public.is_org_member(auth.uid(), t.org_id)));

create policy "metric_defs read" on public.metric_definitions for select using (org_id is null or public.is_org_member(auth.uid(), org_id));
create policy "metric_defs insert" on public.metric_definitions for insert with check (org_id is not null and public.is_org_member(auth.uid(), org_id));
create policy "metric_defs update" on public.metric_definitions for update using (org_id is not null and public.is_org_member(auth.uid(), org_id));
create policy "metric_defs delete" on public.metric_definitions for delete using (org_id is not null and public.is_org_member(auth.uid(), org_id));

create policy "anyone read connector_registry" on public.connector_registry for select using (true);
create policy "anyone read formula_variables" on public.formula_variables for select using (true);

insert into public.connector_registry (id, name, category, auth_method, description, icon, is_available) values
  ('instagram','Instagram','social','oauth2','Reels, stories, DMs, profile metrics','instagram',false),
  ('tiktok','TikTok','social','oauth2','Videos, watch time, follower analytics','tiktok',false),
  ('youtube','YouTube','social','oauth2','Videos, shorts, retention curves','youtube',false),
  ('stripe','Stripe','payments','api_key','Payments, subscriptions, refunds','stripe',false),
  ('calendly','Calendly','scheduling','oauth2','Booked calls, no-shows, reschedules','calendar',false),
  ('gohighlevel','GoHighLevel','crm','api_key','Contacts, pipelines, calls','briefcase',false),
  ('typeform','Typeform','forms','oauth2','Form responses (onboarding, qualification)','clipboard',false),
  ('slack','Slack','chat','oauth2','Team alerts and notifications','slack',false),
  ('discord','Discord','chat','webhook','Community + alert notifications','discord',false),
  ('meta_ads','Meta Ads','ads','oauth2','Ad spend, CPL, ROAS','target',false);

insert into public.formula_variables (id, display_name, aggregation, source_table, source_column, scope, is_currency, description) values
  ('views','Views','sum','content_metrics','views','content',false,'Total views on content'),
  ('reach','Reach','sum','content_metrics','reach','content',false,'Unique reach'),
  ('followers_gained','Followers Gained','sum','content_metrics','followers_gained','content',false,'New followers'),
  ('qualified_followers','Qualified Followers','sum','content_metrics','qualified_followers_gained','content',false,'ICP-fit followers'),
  ('dms_generated','DMs Generated','sum','content_metrics','dms_generated','content',false,'DMs sparked by content'),
  ('leads_generated','Leads Generated','sum','content_metrics','leads_generated','content',false,'Leads attributed'),
  ('calls_booked','Calls Booked','count','calls','id','call',false,'Calls scheduled'),
  ('calls_showed','Calls Showed','count','calls','id','call',false,'Calls where lead attended'),
  ('calls_closed','Calls Closed','count','calls','id','call',false,'Closed deals'),
  ('cash_collected','Cash Collected','sum','payments','amount_cents','org',true,'Total cash collected'),
  ('contract_value','Contract Value','sum','calls','contract_value_cents','call',true,'Total contract value'),
  ('avg_deal_size','Avg Deal Size','avg','calls','cash_collected_cents','call',true,'Average deal size');

insert into public.metric_definitions (org_id, key, display_name, description, formula, unit, scope, is_system) values
  (null,'cash_per_qualified_follower','Cash per Qualified Follower','Revenue per ICP-fit follower','cash_collected / nullif(qualified_followers,0)','currency','org',true),
  (null,'revenue_per_1k_views','Revenue per 1k Views','Cash collected per thousand content views','(cash_collected / nullif(views,0)) * 1000','currency','content',true),
  (null,'close_rate','Close Rate','Closes divided by shows','calls_closed / nullif(calls_showed,0)','percent','call',true),
  (null,'show_rate','Show Rate','Shows divided by booked','calls_showed / nullif(calls_booked,0)','percent','call',true),
  (null,'offer_rate','Offer Rate','Offers made divided by shows','offer_made / nullif(calls_showed,0)','percent','call',true),
  (null,'cash_per_booked_call','Cash per Booked Call','Revenue per call scheduled','cash_collected / nullif(calls_booked,0)','currency','call',true);
