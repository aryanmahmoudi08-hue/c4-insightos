import { defineConfig, devices } from "@playwright/test";

// Committed for real (previously every "Playwright run" in this project's
// history was an ephemeral throwaway script, never checked in). Scoped to
// Chromium only and to the routes this rep-dashboard/date-range/Lead-Journey
// project touched — not a full 25-route x theme x motion matrix yet. Grow
// coverage here as more pages get the same scrutiny, rather than writing
// speculative tests for pages nobody has audited.
//
// Auth: every test uses the dev-bypass path (`sessionStorage.setItem("c4-dev-bypass","1")`
// via `tests/fixtures.ts`), matching how this app already lets local/CI runs in
// without a real Supabase session — see `useAuth()`'s `devBypass` flag.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  // A local Vite dev server runs a single esbuild service under the hood —
  // concurrent Playwright workers hitting different (even pre-warmed, via
  // globalSetup below) routes at once serialized behind it and intermittently
  // blew a 20s wait, non-deterministically, with no app-side error. Serial
  // execution against the dev server removed the flake entirely (8/8 green,
  // ~1-1.6s each) at the cost of total suite runtime — worth revisiting
  // (e.g. `vite preview` against a prod build instead of `vite dev`) once
  // this suite is large enough for that tradeoff to matter.
  workers: 1,
  timeout: 45_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8080",
    trace: "retain-on-failure",
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
