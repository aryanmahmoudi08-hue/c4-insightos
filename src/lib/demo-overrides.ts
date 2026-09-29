/**
 * Demo-only value overrides.
 *
 * Lets an admin retype any KPI figure while Mock Data is on, so a screenshot
 * can show a specific scenario without editing fixtures or touching the
 * database. Nothing here is ever consulted unless `demoMode` is true — see
 * `DemoEditableValue`, which is a pass-through otherwise.
 *
 * Values are stored as strings, not numbers, on purpose: the thing being
 * overridden is already formatted ("$58,800", "69.2%", "1.2M"), and reusing
 * the app's formatter would mean parsing a display string back into a figure
 * and re-formatting it. For a screenshot tool, what you typed is what you
 * want to see.
 *
 * localStorage, not the database: these are one person's throwaway demo
 * edits, not shared state, and they must never outlive the browser they were
 * made in or reach a real workspace.
 */

const KEY = "c4-demo-value-overrides";

export type DemoOverrides = Record<string, string>;

/**
 * Overrides are keyed by page + label rather than label alone. "Cash
 * Collected" appears on Main Hub, Payments and Closer; keying on the label
 * alone would make one edit silently change all three, which is confusing
 * mid-demo and impossible to undo selectively.
 */
export function overrideKey(pathname: string, label: string): string {
  return `${pathname}::${label}`;
}

export function readOverrides(): DemoOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Drop anything non-string rather than trusting the blob — this is
    // user-editable storage and a bad value would render as "[object Object]".
    const out: DemoOverrides = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeOverride(key: string, value: string): DemoOverrides {
  const next = readOverrides();
  const trimmed = value.trim();
  // An empty string clears rather than displaying a blank card — that is what
  // someone means when they select-all and delete.
  if (trimmed === "") delete next[key];
  else next[key] = trimmed;
  persist(next);
  return next;
}

export function clearOverrides(): void {
  persist({});
}

export function countOverrides(): number {
  return Object.keys(readOverrides()).length;
}

function persist(next: DemoOverrides) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    // Same-tab listeners: the storage event only fires in *other* tabs, so
    // without this a card would not repaint until the next navigation.
    window.dispatchEvent(new CustomEvent("c4-demo-overrides-changed"));
  } catch {
    /* private browsing, quota, or storage disabled — the demo still works,
       the edit just does not persist across a reload. */
  }
}

export const DEMO_OVERRIDES_EVENT = "c4-demo-overrides-changed";
export const DEMO_OVERRIDES_STORAGE_KEY = KEY;
