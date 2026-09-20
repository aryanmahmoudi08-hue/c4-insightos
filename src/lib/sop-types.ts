/**
 * Content model for the Help / SOP library (one document per role). Content
 * is authored as structured data (see src/lib/sop/*.ts), not hand-written
 * JSX, so every role's document renders through the exact same visual
 * language (SopViewer) and stays easy to extend/re-order.
 */

export type SopBlock =
  | { type: "heading"; level: 2 | 3; text: string; id?: string }
  | { type: "paragraph"; text: string }
  /** A short, high-signal callout — a warning, a tip, a "why this matters." */
  | { type: "callout"; tone: "tip" | "warning" | "info" | "danger"; title?: string; text: string }
  /** Numbered walkthrough — "click X, then Y, then Z." */
  | { type: "steps"; items: string[] }
  /** Unordered reference list — not a sequence, just related facts. */
  | { type: "list"; items: string[] }
  | {
      type: "screenshot";
      src: string;
      alt: string;
      caption?: string;
      /** Defaults to "desktop" sizing; "mobile" renders narrower/centered. */
      variant?: "desktop" | "mobile";
    }
  | { type: "table"; headers: string[]; rows: string[][] }
  /** Collapsed-by-default Q&A entries, rendered as a disclosure list. */
  | { type: "faq"; items: { q: string; a: string }[] }
  | { type: "divider" };

export type SopSection = {
  id: string;
  title: string;
  blocks: SopBlock[];
};

export type SopDoc = {
  /** Matches DevPreviewKey from use-dev-preview-role.ts. */
  key: "admin" | "growth_ops" | "sales_manager" | "dm_setter" | "inbound_dialer" | "closer";
  roleTitle: string;
  tagline: string;
  sections: SopSection[];
};
