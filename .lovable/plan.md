This is a large multi-area change. Grouping into 4 shippable batches so each can be verified before the next. Confirm the batch order (or re-prioritize) and I'll start with Batch 1.

---

## Batch 1 — Quick wins (UI + ingest fixes)

**#2 — Drop `_cents` requirement in ingest**
Already supported: schemas accept `cash_collected`, `contract_value`, `deposit`, `total_revenue` as plain dollar numbers. Will document and double-check the Typeform route (`src/routes/api/public/typeform.ts`) accepts the same shape so n8n/Typeform never has to send `_cents`.

**#8 — Content table: show Title only (drop the "– Hook")**
Edit `_authenticated.content.tsx` table column back to title only. Hook still visible in the expanded row + overview panel.

**#9 — Move "Sales Tracking" dropdown directly under "Main Hub" in sidebar**
Edit `src/components/app-sidebar.tsx`: render the Sales Tracking collapsible right after Main Hub (before Content Tracker / Attribution).

**#1 — Main Hub: wire Calls Booked / Showed / Offers Made / Closes from sales team data**
Currently those tiles read only from `calls`. Will also sum `setter_activity` (`calls_on_calendar`, `live_calls`, `closes`) so the numbers populate when data comes from setter day logs instead of individual call rows. Same pattern as the cash-collected sync already in place.

**#10 — "Generate AI Insights" should wipe and re-create**
Update the insights server fn to `DELETE` the org's existing `ai_insights` rows (or mark dismissed) before generating, and broaden the prompt to include sales-team funnel data + fulfillment signals so it surfaces system-wide bottlenecks.

---

## Batch 2 — Clients, Onboarding & Fulfillment

**#3 — Editable Clients & Onboarding pages**
Add inline edit (Dialog with form) on `_authenticated.clients.tsx` and `_authenticated.onboarding.tsx` for all key fields.

**#5 — Clients schema additions**
Migration to add: `phone`, `invested_to_date_cents`, `expected_next_payment_cents`, `expected_next_payment_date`. Update the Client form:
- Always shows contract value, invested-to-date, next expected payment + date.
- Renewal date input is only visible when `payment_plan = true`. If unchecked (PIF), `renewal_date` is cleared on save.

**#6 — Pre-close summary section on Client**
New `clients.pre_close_summary` text + `clients.pre_close_raw` jsonb. Add a "Generate Pre-Close Summary" button on the client detail that pulls related `messages` (Instagram DMs) + the matching `calls.call_summary` / `key_moment` and runs them through Lovable AI to produce a 1-paragraph summary stored on the client row.

**#7 — Fulfillment dropdown (new sidebar group)**
New sidebar section "Fulfillment" with one page: **Client Results**. For each active client, pulls their Typeform application answers + `onboarding_responses` + AI-generated "goals & current state" summary, and displays a tracker so the offer owner can mark progress toward those goals. Reuses Lovable AI Gateway, no new keys.

---

## Batch 3 — Role-based access (#4) — biggest piece

**Schema (migration):**
- `app_role` enum already exists (`owner`, `admin`, etc.) — extend with: `setter`, `closer`, `sales_manager`, `growth_ops`.
- New table `membership_requests` (org_id, email, full_name, requested_role, status: pending/approved/rejected, decided_by, decided_at).
- RLS: anyone signed-in can insert a request for an org; only org admins/owners can read/update; on approve → insert into `memberships` with the requested role.

**Sign-up flow:**
- New route `/request-access`: collects name, email, role, and the **admin's email** of the org they want to join. Looks up org by admin email → creates a `membership_requests` row.
- Admin sees a "Pending requests" panel on `/team` with Approve / Reject buttons.

**Route gating (front-end):**
- New helper `useRole()` returns the user's role in the current org.
- Sidebar filters items by role:
  - **setter / closer**: Main Hub, Sales Tracking, Clients, Onboarding (read-only)
  - **sales_manager**: above + can edit sales sections
  - **growth_ops / admin / owner**: full access
- Hide edit buttons / disable mutations for non-managers via the same role check.

**Note:** This is the largest batch. Mutations also need server-side enforcement via `has_org_role` in RLS — I'll add policies that restrict UPDATE/DELETE on key tables to manager+ roles.

---

## Batch 4 — Polish & verify

- Walk through each flow end-to-end in preview.
- Confirm Typeform → Clients pipeline still works without `_cents`.
- Confirm role-gated sidebar renders correctly for a test setter account.

---

### Questions before I start

1. **Order:** Start with Batch 1 (quick wins) and ship it, then Batch 2, etc.? Or do you want roles (#4) first since it blocks giving teammates access?
2. **#4 admin identification:** Should "admin email" on the request form be the workspace owner's login email, or do you want a dedicated invite code per org?
3. **#7 Fulfillment:** Just one "Client Results" page to start, or do you have other fulfillment views in mind (e.g. milestones, deliverables)?

Reply with order + answers and I'll start Batch 1 immediately.