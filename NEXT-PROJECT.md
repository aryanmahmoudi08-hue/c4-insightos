# C4 InsightOS — Rep Dashboard Polish + Lead Journey

**Send this AFTER the fabricated-thresholds project completes.** Lead Journey (Part 5)
should reuse the data-sufficiency gate that project builds, rather than reinventing it.

---

Five things. Parts 1-4 are finishing and elevating the rep dashboards; Part 5 is a
substantial new feature. The Spectrum Terminal design system and its data language
(cold blue = top of funnel, purple = mid, hot pink = cash/conversion) apply
throughout — extend it, don't deviate from it.

════════════════════════════════════════════════════════
PART 1 — REP DASHBOARD HEADER PARITY (kill the banner)
════════════════════════════════════════════════════════
/closer has a proper hero block: circular icon, "REP EFFICIENCY" eyebrow, serif
"Closer Dashboard" title, one-line description, status chips ("4 ACTIVE CLOSERS",
"46.8% CLOSE RATE"), then a divider and four inline stats with mini sparklines
(Calls Booked / Showed / Closed / Cash Collected). It also has a page-level date
range directly under the page title.

/dm-setter and /inbound-dialer have NEITHER. Instead they have a leftover
full-width white-to-grey gradient banner that just says "DM SETTER DASHBOARD" /
"INBOUND DIALER DASHBOARD" in centered caps. It carries no data, has no icon, no
description, no chips, and is visually from the pre-redesign era. It's the first
thing you see on both pages and it's the worst element in the app.

DELETE that banner entirely on both pages and build the /closer hero block in its
place, role-adapted (this was specified in Phase 3's C1 and never got built):
- DM Setter — eyebrow "REP EFFICIENCY", title "DM Setter Dashboard", description
  "Per-rep daily DM outreach activity". Chips: "N ACTIVE SETTERS" + "X% SET RATE".
  Inline stats: Leads Contacted · Qualified Convos · Sets · Cash Collected.
- Inbound Dialer — same structure. Chips: "N ACTIVE DIALERS" + "X% PICK-UP RATE".
  Inline stats: Dials · Connections · Sets · Cash Collected.
The inline stat strip should read left-to-right in spectrum order (cold volume
metrics through to hot cash) and be colored accordingly.

Also add the page-level date-range control under the page title on both, matching
/closer's placement, so all three rep dashboards are structurally identical.

════════════════════════════════════════════════════════
PART 2 — REMODEL THE METRIC TILES (all four affected pages)
════════════════════════════════════════════════════════
The lower tile grids are the weakest surfaces in the entire app — plain bordered
rectangles with a caps label and a bare number. Affects /dm-setter (13 tiles),
/inbound-dialer (16 tiles), and /closer's lower grid too. They read as
placeholder, not product.

Rebuild them so they feel like instrumentation, not form fields:
- NOT ALL TILES ARE EQUAL. Right now every tile has identical visual weight, which
  is why the grid reads as flat. Money and outcome tiles (Cash Collected, Revenue
  Generated, Closes, Payout Owed) get more weight — larger footprint, larger
  numerals, spectrum-hot treatment. Volume/activity tiles (Leads Contacted, Dials,
  Links Sent) sit quieter in cold blue at smaller weight. Apply the bento sizing
  system that already exists.
- Every tile gets a trend sparkline and a delta vs the prior equivalent period,
  with direction. A tile showing a number with no trajectory is a dead tile.
- Every rate tile gets its denominator as a secondary line ("75.0% — 18 of 24
  showed"). A percentage without its base is not actionable.
- Count-up animation on the value via the existing useCountUp, with correct
  currency/percent formatters.
- Depth per the existing L1/L2 model: inner top highlight, hairline border, and a
  spectrum glow on hover keyed to that tile's funnel position.
- Units and currency symbols at smaller optical size, aligned to cap height —
  terminal-style figure setting.
- Design the zero state deliberately. Most of these currently read "0" and my
  workspace is genuinely empty. A zero tile should look intentional and tell me
  what to log to populate it, not look broken.

════════════════════════════════════════════════════════
PART 3 — OBJECTION FREQUENCY: MAKE IT A REAL INSTRUMENT
════════════════════════════════════════════════════════
Currently a plain horizontal bar chart on /dm-setter, /inbound-dialer and /closer.
Upgrade it into the most useful chart in the app, because objections are the
single richest signal this business produces:
- Spectrum-encoded bars, sorted by frequency, with the resolved-on-call rate
  overlaid on each bar (the data already tracks this) so I can see at a glance
  which objections get handled and which kill deals.
- A period-over-period trend indicator per objection — is "price" rising or
  falling versus the prior window? A rising objection is a leading indicator.
- CROSS-LINK EACH OBJECTION TO THE CONTENT THAT ANSWERS IT. This is the high-value
  part: each objection maps to one of the four mechanisms (Educational /
  Credibility / Authoritative / Relatability), and to any FAQ video that handles
  it. Clicking an objection should show which mechanism resolves it and deep-link
  to Content Signals and the relevant FAQ video. Objections should route to content
  — that closes the loop the whole app is built around.
- Show sample size explicitly. "Price" being #1 out of 4 logged objections is not
  a finding, and the chart must not imply it is.

════════════════════════════════════════════════════════
PART 4 — DATE RANGE ON EVERY DASHBOARD (audit)
════════════════════════════════════════════════════════
Sweep all 23 routes and confirm every page displaying time-scoped data has a
working page-level date-range control in a consistent position. Report any page
missing one, any page where it's placed inconsistently, and any page where
changing it doesn't actually refetch/recompute what's displayed. I believe
/dm-setter and /inbound-dialer are missing the page-level one (Part 1 covers
those) — find the rest.

════════════════════════════════════════════════════════
PART 5 — NEW FEATURE: LEAD JOURNEY
════════════════════════════════════════════════════════
New route /lead-journey under Sales Tracking. This is the feature that ties the
entire product together, so build it as a centerpiece.

THE CONCEPT — not a funnel chart, a BELIEF MAP.
I already have a funnel; it tells me how many leads survive each stage. What I
don't have is what a lead is THINKING at each stage — what they believe, what
they doubt, and what content resolves it. This app already collects every piece
needed to reconstruct that, but the data is scattered across six pages and joined
nowhere:
  - Traffic / Attribution → first-touch channel and the content piece that
    generated the lead
  - Content metrics → what they consumed, retention, drop-off
  - VSL Analytics → what they watched and precisely where they left
  - FAQ Videos → which objection video they clicked, which IS their dominant
    limiting belief (the strongest psychological signal in the system)
  - Setting-call signals → objections and limiting beliefs extracted from call
    transcripts and notes
  - Onboarding intake → "what was your first touchpoint", "what made you decide
    to join", "what would have made you join EARLIER"
  - Closer data → objections at the close, time-to-close
  - Client Results → the outcome

Join all of it into one view.

TWO MODES:
1. AGGREGATE — "the typical journey." A composite path showing, at every stage:
   volume, drop-off percentage, the DOMINANT LIMITING BELIEF at that stage, and
   the content mechanism that resolves it. This tells me where in the psychology
   — not just the funnel — I'm losing people, and exactly what to post to fix it.
2. INDIVIDUAL — pick any lead and trace their real path: first touch → content
   consumed → VSL watch depth → FAQ videos clicked → application answers → call
   objections → outcome. A real timeline for one human being.

VISUAL TREATMENT — a synapse map, not a bar chart.
I described this as wanting a "hologram of a brain," and the honest translation
into this design system is a glowing node-graph / neural-network diagram, which is
both more useful and more tasteful than a literal brain render:
- Stages as luminous nodes, connected by flow paths whose thickness encodes volume.
- Spectrum encoding along the journey: cold blue at first touch, through purple at
  qualification, to hot pink at cash. The color IS the progression.
- Drop-off rendered as visible branches leaving the main path, weighted by
  magnitude — I should be able to SEE where people fall out.
- Animated pulses travelling the paths to convey live flow (respecting
  prefers-reduced-motion, and never blocking readability).
- Belief annotations attached to nodes, sourced from real FAQ-click and
  objection data, each linked to the mechanism that answers it.
- Built as inline SVG with the existing motion system. No new charting library.

HARD REQUIREMENTS:
- Every element must be derived from real data joins. If a connection can't be
  supported by actual data, don't draw it — no invented paths, no decorative nodes.
- DATA SUFFICIENCY GATE. I have ~12 leads. A confident "typical journey" from 12
  leads is fiction. Show an explicit insufficient-data state that tells me what to
  log to unlock it, rather than rendering a persuasive-looking graph from noise.
  Reuse the data-sufficiency module from the thresholds project rather than
  building a second one.
- DO NOT resurrect the `funnel_stage` / per-content "lead journey" form field that
  was deliberately removed from Content Intelligence. This is a new aggregate
  visualization, not that field coming back.
- Add it to Access Control's permission matrix like every other section.

════════════════════════════════════════════════════════
VERIFICATION
════════════════════════════════════════════════════════
Standard checklist — tsc, eslint, npm run build, and the full Playwright suite
(console errors, zero-geometry, half-empty bento rows, overflow, image contrast)
across all routes × both themes × both motion settings. For Part 5 specifically:
assert the node graph renders with non-zero geometry, that the insufficient-data
state triggers correctly at my current data volumes, and that no path is drawn
without backing data. Report what you could not verify.

Give me your plan before building Part 5 — I want to see the data-join design and
the stage model before you write the visualization.
