import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // No route defines a `loader` — every page fetches its own data client-side via
  // react-query inside the component. Without these defaults, QueryClient's own
  // defaults (staleTime: 0) mean every remount AND every window focus refetches
  // every active query from scratch, even when the data is seconds old.
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch a route's JS chunk on link hover/focus for snappier navigation.
    // No route uses a `loader`, so there's no data to preload yet — only code.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    // Cross-fade + upward-drift on route change (styles.css's ::view-transition-*
    // rules). Safely no-ops via the router's own `"startViewTransition" in
    // document` feature check on unsupported browsers.
    defaultViewTransition: true,
  });

  return router;
};
