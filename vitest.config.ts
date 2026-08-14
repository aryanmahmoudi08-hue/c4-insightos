import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately NOT extending vite.config.ts: that config loads the full
// TanStack Start / Cloudflare Worker plugin stack (SSR entry, wrangler
// bindings, componentTagger, etc.) via @lovable.dev/vite-tanstack-config,
// none of which pure business-logic unit tests need or should depend on.
// The `@/*` alias itself is still needed though — content-signals.server.ts's
// import chain reaches `@/integrations/supabase/auth-middleware`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
    environment: "node",
  },
});
