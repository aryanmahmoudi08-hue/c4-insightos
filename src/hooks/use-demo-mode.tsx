import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "c4-demo-preview-mode";

/**
 * Demo / Preview Data mode — a user-toggleable UI preference, distinct from
 * `devBypass` (a login-bypass for testing without a real session). Each
 * surface opts in individually by branching on `demoMode` in its own
 * queries; participating surfaces currently include Main Hub, Attribution
 * Command Center, Calls on Calendar, Mentees, Closer, and DM Setter/Inbound
 * Dialer's primary range-scoped KPI queries. A handful of secondary,
 * independently-ranged instruments on those same pages (e.g. the Closer and
 * DM Setter/Inbound Dialer Leaderboards, Closer's Objections panel, the
 * Dialer's Speed to Lead card) deliberately do NOT swap to demo data —
 * those instruments instead disable their query and show an honest "not
 * connected"/"unavailable" state while Mock Data is on, rather than
 * silently leaking real org data next to demo KPIs. Check each surface's
 * own query for its exact scope rather than assuming this flag is
 * all-or-nothing per page.
 *
 * 2026-10 amendment: Webinar Analytics and VSL Analytics are the exception
 * to "dev-mock-data.ts fixtures are dev-bypass-only". `devBypass` is gated
 * on import.meta.env.DEV and so is permanently false in the deployed build,
 * which left both pages completely blank with Mock Data on — there was no
 * path to any fixture at all. They now read the same fixtures under either
 * flag. The leak this rule guards against does not apply there: those two
 * pages swap *every* one of their data sources together, so there is never
 * a demo figure sitting beside a real one. Writing is blocked while either
 * flag is on (see webinar-metrics-dialog.tsx), so a fixture can't be saved
 * into a real workspace.
 *
 * When a surface participates, it swaps its real Supabase queries for a
 * deterministic, hand-authored fixture dataset (`src/lib/demo-fixtures.ts`)
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
