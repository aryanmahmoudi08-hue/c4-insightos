#!/usr/bin/env bash
#
# One-shot Vercel setup for AscendOS.
#
# Pushes every variable from .env into the linked Vercel project and deploys.
# Run it after `vercel login` — it does the rest.
#
#   ./scripts/vercel-setup.sh            # set env vars, build, deploy to production
#   ./scripts/vercel-setup.sh --env-only # set env vars, skip the deploy
#
# Secrets are piped straight from .env into the Vercel CLI. Values are never
# echoed, never passed as argv (which would land in `ps` output and shell
# history), and never written anywhere else.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
ENV_ONLY=0
[ "${1:-}" = "--env-only" ] && ENV_ONLY=1

# Both halves matter. The VITE_* copies are inlined into the client bundle at
# BUILD time, so they have to exist on Vercel's builder or the browser bundle
# ships `undefined` for the Supabase URL and the app dies on load. The unprefixed
# copies are read by server functions at request time.
REQUIRED=(
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
  VITE_SUPABASE_PROJECT_ID
  SUPABASE_URL
  SUPABASE_PUBLISHABLE_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPABASE_PROJECT_ID
)

# Set these only if present locally — the app degrades gracefully without them
# (AI panels say "not configured"; the Meta connector stays unavailable).
OPTIONAL=(
  LOVABLE_API_KEY
  META_APP_ID
  META_APP_SECRET
)

# Use a global `vercel` if there is one, otherwise run it through npx so no
# global install (and no sudo) is needed.
if command -v vercel >/dev/null 2>&1; then
  VERCEL=(vercel)
else
  VERCEL=(npx --yes vercel@latest)
fi

"${VERCEL[@]}" whoami >/dev/null 2>&1 || {
  echo "Not logged in to Vercel. Run this first:" >&2
  echo "    ${VERCEL[*]} login" >&2
  exit 1
}

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found." >&2; exit 1; }

# Read one key's value from .env without sourcing the file (avoids executing
# anything in it) and without printing it.
read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

echo "==> Linking project"
"${VERCEL[@]}" link --yes

push_var() {
  local name="$1" value="$2"
  for target in production preview development; do
    # `env add` refuses to overwrite, so clear any existing value first.
    "${VERCEL[@]}" env rm "$name" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | "${VERCEL[@]}" env add "$name" "$target" >/dev/null 2>&1
  done
  echo "    $name  -> production, preview, development"
}

echo "==> Pushing environment variables"
missing=0
for name in "${REQUIRED[@]}"; do
  value="$(read_env "$name")"
  if [ -z "$value" ]; then
    echo "    MISSING in $ENV_FILE: $name" >&2
    missing=1
    continue
  fi
  push_var "$name" "$value"
done

for name in "${OPTIONAL[@]}"; do
  value="$(read_env "$name")"
  if [ -n "$value" ]; then
    push_var "$name" "$value"
  else
    echo "    $name  -> skipped (not set locally)"
  fi
done

if [ "$missing" -ne 0 ]; then
  echo "" >&2
  echo "Required variables are missing from $ENV_FILE — fix those before deploying." >&2
  exit 1
fi

if [ "$ENV_ONLY" -eq 1 ]; then
  echo "==> --env-only, stopping before deploy"
  exit 0
fi

echo "==> Building"
npm run build

echo "==> Deploying to production"
"${VERCEL[@]}" deploy --prebuilt --prod
