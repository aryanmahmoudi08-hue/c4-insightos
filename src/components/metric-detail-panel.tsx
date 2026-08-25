import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GlassTableShell } from "@/components/glass-table";
import type { Derivation } from "@/lib/funnel-derivation";

export interface DetailColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

/**
 * Click-any-metric detail panel — always the same three sections, in the
 * same order: (a) the real rows that produced the number, (b) what's capping
 * it, (c) what's working. (b)/(c) are `Derivation`s from
 * src/lib/funnel-derivation.ts — deterministic arithmetic with an explicit
 * "not enough data" state, never a plausible-sounding guess. This component
 * only renders what it's given; it has no fallback narrative of its own.
 */
export function MetricDetailPanel<T>({
  open, onOpenChange, title, subtitle, columns, rows, rowKey, cap, working, emptyRowsLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  subtitle?: string;
  columns: DetailColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  cap: Derivation;
  working: Derivation;
  emptyRowsLabel?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="pr-8 leading-snug">{title}</SheetTitle>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </SheetHeader>
        <div className="mt-4 space-y-5 text-sm">
          <DetailSection title="What produced this">
            <GlassTableShell maxHeight="320px">
              <table className="w-full text-xs">
                <thead className="sticky-thead bg-muted/40 text-3xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key} className={c.align === "right" ? "p-2 text-right font-mono" : "p-2 text-left"}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={rowKey(r)} className="border-t border-border/70">
                      {columns.map((c) => (
                        <td key={c.key} className={c.align === "right" ? "p-2 text-right font-mono" : "p-2"}>{c.render(r)}</td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={columns.length} className="p-6 text-center text-muted-foreground">{emptyRowsLabel ?? "No rows in range."}</td></tr>
                  )}
                </tbody>
              </table>
            </GlassTableShell>
          </DetailSection>

          <DetailSection title="What's capping it">
            <DerivationText d={cap} />
          </DetailSection>

          <DetailSection title="What's working">
            <DerivationText d={working} />
          </DetailSection>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-3xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function DerivationText({ d }: { d: Derivation }) {
  // "Not enough data" is a neutral state, not a warning — never destructive/red styling.
  return <p className={d.status === "insufficient_data" ? "text-muted-foreground italic" : "text-foreground"}>{d.sentence}</p>;
}
