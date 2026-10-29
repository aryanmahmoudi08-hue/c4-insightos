// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only, preset-driven),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// Nitro builds the deploy bundle from this — wrangler.jsonc main alone is insufficient.
// Nitro's zero-config default here is `cloudflare-module`; pinning the preset
// targets Vercel's Build Output API (`.vercel/output`) instead. Lovable's own
// sandbox builds force Cloudflare regardless, so previews there still work.
export default defineConfig({
  // Nitro reads config.preset BEFORE process.env.NITRO_PRESET, so the env var
  // has to be threaded through here or it is silently ignored.
  nitro: { preset: process.env.NITRO_PRESET ?? "vercel" },
  vite: {
    server: {
      allowedHosts: [
        "4182-ir6qz9hq4v4dp1gbt0qxx-1ef832df.us4.manus.computer",
        "8080-ir6qz9hq4v4dp1gbt0qxx-1ef832df.us4.manus.computer",
        "8081-ir6qz9hq4v4dp1gbt0qxx-1ef832df.us4.manus.computer",
      ],
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
});
