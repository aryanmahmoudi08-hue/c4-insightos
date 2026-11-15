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
 *   - Each channel posts under its own bot name (event-catalog.ts), which
 *     says what the message is — so there is no title line when it has one.
 *   - Every message about a lead ends with a divider and its AscendOS link.
 */

import { eventCatalogEntry } from "./event-catalog";
import { platformLabel, statusLabel, timeOfDayLabel } from "./content-events";

/** Discord's hard limit for `content`. */
export const DISCORD_CONTENT_LIMIT = 2000;
const TRUNCATION_MARKER = "\n… (message truncated)";

export type DiscordMessage = {
  content: string;
  allowed_mentions: { parse: never[]; roles: string[] };
  /** The bot name the message posts under (overrides the webhook's). */
  username?: string;
  avatar_url?: string;
};

export type FormatOptions = {
  /** Base URL of the app, for "Open in AscendOS" links. Omitted → no link. */
  appUrl?: string | null;
  /** The channel's own role pings. Non-numeric entries are ignored. */
  mentionRoleIds?: readonly string[] | null;
  /** Pings this message adds itself (an unconfirmed alert's @Closer). */
  extraRoleIds?: readonly string[] | null;
  /** Bot name and icon. With a name, the title line is left out. */
  username?: string | null;
  avatarUrl?: string | null;
  /** Discord link to the message this one follows up on. */
  replyToUrl?: string | null;
};

/** A label and value. `plain` leaves the label unbolded (Aryan's layouts
 *  bold some labels and not others). */
type Line = [label: string, value: unknown, plain?: boolean];
/** A line whose label is not bold. */
const plain = (label: string, value: unknown): Line => [label, value, true];

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

/** The rule between a message's sections and above its AscendOS link. */
export const DIVIDER = "—————————————————————————————————";

type Block =
  | { kind: "lines"; lines: Line[] }
  | { kind: "divider" }
  /** Free text, its own paragraph. The only part cut when space runs out. */
  | { kind: "long"; label: string; value: unknown; plain?: boolean }
  /** A blank line between groups of fields. */
  | { kind: "gap" }
  /** A preformatted line, e.g. a link to an earlier message. */
  | { kind: "raw"; text: string };

type Body = {
  /** Shown only when the message posts without a bot name — the bot name
   *  ("CALL BOOKED") already says what the message is. */
  title: string;
  /** Bold first line shown whatever the identity, e.g. "CALL THEM ASAP". */
  headline?: string;
  blocks: Block[];
  /** Path under the app, e.g. `/leads?leadId=…`. */
  linkPath?: string | null;
};

const lines = (...l: Line[]): Block => ({ kind: "lines", lines: l });
const divider: Block = { kind: "divider" };
const long = (label: string, value: unknown, plainLabel = false): Block => ({
  kind: "long",
  label,
  value,
  plain: plainLabel,
});
const gap: Block = { kind: "gap" };

function renderLines(ls: Line[]): string {
  return ls
    .map(([label, value, isPlain]) => {
      const v = text(value);
      if (!v) return "";
      return isPlain ? `${label}: ${v}` : `**${label}:** ${v}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function cleanRoleIds(...lists: Array<readonly unknown[] | null | undefined>): string[] {
  const out: string[] = [];
  for (const list of lists)
    for (const r of list ?? []) {
      const id = String(r ?? "").trim();
      if (/^\d+$/.test(id) && !out.includes(id)) out.push(id);
    }
  return out;
}

function assemble(body: Body, opts: FormatOptions): DiscordMessage {
  const roles = cleanRoleIds(opts.mentionRoleIds, opts.extraRoleIds);
  const pings = roles.map((r) => `<@&${r}>`).join(" ");
  // A headline reads first and the pings follow it ("CALL THEM ASAP @Setter");
  // otherwise the pings lead.
  const head = body.headline
    ? [body.headline, pings].filter(Boolean).join(" ")
    : [pings, opts.username ? "" : `**${body.title}**`].filter(Boolean).join(" ");

  // Render each block; drop empty ones, then dividers that would sit at the
  // top, next to another divider, or at the bottom (the link adds its own).
  // Parts join with "\n", so an empty part is a blank line. Blank lines
  // separate groups and sit above and below every divider.
  type Part = { text: string; flex?: { label: string; value: string; plain?: boolean } };
  const parts: Part[] = [];
  const last = () => parts[parts.length - 1];
  const blank = () => {
    if (parts.length && !(last().text === "" && !last().flex)) parts.push({ text: "" });
  };
  for (const b of body.blocks) {
    if (b.kind === "divider") {
      if (parts.length && last().text !== DIVIDER) {
        blank();
        parts.push({ text: DIVIDER }, { text: "" });
      }
    } else if (b.kind === "gap") {
      blank();
    } else if (b.kind === "lines") {
      const t = renderLines(b.lines);
      if (t) parts.push({ text: t });
    } else if (b.kind === "raw") {
      if (b.text.trim()) parts.push({ text: b.text.trim() });
    } else {
      const v = text(b.value);
      if (v) {
        blank();
        parts.push({ text: "", flex: { label: b.label, value: v, plain: b.plain } });
      }
    }
  }
  const isBlank = (p: Part) => p.text === "" && !p.flex;
  while (parts.length && (last().text === DIVIDER || isBlank(last()))) parts.pop();

  const link =
    body.linkPath && opts.appUrl
      ? // Angle brackets stop Discord unfurling this one URL into a preview
        // card (the site's OG image), which doubled every post's height.
        // Only this link: Meet, LinkedIn and content URLs still preview.
        `[Open in AscendOS](<${opts.appUrl.replace(/\/+$/, "")}${body.linkPath}>)`
      : "";
  if (link) parts.push({ text: "" }, { text: DIVIDER }, { text: "" }, { text: link });
  if (head) parts.unshift({ text: head });

  // Only free text gives way when space runs out; the contact details and
  // the link are what someone needs to act, so they are never the part cut.
  const flexHeader = (f: { label: string; plain?: boolean }) =>
    f.plain ? `${f.label}:\n` : `**${f.label}:**\n`;
  const fixedLen = parts.reduce(
    (n, p, i) => n + (i ? 1 : 0) + (p.flex ? flexHeader(p.flex).length : p.text.length),
    0,
  );
  let room = DISCORD_CONTENT_LIMIT - fixedLen;
  let cut = false;
  const rendered: string[] = [];
  for (const p of parts) {
    if (!p.flex) {
      rendered.push(p.text);
      continue;
    }
    const v = p.flex.value;
    if (v.length <= room) {
      room -= v.length;
      rendered.push(`${flexHeader(p.flex)}${v}`);
    } else if (!cut && room > TRUNCATION_MARKER.length + 40) {
      rendered.push(
        `${flexHeader(p.flex)}${v.slice(0, room - TRUNCATION_MARKER.length).trimEnd()}${TRUNCATION_MARKER}`,
      );
      room = 0;
      cut = true;
    } else if (!cut) {
      rendered.push(TRUNCATION_MARKER.trim());
      cut = true;
    }
  }
  let content = rendered.join("\n").replace(/^\n+/, "");
  // Last resort for a pathological fixed part (a leaderboard with dozens of
  // reps): cut anything, but still say so.
  if (content.length > DISCORD_CONTENT_LIMIT) {
    content =
      content.slice(0, DISCORD_CONTENT_LIMIT - TRUNCATION_MARKER.length).trimEnd() +
      TRUNCATION_MARKER;
  }

  const msg: DiscordMessage = { content, allowed_mentions: { parse: [], roles } };
  if (opts.username) msg.username = opts.username;
  if (opts.avatarUrl) msg.avatar_url = opts.avatarUrl;
  return msg;
}

/* ------------------------------------------------------------------ */
/* Per-event bodies                                                    */
/* ------------------------------------------------------------------ */

/** A URL in angle brackets: still a link, but Discord adds no preview card
 *  (the Meet card doubled every call message's height). */
const noPreview = (url: unknown) => (text(url) ? `<${text(url)}>` : "");

const leadLink = (leadId: unknown) => (text(leadId) ? `/leads?leadId=${text(leadId)}` : null);

/** Full Name / Email / Phone (/ LinkedIn) — the block every lead message opens with. */
function leadLines(
  lead: Record<string, unknown>,
  p: Record<string, unknown>,
  withLinkedIn = true,
): Line[] {
  const l: Line[] = [
    ["Full Name", lead.full_name ?? p.lead_name ?? p.client_name],
    ["Email", lead.email ?? p.lead_email ?? p.email],
    ["Phone", lead.phone],
  ];
  if (withLinkedIn) l.push(["LinkedIn", lead.linkedin]);
  return l;
}

/** The application answers a rep sizes a lead up by. */
function profileLines(lead: Record<string, unknown>, withTarget: boolean): Line[] {
  const l: Line[] = [["Current salary", lead.current_salary]];
  if (withTarget) l.push(["Target salary", lead.target_salary]);
  l.push(["Budget", lead.budget], ["Credit", lead.credit]);
  return l;
}

const sourceOf = (lead: Record<string, unknown>) =>
  [lead.source_platform, lead.source_medium, lead.source_campaign]
    .map(text)
    .filter(Boolean)
    .join(" · ");

function application(p: Record<string, unknown>): Body {
  const lead = obj(p.lead);
  const app = obj(p.application_data);
  return {
    title: `New application${text(p.form_title) ? ` — ${text(p.form_title)}` : ""}`,
    blocks: [
      lines(
        ["Name", lead.full_name],
        ["Email", lead.email],
        ["Phone", lead.phone],
        ["LinkedIn", lead.linkedin ?? findLinkedIn(app.answers_by_title, app.raw_answers)],
      ),
      divider,
      lines(["Qualifies", lead.ticket_tier_label ?? lead.ticket_tier]),
      gap,
      lines(["Role & company", app.work_school]),
      gap,
      lines(
        ["Current salary", app.income],
        ["Target salary", app.goal],
        ["Budget", app.capital],
        ["Credit", app.credit],
      ),
      gap,
      lines(
        ["Experience (Years)", app.experience],
        ["Focus", app.focus],
        ["Situation", app.candidate_fit],
      ),
      long("Why you, why now", app.serious_status),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** #calls-booked and #calls-confirmed share a body. */
function callBooked(title: string, p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title,
    blocks: [
      lines(...leadLines(lead, p)),
      gap,
      lines(["Source", sourceOf(lead)]),
      gap,
      lines(...profileLines(lead, true)),
      gap,
      lines(plain("Date of Call", when(p.scheduled_for, tz)), plain("Meeting link", noPreview(p.meeting_link))),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function callUnconfirmed(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Call NOT confirmed — someone confirm it now",
    blocks: [
      lines(...leadLines(lead, p)),
      gap,
      lines(...profileLines(lead, false)),
      gap,
      lines(
        plain("Booked via", p.booked_via),
        plain("Date of Call", when(p.scheduled_for, tz)),
        plain("Meeting link", noPreview(p.meeting_link)),
      ),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function callCancelled(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Call cancelled",
    blocks: [
      lines(...leadLines(lead, p)),
      gap,
      lines(...profileLines(lead, false)),
      gap,
      lines(
        plain("Date of Call", when(p.scheduled_for, tz)),
        plain("Cancellation Reason", p.cancellation_reason),
      ),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function callRescheduled(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Call rescheduled",
    blocks: [
      lines(...leadLines(lead, p)),
      gap,
      lines(...profileLines(lead, false)),
      gap,
      lines(
        plain("Date of Call", when(p.scheduled_for, tz)),
        plain("Previous Date of Call", when(p.previous_scheduled_for, tz)),
        plain("Reschedule Reason", p.reschedule_reason),
      ),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** Where to find the message this one follows up on, or nothing. */
function replyBlock(opts: FormatOptions, label: string): Block {
  return opts.replyToUrl
    ? { kind: "raw", text: `↪ [${label}](<${opts.replyToUrl}>)` }
    : { kind: "raw", text: "" };
}

function postCall(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Post-call notes",
    blocks: [
      lines(
        ["Closer", p.closer_name],
        ["Full Name", lead.full_name],
        ["Email", p.lead_email ?? lead.email],
        ["Phone", lead.phone],
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
      ),
      long("Call summary", p.call_summary),
      long("Follow-up notes", p.followup_notes),
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
  const ls: Line[] = [
    ["Rep", p.team_member_name],
    ["Role", role],
    ["Date", dateLabel(p.activity_date)],
  ];
  for (const [key, label] of EOD_LABELS) {
    const n = Number(p[key]);
    if (Number.isFinite(n) && n !== 0) ls.push([label, n]);
  }
  ls.push(["Cash collected", money(p.cash_collected_cents, p.original_currency)]);
  ls.push(["Rating", text(p.rate_today) ? `${text(p.rate_today)}/10` : ""]);
  return {
    title: "Setter EOD report",
    blocks: [lines(...ls), long("Objections", p.objections), long("Notes", p.notes)],
  };
}

/** Posted when the callback is logged. */
function callbackLogged(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  return {
    title: "Callback logged",
    blocks: [
      lines(...leadLines(lead, p, false)),
      gap,
      lines(...profileLines(lead, false)),
      gap,
      lines(["Call Back (Date/Time)", when(p.due_at, tz)]),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** Posted at the due time, pointing back at the logged message. */
function callbackDue(p: Record<string, unknown>, tz: string | null, opts: FormatOptions): Body {
  const lead = obj(p.lead);
  return {
    title: "Callback due now",
    headline: "CALL THEM ASAP",
    // With an original to point at, just who to call and the link back.
    // Without one (logged before this existed, or its post failed), carry
    // the logged message's details here instead.
    blocks: opts.replyToUrl
      ? [
          gap,
          lines(["Full Name", lead.full_name ?? p.lead_name], ["Phone", lead.phone]),
          replyBlock(opts, "Original callback"),
        ]
      : [gap, ...callbackLogged(p, tz).blocks],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

function followUpLines(p: Record<string, unknown>, tz: string | null): Block[] {
  const lead = obj(p.lead);
  return [
    lines(
      plain("Full Name", lead.full_name ?? p.lead_name ?? p.client_name),
      plain("Email", lead.email ?? p.lead_email ?? p.email),
      ["Phone", lead.phone],
    ),
    gap,
    lines(
      plain("Closer", p.closer_name),
      plain("Due", when(p.requested_followup_at, tz)),
      plain("Amount pitched", money(p.followup_amount_pitched_cents, p.currency)),
      plain("Reason", p.followup_reason),
    ),
    long("Notes", p.followup_notes, true),
  ];
}

/** Posted when the closer logs the follow-up. */
function followUpLogged(term: "Short" | "Long", p: Record<string, unknown>, tz: string | null) {
  return {
    title: `${term}-term follow-up logged`,
    blocks: followUpLines(p, tz),
    linkPath: leadLink(obj(p.lead).id ?? p.lead_id),
  } satisfies Body;
}

/** Posted at the due time, pointing back at the logged message. */
function followUpDue(
  term: "Short" | "Long",
  p: Record<string, unknown>,
  tz: string | null,
  opts: FormatOptions,
): Body {
  const lead = obj(p.lead);
  return {
    title: `${term}-term follow-up due`,
    headline: "FOLLOW UP ASAP",
    blocks: opts.replyToUrl
      ? [
          gap,
          lines(plain("Full Name", lead.full_name ?? p.lead_email), ["Phone", lead.phone]),
          replyBlock(opts, "Original follow-up"),
        ]
      : [gap, ...followUpLines(p, tz)],
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
  const excluded = Number(p.non_usd_rows_excluded) || 0;
  return {
    title: `${kind} sales team report — ${text(p.period_label)}`,
    blocks: [
      lines(
        ["Period", p.period_label],
        [
          "Note",
          excluded > 0
            ? `${excluded} entr${excluded === 1 ? "y" : "ies"} in another currency not included in cash`
            : "",
        ],
      ),
      long("Totals", totals),
      long("Setters", setters.map(rowLine).join("\n")),
      long("Closers", closers.map(rowLine).join("\n")),
    ],
  };
}

/** "2026-11-14" → "Sat, Nov 14" — a calendar date, no timezone involved. */
function dateLabel(date: unknown): string {
  const d = text(date).slice(0, 10);
  const [y, m, day] = d.split("-").map(Number);
  if (!y || !m || !day) return text(date);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function scheduledLabel(date: unknown, time: unknown) {
  const label = text(date) ? dateLabel(date) : "";
  if (!label) return "";
  const t = timeOfDayLabel(text(time));
  return t ? `${label}, ${t}` : label;
}

function contentReady(kind: "Short-form" | "Long-form" | null, p: Record<string, unknown>): Body {
  return {
    title: `${kind ? `${kind} ready to post` : "Ready to post"} — ${platformLabel(text(p.platform))}`,
    blocks: [
      lines(
        ["Title", p.title],
        ["Platform", platformLabel(text(p.platform))],
        ["Hook", p.hook],
        ["Scheduled", scheduledLabel(p.scheduled_date, p.scheduled_time)],
        ["Link", p.url],
        ["Angle", text(p.angle).replace(/_/g, " ")],
        ["Funnel stage", text(p.funnel_stage).replace(/_/g, " ")],
      ),
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
    blocks: [lines(["Date", p.period_label]), long("Today", list)],
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
    blocks: [
      lines(["Report", kind], ["Period", p.period_label]),
      long("By source", [ranked, unknownLine].filter(Boolean).join("\n")),
      long("Top content", content.map((r, i) => sourceLine(r, i + 1)).join("\n")),
      long(
        "How this is counted",
        `Leads created in the period by where they came from; booked calls and closer-logged cash by their lead's source. Anything not tied to a lead is Unattributed.${excluded ? ` ${excluded} cash entr${excluded === 1 ? "y" : "ies"} in another currency not included.` : ""}`,
      ),
    ],
  };
}

const PROCESSOR_LABELS: Record<string, string> = {
  fanbasis: "Commas (Fanbasis)",
  whop: "Whop",
  stripe: "Stripe",
  paypal: "PayPal",
  wise: "Wise",
};

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function payment(failed: boolean, p: Record<string, unknown>): Body {
  const lead = obj(p.lead);
  const amount = money(p.amount_cents, p.currency);
  const usd =
    amount && text(p.currency).toUpperCase() !== "USD" && Number(p.amount_usd_cents)
      ? ` (${money(p.amount_usd_cents)})`
      : "";
  // Counted from AscendOS's own payment rows for this buyer: this failure
  // plus the failures since their last successful payment.
  const attempt = Number(p.failed_attempt_number);
  return {
    title: failed ? `Payment FAILED — ${amount || "—"}` : `Payment collected — ${amount || "—"}`,
    blocks: [
      lines(
        plain("Name", lead.full_name ?? p.client_name),
        plain("Email", p.email ?? lead.email),
        plain("Phone", lead.phone),
      ),
      gap,
      lines(
        plain("Processor", PROCESSOR_LABELS[text(p.processor).toLowerCase()] ?? p.processor),
        plain("Amount", amount ? `${amount}${usd}` : ""),
        plain("Product", p.product ?? p.offer_name),
      ),
      gap,
      lines(
        plain("Reason", failed ? p.failure_reason : ""),
        plain("Attempt #", failed && Number.isFinite(attempt) && attempt > 0 ? attempt : ""),
      ),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** Readable fallback for an event with no bespoke shape: top-level scalars. */
function generic(eventType: string, p: Record<string, unknown>): Body {
  const SKIP = new Set(["answers", "raw_answers", "answers_by_title", "category", "org_id"]);
  const ls: Line[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (SKIP.has(k) || v == null || typeof v === "object") continue;
    ls.push([humanize(k), k.endsWith("_cents") ? money(v) : v]);
  }
  return {
    title: eventCatalogEntry(eventType)?.label ?? eventType,
    blocks: [lines(...ls.slice(0, 20))],
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
    case "call.booked":
      body = callBooked("Call booked", p, tz);
      break;
    case "call.confirmed":
      body = callBooked("Call confirmed", p, tz);
      break;
    case "call.unconfirmed":
      body = callUnconfirmed(p, tz);
      break;
    case "call.cancelled":
      body = callCancelled(p, tz);
      break;
    case "call.rescheduled":
      body = callRescheduled(p, tz);
      break;
    case "closer.post_call_submitted":
      body = postCall(p, tz);
      break;
    case "setter.eod_submitted":
      body = setterEod(p);
      break;
    case "callback.logged":
      body = callbackLogged(p, tz);
      break;
    case "callback.due":
      body = callbackDue(p, tz, opts);
      break;
    case "followup.short_term_logged":
      body = followUpLogged("Short", p, tz);
      break;
    case "followup.long_term_logged":
      body = followUpLogged("Long", p, tz);
      break;
    case "followup.short_term_due":
      body = followUpDue("Short", p, tz, opts);
      break;
    case "followup.long_term_due":
      body = followUpDue("Long", p, tz, opts);
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
    case "payment.collected":
      body = payment(false, p);
      break;
    case "payment.failed":
      body = payment(true, p);
      break;
    case "call.closed_won":
      body = {
        title: "Closed won",
        blocks: [
          lines(
            ["Closer", p.closer],
            ["Lead", p.lead_email],
            ["Cash collected", money(p.cash_cents)],
            ["Contract value", money(p.contract_cents)],
          ),
        ],
      };
      break;
    default:
      body = generic(eventType, p);
  }
  return assemble(body, opts);
}
