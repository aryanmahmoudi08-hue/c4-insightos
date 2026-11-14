import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { upsertableUniqueKeys } from "./__test-support__/migration-columns";

/**
 * Every `.upsert(…, { onConflict: "…" })` in the app must name a unique
 * constraint or a NON-partial unique index that the migrations create.
 *
 * Postgres only infers a partial unique index for ON CONFLICT when the
 * statement repeats the index's WHERE clause, and PostgREST's upsert cannot.
 * An upsert aimed at one fails every time with 42P10 — which is how every
 * Calendly booking came to 500 in production with all tests green.
 */

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.|types\.ts$|routeTree\.gen/.test(name))
      out.push(p);
  }
  return out;
}

type Site = { file: string; line: number; table: string; cols: string };

function upsertSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(SRC)) {
    const text = readFileSync(file, "utf8");
    // Helpers like `const confirmationsTable = () => db.from("call_confirmations")`
    // stand in for a .from() at the call site.
    const helpers = new Map<string, string>();
    for (const h of text.matchAll(
      /const\s+(\w+)\s*=\s*\(\)\s*=>[^;]*?\.from\(\s*["'`]([a-z0-9_]+)["'`]/g,
    ))
      helpers.set(h[1], h[2]);
    const tableRef = new RegExp(
      [
        String.raw`\.from\(\s*["'\`]([a-z0-9_]+)["'\`]`,
        ...[...helpers.keys()].map((name) => String.raw`\b(${name})\(\)`),
      ].join("|"),
      "g",
    );
    for (const m of text.matchAll(/onConflict:\s*["'`]([^"'`]+)["'`]/g)) {
      const at = m.index ?? 0;
      // The table is the nearest .from("…") — or table helper call — before
      // this option.
      const before = text.slice(Math.max(0, at - 1500), at);
      const last = [...before.matchAll(tableRef)].at(-1);
      if (!last) continue;
      const hit = last.slice(1).find(Boolean)!;
      const table = helpers.get(hit) ?? hit;
      sites.push({
        file: relative(process.cwd(), file),
        line: text.slice(0, at).split("\n").length,
        table,
        cols: m[1]
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .sort()
          .join(","),
      });
    }
  }
  return sites;
}

describe("upsert ON CONFLICT targets", () => {
  const sites = upsertSites();

  it("finds the upserts it is meant to check", () => {
    expect(sites.length).toBeGreaterThan(10);
    expect(sites.some((s) => s.file.endsWith("calendly.ts") && s.table === "calls")).toBe(true);
  });

  it("each names a unique key Postgres can infer", () => {
    const bad = sites
      .filter((s) => !upsertableUniqueKeys(s.table).has(s.cols))
      .map((s) => `${s.file}:${s.line} ${s.table}(${s.cols})`);
    expect(bad).toEqual([]);
  });
});
