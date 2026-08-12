import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { ensureCurrentWorkspace } from "@/lib/workspace.functions";
import { DEV_BYPASS_ORG } from "@/lib/dev-mock-data";

type AuthCtx = { session: Session | null; user: User | null; loading: boolean; devBypass: boolean };
const Ctx = createContext<AuthCtx>({ session: null, user: null, loading: true, devBypass: false });

const DEV_BYPASS_KEY = "c4-dev-bypass";
const MOCK_DEV_USER = { id: "dev-bypass", email: "dev@local.test" } as unknown as User;

/**
 * Dev-only: skip real Supabase auth and drop straight into the app shell.
 * Sets a flag AuthProvider reads on mount, then the caller should navigate to /dashboard.
 * No-ops outside `import.meta.env.DEV`, and the flag/branch are dead code in prod builds.
 * NOTE: downstream data (org, leads, etc.) still requires a real Supabase session, so pages
 * will render with empty/zeroed data — this only bypasses the login *screen*.
 */
export function enableDevBypass() {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  sessionStorage.setItem(DEV_BYPASS_KEY, "1");
}

// Every requireSupabaseAuth-gated server fn throws this exact message under Dev Bypass —
// there's no real session to attach a Bearer token from. That's expected, not a bug, so
// swallow just that one toast instead of every call site special-casing devBypass itself.
const DEV_BYPASS_TOAST_SUPPRESS = /unauthorized:\s*no authorization header provided/i;
let devToastFilterInstalled = false;

function installDevBypassToastFilter() {
  if (devToastFilterInstalled || typeof window === "undefined") return;
  devToastFilterInstalled = true;
  const originalError = toast.error;
  toast.error = ((message: unknown, ...rest: unknown[]) => {
    const text = typeof message === "string" ? message : ((message as Error)?.message ?? "");
    if (DEV_BYPASS_TOAST_SUPPRESS.test(text)) {
      console.debug("[dev-bypass] suppressed toast:", text);
      return "";
    }
    return (originalError as (...a: unknown[]) => ReturnType<typeof toast.error>)(message, ...rest);
  }) as typeof toast.error;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Server always sees devBypass=false (no sessionStorage) — reading it synchronously
  // in a useState initializer made the client's first hydration render diverge from
  // the server-rendered HTML whenever the flag was set. Deferred to an effect, matching
  // the pattern already used correctly in use-theme.tsx / use-sidebar-collapsed.tsx.
  const [devBypass, setDevBypass] = useState(false);
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== "undefined" && sessionStorage.getItem(DEV_BYPASS_KEY) === "1") {
      setDevBypass(true);
    }
  }, []);
  const qc = useQueryClient();

  useEffect(() => {
    if (devBypass) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      qc.invalidateQueries();
    });
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    return () => subscription.unsubscribe();
  }, [qc, devBypass]);

  useEffect(() => {
    if (import.meta.env.DEV && devBypass) installDevBypassToastFilter();
  }, [devBypass]);

  if (devBypass) {
    return <Ctx.Provider value={{ session: null, user: MOCK_DEV_USER, loading: false, devBypass: true }}>{children}</Ctx.Provider>;
  }
  return <Ctx.Provider value={{ session, user: session?.user ?? null, loading, devBypass: false }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

export function useCurrentOrg() {
  const { user, devBypass } = useAuth();
  const ensureWorkspace = useServerFn(ensureCurrentWorkspace);
  return useQuery({
    queryKey: ["current-org", user?.id, devBypass],
    enabled: !!user,
    // Dev bypass never got a real Supabase session, so the real workspace server fn
    // (which requires a Bearer token) would just 401 — hand back a complete mock org instead.
    queryFn: () => (devBypass ? Promise.resolve(DEV_BYPASS_ORG) : ensureWorkspace()),
  });
}
