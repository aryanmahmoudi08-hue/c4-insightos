-- Phase 4 (InsightOS upgrade spec): Content Command Center consolidation.
-- content_pieces.platform is actually a format enum (reel/carousel/tiktok/
-- youtube/etc, not a clean brand platform), which conflates two dimensions
-- the spec wants kept separate (Platform -> placement/format -> ...).
-- source_platform mirrors the existing leads/calls pattern (source_platform
-- text column, normalized client-side via normalizeSocialPlatform) rather
-- than migrating the existing enum, which many other queries/forms already
-- depend on. Nullable and additive — existing rows read as
-- "Unknown / Unattributed" until edited, never backfilled by guessing.
alter table public.content_pieces
  add column if not exists source_platform text;
