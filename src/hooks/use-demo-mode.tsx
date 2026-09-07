import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "c4-demo-preview-mode";

/**
 * Demo / Preview Data mode — a user-toggleable UI preference, distinct from
 * `devBypass` (a login-bypass for testing without a real session). This
 * flag only ever changes what TWO features render: the Attribution Command
 * Center and Calls on Calendar (both explicitly scoped to participate in
 * this system). Every other page in the app ignores this flag entirely and
 * always queries real data — Main Hub, Mentees, Content Command Center,
 * VSL, Webinar, Team Calendar's Live Team Calendar section, and all revenue
 * reporting are untouched by this toggle.
 *
 * When on, the two participating pages swap their real Supabase queries for
 * a deterministic, hand-authored fixture dataset (`src/lib/demo-fixtures.ts`)
 * that is fed through the exact same downstream logic real data uses (the
 * canonical attribution engine, the confirmation-workflow derivations) — no
 * second engine, no database writes, no production rows touched.
 */
type Ctx = { demoMode: boolean; setDemoMode: (v: boolean) => void };
const DemoModeCtx = createContext<Ctx>({ demoMode: false, setDemoMode: () => {} });

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);

  useEffect(() => {
    try {
      setDemoModeState(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const setDemoMode = (v: boolean) => {
    setDemoModeState(v);
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return <DemoModeCtx.Provider value={{ demoMode, setDemoMode }}>{children}</DemoModeCtx.Provider>;
}

export const useDemoMode = () => useContext(DemoModeCtx);
