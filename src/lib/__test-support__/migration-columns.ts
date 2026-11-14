/**
 * The columns a table really has, read from `supabase/migrations`.
 *
 * Unit tests on a row builder pass happily while the builder writes a column
 * the database has never had — that is how every Calendly booking came to
 * fail with PGRST204 in production while its tests were green. This replays
 * the migrations' `create table` and `add column` / `drop column` statements
 * so a test can assert a builder's keys against the real schema, without a
 * database.
 *
 * Deliberately simple: it understands the statement shapes this repo uses,
 * not all of SQL. Test-only.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Split a create-table body on top-level commas (not ones inside parens). */
function topLevelParts(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

const CONSTRAINT_WORDS = new Set([
  "primary",
  "unique",
  "constraint",
  "foreign",
  "check",
  "exclude",
]);

export function tableColumnsFromMigrations(table: string): Set<string> {
  const cols = new Set<string>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const t = table.replace(/[^a-z0-9_]/gi, "");
  const createRe = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?"?${t}"?\\s*\\(`,
    "gi",
  );
  const alterRe = new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?(?:public\\.)?"?${t}"?\\s+([\\s\\S]*?);`,
    "gi",
  );

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8").replace(/--[^\n]*/g, "");

    for (const m of sql.matchAll(createRe)) {
      // Walk to the matching close paren.
      let depth = 1;
      let i = (m.index ?? 0) + m[0].length;
      const start = i;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "(") depth += 1;
        if (sql[i] === ")") depth -= 1;
        i += 1;
      }
      for (const part of topLevelParts(sql.slice(start, i - 1))) {
        const word = part.trim().split(/\s+/)[0]?.replace(/"/g, "").toLowerCase();
        if (word && !CONSTRAINT_WORDS.has(word)) cols.add(word);
      }
    }

    for (const m of sql.matchAll(alterRe)) {
      const body = m[1];
      for (const a of body.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi))
        cols.add(a[1].toLowerCase());
      for (const d of body.matchAll(/drop\s+column\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi))
        cols.delete(d[1].toLowerCase());
      for (const r of body.matchAll(
        /rename\s+column\s+"?([a-z0-9_]+)"?\s+to\s+"?([a-z0-9_]+)"?/gi,
      )) {
        cols.delete(r[1].toLowerCase());
        cols.add(r[2].toLowerCase());
      }
    }
  }
  return cols;
}
