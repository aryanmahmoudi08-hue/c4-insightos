-- Placement and exact post, captured; and a way to tie a post to a lead.
--
-- Links carry utm_source, utm_medium and utm_campaign (and utm_content once
-- posts are tagged), and Typeform passes all of them through as hidden
-- fields. Only source and campaign had a column on leads, so utm_medium=bio
-- — which placement the click came from — was dropped, and utm_content
-- would have been too. These hold them, raw, as delivered.
--
-- New columns rather than reusing source_format: that column means the
-- content format (reel, story, …), and a placement written into it would
-- read as a format everywhere it is shown.
alter table public.leads
  add column if not exists source_medium text,
  add column if not exists source_content_tag text;

comment on column public.leads.source_medium is
  'utm_medium as delivered (placement: bio, story, dm, …). First touch; not overwritten.';
comment on column public.leads.source_content_tag is
  'utm_content as delivered. When it matches a content_pieces.tracking_id, source_content_id is set too.';

-- A short, human id for a content piece (e.g. reel-1114-layoff) that links
-- use as utm_content. A lead arriving with a matching utm_content is linked
-- to the piece, so Content-to-Cash and the top-sources reports can rank
-- individual posts. Unique per workspace, ignoring case, so one id can
-- never mean two pieces.
alter table public.content_pieces
  add column if not exists tracking_id text;

create unique index if not exists content_pieces_org_tracking_id_key
  on public.content_pieces (org_id, lower(tracking_id))
  where tracking_id is not null;

comment on column public.content_pieces.tracking_id is
  'Short id used as utm_content on this piece''s links; matched case-insensitively to link leads.';
