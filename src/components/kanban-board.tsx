import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";

export type KanbanColumnDef = {
  key: string;
  label: string;
  tone?: ChipTone;
};

/**
 * Shared kanban primitive — generalizes the board pattern hand-rolled across
 * Hiring, Clients renewal, and Content pipeline into one component. Handles
 * the grid layout, per-column drag-over/drop, header count+value badge, and
 * empty/loading states; callers supply per-card content via `renderCard`.
 */
export function KanbanBoard<T extends { id: string }>({
  columns,
  itemsByColumn,
  onDropItem,
  renderCard,
  sumBy,
  formatValue,
  loading,
  emptyHint = "Drop here",
  layout = "grid",
}: {
  columns: KanbanColumnDef[];
  itemsByColumn: Map<string, T[]>;
  onDropItem: (id: string, columnKey: string) => void;
  renderCard: (item: T) => ReactNode;
  /** Optional: summed per column for the header's count+value badge (e.g. contract value, cash). */
  sumBy?: (item: T) => number;
  formatValue?: (n: number) => string;
  loading?: boolean;
  emptyHint?: string;
  /** "grid" (default) wraps columns onto new rows at narrower viewports — fine
   * for boards with few columns (Clients renewal). "scroll" keeps every column
   * in one horizontally-scrolling row at a fixed width instead — for boards
   * with too many columns to wrap sensibly (Hiring's 7 stages). */
  layout?: "grid" | "scroll";
}) {
  const fmt = formatValue ?? ((n: number) => `$${Math.round(n / 100).toLocaleString()}`);
  return (
    <div
      className={cn(
        layout === "scroll"
          ? "flex gap-3 overflow-x-auto pb-2"
          : "grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3",
      )}
    >
      {columns.map((col) => {
        const rows = itemsByColumn.get(col.key) ?? [];
        const total = sumBy ? rows.reduce((s, r) => s + sumBy(r), 0) : null;
        return (
          <div
            key={col.key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id) onDropItem(id, col.key); }}
            className={cn(
              "rounded-lg border border-border bg-card min-h-[300px]",
              layout === "scroll" && "w-72 shrink-0",
            )}
          >
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <span className={cn("text-3xs uppercase tracking-wider rounded px-1.5 py-0.5", CHIP_TONE_CLASSES[col.tone ?? "default"])}>{col.label}</span>
              <span className="text-3xs font-mono text-muted-foreground">{rows.length}{total !== null ? ` · ${fmt(total)}` : ""}</span>
            </div>
            <div className="p-2 space-y-2">
              {rows.map((item) => (
                <KanbanCard key={item.id} id={item.id}>{renderCard(item)}</KanbanCard>
              ))}
              {!loading && rows.length === 0 && (
                <div className="rounded-md border border-dashed border-border/70 text-2xs text-muted-foreground text-center py-6">
                  {emptyHint}
                </div>
              )}
              {loading && rows.length === 0 && <div className="text-2xs text-muted-foreground text-center py-6">Loading…</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Draggable card wrapper — consistent interactive treatment (hover/press) for any kanban card content. */
export function KanbanCard({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", id)}
      className={cn(
        "cursor-grab active:cursor-grabbing rounded-md border border-border bg-background p-2 hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.97] active:opacity-70",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Standard card anatomy — title, 1-2 metadata lines, optional status chip, optional
 * warning icon (the at-risk triangle pattern from Clients, generalized). Not mandatory:
 * boards with bespoke layouts can skip this and build `renderCard` content directly.
 */
export function KanbanCardAnatomy({ title, metaLines = [], chip, warning }: {
  title: ReactNode;
  metaLines?: ReactNode[];
  chip?: ReactNode;
  warning?: string;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm leading-tight min-w-0 truncate">{title}</div>
        {warning && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
      </div>
      {metaLines.map((line, i) => (
        <div key={i} className="text-3xs text-muted-foreground mt-0.5">{line}</div>
      ))}
      {chip && <div className="mt-1.5">{chip}</div>}
      {warning && <div className="mt-1 text-3xs text-destructive">{warning}</div>}
    </>
  );
}
