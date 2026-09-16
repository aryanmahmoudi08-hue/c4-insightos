-- Webinar classification (paid / organic / unclassified) — the reusable
-- hierarchical Webinar filter groups webinars by this column. Separate
-- concept from a lead's own acquisition source: a webinar can have leads
-- from both paid and organic sources (webinar_metrics.paid_leads /
-- organic_leads already track that split) while still carrying its own
-- primary classification for filtering. Defaults to 'unclassified' rather
-- than guessing, per the app's existing "never fabricate an attribution"
-- convention — real webinars with no classification yet stay visible under
-- an honest "Unclassified" bucket instead of being silently sorted into
-- Paid or Organic.
alter table public.webinars
  add column if not exists webinar_type text not null default 'unclassified'
    check (webinar_type in ('paid', 'organic', 'unclassified'));

create index if not exists idx_webinars_type on public.webinars(org_id, webinar_type);
