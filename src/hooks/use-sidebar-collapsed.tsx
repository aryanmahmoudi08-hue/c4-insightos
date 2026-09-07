import { createContext, useContext, useState, type ReactNode } from "react";

type Ctx = { collapsed: boolean; setCollapsed: (v: boolean) => void; toggle: () => void };
const SidebarCollapsedCtx = createContext<Ctx>({
  collapsed: true,
  setCollapsed: () => {},
  toggle: () => {},
});

/**
 * Icon-rail collapse state for the sidebar — shared between AppSidebar and
 * the authenticated layout's main-content margin. Always starts collapsed
 * on every page load, with no persisted override: the manual pin button
 * still lets a user expand it for the current view/session (in-memory
 * state), but that choice does not carry across reloads/navigation resets —
 * "collapsed on load" must hold consistently, not just until the first
 * manual toggle. A hover/focus expansion on top of this is separate,
 * transient UI state owned by AppSidebar.
 */
export function SidebarCollapsedProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <SidebarCollapsedCtx.Provider
      value={{ collapsed, setCollapsed, toggle: () => setCollapsed(!collapsed) }}
    >
      {children}
    </SidebarCollapsedCtx.Provider>
  );
}

export const useSidebarCollapsed = () => useContext(SidebarCollapsedCtx);
