/**
 * One scheduler tick: find what has become due since the last one and fire
 * it, once.
 *
 * Called every minute by pg_cron (20261113090000_event_scheduler.sql) through
 * /api/public/scheduler-tick. Every job is idempotent: a claim in
 * `scheduled_event_fires` is taken before anything is sent, so overlapping
 * or repeated ticks cannot double-ping a channel.
 *
 * A workspace is only examined for the event types it has an active
 * subscription to. Nobody listening means nothing to compute, and it also
 * means a workspace that has never wired a channel cannot be flooded the
 * moment it first does — the lookback bound in scheduler-rules.ts covers the
 * rest.
 */
import { TOUCHPOINT_LABELS } from "./call-confirmations";
import { callPayload } from "./event-emitters.server";
import { FOLLOWUP_LEAD_STATUSES } from "./eod-reports";
import {
  claimFire,
  db,
  emitEvent,
  leadSummary,
  loadNotificationSettings,
  memberName,
} from "./notify.server";
import { buildLeaderboard } from "./sales-leaderboard";
import {
  DUE_LOOKBACK_MS,
  SCHEDULED_EVENT_TYPES,
  dailyReportWindow,
  followUpEventType,
  periodLabel,
  unconfirmedCallWindow,
  weeklyReportWindow,
} from "./scheduler-rules";
import type { NotificationSettingsT } from "./workspace-settings.functions";
import { zonedDayRangeUtc } from "./zoned-time";

type Counts = Record<string, number>;

export async function runSchedulerTick(now: Date = new Date()) {
  const { data: subs, error } = await db
    .from("webhook_subscriptions")
    .select("org_id, event_types")
    .eq("active", true);
  if (error) throw new Error(`scheduler: subscriptions lookup failed: ${error.message}`);

  const scheduled = new Set<string>(SCHEDULED_EVENT_TYPES);
  const byOrg = new Map<string, Set<string>>();
  for (const s of (subs ?? []) as Array<{ org_id: string; event_types: string[] | null }>) {
    for (const t of s.event_types ?? []) {
      if (!scheduled.has(t)) continue;
      const set = byOrg.get(s.org_id) ?? new Set<string>();
      set.add(t);
      byOrg.set(s.org_id, set);
    }
  }

  const results: Array<{ orgId: string; fired: Counts; skipped: string[]; errors: string[] }> = [];
  for (const [orgId, types] of byOrg) {
    const fired: Counts = {};
    const skipped: string[] = [];
    const errors: string[] = [];
    const settings = await loadNotificationSettings(orgId);
    const run = async (name: string, fn: () => Promise<number>) => {
      try {
        const n = await fn();
        if (n) fired[name] = n;
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    if (types.has("call.unconfirmed"))
      await run("call.unconfirmed", () => fireUnconfirmed(orgId, settings, now));
    if (types.has("callback.due"))
      await run("callback.due", () => fireCallbacksDue(orgId, settings, now));
    if (types.has("followup.short_term_due") || types.has("followup.long_term_due"))
      await run("followups", () => fireFollowUpsDue(orgId, settings, types, now));
    if (types.has("report.daily_sales")) {
      const w = dailyReportWindow(settings.timeZone, settings.dailyReportHour, now);
      if (w.due)
        await run("report.daily_sales", () => fireReport(orgId, "report.daily_sales", w, settings));
      else if (w.reason === "no workspace timezone set")
        skipped.push(`report.daily_sales: ${w.reason}`);
    }
    if (types.has("report.weekly_sales")) {
      const w = weeklyReportWindow(
        settings.timeZone,
        settings.weeklyReportDay,
        settings.dailyReportHour,
        now,
      );
      if (w.due)
        await run("report.weekly_sales", () =>
          fireReport(orgId, "report.weekly_sales", w, settings),
        );
      else if (w.reason === "no workspace timezone set")
        skipped.push(`report.weekly_sales: ${w.reason}`);
    }

    if (errors.length) console.error(`scheduler org ${orgId}:`, errors.join("; "));
    results.push({ orgId, fired, skipped, errors });
  }
  return { at: now.toISOString(), orgs: results };
}

/* ------------------------------------------------------------------ */

async function fireUnconfirmed(orgId: string, settings: NotificationSettingsT, now: Date) {
  const tp = settings.confirmTouchpoint;
  const { fromIso, toIso } = unconfirmedCallWindow(tp, now);
  const { data: calls, error } = await db
    .from("calls")
    .select("id, scheduled_for, cancelled, status")
    .eq("org_id", orgId)
    .eq("status", "booked")
    .gte("scheduled_for", fromIso)
    .lte("scheduled_for", toIso);
  if (error) throw new Error(error.message);
  const live = (
    (calls ?? []) as Array<{ id: string; scheduled_for: string; cancelled: boolean | null }>
  ).filter((c) => !c.cancelled);
  if (!live.length) return 0;

  const { data: confs } = await db
    .from("call_confirmations")
    .select(`call_id, overall_status, ${tp}_sent_at`)
    .in(
      "call_id",
      live.map((c) => c.id),
    );
  const byCall = new Map<string, Record<string, unknown>>(
    ((confs ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.call_id), c]),
  );

  let n = 0;
  for (const c of live) {
    const conf = byCall.get(c.id);
    if (conf?.[`${tp}_sent_at`]) continue;
    if (conf?.overall_status === "cancelled" || conf?.overall_status === "rescheduled") continue;
    if (!(await claimFire(orgId, "call.unconfirmed", `${c.id}:${c.scheduled_for}`))) continue;
    const built = await callPayload(orgId, c.id);
    if (!built) continue;
    await emitEvent(
      orgId,
      "call.unconfirmed",
      { type: "call", id: c.id },
      {
        ...built.payload,
        touchpoint: tp,
        touchpoint_label: TOUCHPOINT_LABELS[tp],
        time_zone: settings.timeZone || null,
      },
    );
    n += 1;
  }
  return n;
}

async function fireCallbacksDue(orgId: string, settings: NotificationSettingsT, now: Date) {
  const { data: items, error } = await db
    .from("operational_work_items")
    .select("id, entity_id, owner_id, due_at, next_action, payload, state")
    .eq("org_id", orgId)
    .eq("entity_type", "dialer_callback")
    .neq("state", "completed")
    .lte("due_at", now.toISOString())
    .gte("due_at", new Date(now.getTime() - DUE_LOOKBACK_MS).toISOString());
  if (error) throw new Error(error.message);

  let n = 0;
  for (const it of (items ?? []) as Array<{
    id: string;
    entity_id: string | null;
    owner_id: string | null;
    due_at: string;
    next_action: string | null;
    payload: { lead_name?: string } | null;
  }>) {
    if (!(await claimFire(orgId, "callback.due", `${it.id}:${it.due_at}`))) continue;
    const [lead, owner] = await Promise.all([
      leadSummary(orgId, { leadId: it.entity_id }),
      memberName(orgId, it.owner_id),
    ]);
    await emitEvent(
      orgId,
      "callback.due",
      { type: "operational_work_item", id: it.id },
      {
        callback_id: it.id,
        lead_id: lead.id,
        lead: { ...lead, full_name: lead.full_name ?? it.payload?.lead_name ?? null },
        lead_name: it.payload?.lead_name ?? null,
        due_at: it.due_at,
        next_action: it.next_action,
        owner_name: owner,
        time_zone: settings.timeZone || null,
      },
    );
    n += 1;
  }
  return n;
}

async function fireFollowUpsDue(
  orgId: string,
  settings: NotificationSettingsT,
  types: Set<string>,
  now: Date,
) {
  const { data: calls, error } = await db
    .from("calls")
    .select(
      "id, lead_id, lead_email, closer_name, eod_lead_status, requested_followup_at, followup_amount_pitched_cents, followup_reason, followup_reason_other, followup_notes, original_currency, created_at",
    )
    .eq("org_id", orgId)
    .in("eod_lead_status", [...FOLLOWUP_LEAD_STATUSES])
    .lte("requested_followup_at", now.toISOString())
    .gte("requested_followup_at", new Date(now.getTime() - DUE_LOOKBACK_MS).toISOString());
  if (error) throw new Error(error.message);

  let n = 0;
  for (const c of (calls ?? []) as Array<Record<string, string | number | null>>) {
    const type = followUpEventType(c.eod_lead_status as string | null);
    if (!type || !types.has(type)) continue;

    // A later call with this lead means someone already followed up — the
    // lead closed, no-showed again or was rescheduled. Pinging the closer
    // about a lead who has moved on teaches them to ignore the channel.
    if (c.lead_email) {
      const { data: later } = await db
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .ilike("lead_email", String(c.lead_email))
        .gt("created_at", String(c.created_at))
        .limit(1);
      if (later?.length) continue;
    }

    if (!(await claimFire(orgId, type, `${c.id}:${c.requested_followup_at}`))) continue;
    const lead = await leadSummary(orgId, {
      leadId: c.lead_id as string | null,
      email: c.lead_email as string | null,
    });
    await emitEvent(
      orgId,
      type,
      { type: "call", id: String(c.id) },
      {
        call_id: c.id,
        lead_id: lead.id,
        lead,
        lead_email: c.lead_email,
        closer_name: c.closer_name,
        requested_followup_at: c.requested_followup_at,
        followup_amount_pitched_cents: c.followup_amount_pitched_cents,
        followup_reason: c.followup_reason_other || c.followup_reason,
        followup_notes: c.followup_notes,
        currency: c.original_currency,
        time_zone: settings.timeZone || null,
      },
    );
    n += 1;
  }
  return n;
}

async function fireReport(
  orgId: string,
  eventType: "report.daily_sales" | "report.weekly_sales",
  w: { from: string; to: string; key: string },
  settings: NotificationSettingsT,
) {
  // Checked first so the queries below do not run every minute between the
  // send hour and midnight; claimed only after they succeed, so a failed
  // query retries on the next tick instead of losing the day's report.
  const { data: already } = await db
    .from("scheduled_event_fires")
    .select("id")
    .eq("org_id", orgId)
    .eq("event_type", eventType)
    .eq("fire_key", w.key)
    .maybeSingle();
  if (already) return 0;

  const { startIso, endIso } = zonedDayRangeUtc(w.from, w.to, settings.timeZone);
  const [setters, closers] = await Promise.all([
    // activity_date is the rep's own local date, so it is compared as a date.
    db
      .from("setter_activity")
      .select(
        "team_member_name, dials, sets, calls_on_calendar, live_calls, closes, cash_collected_cents, original_currency",
      )
      .eq("org_id", orgId)
      .gte("activity_date", w.from)
      .lte("activity_date", w.to),
    // A closer's call row is created when they submit the post-call form, so
    // creation time inside the local day is "calls they took that day".
    db
      .from("calls")
      .select(
        "closer_name, showed, closed, status, eod_lead_status, cash_collected_cents, original_currency",
      )
      .eq("org_id", orgId)
      .not("closer_name", "is", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);
  if (setters.error) throw new Error(setters.error.message);
  if (closers.error) throw new Error(closers.error.message);

  const board = buildLeaderboard(setters.data ?? [], closers.data ?? []);
  if (!(await claimFire(orgId, eventType, w.key))) return 0;
  await emitEvent(
    orgId,
    eventType,
    { type: "report", id: null },
    {
      period_from: w.from,
      period_to: w.to,
      period_label: periodLabel(w.from, w.to),
      time_zone: settings.timeZone,
      ...board,
    },
  );
  return 1;
}
