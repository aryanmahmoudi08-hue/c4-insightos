import { useState } from "react";
import { Input } from "@/components/ui/input";

export type DateRange = { from: string; to: string; label: string };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export const RANGES = {
  today: (): DateRange => ({ from: today(), to: today(), label: "Today" }),
  last7: (): DateRange => ({ from: daysAgo(6), to: today(), label: "Last 7d" }),
  last30: (): DateRange => ({ from: daysAgo(29), to: today(), label: "Last 30d" }),
  mtd: (): DateRange => { const d = new Date(); const f = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); return { from: f, to: today(), label: "MTD" }; },
  all: (): DateRange => ({ from: "2000-01-01", to: today(), label: "All time" }),
};

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [custom, setCustom] = useState(false);
  const presets: { key: keyof typeof RANGES; label: string }[] = [
    { key: "today", label: "Today" }, { key: "last7", label: "7d" },
    { key: "last30", label: "30d" }, { key: "mtd", label: "MTD" }, { key: "all", label: "All" },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/30 p-0.5">
        {presets.map(p => {
          const active = value.label === RANGES[p.key]().label && !custom;
          return (
            <button key={p.key} type="button"
              onClick={() => { setCustom(false); onChange(RANGES[p.key]()); }}
              className={`rounded-full px-2.5 py-1 text-2xs font-medium transition-all ${active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setCustom(true)}
          className={`rounded-full px-2.5 py-1 text-2xs font-medium transition-all ${custom ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Custom
        </button>
      </div>
      {custom && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">From</span>
          <Input type="date" defaultValue={value.from} className="h-7 w-36 text-xs"
            onChange={(e) => onChange({ ...value, from: e.target.value, label: "Custom" })} />
          <span className="text-muted-foreground">To</span>
          <Input type="date" defaultValue={value.to} className="h-7 w-36 text-xs"
            onChange={(e) => onChange({ ...value, to: e.target.value, label: "Custom" })} />
        </div>
      )}
      <span className="text-2xs text-muted-foreground font-mono">{value.from} → {value.to}</span>
    </div>
  );
}
