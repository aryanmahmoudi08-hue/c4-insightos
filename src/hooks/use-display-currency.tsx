import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DISPLAY_CURRENCIES, type DisplayCurrency } from "@/lib/currency";

const KEY = "c4-display-currency";

type Ctx = { currency: DisplayCurrency; setCurrency: (c: DisplayCurrency) => void };
const DisplayCurrencyCtx = createContext<Ctx>({ currency: "USD", setCurrency: () => {} });

/** Global display-currency preference (B — currency selector). USD stays the canonical/stored value everywhere; this only controls presentation. */
export function DisplayCurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<DisplayCurrency>("USD");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (stored && (DISPLAY_CURRENCIES as string[]).includes(stored)) {
      setCurrencyState(stored as DisplayCurrency);
    }
  }, []);

  const setCurrency = (c: DisplayCurrency) => {
    setCurrencyState(c);
    try {
      window.localStorage.setItem(KEY, c);
    } catch {
      /* ignore */
    }
  };

  return (
    <DisplayCurrencyCtx.Provider value={{ currency, setCurrency }}>
      {children}
    </DisplayCurrencyCtx.Provider>
  );
}

export const useDisplayCurrency = () => useContext(DisplayCurrencyCtx);
