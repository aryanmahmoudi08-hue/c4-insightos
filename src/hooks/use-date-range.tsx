import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { normalizeStoredRange, presetRange, type DateRange } from "@/lib/date-range";

type Ctx = { range: DateRange; setRange: (r: DateRange) => void };
const DateRangeCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "c4_date_range_v1";

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<DateRange>(() => {
    if (typeof window === "undefined") return presetRange("last30");
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // A stored preset is re-resolved against today rather than restored
      // verbatim: what gets persisted is the dates the rule produced when it
      // was clicked, so a tab reopened the next morning showed the "Today"
      // chip lit over yesterday's numbers. A custom range is kept as typed.
      if (raw) return normalizeStoredRange(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    return presetRange("last30");
  });

  const setRange = (r: DateRange) => {
    setRangeState(r);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          setRangeState(normalizeStoredRange(JSON.parse(e.newValue)));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <DateRangeCtx.Provider value={{ range, setRange }}>{children}</DateRangeCtx.Provider>;
}

export function useDateRange(): Ctx {
  const ctx = useContext(DateRangeCtx);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
