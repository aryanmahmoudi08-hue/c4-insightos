# Big build pass — what gets done

This is a lot of distinct work. Here's the order I'll ship it in. Approve and I run it straight through (no further check-ins unless something blocks).

## Quick answer first — what is the Swipes section for?

The **Swipe library** is a paste-bin for proven copy you find in the wild — competitor emails that converted you, scripts from ads you stopped scrolling for, hooks from creators in your niche. You drop them in with a tag ("hook", "vsl-open", "pricing reveal", etc.) and the generator pulls from them as reference fuel when writing new copy. It's a private vault of "things that already worked" so the AI stops hallucinating and starts remixing what's proven. If you don't want it, I'll cut it and fold the best examples directly into the per-client knowledge.

## 1. Content pipeline + Discord automation
- Add a `status` column to `content_pieces`: `idea → drafting → review → ready_to_post → posted`.
- Content Tracker becomes a 5-column kanban; drag/edit until it lands in **Ready to post**.
- On move to `ready_to_post`: server fn dispatches to a Discord webhook, payload = full script + hooks + caption.
- **Per-copy-type channels**: one webhook URL per category (Content, Email/SMS, Long-form, DMs). Stored in `webhook_subscriptions` with a `category` field. Single sidebar dropdown in the app shows where each type routes. Admin-only is enforced on Discord's side via channel permissions — I'll include setup notes in the connect screen.

## 2. Sidebar restructure
- **Sales Tracking** dropdown now contains: Leads, Sales Team (sub-dropdown: DM Setter, Inbound Dialer, Closer), Attribution, Traffic, Pre-close.
- Move Leads out of top-level into Sales Tracking.
- DM Setter / Inbound Dialer / Closer collapse into a "Reps" sub-dropdown.

## 3. CopyOS cleanup
- **Story Sequences** promoted to its own top-level item under CopyOS (out of Long-form). Seeded with your own slide-by-slide data structure (`story_slides` already exists — I'll wire the UI and prefill 3 starter sequences from the methodology).
- **Client DNA** locked to a single client per workspace (one website = one voice). Removes the picker, becomes a single profile page.
- **Swipes** — keep or cut based on your answer above; defaulting to keep with a clearer "what goes here" empty state.

## 4. AI Insights revamp
Currently outputs 3–5 generic insights. Rebuild as two stacked panels:
- **Bottlenecks** — every metric below target, ranked by revenue impact, with the specific lever to pull.
- **Double down** — every metric trending up or outperforming, with "do more of this" prescriptions.
Each card shows the number, the trend arrow, the why, and the next action. Generated weekly + on-demand.

## 5. Client onboarding form — visual diagnostic
After submission, each answer gets outlined:
- **Green** = matches a "doing well" signal in their data
- **Red** = matches a current bottleneck
- Neutral = no signal yet
Driven by mapping onboarding question IDs → metric thresholds.

## 6. Content Calendar — real calendar
Replace the list view with a month grid (header: « Month YYYY », day cells with content chips, click a day to add/view). Week / month toggle. Drag posts between days.

## 7. Dashboard glow-up (the big visual lift)
Across Dashboard, Insights, Attribution, Sales modules:
- Denser KPI tiles with sparklines + WoW delta chips
- Gradient borders on hero metrics, subtle inner glow on positive trends
- Real chart components (area gradients, not flat bars) using the existing chart primitives
- Sticky module headers with quick-filter chips
- Section dividers + consistent card hierarchy so every page reads like the same product

---

## Order of execution
1. Sidebar restructure (fastest visible win)
2. Story Sequences + Client DNA single-client lock
3. Content pipeline statuses + kanban
4. Discord per-channel routing
5. Calendar grid
6. Insights revamp
7. Onboarding green/red outlines
8. Dashboard visual pass (last — touches everything)

Reply **go** and I run the whole list. If you want Swipes cut, say "cut swipes" and I'll fold it into Client DNA references instead.
