# AscendOS — card-by-card source decisions

Your walkthrough of 2026-09-25, with a verdict on each. Verdicts are one of:

- **Already built** — works the way you described, nothing to do
- **Possible** — real API exists, needs building
- **Needs a decision** — more than one source could write it; you pick
- **Change** — differs from what's built; captured as a change request
- **Hard** — possible but expensive, or the API genuinely limits it

---

## Main Hub

| Card | You said | Verdict |
|---|---|---|
| Cash collected | Closer EOD **and** payments | **Already built.** `dashboard.tsx:487` takes `max(paymentsCash, reportedCash)` — never the sum, so the same dollars can't double-count. Read the caveat below. |
| Revenue generated | Same | Already built, same `max()` rule |
| Low-ticket MRR | Payments | Already built |
| Low/high ticket active | Auto-detect: under $1k = low | **Change.** Today it reads `leads.ticket_tier`, set when Typeform classifies the application. See "Ticket tier" below — the threshold must apply to contract value, not payment amount. |
| New leads | How many convos setters/dialers are having | **Needs a decision.** Today it counts rows in `leads` (people who applied). Convo count is a different number and lives in EOD. These are two distinct metrics, not one. |
| Total views | Instagram / TikTok / YouTube | **Hard** — see the Content section. This is the real problem. |
| Ad spend / ROAS / CPC / CPL / CPA | Meta | **Possible**, already built. Needs the Meta app only. |
| VSL page visits, plays, unique viewers, engagement rate, play rate | Wistia | **Possible.** Wistia's Stats API covers all five. Poller built; needs an API token. |
| Applications submitted | Typeform | Already built |
| Completion rate | Typeform | Already built |
| Application quality | "Not sure" | **Already built** — scored from how completely the application fields come back (`APP_FIELDS` in `hub-operating-metrics.tsx`). Not AI, just completeness. |
| Pre-call vids watched | Setter marks it on the calendar | **Already built** — one of the five pre-call circles on each booking |
| App → booked rate | Math of the two above | Already built |
| Qualified convo rate | Sales team EOD | Already built |
| Pick-up rate | Close, or dials-vs-convos math | **Needs a decision.** Both work. EOD math works today with zero integration; Close is more accurate but needs the API key. |
| Show rate | Closer EOD | Already built |
| Close rate on show | Closes ÷ showed, not ÷ all leads | **Already built** — that's exactly the existing definition |
| New inbound leads, links sent, qualified convos | Dialer/setter EOD | Already built |
| Avg first response time | "Guessing Close" | **Already built** from `lead_response_events` — no Close needed |
| Convo-to-link-sent rate | "You tell me" | Math: links sent ÷ qualified convos, both already on the EOD. Already built. |
| Daily inbound volume pace | Calculated | Already built |
| Active clients | Mentees who've paid | Already built |
| Client health | Auto-calculated | Already built |
| Daily W logs | **Google Form**, not Typeform | **Change** — see below |
| Financial wins | A "financial win" option on that form | **Change** — same form |
| Student cash logged | Sum of cash on financial-win submissions | **Change** — same form |
| Average energy | 1–10 on the daily form, averaged | **Change** — same form |

### The `max()` caveat on cash — worth understanding

When a closer logs $5,000 and Stripe also reports $5,000, Main Hub shows
**$5,000, not $10,000**. Good. But the consequence: if your team under-reports,
payments silently win; if payments aren't wired, self-reported silently wins.
**You never see the discrepancy — only the larger number.** If you want to catch
a rep whose reported cash doesn't match what actually landed, that needs a
reconciliation view, which does not exist today. Worth building once real money
is flowing.

### Ticket tier — the threshold has a trap

"Under $1,000 = low ticket" is fine, but it must be applied to the **contract
value**, not an individual payment. A $500 installment on a $5,000 payment plan
would otherwise classify a high-ticket client as low-ticket every month. The
field to key off is `clients.contract_value_cents`.

### Daily W logs — Google Form, noted

Currently this is an in-app form at `/daily-win` (no login, students just open
the link). You want a **Google Form** instead. That works through the ingest
endpoint, but note what you'd give up: the in-app form already writes straight
to `daily_wins` with no middleware, and the Mentee Results page reads it live. A
Google Form needs Apps Script or Zapier in between, which is one more thing to
break. **Worth asking why you prefer Google Forms here** — if it's just
familiarity, the existing form is less fragile.

---

## Sales

| Card | You said | Verdict |
|---|---|---|
| Total leads, available to call, calls booked, closed | Typeform application + team actions | Already built |
| All lead fields (name, stage, status, qualification, work/school, focus, goal, candidate fit, seriousness, time, income, capital, credit, committed, email, phone, handle) | Typeform questions | **Already built** — map each Typeform field to its column when you connect |
| Setter / closer on a lead | Team assigns in-app, not Typeform | Already built |
| Pre-call vid | Team marks it, not Typeform | Already built |
| Diamond leads | "Claude made this, not sure" | **Your call.** It's a priority flag. Either define it or hide it — an undefined badge is worse than no badge. |
| EOD → Discord message | Want auto-post to a per-role channel | **Possible, not built.** Discord connector already exists and Weekly Report already has "Send to Discord", so the plumbing is proven — this is wiring EOD submission to the same path, plus per-role channel routing. |

---

## Rep dashboards (DM Setter / Inbound Dialer / Closer)

| Card | You said | Verdict |
|---|---|---|
| Nearly everything (leads contacted, qualified convos, sets, DMs, follow-ups, booked, showed, closed, disqualified, down-sells) | EOD | Already built |
| Avg call duration, talk time, talk/listen (dialer) | Close CRM | **Possible.** Close's API exposes call duration. This is gap 1 in the data-source map — the table exists and is empty. |
| Avg call duration, talk time, talk/listen (closer) | Fathom | **Hard.** Fathom's public API is limited; there's no clean "give me every call's duration" endpoint. Practical route is Fathom → Zapier → ingest. Treat as lower priority than Close. |
| Links sent | EOD | Already built |
| **Links clicked** | "Is it possible to automate?" | **Possible, not built.** Needs a redirect you control — `/l/<code>` that logs the click and forwards. Small build, real value. Third-party shorteners would also work. |
| Post-booking page visits | "If you can track that" | **Possible, not built.** Same mechanism as above, or page analytics. |
| Pickup rate, qualified convo rate, set rate | Math from EOD | Already built |
| Available leads to dial | Leads not yet worked | Already built |
| Call-backs requested / due today / completed / cancel / no-show / recovery | The call-back logger | Already built |
| Calls booked (closer) | Their calendar | Already built |
| No-shows, no-shows rebooked | EOD or calendar | Already built |

**Correction:** you said you're hosting on Vercel. You're on **Cloudflare
Workers** — that's what we deployed to. It doesn't change the answer on link
tracking (you'd build the redirect either way), but worth knowing.

### The "three closer things"

Not three features. One page plus two views of the same data:

1. **Closer** — the page in the sidebar
2. **Closer Scorecard** — a radar chart comparing closers on normalised 0–100 axes
3. **Closer Scorecard Input** — the table of raw numbers behind that radar

"Input" is a bad name — it reads like a form you fill in. Worth renaming to
something like "Scorecard detail". Say the word.

---

## Team

| Card | You said | Verdict |
|---|---|---|
| Team members, setters, dialers, closers | Who's on the platform, by role | Already built |
| Booked, show rate, cash collected | Totals in range | Already built |
| KPI targets | Reps set their own | Already built |
| Access / roles | Wants request → approve → correct role → correct permissions | **Already built, and now testable.** Flow: sign up → Request access → admin approves under Team with a role → `permissions.ts` gates what they see. Worth one real end-to-end test with a throwaway account. |
| Calls today | Calendly | **Possible** — Calendly connector is built, just connect it |
| Pre-call ready / video not watched | The five circles | Already built |
| Cancelled | Calendly cancellation should sync | **Already built** — the Calendly connector handles `invitee.canceled` and reschedules |
| Live team calendar (rep's own Google Calendar: gym, wake-up, blocks) | Reps connect Google Calendar | **Possible, not built.** This is genuinely separate from Calendly — Calendly gives you *bookings*, Google Calendar gives you *availability*. Needs its own Google OAuth. Gap 2 in the data-source map. |
| Connected reps | Count of connected calendars | Follows from the above |

---

## Hiring

| Card | You said | Verdict |
|---|---|---|
| Total applicants | Google Form submissions | **Possible** — ingest `hiring_application`. Needs Apps Script or Zapier on the form. |
| Interview / trial / hired | Pipeline stage | Already built |
| Average AI score | AI grades them | **Possible** — needs `LOVABLE_API_KEY` |
| Transcript quality from Loom | AI reads the Loom transcript | **Hard.** Loom exposes transcripts only on paid tiers and the API is restricted. Getting the transcript is the blocker, not the grading. |
| Auto-sort into rejected / needs grading / interview-worthy | AI triages on arrival | **Possible** once the two above work. Recommend AI *suggests* a bucket and a human confirms, at least at first — an AI silently rejecting a good rep is expensive and invisible. |

---

## Mentees & Payments

| Card | You said | Verdict |
|---|---|---|
| Total intakes, pending, answered | Typeform onboarding | Already built |
| Mentee results / daily W | Should be a real Typeform, not the example form | **Change** — but see the Google Form note above; pick one and stay with it |
| All payment cards | Payment processors | Already built — connect any of the five |
| Client, date, plan, tier | From the payment + linked lead | Already built |

---

## Content — the real problem

You're right to worry. This is the one area where the honest answer is that it
is expensive, and it's worth being blunt about why.

**All three platforms have APIs. None of them is easy.**

| Platform | What you can get | The catch |
|---|---|---|
| **YouTube** | Views, watch time, retention, traffic sources — everything you'd want | **Easiest by far.** Data API v3 + Analytics API, OAuth to your own channel, no App Review for your own data, generous free quota. **Start here.** |
| **Instagram** | Reach, impressions, saves, shares, comments, profile visits, per post | Needs a Meta app (the one you're building anyway), a Business/Creator account linked to a Facebook Page, and `instagram_manage_insights`. App Review required to go beyond your own account. |
| **TikTok** | Views, likes, comments, shares per video | **Hardest.** Display API access needs approval, is stricter than Meta's, and gives less. Expect the most work for the least data. |

**Meta Business Suite is not an API.** It's a dashboard. You can export CSVs by
hand, but nothing polls it. If you want Instagram automated, it's the Instagram
Graph API through a Meta app.

### What I'd actually do

1. **Now** — log content manually, or paste a CSV, through the `content_post`
   ingest event. Works today, zero integration. For a business with no clients
   yet, this is genuinely the right call.
2. **Next** — YouTube. Cheapest win by a wide margin, and it proves the pipeline.
3. **Then** — Instagram, once the Meta app exists for ads anyway. Marginal extra
   work at that point.
4. **Last, maybe never** — TikTok. Reassess when the others are running.

The trap to avoid is building all three at once before you know which platform
actually drives your business. Log manually for a month, see where leads come
from, then automate that one first.

---

## Weekly Report — fixed

It was genuinely broken, not empty: `weekly-report.server.ts:294` queried a
table `public.applicants` that has never existed in any migration. The real
table is `hiring_applicants`, which the Hiring page has always used correctly.
Because the query sat inside the same `Promise.all` as everything else, one
wrong table name took down the entire report rather than just the hiring
section. Fixed and deployed; the report builds now.

---

## Open decisions for you

1. **New leads** — applications, or convo count? They're different numbers.
2. **Pick-up rate** — EOD math (free, today) or Close (accurate, needs key)?
3. **Diamond leads** — define it or remove it.
4. **Daily W form** — Google Form or the existing in-app form? Pick one.
5. **Ticket tier threshold** — confirm $1,000, applied to contract value.
6. **Cash reconciliation** — do you want a view that surfaces reported-vs-actual
   gaps, rather than silently taking the larger?
