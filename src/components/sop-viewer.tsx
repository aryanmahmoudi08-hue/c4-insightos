import { useState } from "react";
import { Lightbulb, TriangleAlert, Info, ShieldAlert, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SopBlock, SopDoc } from "@/lib/sop-types";

const CALLOUT_STYLE: Record<
  "tip" | "warning" | "info" | "danger",
  { icon: typeof Lightbulb; classes: string; label: string }
> = {
  tip: {
    icon: Lightbulb,
    classes:
      "border-[color:var(--color-success)]/30 bg-[color:var(--color-success)]/[0.06] text-[color:var(--color-success)]",
    label: "Tip",
  },
  warning: {
    icon: TriangleAlert,
    classes:
      "border-[color:var(--color-warning)]/30 bg-[color:var(--color-warning)]/[0.06] text-[color:var(--color-warning)]",
    label: "Careful",
  },
  info: {
    icon: Info,
    classes: "border-accent/30 bg-accent/[0.06] text-accent",
    label: "Note",
  },
  danger: {
    icon: ShieldAlert,
    classes: "border-destructive/30 bg-destructive/[0.06] text-destructive",
    label: "Never do this",
  },
};

function Block({ block }: { block: SopBlock }) {
  switch (block.type) {
    case "heading":
      return block.level === 2 ? (
        <h3
          id={block.id}
          className="scroll-mt-24 mt-8 text-base font-semibold text-foreground first:mt-0"
        >
          {block.text}
        </h3>
      ) : (
        <h4 id={block.id} className="scroll-mt-24 mt-5 text-sm font-semibold text-foreground/90">
          {block.text}
        </h4>
      );
    case "paragraph":
      return <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{block.text}</p>;
    case "callout": {
      const style = CALLOUT_STYLE[block.tone];
      const Icon = style.icon;
      return (
        <div className={cn("mt-3 flex gap-2.5 rounded-lg border p-3", style.classes)}>
          <Icon className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <div className="font-semibold uppercase tracking-wide text-3xs mb-0.5">
              {block.title ?? style.label}
            </div>
            <div className="text-foreground/90">{block.text}</div>
          </div>
        </div>
      );
    }
    case "steps":
      return (
        <ol className="mt-3 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-foreground/90">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-3xs font-bold font-sans tabular-nums text-accent mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul className="mt-3 space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "screenshot":
      return (
        <figure className="mt-4">
          <div
            className={cn(
              "overflow-hidden rounded-lg border border-border bg-card",
              block.variant === "mobile" ? "max-w-[280px]" : "max-w-full",
            )}
          >
            <img src={block.src} alt={block.alt} className="w-full h-auto block" loading="lazy" />
          </div>
          {block.caption && (
            <figcaption className="mt-1.5 text-2xs text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "table":
      return (
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left p-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-t border-border/70">
                  {row.map((cell, j) => (
                    <td key={j} className="p-2.5 text-foreground/90">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "faq":
      return (
        <div className="mt-3 space-y-2">
          {block.items.map((item, i) => (
            <FaqRow key={i} q={item.q} a={item.a} />
          ))}
        </div>
      );
    case "divider":
      return <div className="my-6 h-px bg-border" />;
  }
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-card/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium text-foreground"
      >
        {q}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="px-3 pb-3 text-sm leading-relaxed text-muted-foreground">{a}</div>}
    </div>
  );
}

/**
 * Renders one role's SOP — a sticky in-page table of contents (desktop)
 * alongside the full document. Every section gets its own scroll-anchored
 * id so the TOC and any deep link land in the right place.
 */
export function SopViewer({ doc }: { doc: SopDoc }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav className="hidden lg:block">
        <div className="sticky top-24 space-y-0.5 rounded-lg border border-border bg-card/60 p-3">
          <div className="mb-2 px-1 text-3xs font-semibold uppercase tracking-wider text-muted-foreground">
            On this page
          </div>
          {doc.sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="block truncate rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            >
              {s.title}
            </a>
          ))}
        </div>
      </nav>
      <div className="min-w-0 space-y-10">
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <div className="mb-1 flex items-center gap-2">
              <div className="eyebrow">— {s.title}</div>
              <div className="h-px flex-1 bg-border" />
            </div>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
