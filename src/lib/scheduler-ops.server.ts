/**
 * The ops channels the minute scheduler feeds (Aryan, 2026-11-15):
 *
 *   lead.applied_not_booked   #applied-not-booked   full application, no call booked after N minutes
 *   eod.missing               #eod-no-show          a rep who didn't file the previous day, one post each
 *   calls.today               #todays-calls         the day's booked calls, early morning
 *   payment.followup_due      #payment-follow-ups   "COLLECT PAYMENT ASAP" at the due time
 *   precall.progress          #pre-call-assets      one post per booked call, edited as assets open
 *   (Google Calendar sync)    #calls-confirmed      an accepted invite ticks the confirm step
 *
 * Everything goes through fireOnce, so a retried tick never posts twice.
 */
import { notifyTouchpointMarked, paymentFollowUpPayload } from "./event-emitters.server";
import { rsvpFor } from "./google-calendar";
import { googleAccessToken, listGoogleEvents } from "./google-calendar.server";
import { alreadyFired, db, fireOnce, leadSummary, pingRoleIds } from "./notify.server";
import { DUE_LOOKBACK_MS, dailyReportWindow, periodLabel } from "./scheduler-rules";
import { escapeLike } from "./sql-like";
import type { NotificationSettingsT } from "./workspace-settings.functions";
import { addCalendarDays, zonedDayRangeUtc } from "./zoned-time";

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Team members with their Discord user, keyed every way a call names a rep. */
async function rosterIndex(orgId: string) {
  const { data } = await db
    .from("team_members")
    .select("name, role, active, user_id, discord_user_id")
    .eq("org_id", orgId);
  const rows = (
    (data ?? []) as Array<{
      name: string | null;
      role: string | null;
      active: boolean | null;
      user_id: string | null;
      discord_user_id: string | null;
    }>
  ).filter((m) => m.active !== false);
  const byUser = new Map(rows.filter((m) => m.user_id).map((m) => [m.user_id!, m]));
  const byName = new Map(rows.filter((m) => m.name).map((m) => [m.name!.trim().toLowerCase(), m]));
  return { rows, byUser, byName };
}

type Roster = Awaited<ReturnType<typeof rosterIndex>>;

/** "<@123>" when the rep has a Discord user, else their name. */
function repTag(roster: Roster, ref: { userId?: unknown; name?: unknown }, mentions: Set<string>) {
  const m =
    (ref.userId ? roster.byUser.get(s(ref.userId)) : undefined) ??
    (ref.name ? roster.byName.get(s(ref.name).trim().toLowerCase()) : undefined);
  const id = m?.discord_user_id?.trim();
  if (id && /^\d+$/.test(id)) {
    mentions.add(id);
    return `<@${id}>`;
  }
  return m?.name ?? (s(ref.name) || "");
}

/* ------------------------------------------------------------------ */

export async function fireAppliedNotBooked(
  orgId: string,
  settings: NotificationSettingsT,
  now: Date,
) {
  const waitMs = (settings.appliedNotBookedMinutes || 60) * 60 * 1000;
  const { data: leads, error } = await db
    .from("leads")
    .select(
      "id, full_name, email, phone, application_data, application_partial, ticket_tier, source_platform, source_medium, source_campaign, created_at",
    )
    .eq("org_id", orgId)
    .lte("created_at", new Date(now.getTime() - waitMs).toISOString())
    .gte("created_at", new Date(now.getTime() - waitMs - DUE_LOOKBACK_MS).toISOString());
  if (error) throw new Error(error.message);
  const applied = ((leads ?? []) as Row[]).filter(
    (l) =>
      !l.application_partial &&
      l.application_data &&
      typeof l.application_data === "object" &&
      Object.keys(l.application_data as object).length > 0,
  );
  if (!applied.length) return 0;
  const done = await alreadyFired(
    orgId,
    "lead.applied_not_booked",
    applied.map((l) => s(l.id)),
  );
  const { data: tiers } = await db.from("offer_tiers").select("key, label").eq("org_id", orgId);
  const tierLabel = new Map(((tiers ?? []) as Row[]).map((t) => [s(t.key), s(t.label)]));

  let n = 0;
  for (const l of applied) {
    if (done.has(s(l.id))) continue;
    const { data: byId } = await db
      .from("calls")
      .select("id")
      .eq("org_id", orgId)
      .eq("lead_id", s(l.id))
      .limit(1);
    if (byId?.length) continue;
    if (l.email) {
      const { data: byEmail } = await db
        .from("calls")
        .select("id")
        .eq("org_id", orgId)
        .ilike("lead_email", escapeLike(s(l.email)))
        .limit(1);
      if (byEmail?.length) continue;
    }
    const lead = await leadSummary(orgId, { leadId: s(l.id) });
    const sent = await fireOnce(
      orgId,
      "lead.applied_not_booked",
      s(l.id),
      { type: "lead", id: s(l.id) },
      {
        lead: {
          ...lead,
          ticket_tier: l.ticket_tier,
          ticket_tier_label: tierLabel.get(s(l.ticket_tier)) || null,
        },
        lead_id: s(l.id),
        application_data: l.application_data,
        applied_at: l.created_at,
        time_zone: settings.timeZone || null,
        ping_role_ids: pingRoleIds(settings, ["setter"]),
      },
    );
    if (sent) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */

const FORM_ROLE: Record<string, string> = {
  dm_setter: "dm_setter",
  inbound_dialer: "inbound_dialer",
  closer: "closer",
};

export async function fireEodNoShows(orgId: string, settings: NotificationSettingsT, now: Date) {
  const w = dailyReportWindow(settings.timeZone, settings.eodNoShowHour ?? 0, now);
  if (!w.due) return 0;
  // Posted after the day is over: it covers the previous local day.
  const date = addCalendarDays(w.from, -1);
  const roster = await rosterIndex(orgId);
  const reps = roster.rows.filter((m) => m.name && FORM_ROLE[m.role ?? ""]);
  if (!reps.length) return 0;

  const keys = reps.map((m) => `${date}:${m.name}`);
  const done = await alreadyFired(orgId, "eod.missing", keys);
  const { startIso, endIso } = zonedDayRangeUtc(date, date, settings.timeZone);

  const [{ data: eods }, { data: scheduled }, { data: postCalls }] = await Promise.all([
    db
      .from("setter_activity")
      .select("team_member_name")
      .eq("org_id", orgId)
      .eq("activity_date", date),
    db
      .from("calls")
      .select("id, lead_id, lead_email, closer_id, closer_name, scheduled_for, cancelled, status")
      .eq("org_id", orgId)
      .not("source_connector", "is", null)
      .gte("scheduled_for", startIso)
      .lt("scheduled_for", endIso),
    db
      .from("calls")
      .select("closer_name, lead_email")
      .eq("org_id", orgId)
      .not("closer_name", "is", null)
      .gte("created_at", startIso),
  ]);
  const filed = new Set(
    ((eods ?? []) as Row[]).map((r) => s(r.team_member_name).trim().toLowerCase()),
  );
  const notes = new Set(
    ((postCalls ?? []) as Row[]).map((r) => s(r.lead_email).trim().toLowerCase()).filter(Boolean),
  );

  let n = 0;
  for (const m of reps) {
    const key = `${date}:${m.name}`;
    if (done.has(key)) continue;
    let missing = "";
    let calls: Array<{ lead: string; time: string }> = [];
    if (m.role === "closer") {
      // Booked calls assigned to this closer that day with no post-call notes.
      const mine = ((scheduled ?? []) as Row[]).filter(
        (c) =>
          !c.cancelled &&
          s(c.status) !== "cancelled" &&
          ((m.user_id && s(c.closer_id) === m.user_id) ||
            s(c.closer_name).trim().toLowerCase() === m.name!.trim().toLowerCase()),
      );
      const open = mine.filter((c) => !notes.has(s(c.lead_email).trim().toLowerCase()));
      if (!open.length) continue;
      missing = `Post-call notes for ${open.length} call${open.length === 1 ? "" : "s"}`;
      for (const c of open) {
        const lead = await leadSummary(orgId, {
          leadId: s(c.lead_id) || null,
          email: s(c.lead_email) || null,
        });
        calls.push({
          lead: lead.full_name || s(c.lead_email) || "Unknown lead",
          time: s(c.scheduled_for),
        });
      }
    } else {
      if (filed.has(m.name!.trim().toLowerCase())) continue;
      missing = m.role === "inbound_dialer" ? "Dialer EOD" : "DM Setter EOD";
    }
    const mentions = new Set<string>();
    const tag = repTag(roster, { userId: m.user_id, name: m.name }, mentions);
    const sent = await fireOnce(
      orgId,
      "eod.missing",
      key,
      { type: "report", id: null },
      {
        rep: tag,
        rep_name: m.name,
        role: m.role,
        date,
        date_label: periodLabel(date, date),
        missing,
        calls,
        form_path: `/eod-reports?role=${FORM_ROLE[m.role ?? ""]}`,
        mention_user_ids: [...mentions],
        time_zone: settings.timeZone || null,
      },
    );
    if (sent) n += 1;
    calls = [];
  }
  return n;
}

/* ------------------------------------------------------------------ */

export async function fireTodaysCalls(orgId: string, settings: NotificationSettingsT, now: Date) {
  const w = dailyReportWindow(settings.timeZone, settings.todaysCallsHour ?? 6, now);
  if (!w.due) return 0;
  if ((await alreadyFired(orgId, "calls.today", [w.key])).size) return 0;
  const { startIso, endIso } = zonedDayRangeUtc(w.from, w.to, settings.timeZone);
  const { data, error } = await db
    .from("calls")
    .select(
      "id, lead_id, lead_email, setter_id, closer_id, closer_name, scheduled_for, meeting_link, cancelled, status, source_connector, google_rsvp_status",
    )
    .eq("org_id", orgId)
    .not("source_connector", "is", null)
    .gte("scheduled_for", startIso)
    .lt("scheduled_for", endIso)
    .order("scheduled_for", { ascending: true });
  if (error) throw new Error(error.message);
  const calls = ((data ?? []) as Row[]).filter((c) => !c.cancelled && s(c.status) !== "cancelled");

  const tp = settings.confirmTouchpoint;
  const { data: confs } = calls.length
    ? await db
        .from("call_confirmations")
        .select(`call_id, ${tp}_sent_at`)
        .in(
          "call_id",
          calls.map((c) => s(c.id)),
        )
    : { data: [] };
  const confirmed = new Set(
    ((confs ?? []) as Row[]).filter((c) => c[`${tp}_sent_at`]).map((c) => s(c.call_id)),
  );

  const roster = await rosterIndex(orgId);
  const mentions = new Set<string>();
  const list = [];
  for (const c of calls) {
    const lead = await leadSummary(orgId, {
      leadId: s(c.lead_id) || null,
      email: s(c.lead_email) || null,
    });
    list.push({
      time: c.scheduled_for,
      lead_name: lead.full_name || s(c.lead_email) || "Unknown lead",
      phone: lead.phone,
      lead_id: lead.id,
      setter: c.setter_id ? repTag(roster, { userId: c.setter_id }, mentions) : "",
      closer: repTag(roster, { userId: c.closer_id, name: c.closer_name }, mentions),
      confirmed: confirmed.has(s(c.id)) || s(c.google_rsvp_status) === "accepted",
      meeting_link: c.meeting_link,
    });
  }
  const sent = await fireOnce(
    orgId,
    "calls.today",
    w.key,
    { type: "report", id: null },
    {
      date_label: periodLabel(w.from, w.to),
      calls: list,
      mention_user_ids: [...mentions],
      time_zone: settings.timeZone || null,
    },
  );
  return sent ? 1 : 0;
}

/* ------------------------------------------------------------------ */

export async function firePaymentFollowUpsDue(
  orgId: string,
  settings: NotificationSettingsT,
  now: Date,
) {
  const { data, error } = await db
    .from("calls")
    .select(
      "id, lead_id, lead_email, closer_name, eod_lead_status, cash_collected_cents, contract_value_cents, payment_followup_at, payment_followup_amount_cents, payment_followup_method, payment_followup_notes, original_currency, created_at",
    )
    .eq("org_id", orgId)
    .not("payment_followup_at", "is", null)
    .lte("payment_followup_at", now.toISOString())
    .gte("payment_followup_at", new Date(now.getTime() - DUE_LOOKBACK_MS).toISOString());
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return 0;
  const keyOf = (c: Row) => `${s(c.id)}:${s(c.payment_followup_at)}`;
  const done = await alreadyFired(orgId, "payment.followup_due", rows.map(keyOf));

  let n = 0;
  for (const c of rows) {
    if (done.has(keyOf(c))) continue;
    // Already paid since the call: nothing to chase.
    if (c.lead_email) {
      const { data: paid } = await db
        .from("payments")
        .select("id")
        .eq("org_id", orgId)
        .eq("status", "paid")
        .ilike("raw->>email", escapeLike(s(c.lead_email)))
        .gt("collected_at", s(c.created_at))
        .limit(1);
      if (paid?.length) continue;
    }
    const lead = await leadSummary(orgId, {
      leadId: s(c.lead_id) || null,
      email: s(c.lead_email) || null,
    });
    const sent = await fireOnce(
      orgId,
      "payment.followup_due",
      keyOf(c),
      { type: "call", id: s(c.id) },
      {
        ...paymentFollowUpPayload(c, lead, settings.timeZone),
        ping_role_ids: pingRoleIds(settings, ["closer"]),
        reply_to: { event_type: "payment.followup_logged", fire_key: keyOf(c) },
      },
    );
    if (sent) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */

const PRECALL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function firePrecallProgress(
  orgId: string,
  settings: NotificationSettingsT,
  now: Date,
) {
  const assets = (settings.precallAssets ?? []).filter((a) => a.label?.trim() && a.url?.trim());
  if (!assets.length) return 0;
  const { data, error } = await db
    .from("calls")
    .select("id, lead_id, lead_email, scheduled_for, cancelled, status, source_connector")
    .eq("org_id", orgId)
    .not("source_connector", "is", null)
    .not("lead_id", "is", null)
    .gt("scheduled_for", new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString())
    .lte("scheduled_for", new Date(now.getTime() + PRECALL_WINDOW_MS).toISOString());
  if (error) throw new Error(error.message);
  const calls = ((data ?? []) as Row[]).filter((c) => !c.cancelled && s(c.status) !== "cancelled");
  if (!calls.length) return 0;

  const { data: clicks } = await db
    .from("precall_asset_clicks")
    .select("lead_id, asset_index")
    .eq("org_id", orgId)
    .in("lead_id", [...new Set(calls.map((c) => s(c.lead_id)))]);
  const opened = new Map<string, Set<number>>();
  for (const k of (clicks ?? []) as Array<{ lead_id: string; asset_index: number }>) {
    if (k.asset_index >= assets.length) continue;
    const set = opened.get(k.lead_id) ?? new Set<number>();
    set.add(k.asset_index);
    opened.set(k.lead_id, set);
  }

  const first = (c: Row) => `${s(c.id)}:0`;
  const at = (c: Row, k: number) => `${s(c.id)}:${k}`;
  const keys = calls.flatMap((c) => [first(c), at(c, opened.get(s(c.lead_id))?.size ?? 0)]);
  const done = await alreadyFired(orgId, "precall.progress", [...new Set(keys)]);

  let n = 0;
  for (const c of calls) {
    const doneIdx = [...(opened.get(s(c.lead_id)) ?? new Set<number>())].sort();
    const count = doneIdx.length;
    const isFirst = !done.has(first(c));
    if (!isFirst && (count === 0 || done.has(at(c, count)))) continue;
    const lead = await leadSummary(orgId, { leadId: s(c.lead_id) });
    const payload = {
      lead,
      lead_id: lead.id,
      scheduled_for: c.scheduled_for,
      assets: assets.map((a, i) => ({ label: a.label, done: doneIdx.includes(i) })),
      done_count: count,
      total: assets.length,
      time_zone: settings.timeZone || null,
      // Every update after the first edits that first message in place.
      ...(isFirst ? {} : { edit_of: { event_type: "precall.progress", fire_key: first(c) } }),
    };
    const sent = await fireOnce(
      orgId,
      "precall.progress",
      isFirst ? first(c) : at(c, count),
      { type: "call", id: s(c.id) },
      payload,
    );
    // The first post may already reflect opens; mark that level done too.
    if (sent && isFirst && count > 0) {
      await fireOnce(
        orgId,
        "precall.progress",
        at(c, count),
        { type: "call", id: s(c.id) },
        { ...payload, edit_of: { event_type: "precall.progress", fire_key: first(c) } },
      );
    }
    if (sent) n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ */

const RSVP_LOOKAHEAD_MS = 3 * 24 * 60 * 60 * 1000;

/** Every 10 minutes: read invite responses for upcoming calls. An accepted
 *  invite ticks the workspace's confirm step, which fires call.confirmed and
 *  stops the unconfirmed alerts — the same path as a rep ticking it. */
export async function syncGoogleRsvps(orgId: string, settings: NotificationSettingsT, now: Date) {
  if (now.getUTCMinutes() % 10 !== 0) return 0;
  const token = await googleAccessToken(orgId).catch(() => null);
  if (!token) return 0;
  const { data, error } = await db
    .from("calls")
    .select("id, lead_email, scheduled_for, cancelled, status, google_rsvp_status")
    .eq("org_id", orgId)
    .not("lead_email", "is", null)
    .gt("scheduled_for", now.toISOString())
    .lte("scheduled_for", new Date(now.getTime() + RSVP_LOOKAHEAD_MS).toISOString());
  if (error) throw new Error(error.message);
  const calls = ((data ?? []) as Row[]).filter((c) => !c.cancelled && s(c.status) !== "cancelled");
  if (!calls.length) return 0;
  const events = await listGoogleEvents(
    token,
    now.toISOString(),
    new Date(now.getTime() + RSVP_LOOKAHEAD_MS).toISOString(),
  );

  const tp = settings.confirmTouchpoint;
  let n = 0;
  for (const c of calls) {
    const r = rsvpFor(events, { scheduled_for: s(c.scheduled_for), lead_email: s(c.lead_email) });
    if (!r) continue;
    await db
      .from("calls")
      .update({
        google_event_id: r.eventId,
        google_rsvp_status: r.status,
        google_rsvp_checked_at: now.toISOString(),
      })
      .eq("id", s(c.id));
    if (r.status !== "accepted" || s(c.google_rsvp_status) === "accepted") continue;
    const { error: upErr } = await db.from("call_confirmations").upsert(
      {
        call_id: s(c.id),
        org_id: orgId,
        [`${tp}_sent_at`]: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "call_id" },
    );
    if (upErr) throw new Error(upErr.message);
    await notifyTouchpointMarked(orgId, s(c.id), tp);
    n += 1;
  }
  return n;
}
