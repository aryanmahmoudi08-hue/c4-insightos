# AscendOS — building and testing before your first client

Written 2026-09-28, after proving each claim against the live deployment.

## You do not need a client, an offer, or a dollar

The whole system can be built and verified with free accounts and test modes.
This was demonstrated end to end: a throwaway workspace was created, given two
offers (a $5,000 paid-in-full and a $97/mo MRR), two payment plans, and three
clients covering every branch of the ticket-tier rule. The real
`dealClassification` / `ticketTierFromDeal` functions were then run against
those exact values — all three classified correctly, including the case that
matters most:

| Client | Deal | Classified |
|---|---|---|
| A | $5,000 paid in full | high |
| B | 4-pay, **$1,375/month** on a $5,500 contract | **high** — not low |
| C | $97/month MRR | low |

B is the one a naive "is this payment under $1,000" rule gets wrong.

Deleting the workspace cascaded every row. Nothing leaked into the real one.

### The sandbox pattern

This app is multi-tenant by design, so the safest test environment is **a second
workspace**, not test rows in your real one:

1. Create a workspace (or ask Claude to)
2. Put whatever fake offers, clients and payments you like in it
3. Break things, check the numbers, learn the UI
4. Delete the workspace — every row cascades

Your real workspace never sees any of it. This is also exactly how a second
client will work, so testing it is testing the real multi-tenancy.

## Free tiers that cover every connector

| Service | Free path | Good enough to verify? |
|---|---|---|
| **Stripe** | Test mode, no activation needed. Published test cards. | Yes — full webhook flow including failures |
| **Typeform** | Free plan, 10 responses/month | Yes |
| **Calendly** | Free plan | Yes — booking + cancellation webhooks |
| **Google Forms** | Free | Yes |
| **Discord** | Free | Yes |
| **Zapier** | Free plan, 100 tasks/month | Yes |
| **Wistia** | Free plan, 3 videos | Yes |
| **Close CRM** | 14-day trial | Enough to verify the mirror |
| **Meta** | Developer app is free; Development mode needs no App Review for your own ad account | Yes |

Stripe test mode is the important one: real webhooks, real signature
verification, real ledger rows, fake money. There is no meaningful difference
between a test-mode charge and a live one as far as this app is concerned.

## The website is already launched

<https://ascendos.aryanmahmoudi.workers.dev> is live, on Cloudflare Workers,
serving real traffic. There is no separate "launch" step.

What is missing is a **custom domain**, which is cosmetic but matters for
client trust:

1. Buy a domain (anywhere)
2. Cloudflare dashboard -> Workers & Pages -> **ascendos** -> Settings ->
   **Domains & Routes** -> Add custom domain
3. If the domain is not already on Cloudflare, it will ask you to move its
   nameservers there
4. Update `site_url` and `additional_redirect_urls` in `supabase/config.toml`
   to the new domain and push the config, or Supabase auth will keep
   redirecting to the workers.dev URL

Step 4 is the one people forget, and the symptom is a confusing post-login
redirect to the old domain.

## Before real client data: what must be true

Verified already:

- **Multi-tenant isolation.** Proven, not assumed: a row inserted as service
  role was invisible to an anonymous caller (`[]`, not an error). Every business
  table is `org_id`-scoped with RLS.
- **Every webhook endpoint** rejects unknown connections *before* signature
  verification, so it cannot be used as a signature oracle.
- **Honest empty states** — no fabricated zeros anywhere on the six pages
  checked.

Still required:

- **Custom SMTP** before inviting anyone. Email confirmations are on, and
  Supabase's built-in sender on the free tier is rate-limited and may only
  deliver to your own address. A teammate could sign up and never receive the
  email.
- **Rotate the service-role key** if it has ever been pasted anywhere it
  should not have been.
- **Supabase free tier pauses after ~1 week of inactivity.** Fine while
  building; not fine once a client depends on it. Upgrade before onboarding.
- **Cloudflare Workers free tier has a 10ms CPU limit per request.** Nothing
  has hit it, but it is the most likely first scaling surprise.

## A sensible build order with no client

1. **Sandbox workspace** — learn the UI with disposable data
2. **Stripe test mode** — connect it, push a test charge, watch the ledger fill
3. **Typeform free** — build your real application form, submit it yourself,
   check the fields land in the right columns rather than in `raw_answers`
4. **Calendly free** — book a call with yourself, cancel it, watch the calendar
5. **Google Form** — wire the daily-win Apps Script, submit one
6. **Your own offers in Client DNA** — even as a draft, so the tier rule runs
7. **Custom domain** — when you want it to look real
8. **Meta app** — last, since it is the most involved

Each step is one connector, one real record, then check **Ops -> Event Bus**.
Every inbound payload lands in `raw_payloads` with its error before anything
maps, so a failure is visible rather than silent.
