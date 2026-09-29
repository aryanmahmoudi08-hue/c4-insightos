import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { DEMO_OVERRIDES_EVENT, readOverrides, writeOverride } from "@/lib/demo-overrides";

/**
 * Click-to-edit for *any* figure on the page, while Mock Data is on.
 *
 * `DemoEditableValue` covers KPI cards, which all render through MetricCard.
 * This covers everything else — table cells, badges, chart labels, the counts
 * in section headers — by working at the DOM level instead of the component
 * level, because there is no shared component behind "every number in the
 * app" to wrap.
 *
 * Renders nothing. Mounted once inside the authenticated layout.
 */

/** Text that is worth offering to edit: contains a digit, and is short enough
 *  to be a figure rather than a sentence that happens to include a number. */
function looksLikeFigure(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 24) return false;
  return /\d/.test(t);
}

/**
 * Write `value` into the element's own text, leaving element children alone.
 *
 * Not `textContent = value`: a badge like "69.2% set rate" holds a <span> for
 * its status dot next to the text, and replacing textContent deletes the dot —
 * visible in a screenshot as one chip missing the marker every other chip has.
 * React re-renders the full badge on every load, so swapping only the text node
 * restores the icon for free.
 */
function applyText(el: Element, value: string): void {
  const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
  if (textNodes.length === 0) {
    if (el.textContent !== value) el.textContent = value;
    return;
  }
  if (textNodes[0].textContent !== value) textNodes[0].textContent = value;
  // Any further text nodes belonged to the old value and would otherwise be
  // appended after the replacement.
  for (const n of textNodes.slice(1)) if (n.textContent !== "") n.textContent = "";
}

/** Text belonging directly to this element, ignoring text inside child
 *  elements — what distinguishes "renders a number" from "contains one". */
function ownText(el: Element): string {
  let out = "";
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
  }
  return out;
}

/**
 * A positional path from the app root, used as the storage key.
 *
 * Deliberately positional rather than id- or text-based: these pages render
 * deterministically from fixtures under Mock Data, so the same cell is at the
 * same position on every load, while an id does not exist and the text is the
 * very thing being changed.
 */
function domPath(el: Element, root: Element): string | null {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    const parent: Element | null = cur.parentElement;
    if (!parent) return null;
    parts.unshift(`${cur.tagName.toLowerCase()}:${Array.from(parent.children).indexOf(cur)}`);
    cur = parent;
  }
  return parts.length ? parts.join(">") : null;
}

function resolvePath(path: string, root: Element): Element | null {
  let cur: Element | null = root;
  for (const part of path.split(">")) {
    if (!cur) return null;
    const idx = Number(part.slice(part.lastIndexOf(":") + 1));
    cur = cur.children[idx] ?? null;
  }
  return cur;
}

export function DemoEditAnything() {
  const { demoMode } = useDemoMode();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!demoMode || typeof document === "undefined") return;
    const root = document.body;

    // Re-apply saved edits after every render pass. React owns this DOM and
    // will overwrite textContent whenever it re-renders, so a one-shot pass on
    // mount would survive only until the next state change.
    const apply = () => {
      const all = readOverrides();
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(`${pathname}##`)) continue;
        const el = resolvePath(key.slice(pathname.length + 2), root);
        if (el) applyText(el, value);
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Leave the MetricCard path to DemoEditableValue, and never hijack a
      // real control the operator needs in order to navigate the demo.
      if (target.closest("input, textarea, select, [data-demo-editable]")) return;
      // The test is whether this element renders the figure *itself* — i.e.
      // has its own direct text nodes containing a digit — not whether it is
      // a childless leaf. A badge like "69.2% set rate" holds a <span> for its
      // status dot alongside the text, and a leaf-only rule skipped it. A
      // layout container, by contrast, has no direct text of its own (all of
      // it lives in children), so it is still excluded and the whole card
      // can never be typed over.
      if (!looksLikeFigure(ownText(target))) return;

      const path = domPath(target, root);
      if (!path) return;

      // Take the click before the card's own onClick fires, so editing a
      // number never also triggers a drill-down navigation. Clicks anywhere
      // else on the same card still navigate normally.
      e.preventDefault();
      e.stopPropagation();

      const el = target as HTMLElement;
      const before = el.textContent ?? "";
      el.contentEditable = "true";
      el.style.outline = "1px dashed rgba(251,191,36,0.8)";
      el.focus();
      // Select the existing text so typing replaces it.
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const finish = (commit: boolean) => {
        el.contentEditable = "false";
        el.style.outline = "";
        el.removeEventListener("blur", onBlur);
        el.removeEventListener("keydown", onKey);
        if (commit) writeOverride(`${pathname}##${path}`, el.textContent ?? "");
        else el.textContent = before;
      };
      const onBlur = () => finish(true);
      const onKey = (ev: KeyboardEvent) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          el.blur();
        }
        if (ev.key === "Escape") {
          finish(false);
        }
      };
      el.addEventListener("blur", onBlur);
      el.addEventListener("keydown", onKey);
    };

    // Capture phase, so this runs before React's own delegated handlers.
    document.addEventListener("click", onClick, true);
    window.addEventListener(DEMO_OVERRIDES_EVENT, apply);

    // React re-renders wipe textContent; re-apply when the tree changes.
    const observer = new MutationObserver(() => apply());
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    apply();

    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(DEMO_OVERRIDES_EVENT, apply);
      observer.disconnect();
    };
  }, [demoMode, pathname]);

  return null;
}
