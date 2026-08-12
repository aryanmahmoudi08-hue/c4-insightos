import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "c4-sidebar-collapsed";

type Ctx = { collapsed: boolean; setCollapsed: (v: boolean) => void; toggle: () => void };
const SidebarCollapsedCtx = createContext<Ctx>({ collapsed: false, setCollapsed: () => {}, toggle: () => {} });

/** Icon-rail collapse state for the sidebar (B6) — persisted, shared between AppSidebar and the authenticated layout's main-content margin. */
export function SidebarCollapsedProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    if (stored === "1") setCollapsedState(true);
  }, []);

  const setCollapsed = (v: boolean) => {
    setCollapsedState(v);
    try { window.localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* ignore */ }
  };

  return (
    <SidebarCollapsedCtx.Provider value={{ collapsed, setCollapsed, toggle: () => setCollapsed(!collapsed) }}>
      {children}
    </SidebarCollapsedCtx.Provider>
  );
}

export const useSidebarCollapsed = () => useContext(SidebarCollapsedCtx);
