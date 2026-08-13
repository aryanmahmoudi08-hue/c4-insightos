import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, createRootRouteWithContext, useRouter, HeadContent, Scripts, Link,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider, themeBootstrapScript } from "@/hooks/use-theme";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="font-mono text-6xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Route not found.</p>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">Back to command center</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold">Something broke</h1>
        <p className="mt-2 text-xs text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Retry</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "C4 InsightOS" },
      { name: "description", content: "Business intelligence command center for high-ticket coaching & info-product operators." },
      { property: "og:title", content: "C4 InsightOS" },
      { name: "twitter:title", content: "C4 InsightOS" },
      { property: "og:description", content: "Business intelligence command center for high-ticket coaching & info-product operators." },
      { name: "twitter:description", content: "Business intelligence command center for high-ticket coaching & info-product operators." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zvc72oMCDcYGSMIKqrxsMA8TLup2/social-images/social-1779172160305-Gemini_Generated_Image_t34nyft34nyft34n_(1).webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/zvc72oMCDcYGSMIKqrxsMA8TLup2/social-images/social-1779172160305-Gemini_Generated_Image_t34nyft34nyft34n_(1).webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is scoped to this element's own attributes only
    // (React doesn't propagate it to children) — needed because
    // themeBootstrapScript below runs before hydration and can flip this
    // className to "light" per localStorage, intentionally diverging from the
    // server's always-"dark" markup to avoid a flash of the wrong theme. That
    // divergence is deliberate, but without this it read as a genuine
    // hydration mismatch on every route whenever the stored theme was light
    // (backfill sweep caught it — every one of the 25 routes tested light,
    // zero tested dark before this).
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useViewTransitionGuard();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster position="top-right" />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * router.tsx's `defaultViewTransition: true` calls the native
 * `document.startViewTransition()` on every route change (router-core's own
 * `startViewTransition` wrapper — see node_modules/@tanstack/router-core —
 * neither awaits nor catches it). In real browser conditions the native call
 * can reject with `InvalidStateError: Transition was aborted because of
 * invalid state` (e.g. the tab loses visibility mid-navigation, or a second
 * transition starts before the first settles) — uncaught, that surfaces as a
 * console error on navigation. Wrapping the native API here degrades that
 * specific failure to an instant route swap — the same behavior as an
 * unsupported browser — instead of erroring, without disabling the cross-fade
 * for the normal case.
 *
 * Deliberately narrow: `updateCallbackDone` is NOT swallowed. That promise
 * rejects only if the update callback itself throws — i.e. a real bug in the
 * route-change logic (React state commits, route match handlers) — and that
 * must stay visible, not get silently absorbed along with the browser-level
 * transition failure. `ready`/`finished` reject either for transition-
 * mechanics reasons (tab hidden, overlapping transitions — the actual target
 * of this guard) or because `updateCallbackDone` rejected; in the latter case
 * the real error already surfaces via `updateCallbackDone` above, so
 * silencing `ready`/`finished` never hides anything, only the redundant
 * mechanical rejection. The synchronous catch is scoped to the two
 * browser-defined exceptions this actually happens as, not `catch {}` on
 * anything the native call might throw.
 */
function useViewTransitionGuard() {
  useEffect(() => {
    if (typeof document === "undefined" || typeof document.startViewTransition !== "function") return;
    const native = document.startViewTransition.bind(document);
    const noopTransition = (): ViewTransition => ({
      ready: Promise.resolve(),
      updateCallbackDone: Promise.resolve(),
      finished: Promise.resolve(),
      skipTransition() {},
      types: new Set(),
    });
    document.startViewTransition = ((cb?: ViewTransitionUpdateCallback | StartViewTransitionOptions) => {
      const update = typeof cb === "function" ? cb : cb?.update;
      try {
        const vt = native(cb as never);
        vt.ready.catch(() => {});
        vt.finished.catch(() => {});
        return vt;
      } catch (err) {
        if (err instanceof DOMException && (err.name === "InvalidStateError" || err.name === "NotSupportedError")) {
          update?.();
          return noopTransition();
        }
        throw err;
      }
    }) as typeof document.startViewTransition;
    return () => { document.startViewTransition = native; };
  }, []);
}
