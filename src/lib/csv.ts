/**
 * Shared CSV primitives. Extracted from vsl.functions.ts when webinar metrics
 * became a second real importer — one quoted-cell parser for the app, not two
 * that can drift apart on the same edge cases (escaped quotes, commas inside
 * quoted values).
 */

/** Split one CSV line, honouring quoted cells and "" escapes. */
export function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") {
        out.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** A cell as a number, tolerating thousands separators and a trailing %.
 * Non-numeric or empty reads as 0 — callers that need "absent" distinct from
 * "zero" should check the raw cell first (see csvOptionalNumber). */
export function csvNumber(value: string): number {
  if (!value) return 0;
  const n = parseFloat(value.replace(/[%,$]/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Null when the column is missing or the cell is blank — the distinction
 * matters for metric columns, where 0 is a real measurement and absent is not. */
export function csvOptionalNumber(cells: string[], index: number): number | null {
  if (index < 0) return null;
  const raw = cells[index];
  if (raw === undefined || raw.trim() === "") return null;
  return csvNumber(raw);
}

/** Normalize a header row and return a lookup that resolves any of several
 * accepted spellings to a column index (-1 when absent). Exact matches win
 * over substring matches, so a header of "sales" can't be captured by a
 * lookup for "upsell_sales" just because one contains the other. */
export function csvHeaderIndex(headerLine: string) {
  const header = parseCSVLine(headerLine).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
  return (keys: string[]) => {
    const exact = header.findIndex((h) => keys.some((k) => h === k));
    if (exact >= 0) return exact;
    return header.findIndex((h) => keys.some((k) => h.includes(k)));
  };
}
