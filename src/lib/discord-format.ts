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
/** Ends every message: a blank line Discord keeps (see assemble). */
export const MESSAGE_SPACER = "\n\u200b";

export type DiscordMessage = {
  content: string;
  allowed_mentions: { parse: never[]; roles: string[]; users?: string[] };
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
  /** Discord link to the lead's #new-1on1-applicants post ("View application"). */
  applicationUrl?: string | null;
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
  // Every lead message can jump to the lead's full application answers.
  const app =
    body.linkPath && opts.applicationUrl
      ? `[📝 View 1on1 application](<${opts.applicationUrl}>)`
      : "";
  if (link)
    parts.push(
      { text: "" },
      { text: DIVIDER },
      { text: "" },
      { text: [link, app].filter(Boolean).join("\n") },
    );
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

  // A blank trailing line, so back-to-back posts from the same bot don't run
  // together. Discord trims trailing whitespace, so it's a zero-width space.
  if (content.length + MESSAGE_SPACER.length <= DISCORD_CONTENT_LIMIT) content += MESSAGE_SPACER;
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
      lines(
        plain("Date of Call", when(p.scheduled_for, tz)),
        plain("Meeting link", noPreview(p.meeting_link)),
      ),
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

/** The channel a follow-up is also posted to, by the closer's outcome. */
function followUpChannel(status: unknown): string {
  const st = text(status);
  if (st === "Follow Up (short term)") return "#closer-short-term";
  if (st === "Follow Up (long term)") return "#closer-long-term";
  return "";
}

/** Lead first, then the call and its outcome, the money, then the story. */
function postCall(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  const also = followUpChannel(p.lead_status);
  return {
    title: "Post-call notes",
    blocks: [
      lines(
        ["Full Name", lead.full_name],
        ["Email", p.lead_email ?? lead.email],
        ["Phone", lead.phone],
      ),
      gap,
      lines(["Closer", p.closer_name], plain("Date of Call", when(p.scheduled_for, tz)), [
        "Outcome",
        p.lead_status,
      ]),
      gap,
      lines(
        ["Offer made", p.offer_made],
        ["Cash collected", money(p.cash_collected_cents, p.currency)],
        ["Total revenue", money(p.contract_value_cents, p.currency)],
        ["Payment plan", p.payment_plan],
      ),
      gap,
      lines([
        "Objections",
        Array.isArray(p.objections)
          ? p.objections.map(text).filter(Boolean).join(", ")
          : p.objections,
      ]),
      long("Call summary", p.call_summary),
      gap,
      lines(plain("Recording", noPreview(p.recording_url))),
      gap,
      lines(
        plain("Follow up", when(p.requested_followup_at, tz)),
        plain("Amount pitched", money(p.followup_amount_pitched_cents, p.currency)),
        plain("Reason", p.followup_reason),
        plain("Also posted in", also),
      ),
      long("Follow-up notes", p.followup_notes, true),
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** "37%", or nothing when there is nothing to divide by. */
function rate(n: unknown, d: unknown): string {
  const num = Number(n) || 0;
  const den = Number(d) || 0;
  return den > 0 ? `${Math.round((num / den) * 100)}%` : "";
}

/** A count, or nothing when it is zero, so empty fields are left out. */
const count = (v: unknown) => (Number(v) ? Number(v) : "");

/**
 * Grouped as the rep's funnel: activity, then conversations, then the
 * outcome, then the rates the rep pages track.
 */
function setterEod(p: Record<string, unknown>): Body {
  const dialer = text(p.role) === "inbound_dialer";
  const who: Line[] = [
    [
      "Rep",
      text(p.team_member_name)
        ? `${text(p.team_member_name)} (${dialer ? "Dialer" : "DM Setter"})`
        : "",
    ],
    ["Date", dateLabel(p.activity_date)],
  ];
  const outbound = Number(p.outbound_dms_sent) || 0;
  const blocks: Block[] = dialer
    ? [
        lines(...who),
        gap,
        lines(
          ["Dials", count(p.dials)],
          ["Connections", count(p.connections)],
          ["Leads contacted", count(p.leads_contacted)],
        ),
        gap,
        lines(
          ["Sets", count(p.sets)],
          ["Calls on calendar", count(p.calls_on_calendar)],
          ["Live calls", count(p.live_calls)],
          ["Closes", count(p.closes)],
          ["Cash collected", money(p.cash_collected_cents, p.original_currency)],
        ),
        gap,
        lines(
          plain("Pickup rate", rate(p.connections, p.dials)),
          plain("Set rate", rate(p.sets, p.connections)),
          plain("Rating", text(p.rate_today) ? `${text(p.rate_today)}/10` : ""),
        ),
      ]
    : [
        lines(...who),
        gap,
        lines(
          ["Leads contacted", count(p.leads_contacted)],
          ["Outbound DMs", count(p.outbound_dms_sent)],
          ["Inbound DMs", count(p.inbound_dms_sent)],
          ["Follow-ups sent", count(p.followups_sent)],
        ),
        gap,
        lines(
          ["Replies", count(p.replies)],
          ["Qualified conversations", count(p.qualified_convos)],
          ["Links sent", count(p.links_sent)],
          ["Sets", count(p.sets)],
          ["Cash collected", money(p.cash_collected_cents, p.original_currency)],
        ),
        gap,
        lines(
          plain("Reply rate", outbound ? rate(p.replies, outbound) : ""),
          plain("Set rate", rate(p.sets, p.qualified_convos)),
          plain("Rating", text(p.rate_today) ? `${text(p.rate_today)}/10` : ""),
        ),
      ];
  return {
    title: "Setter EOD report",
    blocks: [...blocks, long("Objections", p.objections), long("Notes", p.notes)],
    linkPath: dialer ? "/inbound-dialer" : "/dm-setter",
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

function leaderboard(kind: "Daily" | "Weekly" | "Monthly", p: Record<string, unknown>): Body {
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

/* ------------------------------------------------------------------ */
/* Sales team reports and top sources (remodel, 2026-11-15)             */
/* ------------------------------------------------------------------ */

type Rep = {
  name: string;
  taken?: number;
  showed?: number;
  noShows?: number;
  closed?: number;
  cashCents?: number;
  revenueCents?: number;
  sets?: number;
  dials?: number;
  connections?: number;
  replies?: number;
  qualified?: number;
  prev?: number;
};

type Totals = {
  cashCents?: number;
  revenueCents?: number;
  closes?: number;
  booked?: number;
  onCalendar?: number;
  showed?: number;
  noShows?: number;
};

/** A rate is only shown once there is enough behind it. */
const MIN_RATE_SAMPLE = 5;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? "" : "s"}`;
const sampleRate = (a: number, b: number) => (b >= MIN_RATE_SAMPLE ? pct(a, b) : "");
const moneyOr0 = (c: number) => money(c) || "$0";

/** "(▲ 2)", "(▼ $1,500)", "(▲ 6 pts)", "(▬)" — or nothing without a previous period. */
function delta(cur: number, prev: number | null | undefined, unit: "count" | "money" | "pts") {
  if (prev == null) return "";
  const d = cur - prev;
  if (d === 0) return " (▬)";
  const arrow = d > 0 ? "▲" : "▼";
  const abs = Math.abs(d);
  const v = unit === "money" ? money(abs) : unit === "pts" ? `${Math.round(abs)} pts` : String(abs);
  return ` (${arrow} ${v})`;
}

const periodLine = (kind: string, p: Record<string, unknown>): Line =>
  kind === "Monthly"
    ? ["Month", p.month_label || p.period_label]
    : [kind === "Weekly" ? "Week" : "Date", p.period_label];

function closerLine(r: Rep, i: number, withDelta: boolean) {
  const bits = [
    `${moneyOr0(num(r.cashCents))} cash`,
    num(r.revenueCents) ? `${money(r.revenueCents)} revenue` : "",
    plural(num(r.closed), "close"),
    plural(num(r.taken), "call"),
    sampleRate(num(r.closed), num(r.showed)) && `${sampleRate(num(r.closed), num(r.showed))} close`,
  ].filter(Boolean);
  const d = withDelta ? delta(num(r.cashCents), r.prev ?? 0, "money") : "";
  return `${medal(i)} **${r.name}:** ${bits.join(" · ")}${d}`;
}

function setterLine(r: Rep, i: number, dialer: boolean, withDelta: boolean) {
  const bits = dialer
    ? [
        plural(num(r.sets), "set"),
        plural(num(r.dials), "dial"),
        sampleRate(num(r.connections), num(r.dials)) &&
          `${sampleRate(num(r.connections), num(r.dials))} pickup`,
        sampleRate(num(r.sets), num(r.connections)) &&
          `${sampleRate(num(r.sets), num(r.connections))} set rate`,
      ]
    : [
        plural(num(r.sets), "set"),
        num(r.qualified) ? `${num(r.qualified)} qualified` : "",
        num(r.replies) ? plural(num(r.replies), "reply").replace("replys", "replies") : "",
        sampleRate(num(r.sets), num(r.qualified)) &&
          `${sampleRate(num(r.sets), num(r.qualified))} set rate`,
      ];
  // The money on their sets: what closed, the cash taken, the deal value.
  if (num(r.showed)) bits.push(`${num(r.showed)} showed`);
  if (num(r.closed)) bits.push(`${num(r.closed)} closed`);
  if (num(r.cashCents)) bits.push(`${money(r.cashCents)} cash`);
  if (num(r.revenueCents)) bits.push(`${money(r.revenueCents)} revenue`);
  const d = withDelta ? delta(num(r.sets), r.prev ?? 0, "count") : "";
  return `${medal(i)} **${r.name}:** ${bits.filter(Boolean).join(" · ")}${d}`;
}

/** The weakest of show rate and close rate, against simple benchmarks. */
function weakestStep(t: Totals, monthly: boolean): string {
  const showDen = num(t.showed) + num(t.noShows);
  const showRate = showDen ? num(t.showed) / showDen : null;
  const closeRate = num(t.showed) ? num(t.closes) / num(t.showed) : null;
  const showGap = showRate != null && showDen >= MIN_RATE_SAMPLE ? 0.7 - showRate : -1;
  const closeGap = closeRate != null && num(t.showed) >= MIN_RATE_SAMPLE ? 0.3 - closeRate : -1;
  if (showGap <= 0 && closeGap <= 0) return "";
  if (showGap >= closeGap)
    return monthly
      ? `No-shows: ${plural(num(t.noShows), "booked call")} never showed`
      : `Show rate ${pct(num(t.showed), showDen)}, the weakest step`;
  return monthly
    ? `Showed but didn't buy: ${plural(num(t.showed) - num(t.closes), "call")}`
    : `Close rate ${pct(num(t.closes), num(t.showed))}, the weakest step`;
}

function salesReport(p: Record<string, unknown>): Body {
  const kind = text(p.kind) || "Daily";
  const monthly = kind === "Monthly";
  const compare = kind !== "Daily";
  const t = obj(p.team) as Totals;
  const pt = (compare ? obj(p.prev_team) : {}) as Totals;
  const hasPrev = compare && p.prev_team != null;
  const prev = (k: keyof Totals) => (hasPrev ? num(pt[k]) : null);
  const closers = (Array.isArray(p.closers) ? p.closers : []) as Rep[];
  const dms = (Array.isArray(p.dm_setters) ? p.dm_setters : []) as Rep[];
  const dialers = (Array.isArray(p.dialers) ? p.dialers : []) as Rep[];
  const target = num(p.cash_target_cents);

  const cash = num(t.cashCents);
  const cashText =
    (monthly && target
      ? `${moneyOr0(cash)} of ${money(target)} target (${pct(cash, target)})`
      : moneyOr0(cash)) + delta(cash, prev("cashCents"), "money");
  const showDen = num(t.showed) + num(t.noShows);
  const prevShowDen = num(pt.showed) + num(pt.noShows);
  const showPts = (s: number, d: number) => (d ? (s / d) * 100 : 0);

  const boards: string[] = [];
  if (closers.length)
    boards.push(
      [
        "**🏆 CLOSERS** · ranked by cash collected",
        ...closers.map((r, i) => closerLine(r, i, hasPrev)),
      ].join("\n"),
    );
  if (dms.length)
    boards.push(
      [
        "**💬 DM SETTERS** · ranked by sets",
        ...dms.map((r, i) => setterLine(r, i, false, hasPrev)),
      ].join("\n"),
    );
  if (dialers.length)
    boards.push(
      [
        "**📞 DIALERS** · ranked by sets",
        ...dialers.map((r, i) => setterLine(r, i, true, hasPrev)),
      ].join("\n"),
    );
  if (num(p.unassigned_closes))
    boards.push(`Closed calls with no setter on them: ${num(p.unassigned_closes)}`);

  const topCloser = closers[0];
  const allSetters = [...dms, ...dialers].sort((a, b) => num(b.sets) - num(a.sets));
  const topSetter = allSetters[0];
  const improved = hasPrev
    ? [...allSetters]
        .map((r) => ({ r, d: num(r.sets) - num(r.prev) }))
        .filter((x) => x.d > 0)
        .sort((a, b) => b.d - a.d)[0]
    : undefined;
  const improvedCloser =
    hasPrev && !improved
      ? [...closers]
          .map((r) => ({ r, d: num(r.cashCents) - num(r.prev) }))
          .filter((x) => x.d > 0)
          .sort((a, b) => b.d - a.d)[0]
      : undefined;
  const src = obj(p.top_source);
  const missing = (Array.isArray(p.missing_eods) ? p.missing_eods : []).map(text).filter(Boolean);
  const idle = (Array.isArray(p.no_activity) ? p.no_activity : []).map(text).filter(Boolean);
  const excluded = num(p.non_usd_rows_excluded);

  return {
    title: `${kind} sales team report — ${text(p.period_label)}`,
    blocks: [
      lines(periodLine(kind, p)),
      gap,
      lines(
        ["Cash collected", cashText],
        [
          "Revenue",
          moneyOr0(num(t.revenueCents)) + delta(num(t.revenueCents), prev("revenueCents"), "money"),
        ],
        ["Closes", String(num(t.closes)) + delta(num(t.closes), prev("closes"), "count")],
      ),
      gap,
      lines(
        ["Calls booked", String(num(t.booked)) + delta(num(t.booked), prev("booked"), "count")],
        ["Calls on calendar", String(num(t.onCalendar))],
        ["Showed", String(num(t.showed))],
        ["No-shows", String(num(t.noShows))],
      ),
      gap,
      lines(
        plain(
          "Show rate",
          showDen
            ? pct(num(t.showed), showDen) +
                (hasPrev && prevShowDen
                  ? delta(
                      showPts(num(t.showed), showDen),
                      showPts(num(pt.showed), prevShowDen),
                      "pts",
                    )
                  : "")
            : "",
        ),
        plain("Close rate", num(t.showed) ? pct(num(t.closes), num(t.showed)) : ""),
      ),
      divider,
      { kind: "raw", text: boards.join("\n\n") || "No activity logged." },
      divider,
      lines(
        [
          monthly ? "Closer of the month" : "Top closer",
          topCloser && num(topCloser.cashCents)
            ? `${topCloser.name} (${money(topCloser.cashCents)} · ${plural(num(topCloser.closed), "close")})`
            : "",
        ],
        [
          monthly ? "Setter of the month" : "Top setter",
          topSetter && num(topSetter.sets)
            ? `${topSetter.name} (${plural(num(topSetter.sets), "set")})`
            : "",
        ],
        [
          "Most improved",
          improved
            ? `${improved.r.name} (▲ ${plural(improved.d, "set")})`
            : improvedCloser
              ? `${improvedCloser.r.name} (▲ ${money(improvedCloser.d)})`
              : "",
        ],
        [monthly ? "Biggest leak" : "Bottleneck", compare ? weakestStep(t, monthly) : ""],
        [
          monthly ? "Best source" : "Top source",
          text(src.name)
            ? `${text(src.name)} (${plural(num(src.leads), "lead")}, ${num(src.booked)} booked)`
            : "",
        ],
        ["Missing EODs", missing.join(", ")],
        ["No activity", compare ? idle.join(", ") : ""],
        plain(
          "Note",
          excluded
            ? `${excluded} entr${excluded === 1 ? "y" : "ies"} in another currency not included in cash`
            : "",
        ),
      ),
    ],
    linkPath: "/dashboard",
  };
}

type Src = {
  name: string;
  leads?: number;
  applications?: number;
  booked?: number;
  closed?: number;
  cashCents?: number;
  revenueCents?: number;
};

/** "(▲ 3 leads)", "(▼ 1 lead)", "(▬)". */
function leadDelta(cur: number, prev: number) {
  const d = cur - prev;
  if (!d) return " (▬)";
  return ` (${d > 0 ? "▲" : "▼"} ${plural(Math.abs(d), "lead")})`;
}

function srcLine(r: Src, i: number, extra = "") {
  const bits = [
    plural(num(r.leads), "lead"),
    num(r.applications) ? plural(num(r.applications), "application") : "",
    num(r.booked) ? `${num(r.booked)} booked` : "",
    num(r.closed) ? `${num(r.closed)} closed` : "",
    money(num(r.revenueCents) || num(r.cashCents)),
  ].filter(Boolean);
  return `${medal(i)} **${r.name}:** ${bits.join(" · ")}${extra}`;
}

function topSourcesReport(p: Record<string, unknown>): Body {
  const kind = text(p.kind) || "Daily";
  const monthly = kind === "Monthly";
  const weekly = kind === "Weekly";
  const t = obj(p.totals) as Src;
  const pt = p.prev_totals ? (obj(p.prev_totals) as Src) : null;
  const prevLeads = new Map(
    ((Array.isArray(p.prev_sources) ? p.prev_sources : []) as Src[]).map((r) => [
      r.name,
      num(r.leads),
    ]),
  );
  const sources = (Array.isArray(p.sources) ? p.sources : []) as Src[];
  const placements = (Array.isArray(p.placements) ? p.placements : []) as Src[];
  const content = (Array.isArray(p.content) ? p.content : []) as Src[];
  const un = obj(p.unattributed) as Src;
  const d = (k: keyof Src, unit: "count" | "money" = "count") =>
    pt ? delta(num(t[k]), num(pt[k]), unit) : "";

  if (kind === "Daily" && !num(t.leads) && !num(t.booked) && !num(t.closed)) {
    return {
      title: `Daily top content sources — ${text(p.period_label)}`,
      blocks: [lines(periodLine(kind, p)), gap, lines(plain("Result", "No new leads today."))],
      linkPath: "/traffic",
    };
  }

  const top5 = (rows: Src[], withDelta = false) =>
    rows
      .slice(0, 5)
      .map((r, i) =>
        srcLine(
          r,
          i,
          withDelta && p.prev_sources ? leadDelta(num(r.leads), prevLeads.get(r.name) ?? 0) : "",
        ),
      );

  const boards: string[] = [];
  if (monthly) {
    const byRevenue = [...sources]
      .filter((r) => num(r.revenueCents) || num(r.closed))
      .sort((a, b) => num(b.revenueCents) - num(a.revenueCents) || num(b.closed) - num(a.closed));
    if (byRevenue.length)
      boards.push(
        [
          "**💰 REVENUE BY PLATFORM**",
          ...byRevenue
            .slice(0, 5)
            .map(
              (r, i) =>
                `${medal(i)} **${r.name}:** ${moneyOr0(num(r.revenueCents))} · ${plural(num(r.closed), "close")} · ${plural(num(r.leads), "lead")}`,
            ),
        ].join("\n"),
      );
  }
  if (sources.length)
    boards.push(["**📱 BY PLATFORM**", ...top5(sources, weekly || monthly)].join("\n"));
  if (placements.length) boards.push(["**📍 BY PLACEMENT**", ...top5(placements)].join("\n"));
  if (content.length) boards.push(["**🎬 TOP POSTS**", ...top5(content)].join("\n"));

  // Callouts. Rate callouts need at least 2 leads behind them.
  const pool = placements.length ? placements : sources;
  const bestPost = [...content].sort(
    (a, b) => num(b.closed) - num(a.closed) || num(b.leads) - num(a.leads),
  )[0];
  const bestRate = [...pool]
    .filter((r) => num(r.leads) >= 2 && num(r.booked) > 0)
    .sort((a, b) => num(b.booked) / num(b.leads) - num(a.booked) / num(a.leads))[0];
  const dead = [...pool]
    .filter((r) => num(r.leads) >= 3 && !num(r.booked))
    .sort((a, b) => num(b.leads) - num(a.leads))[0];
  const valuePerLead = [...sources]
    .filter((r) => num(r.revenueCents) > 0 && num(r.leads) > 0)
    .sort((a, b) => num(b.revenueCents) / num(b.leads) - num(a.revenueCents) / num(a.leads))[0];
  const leastMoney = [...sources]
    .filter((r) => num(r.leads) >= 3 && !num(r.revenueCents))
    .sort((a, b) => num(b.leads) - num(a.leads))[0];
  const totalLeads = num(t.leads);
  const untagged = num(un.leads);

  return {
    title: `${kind} top content sources — ${text(p.period_label)}`,
    blocks: [
      lines(periodLine(kind, p)),
      gap,
      lines(
        ["Leads", String(num(t.leads)) + d("leads")],
        ["Applications", String(num(t.applications)) + d("applications")],
        ["Booked", String(num(t.booked)) + d("booked")],
        ["Closed", String(num(t.closed)) + d("closed")],
        ["Cash collected", money(t.cashCents)],
        ["Revenue", money(t.revenueCents)],
      ),
      divider,
      { kind: "raw", text: boards.join("\n\n") || "No attributed leads yet." },
      divider,
      lines(
        [
          monthly ? "Content of the month" : "Best post",
          bestPost && kind !== "Daily"
            ? `${bestPost.name}: ${plural(num(bestPost.leads), "lead")}${num(bestPost.closed) ? ` → ${plural(num(bestPost.closed), "close")}` : ""}${monthly && num(bestPost.revenueCents) ? ` · ${money(bestPost.revenueCents)}` : ""}`
            : "",
        ],
        [
          "Best lead-to-booked rate",
          weekly && bestRate
            ? `${bestRate.name} (${pct(num(bestRate.booked), num(bestRate.leads))}, ${num(bestRate.booked)} of ${num(bestRate.leads)})`
            : "",
        ],
        [
          "Dead weight",
          weekly && dead ? `${dead.name} (${plural(num(dead.leads), "lead")}, 0 booked)` : "",
        ],
        [
          "Highest value per lead",
          monthly && valuePerLead
            ? `${valuePerLead.name} (${money(Math.round(num(valuePerLead.revenueCents) / num(valuePerLead.leads)))} revenue per lead)`
            : "",
        ],
        [
          "Most leads, least money",
          monthly && leastMoney
            ? `${leastMoney.name} (${plural(num(leastMoney.leads), "lead")}, $0)`
            : "",
        ],
      ),
      lines(
        plain(
          "Untagged",
          untagged && totalLeads
            ? `${untagged} of ${plural(totalLeads, "lead")} (${pct(untagged, totalLeads)}) had no source. Use the tagged links.`
            : "",
        ),
      ),
    ],
    linkPath: "/traffic",
  };
}

/* ------------------------------------------------------------------ */
/* Ops channels (2026-11-15)                                            */
/* ------------------------------------------------------------------ */

/** #applied-not-booked: the application, plus when they applied. */
function appliedNotBooked(p: Record<string, unknown>, tz: string | null): Body {
  const app = application(p);
  return {
    ...app,
    title: "Applied but didn't book",
    blocks: [
      ...app.blocks,
      gap,
      lines(plain("Applied", when(p.applied_at, tz)), plain("Call booked", "Not yet")),
    ],
  };
}

const ROLE_LABEL: Record<string, string> = {
  dm_setter: "DM Setter",
  inbound_dialer: "Dialer",
  closer: "Closer",
};

/** #eod-no-show: one rep who didn't file the previous day. */
function eodMissing(p: Record<string, unknown>, tz: string | null, appUrl?: string | null): Body {
  const calls = (Array.isArray(p.calls) ? p.calls : []) as Array<{ lead?: string; time?: string }>;
  const formUrl =
    appUrl && text(p.form_path) ? `${appUrl.replace(/\/+$/, "")}${text(p.form_path)}` : "";
  return {
    title: "EOD not filed",
    blocks: [
      lines(
        ["Rep", text(p.rep) ? `${text(p.rep)} (${ROLE_LABEL[text(p.role)] ?? text(p.role)})` : ""],
        ["Date", p.date_label],
        ["Missing", p.missing],
      ),
      gap,
      {
        kind: "raw",
        text: calls
          .map((c) => `• ${text(c.lead)}${c.time ? `: ${when(c.time, tz)}` : ""}`)
          .join("\n"),
      },
      gap,
      lines(plain("File it now", formUrl ? `[Open form](<${formUrl}>)` : "")),
    ],
  };
}

/** #todays-calls: every call on the calendar today, earliest first. */
function callsToday(p: Record<string, unknown>, tz: string | null, appUrl?: string | null): Body {
  const calls = (Array.isArray(p.calls) ? p.calls : []) as Array<Record<string, unknown>>;
  const base = (appUrl ?? "").replace(/\/+$/, "");
  const timeOnly = (iso: unknown) => {
    const full = when(iso, tz);
    return full.includes(", ") ? full.split(", ").slice(2).join(", ") || full : full;
  };
  const blocks = calls.map((c) => {
    const status = c.confirmed ? "✅ Confirmed" : "⚠️ Not confirmed";
    const who = [
      text(c.setter) ? `Setter: ${text(c.setter)}` : "",
      text(c.closer) ? `Closer: ${text(c.closer)}` : "Closer: unassigned",
    ]
      .filter(Boolean)
      .join(" · ");
    const linksLine = [
      text(c.meeting_link) ? `[Meeting link](<${text(c.meeting_link)}>)` : "",
      base && text(c.lead_id)
        ? `[Open in AscendOS](<${base}/leads?leadId=${text(c.lead_id)}>)`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return [
      `**${timeOnly(c.time)} · ${text(c.lead_name)}** ${status}`,
      text(c.phone) ? `Phone: ${text(c.phone)}` : "",
      who,
      linksLine,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return {
    title: "Today's calls",
    blocks: [
      lines(["Date", p.date_label], ["Calls today", String(calls.length)]),
      divider,
      { kind: "raw", text: blocks.join("\n\n") || "No calls booked today." },
    ],
  };
}

/** The lead and money lines both payment follow-up messages share. */
function paymentFollowUpBlocks(p: Record<string, unknown>, tz: string | null): Block[] {
  const lead = obj(p.lead);
  const collected = num(p.cash_collected_cents);
  const deal = num(p.contract_value_cents);
  return [
    lines(...leadLines(lead, p, false)),
    gap,
    lines(["Closer", p.closer_name], plain("Status", p.lead_status)),
    gap,
    lines(
      plain("Collected so far", money(collected, p.currency)),
      plain("Deal value", money(deal, p.currency)),
      plain("Still owed", deal > collected ? money(deal - collected, p.currency) : ""),
    ),
    gap,
    lines(
      ["Next payment due", when(p.payment_followup_at, tz)],
      ["Amount due", money(p.payment_followup_amount_cents, p.currency)],
      ["How they're paying", p.payment_followup_method],
    ),
    long("Payment notes", p.payment_followup_notes, true),
  ];
}

function paymentFollowUpLogged(p: Record<string, unknown>, tz: string | null): Body {
  return {
    title: "Payment follow-up logged",
    blocks: paymentFollowUpBlocks(p, tz),
    linkPath: leadLink(obj(p.lead).id ?? p.lead_id),
  };
}

function paymentFollowUpDue(
  p: Record<string, unknown>,
  tz: string | null,
  opts: FormatOptions,
): Body {
  const lead = obj(p.lead);
  return {
    title: "Payment due now",
    headline: "COLLECT PAYMENT ASAP",
    blocks: opts.replyToUrl
      ? [
          lines(
            ["Full Name", lead.full_name],
            ["Phone", lead.phone],
            ["Amount due", money(p.payment_followup_amount_cents, p.currency)],
            ["How they're paying", p.payment_followup_method],
          ),
          replyBlock(opts, "Original payment follow-up"),
        ]
      : paymentFollowUpBlocks(p, tz),
    linkPath: leadLink(lead.id ?? p.lead_id),
  };
}

/** #pre-call-assets: ✅ per asset the lead opened. Edited in place. */
function precallProgress(p: Record<string, unknown>, tz: string | null): Body {
  const lead = obj(p.lead);
  const assets = (Array.isArray(p.assets) ? p.assets : []) as Array<{
    label?: string;
    done?: boolean;
  }>;
  const row = assets.map((a) => (a.done ? "✅" : "❌")).join("");
  const done = assets.filter((a) => a.done).length;
  return {
    title: "Pre-call assets",
    blocks: [
      lines(...leadLines(lead, p, false)),
      gap,
      lines(plain("Date of Call", when(p.scheduled_for, tz))),
      gap,
      lines(["Progress", `${row} (${done}/${assets.length})`]),
      {
        kind: "raw",
        text: assets.map((a) => `${a.done ? "✅" : "❌"} ${text(a.label)}`).join("\n"),
      },
    ],
    linkPath: leadLink(lead.id ?? p.lead_id),
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

/** "2", or "2 of 5" when the client's plan progress is known ("2/5 paid"). */
function paymentNumber(p: Record<string, unknown>): string {
  const prior = Number(p.prior_successful_payments);
  if (!Number.isFinite(prior) || prior < 0) return "";
  const nth = prior + 1;
  const m = /\/(\d+)/.exec(text(p.plan_progress));
  return m ? `${nth} of ${m[1]}` : String(nth);
}

function payment(failed: boolean, p: Record<string, unknown>): Body {
  const lead = obj(p.lead);
  const amount = money(p.amount_cents, p.currency);
  const usd =
    amount && (text(p.currency).toUpperCase() || "USD") !== "USD" && Number(p.amount_usd_cents)
      ? ` (${money(p.amount_usd_cents)})`
      : "";
  // Counted from AscendOS's own payment rows for this buyer: this failure
  // plus the failures since their last successful payment.
  const attempt = Number(p.failed_attempt_number);
  const revenue = Number(p.revenue_cents) || 0;
  const toDate = Number(p.collected_to_date_cents) || 0;
  // "$2,500 of $5,000" once there's more than this payment, or more to come.
  const soFar =
    !failed &&
    toDate &&
    revenue &&
    (toDate !== Number(p.amount_usd_cents ?? p.amount_cents) || toDate < revenue)
      ? `${money(toDate)} of ${money(revenue)}`
      : "";
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
        plain("Product", p.product ?? p.offer_name),
        plain("Payment #", failed ? "" : paymentNumber(p)),
      ),
      gap,
      lines(
        failed
          ? plain("Amount", amount ? `${amount}${usd}` : "")
          : plain("Cash collected", amount ? `${amount}${usd}` : ""),
        plain("Revenue", money(revenue)),
        plain("Collected to date", soFar),
      ),
      gap,
      lines(plain("Closer", p.closer_name), plain("Setter", p.setter_name)),
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
      body = Array.isArray(p.dm_setters)
        ? salesReport({ kind: "Daily", ...p })
        : leaderboard("Daily", p);
      break;
    case "report.weekly_sales":
      body = Array.isArray(p.dm_setters)
        ? salesReport({ kind: "Weekly", ...p })
        : leaderboard("Weekly", p);
      break;
    case "report.monthly_sales":
      body = Array.isArray(p.dm_setters)
        ? salesReport({ kind: "Monthly", ...p })
        : leaderboard("Monthly", p);
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
      body = p.totals ? topSourcesReport({ kind: "Daily", ...p }) : topSources("Daily", p);
      break;
    case "report.top_sources_weekly":
      body = p.totals ? topSourcesReport({ kind: "Weekly", ...p }) : topSources("Weekly", p);
      break;
    case "report.top_sources_monthly":
      body = p.totals ? topSourcesReport({ kind: "Monthly", ...p }) : topSources("Monthly", p);
      break;
    case "lead.applied_not_booked":
      body = appliedNotBooked(p, tz);
      break;
    case "eod.missing":
      body = eodMissing(p, tz, opts.appUrl);
      break;
    case "calls.today":
      body = callsToday(p, tz, opts.appUrl);
      break;
    case "payment.followup_logged":
      body = paymentFollowUpLogged(p, tz);
      break;
    case "payment.followup_due":
      body = paymentFollowUpDue(p, tz, opts);
      break;
    case "precall.progress":
      body = precallProgress(p, tz);
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
  const appUrl = text(obj(p.lead).application_message_url);
  const msg = assemble(body, {
    ...opts,
    applicationUrl:
      eventType === "lead.application_submitted" ? null : (opts.applicationUrl ?? (appUrl || null)),
  });
  // Rep mentions a message decides itself (#todays-calls, #eod-no-show).
  const users = (Array.isArray(p.mention_user_ids) ? p.mention_user_ids : [])
    .map((u) => String(u))
    .filter((u) => /^\d+$/.test(u));
  if (users.length) msg.allowed_mentions.users = users;
  return msg;
}
