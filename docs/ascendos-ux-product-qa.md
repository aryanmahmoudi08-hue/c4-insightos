# AscendOS — Final UX/Product QA

Research/QA document (Prompt 10). Hands-on walkthrough via the dev server + Dev Bypass, covering
navigation, dashboards, visual system, and responsive behavior — desktop and mobile (375px). No
fixes applied, no commit/push.

## Environment constraint — disclosed up front, not glossed over

This sandbox's local Supabase stack requires Docker (`supabase status` confirmed:
`Cannot connect to the Docker daemon`), which isn't running here. Every page that queries
Supabase directly from the browser hit `net::ERR_CONNECTION_REFUSED` against
`127.0.0.1:54321` — some pages showed real-looking numbers anyway (stale TanStack Query cache
from an earlier session in the same browser tab), others showed genuine empty/zero states. That
mix isn't reliable evidence of anything either way, so **live-data correctness was not fully
re-verifiable in this pass**. Instead, this QA relied on: (1) **Demo/Preview Data mode**
(`c4-demo-preview-mode` in `localStorage`) — a real, deterministic fixture path several pages
already support and honestly self-label ("Demo Data Active — everything below is a deterministic
fixture, not real data"), and (2) structural checks that don't need live data: navigation
integrity, page-shell rendering, visual system consistency, responsive layout, and console errors
with the connectivity noise filtered out. Say so explicitly, per the standing rule for UI
verification, rather than implying a full live-data pass happened.

## What holds up

1. **Every top-level nav destination resolves and renders** — Home, Main, Sales, Rep Dash, Team,
   Mentees, Payments, Content, Analytics, Client DNA, System, Help all loaded real page shells
   with no crashes, no 404s, no dead links. Sub-navigation (flyout panels under each top-level
   icon) matches the taxonomy `CLAUDE.md` describes, reorganized since that file was written
   (e.g. the "Reps" sub-group now lives under its own "Rep Dash" top-level icon rather than under
   Sales) — a real, consistent restructuring, not a broken migration.
2. **No genuine JavaScript/React errors surfaced anywhere** — every console error across the
   entire walkthrough traced to the one root cause above (`ERR_CONNECTION_REFUSED` to a local
   Supabase that isn't running), not application exceptions.
3. **Honest empty/unavailable states are real and consistent with the whole remediation's
   findings** — Main Hub's "Paid Ad Performance" tiles show "Not tracked" with the real reason
   ("No traffic-source attribution connected yet"); Webinar Analytics' Cash Collected/Ad Cash
   Collected tiles show "—" with "Requires linking webinar leads to a closed call's cash
   collected" / "Requires a paid-vs-organic split of cash collected, per lead" — this is the
   `NEEDS INTEGRATION` reality from Prompts 5/6/9, correctly reflected in the live UI, not
   glossed over.
4. **Prompt 6's documented ingestion platform has a real, live admin surface** — System → Event
   Bus & Webhooks renders genuine sections for Connector Sync Status, Raw Ingestion Payloads,
   Webhook Subscriptions, and Webhook Deliveries — confirming those tables aren't just backend
   schema, there's already a working UI over them.
5. **The Payments page redesign already appears substantially implemented.** This wasn't
   something Prompt 10 set out to check, but it's directly relevant: the stat-card row shows
   both "This range" and honestly-labeled "not scoped to date range" cards, and scrolling down
   reveals a live **"Payment Operations → Payment Notifications"** section explicitly labeled
   "Live, computed from real payment/schedule/recovery records — not a persisted alert log" —
   matching the plan on file for this page almost verbatim (its §F). **Worth flagging to you
   directly**: if that plan document is still sitting as a to-do, it may already be done — worth
   checking against the real page before treating it as pending work.
6. **Mobile layout (375px) is generally solid** — single-column stacking, no overlapping
   elements, a working full-screen hamburger nav drawer with properly-sized touch targets, and
   the Payments page's stat cards actually wrap their labels to two lines at this width rather
   than truncating (see finding A below for the inconsistency this creates elsewhere).

## Real findings

### A. KPI card label truncation is inconsistent across the design system

Some card components truncate long labels with an ellipsis; others wrap to two lines. Examples
truncated: Home's "Business Health" row ("CASH COLL…"), "Team & Hiring" row ("HIRING — NEEDS
GR…", "HIRING — INTERVIE…") — reproduced at both desktop and mobile width. Examples that wrap
instead: Payments page's "TOTAL COLLECTED" / "TOTAL CONTRACTED" / "TOTAL OUTSTANDING" / "FAILED &
AT-RISK" cards render full text on two lines at the same 375px width. One instance cut off
substantive content, not just a label word: the mobile Payment Notifications list showed "Payment
plan ending so…" with the client's name lost entirely. Not a crash — a design-system consistency
gap between two different card treatments in the same app.

### B. Mobile nav drawer doesn't auto-close after selecting a top-level destination

Tapping a top-level icon with no sub-items (e.g. "Payments") in the mobile hamburger drawer
switches the active-item highlight but leaves the full-screen drawer open over a blurred
background — the destination page is rendered underneath but hidden until the user explicitly
taps the "X". Reproduced twice (Home → Payments transition). Real, minor friction on the primary
mobile navigation path — most mobile nav patterns auto-dismiss after a selection with no further
choices to make.

### C. The Event Bus documentation UI is one event-type behind Prompt 7's own change

`src/routes/_authenticated.events.tsx` (~lines 529–619) hardcodes the list of documented payload
schemas shown under "Payload schemas by event type" on the Ingest Endpoint card: Closer call, DM
setter day, Inbound dialer day, Content post, Onboarding response. Prompt 7 added a 6th real,
working event type (`vsl_metric_snapshot`) to the same endpoint
(`src/routes/api/public/ingest.$token.ts`) — this documentation UI wasn't updated to match, so
the endpoint now silently supports more than its own in-app documentation shows. A small, direct
follow-up from that earlier change; flagged rather than fixed here per this pass's own scope.

### D. Brief mid-navigation render glitch, not reproducible as a persistent bug

On 2 of roughly 10 navigations, the page briefly rendered with the main content clipped hard to
the right edge and a large blank gap on the left (as if a closing side panel hadn't finished
collapsing) before settling into the correct layout about 2 seconds later. Every occurrence
resolved on its own without interaction. Likely a CSS transition/hydration timing artifact rather
than a functional defect — noted since a slower device could make this more visible to a real
user, not because it broke anything observed here.

## Bottom line

Navigation is complete and consistent, honest-empty-state discipline (the core value of this
entire remediation) is genuinely reflected live in the product, and mobile layout holds up
structurally. Four real findings, all cosmetic/UX polish rather than functional breakage — none
block anything, and none were silently fixed here. Live-data runtime correctness (as opposed to
structure/navigation/responsiveness) couldn't be fully re-verified in this specific sandbox due
to the missing local Supabase/Docker dependency — flagged rather than assumed.

No code changes. No commit/push.
