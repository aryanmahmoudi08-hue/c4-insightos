import { useState, useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Glass chrome around a `<table>`: optional toolbar (search/filter pills go here — the
 * caller owns that state), a scroll container with a sticky header (apply `.sticky-thead`
 * to the table's own `<thead>`), and a footer slot for pagination.
 */
export function GlassTableShell({ toolbar, footer, maxHeight = "60vh", children }: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
  children: ReactNode;
}) {
  return (
    <div className="glass overflow-hidden rounded-xl border shadow-md">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/20 px-3 py-2.5">{toolbar}</div>}
      <div className="overflow-auto" style={{ maxHeight }}>
        {children}
      </div>
      {footer && <div className="border-t border-border/70 bg-muted/10 px-3 py-2">{footer}</div>}
    </div>
  );
}

/** Search input styled for a GlassTableShell toolbar. */
export function TableSearch({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative flex-1 min-w-[160px] max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-input bg-input/40 pl-8 pr-3 text-xs outline-none transition-all hover:border-ring/30 focus:border-ring focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

/** Single-select status filter pill row for a GlassTableShell toolbar. */
export function FilterPills<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
            value === o.key
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
          )}
        >
          {o.label}{o.count !== undefined && <span className="ml-1 opacity-70">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageCount, onPage, total, pageSize }: {
  page: number; pageCount: number; onPage: (p: number) => void; total: number; pageSize: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] font-mono text-muted-foreground">{from}–{to} of {total}</div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground transition-all hover:border-ring/40 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 text-[11px] font-mono text-muted-foreground">{page} / {Math.max(1, pageCount)}</span>
        <button type="button" disabled={page >= pageCount} onClick={() => onPage(page + 1)}
          className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground transition-all hover:border-ring/40 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Client-side pagination over an already-filtered array. */
export function usePagination<T>(rows: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(() => rows.slice((safePage - 1) * pageSize, safePage * pageSize), [rows, safePage, pageSize]);
  return { page: safePage, setPage, pageCount, paged, total: rows.length, pageSize };
}
