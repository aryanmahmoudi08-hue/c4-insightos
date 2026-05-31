import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RANGES, type DateRange } from "@/components/date-range-picker";

type Ctx = { range: DateRange; setRange: (r: DateRange) => void };
const DateRangeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "c4_date_range_v1";

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(() => {
    if (typeof window === "undefined") return RANGES.last30();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DateRange;
        if (parsed?.from && parsed?.to && parsed?.label) return parsed;
      }
    } catch { /* ignore */ }
    return RANGES.last30();
  });

  const setRange = (r: DateRange) => {
    setRangeState(r);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setRangeState(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <DateRangeCtx.Provider value={{ range, setRange }}>{children}</DateRangeCtx.Provider>;
}

export function useDateRange(): Ctx {
  const ctx = useContext(DateRangeCtx);
  if (!ctx) {
    // Safe fallback for components rendered outside the provider (e.g. login)
    const [range, setRange] = useState<DateRange>(RANGES.last30());
    return { range, setRange };
  }
  return ctx;
}
