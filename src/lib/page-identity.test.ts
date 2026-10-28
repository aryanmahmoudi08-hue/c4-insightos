import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_IDENTITY, pageIdentityFor } from "./page-identity";

const ROUTES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../routes");

/** Every `_authenticated.<name>.tsx` file, as the pathname it serves.
 *  `_authenticated.tsx` itself is the layout, not a page. */
function authenticatedRoutePaths(): string[] {
  return readdirSync(ROUTES_DIR)
    .filter((f) => f.startsWith("_authenticated.") && f.endsWith(".tsx"))
    .filter((f) => f !== "_authenticated.tsx")
    .map((f) => "/" + f.slice("_authenticated.".length, -".tsx".length))
    .filter((p) => !p.includes("."));
}

describe("PAGE_IDENTITY", () => {
  it("covers every authenticated route on disk", () => {
    // The guard that makes the registry safe to rely on: add a route and
    // forget to file it here, and this fails rather than the page quietly
    // rendering no hero.
    const missing = authenticatedRoutePaths().filter((p) => !(p in PAGE_IDENTITY));
    expect(missing).toEqual([]);
  });

  it("has no entries for routes that no longer exist", () => {
    const onDisk = new Set(authenticatedRoutePaths());
    const stale = Object.keys(PAGE_IDENTITY).filter((p) => !onDisk.has(p));
    expect(stale).toEqual([]);
  });

  it("gives every entry a non-empty eyebrow and an icon", () => {
    for (const [path, identity] of Object.entries(PAGE_IDENTITY)) {
      expect(identity.eyebrow.trim(), path).not.toBe("");
      expect(identity.icon, path).toBeTruthy();
    }
  });

  it("groups routes under a small set of module names", () => {
    // An eyebrow is the module the page belongs to. If this count creeps up
    // toward the route count, they have stopped being modules and become
    // per-page captions.
    const modules = new Set(Object.values(PAGE_IDENTITY).map((i) => i.eyebrow));
    expect(modules.size).toBeLessThanOrEqual(12);
  });

  it("returns null for an unknown path rather than a generic fallback", () => {
    expect(pageIdentityFor("/not-a-page")).toBeNull();
    expect(pageIdentityFor("")).toBeNull();
  });

  it("resolves a known path", () => {
    expect(pageIdentityFor("/payments")?.eyebrow).toBe("Payments");
  });
});
