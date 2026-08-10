# Insight Engine

Let me read the C4 PDF properly first.Now I have everything. Here's the full merged, upgraded prompt:

Build me a full-stack business operating system called "C4 InsightOS" for a high-ticket info-product / consulting / coaching business. This is NOT just a CRM. This is a complete business intelligence ecosystem.

The philosophy: "If cash moves, content performs, or a lead breathes — it gets tracked." Everything must be measurable, attributable, and optimizable. The owner should NEVER have to ask "where did revenue come from?" or "why are show rates low?" — the system answers everything.

TECH STACK

React + TypeScript frontend

Supabase backend (auth, database, realtime)

Full auth with email/password login

All data persists to Supabase tables

Mobile responsive throughout

DESIGN Dark mode. Elite, premium, data-dense. Dark navy/charcoal base (#080B12), blue accents (#3B82F6), green for positive metrics (#10B981), red for negatives (#EF4444), yellow for warnings (#F59E0B). Monospace font for all numbers. Smooth animations. Think: Palantir + Stripe + Notion combined.

MODULE 1 — EXECUTIVE DASHBOARD (Home Screen)

Command center. Owner sees at a glance:

TODAY strip: Cash collected | Calls booked | Show % | Close % | Leads generated | Content posted

THIS WEEK: Best performing content piece | Top setter | Biggest bottleneck flagged | Revenue trend chart

THIS MONTH: Revenue by traffic source (bar chart) | Funnel visualization (Calls Booked → Shows → Offers → Closes as % bars) | Predicted revenue based on current pace | Top onboarding insight ("Most clients say X made them buy")

Visuals required: Sankey diagram for lead-to-cash flow | Heatmap for best posting times | Leaderboard cards for setter + closer rankings | Trend line charts for all key metrics

MODULE 2 — CONTENT INTELLIGENCE SYSTEM

Track every content piece ever posted.

Platforms: Reel | TikTok | YouTube | YouTube Short | Story Sequence | Email | Ad Creative | VSL | Carousel

Per post — Basic Metrics: Views, Reach, Watch Time, Avg Watch %, Shares, Saves, Likes, Comments, Profile Visits, Followers Gained, Qualified Followers Gained, DMs Generated, Leads Generated, Calls Booked, Closes, Cash Collected

Per post — Advanced Metrics (auto-calculated where possible): Hook Retention %, 3-sec Hold %, 10-sec Retention %, Drop-off Point, CTA Conversion %, Follower/View Ratio, Qualified Follower Ratio, Lead per 1k Views, Cash per 1k Views, ICP Attraction Score

Content Tagging System — every post tagged by: Hook Type | CTA Type | Topic | Pain Point Addressed | Content Angle (authority / proof / educational / lifestyle / controversial / identity) | Funnel Stage | Objection Handled | Awareness Stage | Emotional Trigger

Content Heatmap View: Visual grid showing best posting times, highest-converting content styles, highest-revenue topics

Story Sequence Tracker: Track each individual story slide — Story 1 views → Story 2 → Story N with drop-off % between each slide. Show exactly where viewers exit. Identify which story sequences generate DMs and booked calls.

AI Insights Panel on this page: "Reels with authority hooks + social proof CTAs generate 43% more qualified calls" — auto-generated pattern recognition across all logged content

MODULE 3 — LEAD ATTRIBUTION & JOURNEY SYSTEM

Every lead has a complete timeline from first touch to cash collected.

Lead Profile contains: First content seen | First DM | All content consumed | Setter assigned | Qualification status | Call booked date | Show/no-show | Offer made | Close status | Cash collected | Objections raised | Beliefs expressed | Engagement score | Intent score | Estimated close probability

Visual Journey Map — horizontal timeline per lead showing every touchpoint

Journey Kanban Board (drag and drop): Stages: DM Received → Qualified → Pre-Call Assets Sent → Call Booked → Showed → Closed / DQ / Follow Up

Each card shows: lead name, setter, days in stage, notes. Click to open full detail view with conversation notes + timeline.

Attribution Answer: System answers "What exact content journey creates buyers?" — show the most common paths to close

MODULE 4 — DM SETTER SYSTEM

Per setter, per day — track: DMs Sent | Responses Received | Response Rate % (auto) | Qualified Convos | Calls Booked | Shows | Closes | Cash Generated | Average Response Time | Follow-up Score

Conversation Flow Visualization per setter: Lead Enters → Conversation → Qualification → Objection → Booking → Show → Close — with % drop-off at each stage

Setter-level insights:

Where leads ghost most often

Which messages convert best

Which objections appear most

Daily / weekly / monthly KPI dashboards per setter

Manager view: Review conversation notes, flag missed opportunities, track which scripts perform

Weekly rollup leaderboard — ranked by cash generated, close rate, show rate

Critical business rules built in:

Flag any setter with <2 calls booked/day

Alert if response rate drops below 10%

100 NEW outreach messages/day target per setter with daily tracking

Lead source tags on every conversation: Instagram Spiderweb | Keyword Search | YouTube Method | Whop.com | Loom Outreach | Inbound DM

MODULE 5 — SALES / CLOSER SYSTEM

Per closer, per call — log: Closer Name | Date | Lead Email | Call Summary | Offer Made (True/False) | Lead Status (dropdown: No Show / Not Qualified / Follow Up / Offer Made / Closed / DQ) | Cash Collected | Total Contract Value | Payment Plan (True/False) | Call Recording URL

Auto-calculated closer metrics: Close Rate % | Offer Rate % | Show Rate % | Cash per Booked Call | Cash per Show | Average Deal Size | Payment Plan Rate | Total Cash This Month

Sales call analysis fields: Objections raised (multi-select tags) | Time-to-close | Key moment in call (notes)

Winning Call Pattern section: Aggregate all closed calls → show most common objections handled → most common close triggers → avg deal size by lead source

Live metrics strip at top: Total cash collected today / this week / this month | Pipeline value (offers made not yet collected)

T5 Closer Framework reminders built into the call logging UI — stages map to: Rapport → Context → Bottleneck → Opportunity Gap → Cost of Inaction → Permission to Pitch → Close

MODULE 6 — ONBOARDING & CLIENT PSYCHOLOGY SYSTEM

After a client is closed: Auto-generate a unique shareable onboarding form link to send them.

Form questions:

Attribution:

What was the FIRST piece of content you saw from me?

Which specific video or post made you trust me?

How long did you follow before deciding to buy?

Where did you find me? (dropdown: Instagram Reel / YouTube / DM / Ad / Referral / Story / Other)

Buying Psychology:

What made you finally pull the trigger?

What almost stopped you? (this is critical — highlight it in the UI)

Why did you choose ME over competitors?

What could I have done to get you to join SOONER? ← flag this as the most important question, display responses in bold

What objection did you have that almost cost me the sale?

Content Feedback:

Which content type helped most? (Reels / Stories / YouTube / DMs / Ads)

Which proof or result convinced you most?

Which message or line stuck with you?

Avatar Intelligence:

Current monthly revenue

Primary goal

Biggest frustration right now

Experience level (Beginner / Intermediate / Advanced)

Responses stored in Supabase. Dashboard view with:

Filter by month

Keyword frequency auto-tagger (pull most common words from "what made you join" and "what almost stopped you" fields — display as tag clouds)

"Top 3 buying triggers this month" auto-summary

Direct feed back into content ideas column

MODULE 7 — CLIENT ROSTER & RETENTION SYSTEM

Active client table: Name | Start Date | Offer Purchased | Contract Value | Payment Plan Status (Paid in Full / Installments — show # remaining) | Renewal Date | Days Until Renewal | Health Score | Notes | Renewal Conversation Started (checkbox)

Automatic flags:

Yellow highlight when renewal is within 14 days

Red flag if health score drops below threshold

"Likely to churn" tag based on low engagement/activity

Client Health Score (manual input or calculated from): Module completion % | Check-in attendance | Wins logged | Support tickets | Last activity date

Ascension tracker: Tag clients as "ready for upsell" — log upsell conversations and outcomes

MODULE 8 — TEAM PERFORMANCE SYSTEM

Track every team member: Setter | Closer | VA | Editor | Coach | Account Manager

Per team member: Role | Daily task completion | Weekly output | Revenue contribution | SLA adherence | Communication quality score (manual 1-5) | Notes

Leaderboards:

Top cash producer

Highest close rate

Fastest average response time

Highest retention impact

Most qualified calls booked

End-of-day form (fillable by team): What did you complete today? Calls booked / Cash collected / Blockers / Tomorrow's priority

MODULE 9 — TRAFFIC & ACQUISITION SYSTEM

Track all sources: Instagram Organic | TikTok | YouTube | Facebook | Ads (Meta/Google) | Referral | Affiliate | Cold Outbound | Warm Inbound | Email | Whop

Per source: Leads generated | Qualified lead % | Calls booked | Show rate | Close rate | Cash collected | Revenue attributed | Avg LTV | Refund rate

The system must answer:

Where does cash ACTUALLY come from?

Which source scales best?

Which source produces highest LTV clients?

Bar chart comparison of all sources by cash generated. Toggle between this week / this month / all time.

MODULE 10 — AI INSIGHTS ENGINE

Dedicated page that continuously surfaces insights across all modules:

Examples of what it generates:

"This hook style generates 43% more qualified calls"

"These objections reduce close rate by 18% — create content addressing them"

"Setter [Name] performs best with beginner leads"

"Story sequences ending with a DM CTA produce 2x more booked calls"

"These 3 clients show churn signals"

"Tuesday 7pm posts outperform all other time slots by 31%"

Automated Bottleneck Detection:

Show rate below 70%? → Flag + suggest fix

Hook retention below 30%? → Flag weak hook

Setter response rate below 10%? → Alert

No closes in 3 days? → Escalation alert

Predictive Scaling Engine:

Projected revenue this month based on current pace

"If you post 3 more reels this week matching your top-performing style, projected leads = X"

Renewal risk forecast

GLOBAL FEATURES (apply to every module)

CSV export button on every table

Date filters everywhere: Today / This Week / This Month / Custom Range

Global search across all leads, clients, content

Slack/Discord webhook alerts for: new close, no-show, setter milestone, content hit 10k views

All navigation in a fixed left sidebar with module icons

Notification bell for automated alerts

Build this end to end with full Supabase integration, working auth, and all modules connected so data entered in one place flows through to the dashboards automatically.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://c4-insightos.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/95dc8234-1121-4fc0-bfc0-35f1c89bd8cd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
