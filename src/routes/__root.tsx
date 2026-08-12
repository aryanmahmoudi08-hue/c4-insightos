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
    <html lang="en" className="dark">
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
 * console error on navigation. Wrapping the native API here degrades any
 * failure (sync throw or async rejection) to an instant route swap — the
 * same behavior as an unsupported browser — instead of erroring, without
 * disabling the cross-fade transition for the normal case.
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
      try {
        const vt = native(cb as never);
        vt.ready.catch(() => {});
        vt.updateCallbackDone.catch(() => {});
        vt.finished.catch(() => {});
        return vt;
      } catch {
        const update = typeof cb === "function" ? cb : cb?.update;
        update?.();
        return noopTransition();
      }
    }) as typeof document.startViewTransition;
    return () => { document.startViewTransition = native; };
  }, []);
}
