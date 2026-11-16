/**
 * One scheduler tick: retry deliveries that failed, then find what has become
 * due since the last tick and fire it, once.
 *
 * Called every minute by pg_cron (20261113090000_event_scheduler.sql) through
 * /api/public/scheduler-tick. Every fire goes through `fireOnce`, which claims
 * the item in `scheduled_event_fires` before sending — overlapping ticks
 * cannot double-ping a channel — and records how delivery went, so a Discord
 * 429 or 5xx is retried with backoff instead of losing the alert.
 *
 * A workspace is only examined for the event types it has an active
 * subscription to. Nobody listening means nothing to compute, and a
 * workspace that has never wired a channel cannot be flooded the moment it
 * first does — the lookback bound in scheduler-rules.ts covers the rest.
 */
import { TOUCHPOINT_LABELS } from "./call-confirmations";
import { callPayload, followUpPayload } from "./event-emitters.server";
import { FOLLOWUP_LEAD_STATUSES } from "./eod-reports";
import {
  alreadyFired,
  db,
  fireOnce,
  leadSummary,
  loadNotificationSettings,
  pingRoleIds,
  retryFailedFires,
} from "./notify.server";
import {
  attachPrevious,
  buildSalesReport,
  previousWindow,
  type CloserCall,
  type EodRow,
  type ReportKind,
  type RosterMember,
  type SalesReport,
} from "./sales-report";
import {
  BOOKING_COLUMNS,
  callsBookedTotal,
  isBooking,
  type BookingRow,
} from "./call-booking-metrics";
import {
  buildSourceBoard,
  type SourceBoard,
  type SourceCall,
  type SourceLead,
} from "./source-leaderboard";
import {
  fireAppliedNotBooked,
  fireEodNoShows,
  firePaymentFollowUpsDue,
  firePrecallProgress,
  fireTodaysCalls,
  syncGoogleRsvps,
} from "./scheduler-ops.server";
import { escapeLike } from "./sql-like";
import {
  DUE_LOOKBACK_MS,
  SCHEDULED_EVENT_TYPES,
  dailyReportWindow,
  UNCONFIRMED_LOOKAHEAD_MS,
  followUpEventType,
  followUpLoggedType,
  monthlyReportWindow,
  periodLabel,
  unconfirmedAlertDue,
  weeklyReportWindow,
} from "./scheduler-rules";
import type { NotificationSettingsT } from "./workspace-settings.functions";
import { zonedDayRangeUtc } from "./zoned-time";

type Counts = Record<string, number>;

export async function runSchedulerTick(now: Date = new Date()) {
  // Retries first: they are older, and an alert that already missed its
  // moment once should not queue behind new work.
  let retried = 0;
  const tickErrors: string[] = [];
  try {
    retried = await retryFailedFires(now);
  } catch (err) {
    tickErrors.push(`retries: ${err instanceof Error ? err.message : String(err)}`);
  }

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
    // Logged before due, so a callback saved already overdue still posts
    // its details first and the "CALL THEM ASAP" can link to them.
    if (types.has("callback.logged"))
      await run("callback.logged", () => fireCallbacksLogged(orgId, settings, now));
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
    if (types.has("report.monthly_sales")) {
      // The month's last local day, at the sales-report hour.
      const w = monthlyReportWindow(settings.timeZone, settings.dailyReportHour, now);
      if (w.due)
        await run("report.monthly_sales", () =>
          fireReport(orgId, "report.monthly_sales", w, settings),
        );
      else if (w.reason === "no workspace timezone set")
        skipped.push(`report.monthly_sales: ${w.reason}`);
    }

    if (types.has("content.schedule_daily")) {
      const w = dailyReportWindow(settings.timeZone, settings.contentScheduleHour, now);
      if (w.due) await run("content.schedule_daily", () => fireContentSchedule(orgId, w, settings));
      else if (w.reason === "no workspace timezone set")
        skipped.push(`content.schedule_daily: ${w.reason}`);
    }
    const sourceWindows = [
      [
        "report.top_sources_daily",
        dailyReportWindow(settings.timeZone, settings.dailyReportHour, now),
      ],
      [
        "report.top_sources_weekly",
        weeklyReportWindow(
          settings.timeZone,
          settings.weeklyReportDay,
          settings.dailyReportHour,
          now,
        ),
      ],
      [
        "report.top_sources_monthly",
        monthlyReportWindow(settings.timeZone, settings.dailyReportHour, now),
      ],
    ] as const;
    for (const [type, w] of sourceWindows) {
      if (!types.has(type)) continue;
      if (w.due) await run(type, () => fireTopSources(orgId, type, w, settings));
      else if (w.reason === "no workspace timezone set") skipped.push(`${type}: ${w.reason}`);
    }

    // Ops channels (scheduler-ops.server.ts).
    if (types.has("lead.applied_not_booked"))
      await run("lead.applied_not_booked", () => fireAppliedNotBooked(orgId, settings, now));
    if (types.has("eod.missing"))
      await run("eod.missing", () => fireEodNoShows(orgId, settings, now));
    if (types.has("calls.today"))
      await run("calls.today", () => fireTodaysCalls(orgId, settings, now));
    if (types.has("payment.followup_due"))
      await run("payment.followup_due", () => firePaymentFollowUpsDue(orgId, settings, now));
    if (types.has("precall.progress"))
      await run("precall.progress", () => firePrecallProgress(orgId, settings, now));
    if (types.has("call.confirmed"))
      await run("google.rsvp", () => syncGoogleRsvps(orgId, settings, now));

    if (errors.length) console.error(`scheduler org ${orgId}:`, errors.join("; "));
    results.push({ orgId, fired, skipped, errors });
  }
  if (tickErrors.length) console.error("scheduler:", tickErrors.join("; "));
  return { at: now.toISOString(), retried, errors: tickErrors, orgs: results };
}

/* ------------------------------------------------------------------ */

/**
 * The #calls-unconfirmed schedule (scheduler-rules.ts): each still-unconfirmed
 * call gets up to five alerts, each fired once.
 */
async function fireUnconfirmed(orgId: string, settings: NotificationSettingsT, now: Date) {
  const tp = settings.confirmTouchpoint;
  const { data: calls, error } = await db
    .from("calls")
    .select("id, scheduled_for, created_at, cancelled, status")
    .eq("org_id", orgId)
    .eq("status", "booked")
    .gt("scheduled_for", now.toISOString())
    .lte("scheduled_for", new Date(now.getTime() + UNCONFIRMED_LOOKAHEAD_MS).toISOString());
  if (error) throw new Error(error.message);

  type Due = {
    id: string;
    scheduled_for: string;
    alert: NonNullable<ReturnType<typeof unconfirmedAlertDue>>;
  };
  const due: Due[] = [];
  for (const c of (calls ?? []) as Array<{
    id: string;
    scheduled_for: string;
    created_at: string | null;
    cancelled: boolean | null;
  }>) {
    if (c.cancelled) continue;
    const alert = unconfirmedAlertDue(
      new Date(c.scheduled_for),
      c.created_at ? new Date(c.created_at) : null,
      settings.timeZone,
      now,
    );
    if (alert) due.push({ id: c.id, scheduled_for: c.scheduled_for, alert });
  }
  if (!due.length) return 0;

  const keyOf = (c: Due) => `${c.id}:${c.scheduled_for}:${c.alert.n}`;
  const done = await alreadyFired(orgId, "call.unconfirmed", due.map(keyOf));
  const fresh = due.filter((c) => !done.has(keyOf(c)));
  if (!fresh.length) return 0;

  const { data: confs } = await db
    .from("call_confirmations")
    .select(`call_id, overall_status, ${tp}_sent_at`)
    .in(
      "call_id",
      fresh.map((c) => c.id),
    );
  const byCall = new Map<string, Record<string, unknown>>(
    ((confs ?? []) as Array<Record<string, unknown>>).map((c) => [String(c.call_id), c]),
  );

  let n = 0;
  for (const c of fresh) {
    const conf = byCall.get(c.id);
    // Confirmed: the schedule stops.
    if (conf?.[`${tp}_sent_at`]) continue;
    if (conf?.overall_status === "cancelled" || conf?.overall_status === "rescheduled") continue;
    const built = await callPayload(orgId, c.id);
    if (!built) continue;
    const sent = await fireOnce(
      orgId,
      "call.unconfirmed",
      keyOf(c),
      { type: "call", id: c.id },
      {
        ...built.payload,
        alert_number: c.alert.n,
        ping_role_ids: pingRoleIds(settings, c.alert.pings),
        touchpoint: tp,
        touchpoint_label: TOUCHPOINT_LABELS[tp],
        time_zone: settings.timeZone || null,
      },
    );
    if (sent) n += 1;
  }
  return n;
}

type CallbackItem = {
  id: string;
  entity_id: string | null;
  owner_id: string | null;
  due_at: string;
  next_action: string | null;
  payload: { lead_name?: string } | null;
};
const CALLBACK_COLS = "id, entity_id, owner_id, due_at, next_action, payload, state";
/** One logged/due pair per callback per due time: re-logging a callback for
 *  a new time posts again, and its "CALL THEM ASAP" links the new post. */
const callbackKey = (it: CallbackItem) => `${it.id}:${it.due_at}`;

async function callbackPayload(orgId: string, it: CallbackItem, settings: NotificationSettingsT) {
  const lead = await leadSummary(orgId, { leadId: it.entity_id });
  return {
    callback_id: it.id,
    lead_id: lead.id,
    lead: { ...lead, full_name: lead.full_name ?? it.payload?.lead_name ?? null },
    lead_name: it.payload?.lead_name ?? null,
    due_at: it.due_at,
    next_action: it.next_action,
    time_zone: settings.timeZone || null,
  };
}

/**
 * Callbacks saved since the last ticks: posted to #setter-logged-call-backs
 * when logged, not when due. Bounded to a day of saves so the first run does
 * not replay every callback ever logged.
 */
async function fireCallbacksLogged(orgId: string, settings: NotificationSettingsT, now: Date) {
  const since = new Date(now.getTime() - DUE_LOOKBACK_MS).toISOString();
  const { data: items, error } = await db
    .from("operational_work_items")
    .select(CALLBACK_COLS)
    .eq("org_id", orgId)
    .eq("entity_type", "dialer_callback")
    .neq("state", "completed")
    .not("due_at", "is", null)
    .or(`created_at.gte.${since},updated_at.gte.${since}`);
  if (error) throw new Error(error.message);
  const list = (items ?? []) as CallbackItem[];
  const done = await alreadyFired(orgId, "callback.logged", list.map(callbackKey));
  let n = 0;
  for (const it of list) {
    if (done.has(callbackKey(it))) continue;
    const sent = await fireOnce(
      orgId,
      "callback.logged",
      callbackKey(it),
      { type: "operational_work_item", id: it.id },
      await callbackPayload(orgId, it, settings),
    );
    if (sent) n += 1;
  }
  return n;
}

/** At the due time: "CALL THEM ASAP @Setter", linking the logged message. */
async function fireCallbacksDue(orgId: string, settings: NotificationSettingsT, now: Date) {
  const { data: items, error } = await db
    .from("operational_work_items")
    .select(CALLBACK_COLS)
    .eq("org_id", orgId)
    .eq("entity_type", "dialer_callback")
    .neq("state", "completed")
    .lte("due_at", now.toISOString())
    .gte("due_at", new Date(now.getTime() - DUE_LOOKBACK_MS).toISOString());
  if (error) throw new Error(error.message);

  const list = (items ?? []) as CallbackItem[];
  const done = await alreadyFired(orgId, "callback.due", list.map(callbackKey));

  let n = 0;
  for (const it of list) {
    if (done.has(callbackKey(it))) continue;
    const sent = await fireOnce(
      orgId,
      "callback.due",
      callbackKey(it),
      { type: "operational_work_item", id: it.id },
      {
        ...(await callbackPayload(orgId, it, settings)),
        ping_role_ids: pingRoleIds(settings, ["setter"]),
        reply_to: { event_type: "callback.logged", fire_key: callbackKey(it) },
      },
    );
    if (sent) n += 1;
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

  type Row = Record<string, string | number | null>;
  type FollowUpType = "followup.short_term_due" | "followup.long_term_due";
  const keyOf = (c: Row) => `${c.id}:${c.requested_followup_at}`;
  const list: Array<{ c: Row; type: FollowUpType }> = [];
  for (const c of (calls ?? []) as Row[]) {
    const type = followUpEventType(c.eod_lead_status as string | null);
    if (type && types.has(type)) list.push({ c, type });
  }
  if (!list.length) return 0;

  const done: Record<FollowUpType, Set<string>> = {
    "followup.short_term_due": await alreadyFired(
      orgId,
      "followup.short_term_due",
      list.filter((x) => x.type === "followup.short_term_due").map((x) => keyOf(x.c)),
    ),
    "followup.long_term_due": await alreadyFired(
      orgId,
      "followup.long_term_due",
      list.filter((x) => x.type === "followup.long_term_due").map((x) => keyOf(x.c)),
    ),
  };

  let n = 0;
  for (const { c, type } of list) {
    if (done[type].has(keyOf(c))) continue;

    // A later call with this lead means someone already followed up — the
    // lead closed, no-showed again or was rescheduled. Pinging the closer
    // about a lead who has moved on teaches them to ignore the channel.
    if (c.lead_email) {
      const { data: later } = await db
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .ilike("lead_email", escapeLike(String(c.lead_email)))
        .gt("created_at", String(c.created_at))
        .limit(1);
      if (later?.length) continue;
    }

    const lead = await leadSummary(orgId, {
      leadId: c.lead_id as string | null,
      email: c.lead_email as string | null,
    });
    // "FOLLOW UP ASAP @Closer", linking the message posted when the closer
    // logged it (event-emitters.server.ts).
    const sent = await fireOnce(
      orgId,
      type,
      keyOf(c),
      { type: "call", id: String(c.id) },
      {
        ...followUpPayload(c, lead, settings.timeZone),
        ping_role_ids: pingRoleIds(settings, ["closer"]),
        reply_to: { event_type: followUpLoggedType(type), fire_key: keyOf(c) },
      },
    );
    if (sent) n += 1;
  }
  return n;
}

const REPORT_KIND = {
  "report.daily_sales": "Daily",
  "report.weekly_sales": "Weekly",
  "report.monthly_sales": "Monthly",
} as const;

/** Everything one sales report window needs, built (sales-report.ts). */
async function loadSalesWindow(
  orgId: string,
  kind: ReportKind,
  from: string,
  to: string,
  timeZone: NotificationSettingsT["timeZone"],
): Promise<SalesReport> {
  const { startIso, endIso } = zonedDayRangeUtc(from, to, timeZone);
  const [eods, closers, roster] = await Promise.all([
    // activity_date is the rep's own local date, so it is compared as a date.
    db
      .from("setter_activity")
      .select(
        "user_id, team_member_name, role, dials, connections, sets, replies, qualified_convos, outbound_dms_sent, calls_on_calendar, closes, cash_collected_cents, total_revenue_cents, original_currency",
      )
      .eq("org_id", orgId)
      .gte("activity_date", from)
      .lte("activity_date", to),
    // A closer's call row is created when they submit the post-call form, so
    // creation time inside the window is "calls they took in it".
    db
      .from("calls")
      .select(
        "closer_name, setter_id, showed, closed, status, eod_lead_status, cash_collected_cents, contract_value_cents, original_currency",
      )
      .eq("org_id", orgId)
      .not("closer_name", "is", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    db.from("team_members").select("name, role, active").eq("org_id", orgId),
  ]);
  if (eods.error) throw new Error(eods.error.message);
  if (closers.error) throw new Error(closers.error.message);
  const closerRows = (closers.data ?? []) as CloserCall[];

  // Setter names for calls whose setter filed no EOD in the window.
  const setterIds = [
    ...new Set(closerRows.map((c) => c.setter_id).filter((x): x is string => !!x)),
  ];
  const setterNames = new Map<string, string>();
  if (setterIds.length) {
    const { data } = await db.from("profiles").select("id, display_name").in("id", setterIds);
    for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>)
      if (p.display_name) setterNames.set(p.id, p.display_name);
  }

  // Bookings made in the window (call-booking-metrics.ts) and calls on the
  // calendar in it.
  const [madeRes, scheduledRes] = await Promise.all([
    db
      .from("calls")
      .select(BOOKING_COLUMNS)
      .eq("org_id", orgId)
      .not("source_connector", "is", null)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    db
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .gte("scheduled_for", startIso)
      .lt("scheduled_for", endIso),
  ]);
  if (madeRes.error) throw new Error(madeRes.error.message);
  if (scheduledRes.error) throw new Error(scheduledRes.error.message);
  const eodRows = (eods.data ?? []) as EodRow[];
  const synced = ((madeRes.data ?? []) as BookingRow[]).filter(isBooking).length;
  const setterBooked = eodRows.reduce((t, r) => t + (Number(r.calls_on_calendar) || 0), 0);

  return buildSalesReport({
    kind,
    eodRows,
    closerCalls: closerRows,
    setterNames,
    roster: (roster.data ?? []) as RosterMember[],
    booked: callsBookedTotal(synced, setterBooked),
    onCalendar: scheduledRes.count ?? 0,
  });
}

async function fireReport(
  orgId: string,
  eventType: "report.daily_sales" | "report.weekly_sales" | "report.monthly_sales",
  w: { from: string; to: string; key: string },
  settings: NotificationSettingsT,
) {
  // Checked first so the queries below do not run every minute between the
  // send hour and midnight; claimed only once they have succeeded, so a
  // failed query retries on the next tick instead of losing the report.
  if ((await alreadyFired(orgId, eventType, [w.key])).size) return 0;

  const kind = REPORT_KIND[eventType];
  let report = await loadSalesWindow(orgId, kind, w.from, w.to, settings.timeZone);

  if (kind !== "Daily") {
    const p = previousWindow(kind, w.from);
    const previous = await loadSalesWindow(orgId, kind, p.from, p.to, settings.timeZone);
    report = attachPrevious(report, previous);
    const sources = await loadSourceBoard(orgId, w.from, w.to, settings.timeZone);
    const top = sources.sources[0];
    report.top_source = top ? { name: top.name, leads: top.leads, booked: top.booked } : null;
  }
  if (kind === "Monthly") {
    const { data } = await db
      .from("rep_kpi_targets")
      .select("target_value")
      .eq("org_id", orgId)
      .eq("role", "closer")
      .eq("period", "monthly")
      .eq("metric_key", "cash_collected_cents")
      .eq("is_active", true);
    const total = ((data ?? []) as Array<{ target_value: number }>).reduce(
      (t, r) => t + (Number(r.target_value) || 0),
      0,
    );
    report.cash_target_cents = total || null;
  }

  const sent = await fireOnce(
    orgId,
    eventType,
    w.key,
    { type: "report", id: null },
    {
      period_from: w.from,
      period_to: w.to,
      period_label: periodLabel(w.from, w.to),
      month_label: monthLabel(w.from),
      time_zone: settings.timeZone,
      ...report,
    },
  );
  return sent ? 1 : 0;
}

/** "2026-11-01" → "November 2026". */
function monthLabel(date: string) {
  const [y, m] = date.split("-").map(Number);
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return y && m ? `${names[m - 1]} ${y}` : "";
}

async function fireContentSchedule(
  orgId: string,
  w: { from: string; to: string; key: string },
  settings: NotificationSettingsT,
) {
  if ((await alreadyFired(orgId, "content.schedule_daily", [w.key])).size) return 0;
  // scheduled_date is the calendar date the piece is planned for, set on the
  // content calendar in the team's own terms — compared as a date.
  const { data, error } = await db
    .from("content_pieces")
    .select("id, title, platform, scheduled_time, pipeline_status")
    .eq("org_id", orgId)
    .eq("scheduled_date", w.from)
    .order("scheduled_time", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  const sent = await fireOnce(
    orgId,
    "content.schedule_daily",
    w.key,
    { type: "report", id: null },
    {
      period_label: periodLabel(w.from, w.to),
      date: w.from,
      time_zone: settings.timeZone,
      pieces: data ?? [],
    },
  );
  return sent ? 1 : 0;
}

/** The top-sources board for one window (source-leaderboard.ts). */
async function loadSourceBoard(
  orgId: string,
  from: string,
  to: string,
  timeZone: NotificationSettingsT["timeZone"],
): Promise<SourceBoard> {
  const { startIso, endIso } = zonedDayRangeUtc(from, to, timeZone);
  const leadCols =
    "id, email, source_platform, source_medium, source_content_tag, source_content_id, first_touch_content_id, application_data, application_partial, created_at";

  const [leadsRes, callsRes] = await Promise.all([
    db
      .from("leads")
      .select(leadCols)
      .eq("org_id", orgId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    db
      .from("calls")
      .select(
        "lead_id, lead_email, created_at, source_connector, cancelled, closed, cash_collected_cents, contract_value_cents, original_currency",
      )
      .eq("org_id", orgId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (callsRes.error) throw new Error(callsRes.error.message);
  const windowLeads = (leadsRes.data ?? []) as SourceLead[];
  const windowCalls = (callsRes.data ?? []) as SourceCall[];

  // Calls in the window can belong to leads created before it; fetch those
  // so a booking is credited to its lead's real source.
  const have = new Set(windowLeads.map((l) => l.id));
  const ids = [
    ...new Set(windowCalls.map((c) => c.lead_id).filter((x): x is string => !!x)),
  ].filter((id) => !have.has(id));
  const emails = [
    ...new Set(
      windowCalls
        .filter((c) => !c.lead_id && c.lead_email)
        .map((c) => String(c.lead_email).trim().toLowerCase()),
    ),
  ];
  const extra: SourceLead[] = [];
  if (ids.length) {
    const { data } = await db.from("leads").select(leadCols).eq("org_id", orgId).in("id", ids);
    extra.push(...((data ?? []) as SourceLead[]));
  }
  // Case-insensitive, with LIKE wildcards escaped (an `_` in an email is a
  // wildcard otherwise). One small query per email, a few at a time.
  for (let i = 0; i < emails.length; i += 10) {
    const batch = await Promise.all(
      emails
        .slice(i, i + 10)
        .map((e) =>
          db
            .from("leads")
            .select(leadCols)
            .eq("org_id", orgId)
            .ilike("email", escapeLike(e))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
    );
    for (const r of batch) if (r.data) extra.push(r.data as SourceLead);
  }

  const knownLeads = [...windowLeads, ...extra];
  const contentIds = [
    ...new Set(
      knownLeads
        .map((l) => l.source_content_id ?? l.first_touch_content_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const titles = new Map<string, string>();
  if (contentIds.length) {
    const { data } = await db
      .from("content_pieces")
      .select("id, title")
      .eq("org_id", orgId)
      .in("id", contentIds);
    for (const c of (data ?? []) as Array<{ id: string; title: string | null }>)
      titles.set(c.id, c.title || "Untitled piece");
  }

  return buildSourceBoard(windowLeads, windowCalls, knownLeads, titles);
}

const SOURCE_KIND = {
  "report.top_sources_daily": "Daily",
  "report.top_sources_weekly": "Weekly",
  "report.top_sources_monthly": "Monthly",
} as const;

async function fireTopSources(
  orgId: string,
  eventType:
    "report.top_sources_daily" | "report.top_sources_weekly" | "report.top_sources_monthly",
  w: { from: string; to: string; key: string },
  settings: NotificationSettingsT,
) {
  if ((await alreadyFired(orgId, eventType, [w.key])).size) return 0;
  const kind = SOURCE_KIND[eventType];
  const board = await loadSourceBoard(orgId, w.from, w.to, settings.timeZone);
  let prev: SourceBoard | null = null;
  if (kind !== "Daily") {
    const p = previousWindow(kind, w.from);
    prev = await loadSourceBoard(orgId, p.from, p.to, settings.timeZone);
  }
  const sent = await fireOnce(
    orgId,
    eventType,
    w.key,
    { type: "report", id: null },
    {
      kind,
      period_from: w.from,
      period_to: w.to,
      period_label: periodLabel(w.from, w.to),
      month_label: monthLabel(w.from),
      time_zone: settings.timeZone,
      ...board,
      prev_totals: prev?.totals ?? null,
      prev_sources: prev ? prev.sources.map((r) => ({ name: r.name, leads: r.leads })) : null,
    },
  );
  return sent ? 1 : 0;
}
