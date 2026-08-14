import { defineConfig } from "vitest/config";
import path from "node:path";

// Separate from vitest.config.ts on purpose: these tests need
// TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY / TEST_SUPABASE_DB_URL
// (a real, migrated, throwaway Supabase project — see .env.test, gitignored)
// and real network calls. `npm test` must stay fast and secret-free; only
// `npm run test:integration` opts into this suite.
export default defineConfig({
  resolve: {
    // The `@/*` alias normally comes from @lovable.dev/vite-tanstack-config's
    // bundled tsConfigPaths plugin (vite.config.ts), which this standalone
    // config deliberately doesn't load — content-signals.server.ts's import
    // chain uses `@/integrations/supabase/auth-middleware`, so it's needed
    // here even though the tests never call that specific export.
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
