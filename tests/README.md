# Playwright suite

Committed for real — every prior "Playwright run" in this project's history was an
ephemeral `npx` script, never checked in (`playwright.config.ts` explains why that
changed). Run with `npx playwright test` (starts its own dev server on `:8080` if
one isn't already running — see `webServer` in `playwright.config.ts`).

## What's covered, and why each assertion exists

- **`fixtures.ts`** — every test authenticates via the app's existing dev-bypass
  path (`sessionStorage["c4-dev-bypass"]`), the same mechanism `useAuth()` already
  uses for local/CI access — there's no separate login flow to build here.
  `consoleErrors`/`realErrors()` collect console/pageerror output and filter out
  expected dev-bypass noise (401s from RLS-gated queries with no real session,
  favicon 404s) so a genuine hydration or runtime error can't hide in the noise.

- **`rep-dashboards.spec.ts`** — guards the Part 1/2 regression this project fixed
  once already: a rep dashboard silently reverting to the old banner + one-metric-
  per-box grid, or a chart rendering as an empty `<svg>` that *looks* like a chart
  but draws nothing (the exact "broken scaffolding" failure a reviewer caught
  mid-project, fixed via `background={{...}}` on recharts `<Bar>`). The
  zero-geometry check asserts every `svg.recharts-surface` has non-zero width/height
  — not just that it exists in the DOM.

- **`date-range-controls.spec.ts`** — Part 4's core requirement: a date-range
  control must provably change what's *rendered*, not just its own selected value.
  Verified by inspecting real Supabase REST request URLs for updated `gte`/`lte`
  params after switching to a custom range — a DOM-text diff alone can't
  distinguish "the query re-fired with new bounds" from "the control's own label
  text just changed." Every interaction is a real trusted `.click()`/`.fill()`;
  never `element.click()` inside `page.evaluate()`, which bypasses Radix's
  pointerdown handling and silently no-ops these pickers.

## `global-setup.ts`

Loads every tested route once with a real browser before any timed test runs, and
`playwright.config.ts` runs the suite with `workers: 1`. Both exist for the same
reason: a local Vite dev server serializes compiles behind one esbuild service, and
running these tests concurrently against cold *or even pre-warmed-via-`fetch`*
routes intermittently hung for 20s+ with no app-side error — reproducible, but not
deterministic per route. A real-browser warm-up plus serial execution removed the
flake entirely (8/8 green, ~1-1.6s per test). This trades total suite runtime for
reliability; revisit (e.g. point `webServer` at `vite preview` against a prod build
instead of `vite dev`) once the suite is large enough for that tradeoff to matter.

## Not yet covered

- Only Chromium, only the routes this project touched (rep dashboards,
  content-signals, events, outreach, insights) — not the full 25-route × theme ×
  motion-setting matrix from the original plan. Grow this incrementally as more
  pages get the same scrutiny.
- Dual-theme contrast — the app is forced dark-only at the HTML level
  (`RootShell`), so there's nothing to assert today; worth adding if that ever
  changes.
