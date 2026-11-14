/**
 * Turning an event payload into a Discord message a person can act on.
 *
 * The old formatter put the whole payload in a JSON code block, capped at
 * 1500 characters. For an application that meant three copies of every
 * answer (keyed by ref, field id and title), so the budget ran out on UUIDs
 * before a name, a tier or a budget ever appeared, and the message stopped
 * mid-email-address with nothing to say it had been cut.
 *
 * Rules here:
 *   - Labelled lines in plain words, built from resolved fields — never raw
 *     JSON, never slot keys.
 *   - Empty values are skipped, not printed as a dash.
 *   - Long free text goes last, so if anything is cut it is the least
 *     structured part, never the contact details.
 *   - A cut message says it was cut.
 *   - Role mentions are listed in `allowed_mentions`; without that Discord
 *     renders `<@&id>` as text and notifies nobody.
 */

import { eventCatalogEntry } from "./event-catalog";
import { platformLabel, statusLabel, timeOfDayLabel } from "./content-events";

/** Discord's hard limit for `content`. */
export const DISCORD_CONTENT_LIMIT = 2000;
const TRUNCATION_MARKER = "\n… (message truncated)";

export type DiscordMessage = {
  content: string;
  allowed_mentions: { parse: never[]; roles: string[] };
};

export type FormatOptions = {
  /** Base URL of the app, for "Open in AscendOS" links. Omitted → no link. */
  appUrl?: string | null;
  /** Discord role IDs to ping. Non-numeric entries are ignored. */
  mentionRoleIds?: readonly string[] | null;
};

type Line = [label: string, value: unknown];

/* ------------------------------------------------------------------ */
/* Small value helpers                                                 */
/* ------------------------------------------------------------------ */

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v.trim();
  return "";
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Cents → "$1,234" (or "$1,234.50" when there are cents). */
export function money(cents: unknown, currency?: unknown): string {
  const n = typeof cents === "number" ? cents : Number(cents);
  if (!Number.isFinite(n) || n === 0) return "";
  const cur = text(currency).toUpperCase() || "USD";
  const amount = n / 100;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return cur === "USD" ? `$${formatted}` : `${formatted} ${cur}`;
}

/** An ISO instant as "Thu, Nov 13, 3:00 PM EST" in `timeZone` (or UTC). */
export function when(iso: unknown, timeZone?: string | null): string {
  const s = text(iso);
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return d.toLocaleString("en-US", {
      timeZone: timeZone || "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return d.toISOString();
  }
}

const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : "—");

/** "work_school" → "Work school". Only used by the generic fallback. */
function humanize(key: string): string {
  const s = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** First answer that is a LinkedIn profile URL, whatever the question said. */
export function findLinkedIn(...sources: unknown[]): string {
  for (const src of sources) {
    for (const v of Object.values(obj(src))) {
      const s = text(v);
      if (/linkedin\.com\/(in|pub)\//i.test(s)) return s;
    }
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

function renderLines(lines: Line[]): string[] {
  const out: string[] = [];
  for (const [label, value] of lines) {
    const v = text(value);
    if (v) out.push(`**${label}:** ${v}`);
  }
  return out;
}

type Body = {
  title: string;
  lines: Line[];
  /** Free text rendered after the lines, each as its own paragraph. */
  long?: Line[];
  /** Path under the app, e.g. `/leads?leadId=…`. */
  linkPath?: string | null;
};

function assemble(body: Body, opts: FormatOptions): DiscordMessage {
  const roles = (opts.mentionRoleIds ?? [])
    .map((r) => String(r).trim())
    .filter((r) => /^\d+$/.test(r));
  const head = [
    roles.length ? roles.map((r) => `<@&${r}>`).join(" ") : "",
    `**${body.title}**`,
  ].filter(Boolean);

  const structured = renderLines(body.lines);
  const link =
    body.linkPath && opts.appUrl
      ? // Angle brackets stop Discord unfurling this one URL into a preview
        // card (the site's OG image), which doubled every post's height.
        // Only this link: Meet, LinkedIn and content URLs still preview.
        `[Open in AscendOS](<${opts.appUrl.replace(/\/+$/, "")}${body.linkPath}>)`
      : "";
  const longParts = (body.long ?? [])
    .map(([label, value]) => {
      const v = text(value);
      return v ? `**${label}:**\n${v}` : "";
    })
    .filter(Boolean);

  // Order: mentions + title, labelled lines, long free text, link. Only the
  // long free text gives way when space runs out; the contact details and the
  // link are what someone needs to act, so they are never the part cut.
  const top = [...head, ...structured].join("\n");
  const tail = longParts.join("\n\n");
  const linkPart = link ? `\n\n${link}` : "";
  const room = DISCORD_CONTENT_LIMIT - top.length - linkPart.length - 2;

  let content: string;
  if (!tail) {
    content = top + linkPart;
  } else if (tail.length <= room) {
    content = `${top}\n\n${tail}${linkPart}`;
  } else if (room > TRUNCATION_MARKER.length + 40) {
    const cut = tail.slice(0, room - TRUNCATION_MARKER.length).trimEnd();
    content = `${top}\n\n${cut}${TRUNCATION_MARKER}${linkPart}`;
  } else {
    content = `${top}${TRUNCATION_MARKER}${linkPart}`;
  }
  // Last resort for a pathological fixed part (a leaderboard with dozens of
  // reps): cut anything, but still say so.
  if (content.length > DISCORD_CONTENT_LIMIT) {
    content =
      content.slice(0, DISCORD_CONTENT_LIMIT - TRUNCATION_MARKER.length).trimEnd() +
      TRUNCATION_MARKER;
  }

  return { content, allowed_mentions: { parse: [], roles } };
}

/* ------------------------------------------------------------------ */
/* Per-event bodies                                                    */
/* ------------------------------------------------------------------ */

const leadLink = (leadId: unknown) => (text(leadId) ? `/leads?leadId=${text(leadId)}` : null);

function application(p: Record<string, unknown>): Body {
  const lead = obj(p.lead);
  const app = obj(p.application_data);
  return {
    title: `New application${text(p.form_title) ? ` — ${text(p.form_title)}` : ""}`,
    lines: [
      ["Name", lead.full_name],
      ["Email", lead.email],
      ["Phone", lead.phone],
      ["Ticket tier", lead.ticket_tier_label ?? lead.ticket_tier],
      ["Role & company", app.work_school],
      ["Current salary", app.income],
      ["Target salary", app.goal],
      ["Budget", app.capital],
      ["Credit", app.credit],
      ["Experience", app.experience],
      ["Focus", app.focus],
      ["Situation", app.candidate_fit],
      ["Time available", app.time],
      ["Committed", app.commitment],
      ["LinkedIn", findLinkedIn(app.answers_by_title, app.raw_answers)],
      // Platform · placement · campaign, as tagged on the link.
      [
        "Source",
        [lead.source_platform, lead.source_medium, lead.source_campaign]
          .map(text)
          .filter(Boolean)
          .join(" · "),
      ],
      ["Content", lead.source_content_tag],
    ],
    long: [["Why you, why now", app.serious_status]],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function callBody(title: string, p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title,
    lines: [
      ["Lead", lead.full_name ?? p.lead_name],
      ["Email", lead.email ?? p.lead_email],
      ["Phone", lead.phone],
      ["Call", when(p.scheduled_for, tz)],
      ["Closer", p.closer_name],
      ["Setter", p.setter_name],
      ["Confirmation step", p.touchpoint_label],
      ["Meeting link", p.meeting_link],
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function postCall(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Post-call notes",
    lines: [
      ["Closer", p.closer_name],
      ["Lead", lead.full_name ?? p.lead_email],
      ["Email", p.lead_email],
      ["Lead status", p.lead_status],
      ["Offer made", p.offer_made],
      ["Cash collected", money(p.cash_collected_cents, p.currency)],
      ["Total revenue", money(p.contract_value_cents, p.currency)],
      ["Payment plan", p.payment_plan],
      [
        "Objections",
        Array.isArray(p.objections)
          ? p.objections.map(text).filter(Boolean).join(", ")
          : p.objections,
      ],
      ["Follow up", when(p.requested_followup_at, tz)],
      ["Amount pitched", money(p.followup_amount_pitched_cents, p.currency)],
      ["Follow-up reason", p.followup_reason],
      ["Recording", p.recording_url],
    ],
    long: [
      ["Call summary", p.call_summary],
      ["Follow-up notes", p.followup_notes],
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

const EOD_LABELS: Array<[string, string]> = [
  ["dials", "Dials"],
  ["connections", "Connections"],
  ["leads_contacted", "Leads contacted"],
  ["outbound_dms_sent", "Outbound DMs"],
  ["inbound_dms_sent", "Inbound DMs"],
  ["replies", "Replies"],
  ["followups_sent", "Follow-ups sent"],
  ["qualified_convos", "Qualified conversations"],
  ["links_sent", "Links sent"],
  ["sets", "Sets"],
  ["calls_on_calendar", "Calls on calendar"],
  ["live_calls", "Live calls"],
  ["closes", "Closes"],
  ["downsells", "Downsells"],
];

function setterEod(p: Record<string, unknown>): Body {
  const role = text(p.role) === "inbound_dialer" ? "Inbound dialer" : "DM setter";
  const lines: Line[] = [
    ["Rep", p.team_member_name],
    ["Role", role],
    ["Date", p.activity_date],
  ];
  for (const [key, label] of EOD_LABELS) {
    const n = Number(p[key]);
    if (Number.isFinite(n) && n !== 0) lines.push([label, n]);
  }
  lines.push(["Cash collected", money(p.cash_collected_cents, p.original_currency)]);
  lines.push(["Rating", text(p.rate_today) ? `${text(p.rate_today)}/10` : ""]);
  return {
    title: "Setter EOD report",
    lines,
    long: [
      ["Objections", p.objections],
      ["Notes", p.notes],
    ],
  };
}

function callback(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Callback due now",
    lines: [
      ["Lead", lead.full_name ?? p.lead_name],
      ["Phone", lead.phone],
      ["Email", lead.email],
      ["Due", when(p.due_at, tz)],
      ["Logged by", p.owner_name],
    ],
    long: [["Next action", p.next_action]],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function followUp(term: "Short" | "Long", p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: `${term}-term follow-up due`,
    lines: [
      ["Lead", lead.full_name ?? p.lead_email],
      ["Email", p.lead_email ?? lead.email],
      ["Phone", lead.phone],
      ["Closer", p.closer_name],
      ["Due", when(p.requested_followup_at, tz)],
      ["Amount pitched", money(p.followup_amount_pitched_cents, p.currency)],
      ["Reason", p.followup_reason],
    ],
    long: [["Notes", p.followup_notes]],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

export type LeaderboardRow = {
  name: string;
  dials?: number;
  sets?: number;
  /** Bookings made in the period (setters, and the team line). */
  booked?: number;
  /** Calls scheduled in the period (team line). */
  onCalendar?: number;
  /** Calls a closer took — one post-call log each. Not bookings. */
  taken?: number;
  showed?: number;
  noShows?: number;
  closed?: number;
  cashCents?: number;
};

function rowLine(r: LeaderboardRow): string {
  const bits: string[] = [];
  if (r.dials) bits.push(`${r.dials} dials`);
  if (r.sets) bits.push(`${r.sets} sets`);
  if (r.booked) bits.push(`${r.booked} booked`);
  if (r.onCalendar) bits.push(`${r.onCalendar} on calendar`);
  if (r.taken) bits.push(`${r.taken} call${r.taken === 1 ? "" : "s"} taken`);
  if (r.showed || r.noShows) bits.push(`${r.showed ?? 0} showed`);
  if (r.noShows) bits.push(`${r.noShows} no-show${r.noShows === 1 ? "" : "s"}`);
  if (r.closed) bits.push(`${r.closed} closed`);
  const cash = money(r.cashCents ?? 0);
  if (cash) bits.push(cash);
  const showDen = (r.showed ?? 0) + (r.noShows ?? 0) || r.booked || 0;
  if (showDen) bits.push(`show ${pct(r.showed ?? 0, showDen)}`);
  if (r.showed) bits.push(`close ${pct(r.closed ?? 0, r.showed)}`);
  return `• **${r.name}** — ${bits.length ? bits.join(" · ") : "no activity logged"}`;
}

function leaderboard(kind: "Daily" | "Weekly", p: Record<string, unknown>): Body {
  const setters = (Array.isArray(p.setters) ? p.setters : []) as LeaderboardRow[];
  const closers = (Array.isArray(p.closers) ? p.closers : []) as LeaderboardRow[];
  const team = obj(p.team) as LeaderboardRow;
  const sTot = obj(p.setter_totals) as LeaderboardRow;
  const cTot = obj(p.closer_totals) as LeaderboardRow;
  const totals = [
    team.name ? rowLine({ ...team, name: "Team" }) : "",
    sTot.name ? rowLine({ ...sTot, name: "All setters" }) : "",
    cTot.name ? rowLine({ ...cTot, name: "All closers" }) : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title: `${kind} sales team report — ${text(p.period_label)}`,
    lines: [
      [
        "Note",
        Number(p.non_usd_rows_excluded) > 0
          ? `${Number(p.non_usd_rows_excluded)} entr${Number(p.non_usd_rows_excluded) === 1 ? "y" : "ies"} in another currency not included in cash`
          : "",
      ],
    ],
    long: [
      ["Totals", totals],
      ["Setters", setters.map(rowLine).join("\n")],
      ["Closers", closers.map(rowLine).join("\n")],
    ],
  };
}

function scheduledLabel(date: unknown, time: unknown) {
  const d = text(date);
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return d;
  const label = new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = timeOfDayLabel(text(time));
  return t ? `${label}, ${t}` : label;
}

function contentReady(kind: "Short-form" | "Long-form" | null, p: Record<string, unknown>): Body {
  return {
    title: `${kind ? `${kind} ready to post` : "Ready to post"} — ${platformLabel(text(p.platform))}`,
    lines: [
      ["Title", p.title],
      ["Platform", platformLabel(text(p.platform))],
      ["Hook", p.hook],
      ["Scheduled", scheduledLabel(p.scheduled_date, p.scheduled_time)],
      ["Link", p.url],
      ["Angle", text(p.angle).replace(/_/g, " ")],
      ["Funnel stage", text(p.funnel_stage).replace(/_/g, " ")],
    ],
    linkPath: "/content-calendar",
  };
}

type ScheduledPiece = {
  title?: string | null;
  platform?: string | null;
  scheduled_time?: string | null;
  pipeline_status?: string | null;
};

function contentSchedule(p: Record<string, unknown>): Body {
  const pieces = (Array.isArray(p.pieces) ? p.pieces : []) as ScheduledPiece[];
  const list = pieces.length
    ? pieces
        .map((c) =>
          [
            timeOfDayLabel(c.scheduled_time) || "Any time",
            platformLabel(c.platform),
            `**${text(c.title) || "Untitled"}**`,
            statusLabel(c.pipeline_status),
          ]
            .filter(Boolean)
            .join(" · "),
        )
        .map((l) => `• ${l}`)
        .join("\n")
    : // Said out loud so an empty day does not read as a broken feed.
      "Nothing scheduled today.";
  return {
    title: `Content schedule — ${text(p.period_label)}`,
    lines: [],
    long: [["Today", list]],
    linkPath: "/content-calendar",
  };
}

type SourceLine = {
  name: string;
  leads?: number;
  applications?: number;
  booked?: number;
  cashCents?: number;
};

function sourceLine(r: SourceLine, rank?: number): string {
  const bits = [
    `${r.leads ?? 0} lead${r.leads === 1 ? "" : "s"}`,
    r.applications ? `${r.applications} application${r.applications === 1 ? "" : "s"}` : "",
    r.booked ? `${r.booked} booked` : "",
    money(r.cashCents ?? 0),
  ].filter(Boolean);
  return `${rank ? `${rank}. ` : "• "}**${r.name}** — ${bits.join(" · ")}`;
}

function topSources(kind: "Daily" | "Weekly" | "Monthly", p: Record<string, unknown>): Body {
  const sources = (Array.isArray(p.sources) ? p.sources : []) as SourceLine[];
  const content = (Array.isArray(p.content) ? p.content : []) as SourceLine[];
  const un = obj(p.unattributed) as SourceLine;
  const ranked = sources.length
    ? sources.map((r, i) => sourceLine(r, i + 1)).join("\n")
    : "No attributed leads yet.";
  const unknownLine =
    (un.leads ?? 0) || (un.booked ?? 0) || (un.cashCents ?? 0)
      ? sourceLine({ ...un, name: "Unknown / Unattributed" })
      : "";
  const excluded = Number(p.non_usd_rows_excluded) || 0;
  return {
    title: `${kind} top content sources — ${text(p.period_label)}`,
    lines: [],
    long: [
      ["By source", [ranked, unknownLine].filter(Boolean).join("\n")],
      ["Top content", content.map((r, i) => sourceLine(r, i + 1)).join("\n")],
      [
        "How this is counted",
        `Leads created in the period by where they came from; booked calls and closer-logged cash by their lead's source. Anything not tied to a lead is Unattributed.${excluded ? ` ${excluded} cash entr${excluded === 1 ? "y" : "ies"} in another currency not included.` : ""}`,
      ],
    ],
  };
}

/** Readable fallback for an event with no bespoke shape: top-level scalars. */
function generic(eventType: string, p: Record<string, unknown>): Body {
  const SKIP = new Set(["answers", "raw_answers", "answers_by_title", "category", "org_id"]);
  const lines: Line[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (SKIP.has(k) || v == null || typeof v === "object") continue;
    lines.push([humanize(k), k.endsWith("_cents") ? money(v) : v]);
  }
  return {
    title: eventCatalogEntry(eventType)?.label ?? eventType,
    lines: lines.slice(0, 20),
    linkPath: leadLink(p.lead_id),
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export function formatDiscordMessage(
  eventType: string,
  payload: Record<string, unknown>,
  opts: FormatOptions & { timeZone?: string | null } = {},
): DiscordMessage {
  const p = obj(payload);
  const tz = opts.timeZone ?? (text(p.time_zone) || null);
  let body: Body;
  switch (eventType) {
    case "lead.application_submitted":
      body = application(p);
      break;
    case "call.confirmed":
      body = callBody("Call confirmed", p, tz);
      break;
    case "call.unconfirmed":
      body = callBody("Call NOT confirmed — someone confirm it now", p, tz);
      break;
    case "closer.post_call_submitted":
      body = postCall(p, tz);
      break;
    case "setter.eod_submitted":
      body = setterEod(p);
      break;
    case "callback.due":
      body = callback(p, tz);
      break;
    case "followup.short_term_due":
      body = followUp("Short", p, tz);
      break;
    case "followup.long_term_due":
      body = followUp("Long", p, tz);
      break;
    case "report.daily_sales":
      body = leaderboard("Daily", p);
      break;
    case "report.weekly_sales":
      body = leaderboard("Weekly", p);
      break;
    case "content.ready_to_post":
      body = contentReady(null, p);
      break;
    case "content.ready_to_post.short_form":
      body = contentReady("Short-form", p);
      break;
    case "content.ready_to_post.long_form":
      body = contentReady("Long-form", p);
      break;
    case "content.schedule_daily":
      body = contentSchedule(p);
      break;
    case "report.top_sources_daily":
      body = topSources("Daily", p);
      break;
    case "report.top_sources_weekly":
      body = topSources("Weekly", p);
      break;
    case "report.top_sources_monthly":
      body = topSources("Monthly", p);
      break;
    case "call.closed_won":
      body = {
        title: "Closed won",
        lines: [
          ["Closer", p.closer],
          ["Lead", p.lead_email],
          ["Cash collected", money(p.cash_cents)],
          ["Contract value", money(p.contract_cents)],
        ],
      };
      break;
    default:
      body = generic(eventType, p);
  }
  return assemble(body, opts);
}
