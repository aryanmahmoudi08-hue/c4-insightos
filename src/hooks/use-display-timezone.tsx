import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "c4-display-timezone";

/** Common IANA zones for the Calls on Calendar timezone selector — display only. */
export const DISPLAY_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "UTC", label: "UTC" },
] as const;

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

type Ctx = { timezone: string; setTimezone: (tz: string) => void };
const DisplayTimezoneCtx = createContext<Ctx>({ timezone: "UTC", setTimezone: () => {} });

/**
 * Global display-timezone preference for Calls on Calendar. `calls.
 * scheduled_for` is a real UTC instant and is NEVER mutated by this — this
 * only controls which zone it's *rendered* in (same principle as
 * use-display-currency.tsx: canonical value stored once, presentation
 * layer converts). Leads have no stored timezone anywhere in the schema
 * (see activity-module.tsx's callback-scheduling comment) — that stays
 * honestly "Unavailable" regardless of this preference.
 */
export function DisplayTimezoneProvider({ children }: { children: ReactNode }) {
  const [timezone, setTimezoneState] = useState<string>("UTC");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    setTimezoneState(stored || browserTimezone());
  }, []);

  const setTimezone = (tz: string) => {
    setTimezoneState(tz);
    try {
      window.localStorage.setItem(KEY, tz);
    } catch {
      /* ignore */
    }
  };

  return (
    <DisplayTimezoneCtx.Provider value={{ timezone, setTimezone }}>
      {children}
    </DisplayTimezoneCtx.Provider>
  );
}

export const useDisplayTimezone = () => useContext(DisplayTimezoneCtx);
