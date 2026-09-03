# InsightOS Claude Code Handoff

## Verified source of truth

- Repository: `https://github.com/aryanmahmoudi08-hue/c4-insightos`
- Local worktree: `/home/ubuntu/insightos-localhost`
- Branch: `upgrade/localhost-8081-command-center`
- Handoff commit: `44909e451567ecd3748c95de33c00bcddc799f40`
- Remote branch: `origin/upgrade/localhost-8081-command-center`
- Default GitHub branch: `main` (not modified or merged)
- Worktree state at handoff: clean and tracking the remote branch

The complete current source tree, migrations, tracked configuration, tests, documentation, and tracked static assets are committed to the handoff branch. Ignored local environment files are deliberately not committed.

## Database and data boundary

InsightOS is configured to use the external Supabase project `c4-insightos-staging`, project ref `zyptvdzlayoheqtxcljx`, region `us-east-1`, using the host `zyptvdzlayoheqtxcljx.supabase.co`. The project was reported by the Supabase management surface as `INACTIVE` during handoff verification. The database is not represented in Git; Git contains schema migration files only. Supabase Storage objects, Auth users, database rows, provider secrets, and other hosted state are outside this repository.

The local schema source is `supabase/migrations/`. No migration was applied during this handoff. Read-only attempts to inspect the inactive Supabase database timed out; no data was modified.

## Official backup/export path

For Supabase data, use the official [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups) and [CLI backup/restore documentation](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). A logical export requires a database connection string and database password obtained from Supabase Database Settings. The documented export is:

```sh
supabase db dump --db-url "$DATABASE_URL" -f roles.sql --role-only
supabase db dump --db-url "$DATABASE_URL" -f schema.sql
supabase db dump --db-url "$DATABASE_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
```

This export was not created here because the Supabase project is inactive and no database password or connection string was supplied. The repository is therefore source-complete but not data-backup-complete. Storage objects require a separate Storage export/copy; database dumps do not include Storage object contents.

If the project is also in scope for Manus website backup, use the official [Manus Data Backup Tool](https://manus.im/backup). The current Manus backup window shown during verification is ended, so no new Manus Task Data Backup was created. Manus Task Data exports are point-in-time snapshots and are not a substitute for a current Supabase database dump.

## Environment variables

Create a local `.env.local` from `.env.example` and supply values through a secure secret manager or local shell. Never commit `.env.local`.

Required runtime names documented by the project are:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; do not expose to the browser)
- `SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
- `LOVABLE_API_KEY` when the related server-side feature is used

The currently inspected local environment contained only the URL and publishable-key pairs. The service-role key, project ID, Lovable key, database password, Supabase Management API token, and third-party provider credentials were not present and must not be inferred.

## Run locally

```sh
git clone https://github.com/aryanmahmoudi08-hue/c4-insightos.git
cd c4-insightos
git checkout upgrade/localhost-8081-command-center
npm ci
cp .env.example .env.local
# Fill .env.local with safe staging values.
npm run dev
```

The Vite/TanStack Start server listens on port `8081` for this worktree. Open `http://localhost:8081/` or `http://localhost:8081/dashboard`. For a production-target build, run `npm run build`; the Cloudflare Worker entry is `src/server.ts` and the deployment configuration is `wrangler.jsonc`.

## Continue the current deployed/preview site

The verified isolated preview URL is:

`https://8081-ir6qz9hq4v4dp1gbt0qxx-1ef832df.us4.manus.computer`

It was serving the local Vite process on port `8081` and returned HTTP 200 for `/` and `/dashboard` after the exact Manus hostname was added to `server.allowedHosts` in `vite.config.ts`. This is a temporary isolated preview, not a durable production deployment. Start the local server first, then use the preview URL while the sandbox process and proxy remain alive.

No persistent Cloudflare deployment or GitHub Actions workflow was verified in the repository. `wrangler.jsonc` describes the Cloudflare Workers target, but deployment requires the operator's Cloudflare account/project configuration and secrets. Do not run `wrangler deploy` until the intended non-production target and credentials are explicitly confirmed.

## Handoff limitations

The code branch is pushed and reproducible. The external Supabase database contents, Storage objects, Auth state, secrets, third-party connectors, domain bindings, scheduled tasks, and any durable production deployment are not reproduced by Git. A database owner must provide access to the inactive staging project or a fresh official Supabase export before data restoration or migration can be verified.
