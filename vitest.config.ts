import { defineConfig } from "vitest/config";

// Deliberately NOT extending vite.config.ts: that config loads the full
// TanStack Start / Cloudflare Worker plugin stack (SSR entry, wrangler
// bindings, componentTagger, etc.) via @lovable.dev/vite-tanstack-config,
// none of which pure business-logic unit tests need or should depend on.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
