#!/usr/bin/env bash
#
# One-shot Vercel setup for AscendOS.
#
# Pushes every variable from .env into the linked Vercel project, deploys, and
# verifies the deployed site actually works. Run it after `vercel login`.
#
#   ./scripts/vercel-setup.sh            # env vars, build, deploy, verify
#   ./scripts/vercel-setup.sh --env-only # env vars only
#   VERCEL_PROJECT=other ./scripts/...   # target a differently-named project
#
# Secrets are piped to the CLI on stdin, never passed as argv (argv is visible
# in `ps`), and .env is parsed with sed rather than sourced so nothing in it is
# executed. No value is ever echoed.

set -uo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env"
PROJECT="${VERCEL_PROJECT:-ascendos-app}"
ENV_ONLY=0
[ "${1:-}" = "--env-only" ] && ENV_ONLY=1

# Both halves matter, for different reasons:
#
#   VITE_*  are inlined into the CLIENT bundle at BUILD time. Without them on
#           Vercel's builder the browser ships `undefined` for the Supabase URL
#           and every page dies on an error boundary.
#   the rest are read by server functions at REQUEST time.
#
# Type is not cosmetic. Vercel refuses a VITE_-prefixed value that looks like a
# credential unless you say which you mean, because VITE_ publishes it:
#   config -> exposed in the client bundle (correct for the publishable/anon
#             key: it is public by design and RLS is what protects it)
#   secret -> stays server-side
# Omitting --type makes the CLI stop and ask, which in a script reads as a
# silent failure. That is exactly how VITE_SUPABASE_PUBLISHABLE_KEY went
# missing once already and shipped a broken production site.
REQUIRED="VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY SUPABASE_PROJECT_ID"

# Set only if present locally. The app degrades honestly without them: AI panels
# say "not configured", the Meta connector stays unavailable.
OPTIONAL="LOVABLE_API_KEY META_APP_ID META_APP_SECRET"

if command -v vercel >/dev/null 2>&1; then
  VERCEL="vercel"
else
  VERCEL="npx --yes vercel@latest"
fi

$VERCEL whoami >/dev/null 2>&1 || {
  echo "Not logged in to Vercel. Run this first:" >&2
  echo "    $VERCEL login" >&2
  exit 1
}

[ -f "$ENV_FILE" ] || { echo "$ENV_FILE not found." >&2; exit 1; }

read_env() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# VITE_ is published to the browser; everything else stays server-side.
type_for() {
  case "$1" in
    VITE_*) echo "config" ;;
    *)      echo "secret" ;;
  esac
}

if [ -f .vercel/project.json ]; then
  echo "==> Already linked, leaving the link alone"
else
  # Bare `link --yes` means "create a new project", which 409s when one of that
  # name exists — the normal case once the repo has been imported in the
  # dashboard. Name it so it attaches to the existing project instead.
  echo "==> Linking to project $PROJECT"
  $VERCEL link --yes --project "$PROJECT" || {
    echo "Could not link to $PROJECT." >&2
    echo "Set VERCEL_PROJECT=<name> if your project is named differently." >&2
    exit 1
  }
fi

failed=""
missing=""

push_var() {
  name="$1"; value="$2"; vtype="$(type_for "$1")"
  for target in production preview development; do
    # `env add` refuses to overwrite, so clear any existing value first. A
    # missing variable is the normal case here, so rm failing is not an error.
    $VERCEL env rm "$name" --environment "$target" --yes >/dev/null 2>&1
    out="$(printf '%s' "$value" | $VERCEL env add "$name" --environment "$target" --type "$vtype" --yes 2>&1)"
    if [ $? -ne 0 ] || printf '%s' "$out" | grep -q '"status": *"action_required"'; then
      echo "    FAILED  $name ($target)" >&2
      printf '%s\n' "$out" | tail -5 | sed 's/^/        /' >&2
      failed="$failed $name/$target"
      return 1
    fi
  done
  echo "    ok      $name  [$vtype]  production, preview, development"
}

echo "==> Pushing environment variables"
for name in $REQUIRED; do
  value="$(read_env "$name")"
  if [ -z "$value" ]; then
    echo "    MISSING in $ENV_FILE: $name" >&2
    missing="$missing $name"
    continue
  fi
  push_var "$name" "$value"
done

for name in $OPTIONAL; do
  value="$(read_env "$name")"
  if [ -n "$value" ]; then
    push_var "$name" "$value"
  else
    echo "    skip    $name (not set locally)"
  fi
done

# Read back rather than trusting the writes. An earlier version of this script
# piped `env add` to /dev/null and printed success unconditionally; it reported
# 7 of 7 set when one had been refused, and production shipped broken.
echo "==> Verifying what actually landed in production"
live="$($VERCEL env ls --environment production 2>/dev/null)"
absent=""
for name in $REQUIRED; do
  if printf '%s' "$live" | grep -q "^ *$name "; then
    echo "    present $name"
  else
    echo "    ABSENT  $name" >&2
    absent="$absent $name"
  fi
done

if [ -n "$missing" ] || [ -n "$failed" ] || [ -n "$absent" ]; then
  echo "" >&2
  [ -n "$missing" ] && echo "Missing from $ENV_FILE:$missing" >&2
  [ -n "$failed" ]  && echo "Rejected by Vercel:$failed" >&2
  [ -n "$absent" ]  && echo "Not present in production after writing:$absent" >&2
  echo "Not deploying with an incomplete environment." >&2
  exit 1
fi

if [ "$ENV_ONLY" -eq 1 ]; then
  echo "==> --env-only, stopping before deploy"
  exit 0
fi

echo "==> Building"
npm run build || { echo "Build failed." >&2; exit 1; }

echo "==> Deploying to production"
$VERCEL deploy --prebuilt --prod || { echo "Deploy failed." >&2; exit 1; }

# A 200 and a correct <title> prove nothing: the app's own error boundary
# renders "Something broke" as a 200 with <title>AscendOS</title>. Check the
# body, and check the client bundle really carries its Supabase config.
echo "==> Verifying the deployed site"
sleep 10
url="https://${PROJECT}.vercel.app"
bad=0
for path in / /login /dashboard; do
  body="$(curl -s --max-time 30 "$url$path")"
  if printf '%s' "$body" | grep -q "Something broke\|Missing Supabase"; then
    echo "    BROKEN  $path renders the error page" >&2
    bad=1
  else
    echo "    ok      $path"
  fi
done

tmp="$(mktemp)"
asset="$(curl -s --max-time 30 "$url/login" | grep -oE '/assets/[A-Za-z0-9._-]+\.js' | head -1)"
if [ -n "$asset" ]; then
  curl -s --max-time 30 -o "$tmp" "$url$asset"
  grep -qaE "https://[a-z0-9]+\.supabase\.co" "$tmp" \
    && echo "    ok      client bundle carries the Supabase URL" \
    || { echo "    BROKEN  client bundle has no Supabase URL" >&2; bad=1; }
  grep -qaE "eyJ[A-Za-z0-9_-]{20,}\." "$tmp" \
    && echo "    ok      client bundle carries the publishable key" \
    || { echo "    BROKEN  client bundle has no publishable key" >&2; bad=1; }
fi
rm -f "$tmp"

if [ "$bad" -ne 0 ]; then
  echo "" >&2
  echo "Deployed, but the site is not healthy. Check $url" >&2
  exit 1
fi

echo ""
echo "Done. $url is live and healthy."
echo ""
echo "Note: the .vercel.app domain follows your LATEST production deployment."
echo "A git-integration build finishing after this one will replace it — which"
echo "is fine now the environment is complete, but it means this verification"
echo "only covers the deployment just made."
