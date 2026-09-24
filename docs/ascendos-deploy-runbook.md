# AscendOS — Deploy Runbook

Getting from local to a live URL, on free tiers, with no client.

Verified 2026-09-24: the production build succeeds (7.3 MB uncompressed server
bundle, well under Workers' 64 MiB limit), and the config needs no paid
Cloudflare bindings — no KV, D1, R2, Durable Objects or Queues.

---

## The one thing that's easy to get wrong

**`VITE_*` variables are baked into the bundle at BUILD time. Server variables
are read at RUNTIME.**

`src/integrations/supabase/client.ts` reads `import.meta.env.VITE_SUPABASE_URL`,
which Vite replaces during `npm run build`. So a `VITE_*` value set only as a
Cloudflare secret never reaches the browser bundle — it has to be present in
`.env` *before* you build.

That's why the order below is build-then-secrets-then-deploy, not the other way
round.

| Variable | Where it must be set | When |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` locally | before `npm run build` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` locally | before `npm run build` |
| `VITE_SUPABASE_PROJECT_ID` | `.env` locally | before `npm run build` |
| `SUPABASE_URL` | Cloudflare secret | before first request |
| `SUPABASE_PUBLISHABLE_KEY` | Cloudflare secret | before first request |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare secret | before first request |
| `SUPABASE_PROJECT_ID` | Cloudflare secret | before first request |
| `LOVABLE_API_KEY` | Cloudflare secret | optional — AI panels degrade honestly without it |
| `META_APP_ID` / `META_APP_SECRET` | Cloudflare secret | only when connecting Meta Ads |

---

## Steps

### 1. Create a Supabase project

app.supabase.com → New project. Free tier: 500 MB database, 1 GB file storage,
50k monthly users. Note the project ref, URL, publishable (anon) key and service
role key.

### 2. Apply the migrations

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

**None of the migrations in this repo has ever been executed** — there has been
no reachable database during development. Expect this step to be where problems
surface, not the deploy itself.

The most likely failure: the partial unique indexes on `leads` and `calls`
(`*_connector_external_uidx`) fail if existing rows duplicate
`(org_id, source_connector, external_id)`. On a fresh project there are no rows,
so this should apply cleanly. Every migration is written to be re-runnable, so a
retry after fixing data is safe.

### 3. Point `.env` at the real project

Replace the local `http://127.0.0.1:54321` values with the real ones. Both the
`VITE_`-prefixed and unprefixed pairs.

### 4. Build

```bash
npm run build
```

This bakes the `VITE_*` values in. Re-run it any time they change.

### 5. Log in to Cloudflare and set the server secrets

```bash
npx wrangler login
```

Then, once each — it prompts for the value so nothing lands in shell history:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put SUPABASE_PROJECT_ID
```

### 6. Deploy

```bash
npm run deploy
```

That rebuilds and ships. `.wrangler/deploy/config.json` points wrangler at the
generated `.output/server/wrangler.json`, so no extra flags are needed.

### 7. First checks

- Open the deployed URL — the login page should render.
- Sign up. The first user provisions a workspace automatically
  (`ensureCurrentWorkspace`).
- Settings → Connections — the connector cards should list, and the webhook
  URLs they generate now carry your real domain.

---

## Known risks, stated plainly

**Supabase free projects pause after one week of no database activity.** Not
dashboard visits — actual queries. This already happened once on this project:
the earlier handoff doc records Supabase reporting `zyptvdzlayoheqtxcljx` as
INACTIVE. Restoring is a click, but not one you want to make in front of a
prospect. Open the app weekly, or point something at it on a schedule.

**Free Workers allow 10 ms CPU per request.** Server-rendering the denser
dashboards may exceed that. It would show as errors on specific heavy pages
rather than a general failure. Workers Paid ($5/month) removes the limit. Not
verifiable without deploying.

**The error-page wrapper.** `wrangler.jsonc` sets `main: src/server.ts`, but
nitro overrides it (a warning appears during build). `renderErrorPage` is still
bundled and reachable through `start.ts`'s `errorMiddleware`, so branded errors
should still render — worth confirming once against a real 500.

---

## After it's live

Connecting anything is then just the Connections panel, per workspace:

- **Stripe** — a webhook secret. Turns on the whole cash layer.
- **Typeform** — lead intake and mentee onboarding.
- **Calendly** — signing key plus a personal access token.
- **Close CRM**, **WebinarJam**, **Meta Ads**, **Wistia** — as accounts exist.

Every one of those is per-workspace. A second client connects their own accounts
through the same cards, against the same deployment, with no new code.
