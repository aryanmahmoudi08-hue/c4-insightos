# AscendOS n8n workflows

Real, importable n8n workflow exports — the same JSON format n8n's own UI produces when you
click **Download** on a workflow, and accepts when you click **Import from File**. I can't drive
your n8n instance directly (no access to it from here), but you don't need me to: these files are
the actual deliverable, built by hand to n8n's schema, not a description of what a workflow
*should* do.

## How to use one

1. Open your n8n instance → **Workflows** → **Import from File** (or drag the `.json` file onto
   the canvas) → select the file.
2. Every node with a `REPLACE_WITH_...` placeholder or a "REQUIRED SETUP" note needs your real
   values filled in before the workflow will run — see the per-workflow notes below.
3. Test with **Execute Workflow** (manual run) before turning on the schedule trigger.

## `wistia-vsl-stats-sync.workflow.json`

Daily poll of Wistia's Stats API for a fixed list of VSL videos, pushed into AscendOS via its
existing generic ingest endpoint. Implements the "Wistia" contract from
`docs/ascendos-external-integration-contract.md` §6 and
`docs/ascendos-supabase-canonical-data-contract.md` §3 (P2 priority — lowest-risk of the three
integrations scoped in those two documents, no OAuth required).

**Setup checklist:**
- [ ] **Wistia API credential**: create an n8n Header Auth credential named `Wistia API Token`
  (header `Authorization`, value `Bearer <your real Wistia API token>` — get one from your Wistia
  account's API access settings), then select it on the "GET Wistia video stats" node.
- [ ] **Video list**: edit the "VSL video IDs to poll (edit me)" Code node — replace the
  placeholder array with your real Wistia video IDs. **Each one must already exist as
  `wistia_video_id` on a `public.vsls` row in AscendOS** (add/edit that field on the VSL in
  AscendOS's VSL Analytics page first) — this workflow attaches a stats snapshot to an existing
  VSL, it does not create one.
- [ ] **AscendOS ingest URL**: in AscendOS, sign in as an org admin → Settings → Connections →
  copy the "Ingest endpoint" URL shown there (already contains your org's real token). Paste the
  full URL into the "POST to AscendOS ingest endpoint" node's URL field.
- [ ] **Verify the Wistia field mapping**: the "Map to AscendOS ingest payload" node assumes
  Wistia's Stats API returns `stats.play_count`, `stats.load_count`, `stats.visitors`,
  `stats.engagement` — this is Wistia's documented v1 shape, but Wistia has changed field names
  across API versions before. Run the workflow manually once, inspect the real response on the
  "GET Wistia video stats" node's output panel, and adjust the mapping if any field name differs.

**What it writes**: a `vsl_metric_snapshot` event to
`POST {ascendos_url}/api/public/ingest/{token}`, handled by
`src/routes/api/public/ingest.$token.ts` (new `vsl_metric_snapshot` branch, added alongside this
workflow) — which resolves the video to a real `public.vsls` row by `wistia_video_id`, rejects
(404) if no match exists rather than fabricating one, and upserts into
`public.vsl_metric_snapshots` with `source='api'`, deduplicated per video per day (checked in
application code, backed by a real DB unique index added in migration
`20260923000000_vsl_metric_snapshots_daily_uniqueness.sql` — manual/CSV-imported rows are
excluded from that constraint, so this never blocks or collides with a user's own manual entries).

## Why only Wistia so far

`docs/ascendos-external-integration-contract.md` scoped three integrations: Webinar Platform
Event Feed (P0, largest impact), Ad Platform Spend Feed (P1), and Wistia (P2). Wistia is the only
one built here because it's the only one with no unresolved blocker:

- **Webinar platform** needs you to confirm which platform you actually use (WebinarJam,
  EverWebinar, Zoom Webinar, etc.) — the webhook payload shape and signature scheme differ enough
  between them that guessing would mean shipping a workflow tuned to the wrong provider.
- **Ad Platform Spend Feed (Meta/TikTok/YouTube/LinkedIn)** is blocked on a real gap: AscendOS's
  connector system (`src/lib/connectors.functions.ts`) has no OAuth flow implemented yet, and
  every ad-platform API in that group requires OAuth. That's real engineering work on the
  AscendOS side, not something an n8n workflow alone can route around.

Once you tell me which webinar platform you're on (or if you want the OAuth work scoped first),
the same pattern — a real importable `.json` file plus the matching AscendOS-side route/migration
— extends to those.
