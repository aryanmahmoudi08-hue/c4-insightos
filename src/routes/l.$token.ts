import { createFileRoute } from "@tanstack/react-router";

/**
 * Public click-tracking redirect: /l/<token> -> the real destination.
 *
 * A server handler rather than a React route on purpose. The visitor is a
 * prospect who clicked a link in a DM; they should land on the destination
 * with one 302, not download a JS bundle to be redirected by the client. It
 * also means the redirect still works with JS disabled and in link previews.
 *
 * Deliberately unauthenticated — the whole point is that the recipient has no
 * account. Recording goes through supabaseAdmin, the same posture as
 * daily_wins and the pre-call video resolve.
 */
export const Route = createFileRoute("/l/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        const { resolveTrackedLink, supabaseAdmin } = await import("@/lib/tracked-links.server");

        let resolved;
        try {
          resolved = await resolveTrackedLink(supabaseAdmin, params.token, {
            referrer: request.headers.get("referer"),
            userAgent: request.headers.get("user-agent"),
          });
        } catch (e) {
          // A lookup failure must not strand the visitor on an error page —
          // they are a prospect, not an operator. Send them somewhere real
          // and leave the diagnosis in the logs.
          console.error("[tracked-links] resolve failed", e);
          return Response.redirect(`${origin}/?link=error`, 302);
        }

        if (!resolved.found || !resolved.destinationUrl) {
          return Response.redirect(`${origin}/?link=expired`, 302);
        }

        // 302, not 301: a permanent redirect would be cached by the browser
        // and every subsequent click would skip this handler entirely, so the
        // click count would silently stop incrementing after the first visit.
        return Response.redirect(resolved.destinationUrl, 302);
      },
    },
  },
});
