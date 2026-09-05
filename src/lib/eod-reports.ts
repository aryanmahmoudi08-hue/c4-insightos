import type { ActivityRole } from "@/components/activity-module";
import type { TeamRole } from "@/components/team-member-picker";

/**
 * Shared schema + payload-building layer for the EOD Reports step-flow.
 * Question label/order/required-ness mirrors activity-module.tsx's "Log day"
 * dialog and closer.tsx's "Log call" dialog exactly (Phase E already
 * confirmed those field lists against the real setter_activity/calls
 * schemas) — this file doesn't re-derive that, it re-exposes it as a
 * schema-driven flow. Payload builders mirror those dialogs' mutationFn
 * bodies exactly (same NUM/cents-rounding/objection-split helpers), so both
 * entry points write identical row shapes into the same tables.
 */

export type EodQuestionType =
  | "text"
  | "email"
  | "url"
  | "number"
  | "date"
  | "datetime"
  | "textarea"
  | "select"
  | "checkbox"
  | "team-member"
  | "lead-picker"
  | "scale";

export interface EodSelectOption {
  value: string;
  label: string;
}

export interface EodQuestion {
  key: string;
  label: string;
  helper?: string;
  type: EodQuestionType;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: EodSelectOption[];
  defaultValue?: string | number | boolean;
  placeholder?: string;
  /** For type: "team-member" — which roster TeamMemberPicker should query. */
  teamRole?: TeamRole;
  /** Renders a "$" prefix and formats as currency-shaped input. */
  money?: boolean;
}

export type EodValues = Record<string, string | number | boolean | undefined>;

const today = () => new Date().toISOString().slice(0, 10);

// Exact 11-choice list requested for the Closer Post-Call form. Deliberately
// distinct from calls.status (call_status enum) and calls.disposition (the
// analytics taxonomy) — see buildClosureCallPayload below for how this real
// submitted choice maps onto both without losing the raw value.
export const CLOSER_LEAD_STATUS_OPTIONS: EodSelectOption[] = [
  { value: "Closed", label: "Closed" },
  { value: "Deposit", label: "Deposit" },
  { value: "No Show", label: "No Show" },
  { value: "Follow Up (short term)", label: "Follow Up (short term)" },
  { value: "Follow Up (long term)", label: "Follow Up (long term)" },
  { value: "Lost", label: "Lost" },
  { value: "Bad Fit", label: "Bad Fit" },
  { value: "DQ", label: "DQ" },
  { value: "Cancelled", label: "Cancelled" },
  { value: "Rescheduling", label: "Rescheduling" },
  { value: "IGNORE", label: "IGNORE" },
];

/** Dialer EOD — exact order requested. */
export const INBOUND_DIALER_EOD_SCHEMA: EodQuestion[] = [
  {
    key: "team_member_name",
    label: "Name",
    type: "team-member",
    teamRole: "inbound_dialer",
    required: true,
  },
  { key: "activity_date", label: "Date", type: "date", required: true, defaultValue: today() },
  { key: "dials", label: "Dials", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "connections",
    label: "Connections",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "qualified_convos",
    label: "Qualified Convos",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  { key: "sets", label: "Sets", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "calls_on_calendar",
    label: "Calls On Calendar",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "live_calls",
    label: "Live Calls",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  { key: "closes", label: "Closes", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "downsells", label: "Downsells", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "cash_collected",
    label: "Cash Collected",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  {
    key: "total_revenue",
    label: "Total Revenue",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  { key: "rate_today", label: "Rate Today 1-10", type: "scale", required: true, min: 1, max: 10 },
  { key: "objections", label: "Objections", type: "text", required: true },
  { key: "notes", label: "Notes", type: "text", required: true },
];

/** DM Setter EOD — exact order requested. */
export const DM_SETTER_EOD_SCHEMA: EodQuestion[] = [
  {
    key: "team_member_name",
    label: "Name",
    type: "team-member",
    teamRole: "dm_setter",
    required: true,
  },
  { key: "activity_date", label: "Date", type: "date", required: true, defaultValue: today() },
  {
    key: "inbound_dms_sent",
    label: "Inbound DMs Sent",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "outbound_dms_sent",
    label: "Outbound DMs Sent",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  { key: "replies", label: "Replies", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "leads_contacted",
    label: "Leads Contacted",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "qualified_convos",
    label: "Qualified Convos",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "followups_sent",
    label: "Follow-ups",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "links_sent",
    label: "VSL Page Links Sent",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "links_clicked",
    label: "VSL Page Links Clicked",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  { key: "sets", label: "Sets", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "calls_on_calendar",
    label: "Calls On Calendar",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  {
    key: "live_calls",
    label: "Live Calls",
    type: "number",
    required: true,
    min: 0,
    defaultValue: 0,
  },
  { key: "closes", label: "Closes", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "downsells", label: "Downsells", type: "number", required: true, min: 0, defaultValue: 0 },
  {
    key: "cash_collected",
    label: "Cash Collected",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  {
    key: "total_revenue",
    label: "Total Revenue",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  { key: "rate_today", label: "Rate Today 1-10", type: "scale", required: true, min: 1, max: 10 },
  { key: "objections", label: "Objections", type: "text", required: true },
  { key: "notes", label: "Notes", type: "text", required: true },
];

/** Closer Post-Call — exact order requested. */
export const CLOSER_EOD_SCHEMA: EodQuestion[] = [
  {
    key: "closer_name",
    label: "Closer Name",
    type: "team-member",
    teamRole: "closer",
    required: true,
  },
  {
    key: "date_of_call",
    label: "Date Of Call",
    type: "date",
    required: true,
    defaultValue: today(),
  },
  { key: "lead_email", label: "Lead Email", type: "email", required: true },
  { key: "summary", label: "Call Summary", type: "textarea", required: true },
  {
    key: "offer_made",
    label: "Offer",
    helper: "Did you make an offer on this call?",
    type: "checkbox",
    required: true,
  },
  {
    key: "status",
    label: "Lead Status",
    type: "select",
    required: true,
    options: CLOSER_LEAD_STATUS_OPTIONS,
  },
  {
    key: "cash_collected",
    label: "Cash Collected",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  {
    key: "total_revenue",
    label: "Total Revenue",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    defaultValue: 0,
  },
  {
    key: "recording_url",
    label: "Call Recording",
    type: "url",
    required: true,
    placeholder: "https://",
  },
];

const NUM = (v: unknown) => Number(v ?? 0) || 0;
const STR = (v: unknown) => String(v ?? "").trim();

export interface SetterActivityPayload {
  org_id: string;
  role: ActivityRole;
  team_member_name: string;
  activity_date: string;
  rate_today: number | null;
  objections: string | null;
  notes: string | null;
  qualified_convos: number;
  sets: number;
  calls_on_calendar: number;
  live_calls: number;
  closes: number;
  downsells: number;
  cash_collected_cents: number;
  total_revenue_cents: number;
  dials?: number;
  connections?: number;
  leads_contacted?: number;
  links_sent?: number;
  links_clicked?: number;
  inbound_dms_sent?: number;
  outbound_dms_sent?: number;
  replies?: number;
  followups_sent?: number;
}

export function buildSetterActivityPayload(
  role: ActivityRole,
  orgId: string,
  values: EodValues,
): SetterActivityPayload {
  const isDialer = role === "inbound_dialer";
  return {
    org_id: orgId,
    role,
    team_member_name: STR(values.team_member_name),
    activity_date: STR(values.activity_date) || today(),
    rate_today: values.rate_today ? Number(values.rate_today) : null,
    objections: STR(values.objections) || null,
    notes: STR(values.notes) || null,
    qualified_convos: NUM(values.qualified_convos),
    sets: NUM(values.sets),
    calls_on_calendar: NUM(values.calls_on_calendar),
    live_calls: NUM(values.live_calls),
    closes: NUM(values.closes),
    downsells: NUM(values.downsells),
    cash_collected_cents: Math.round(NUM(values.cash_collected) * 100),
    total_revenue_cents: Math.round(NUM(values.total_revenue) * 100),
    // Role-specific fields stay unset (not zeroed) on the other role's rows —
    // this schema's own questions never ask a dialer about DMs/replies or a
    // setter about dials/connections, so those columns should read as "not
    // applicable to this role", not "asked, logged zero".
    ...(isDialer
      ? { dials: NUM(values.dials), connections: NUM(values.connections) }
      : {
          leads_contacted: NUM(values.leads_contacted),
          links_sent: NUM(values.links_sent),
          links_clicked: NUM(values.links_clicked),
          inbound_dms_sent: NUM(values.inbound_dms_sent),
          outbound_dms_sent: NUM(values.outbound_dms_sent),
          replies: NUM(values.replies),
          followups_sent: NUM(values.followups_sent),
        }),
  };
}

export type CallStatus =
  | "booked"
  | "showed"
  | "no_show"
  | "offer_made"
  | "closed"
  | "disqualified"
  | "follow_up"
  | "rescheduled";

/**
 * Maps the Closer Post-Call form's exact required "Lead Status" choices onto
 * the existing call_status enum + disposition taxonomy — both keep
 * reporting exactly as before — while the raw submitted choice is preserved
 * verbatim in eod_lead_status so the two are never confused (spec: "the EOD
 * form must preserve the exact requested input choices"). Every mapping
 * below is a direct restatement of what was submitted (e.g. "you cannot be
 * Closed without the call having happened" -> showed=true), never a guess
 * at something that wasn't submitted — genuinely ambiguous cases (does a
 * "Follow Up" or "Cancelled" mean they showed up first?) are left `null`,
 * not defaulted to false.
 */
const LEAD_STATUS_MAP: Record<
  string,
  { status: CallStatus; closed: boolean; disposition: string; showed: boolean | null }
> = {
  Closed: { status: "closed", closed: true, disposition: "closed", showed: true },
  Deposit: { status: "closed", closed: true, disposition: "closed", showed: true },
  "No Show": { status: "no_show", closed: false, disposition: "other", showed: false },
  "Follow Up (short term)": {
    status: "follow_up",
    closed: false,
    disposition: "follow_up",
    showed: null,
  },
  "Follow Up (long term)": {
    status: "follow_up",
    closed: false,
    disposition: "follow_up",
    showed: null,
  },
  Lost: { status: "disqualified", closed: false, disposition: "other", showed: null },
  "Bad Fit": { status: "disqualified", closed: false, disposition: "unqualified", showed: null },
  DQ: { status: "disqualified", closed: false, disposition: "unqualified", showed: null },
  Cancelled: { status: "rescheduled", closed: false, disposition: "other", showed: null },
  Rescheduling: { status: "rescheduled", closed: false, disposition: "other", showed: null },
};

/** `null` return means "IGNORE" — the rep explicitly asked for this entry to not be recorded; the caller must skip the insert entirely, not write a row and hide it. */
export function buildClosureCallPayload(orgId: string, values: EodValues) {
  const rawStatus = STR(values.status);
  if (rawStatus === "IGNORE") return null;
  const mapped = LEAD_STATUS_MAP[rawStatus];
  const cashCollectedCents = Math.round(NUM(values.cash_collected) * 100);
  return {
    org_id: orgId,
    lead_id: null as string | null,
    closer_name: STR(values.closer_name) || null,
    lead_email: STR(values.lead_email) || null,
    status: mapped?.status ?? "follow_up",
    eod_lead_status: rawStatus || null,
    scheduled_for: values.date_of_call ? new Date(STR(values.date_of_call)).toISOString() : null,
    showed: mapped?.showed ?? null,
    offer_made: values.offer_made === true,
    closed: mapped?.closed ?? false,
    disposition: mapped?.disposition ?? null,
    // "Deposit" collects real cash toward a payment plan, not the full
    // contract — same real number, just also recorded as the deposit.
    deposit_cents: rawStatus === "Deposit" ? cashCollectedCents : 0,
    contract_value_cents: Math.round(NUM(values.total_revenue) * 100),
    cash_collected_cents: cashCollectedCents,
    call_summary: STR(values.summary) || null,
    recording_url: STR(values.recording_url) || null,
  };
}

export function buildObjectionRows(
  orgId: string,
  callId: string,
  objectionsRaw: unknown,
  resolved: boolean,
) {
  const parts = STR(objectionsRaw)
    .split(/[,;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((p) => ({ org_id: orgId, call_id: callId, objection: p, resolved }));
}

/** Whether a question's current value counts as "answered" for per-step required-blocking. 0 is a valid answer for numbers (e.g. "Downsells: 0"). */
export function isAnswered(q: EodQuestion, value: string | number | boolean | undefined): boolean {
  if (!q.required) return true;
  if (q.type === "number" || q.type === "scale")
    return value !== undefined && value !== "" && !Number.isNaN(Number(value));
  if (q.type === "checkbox") return value !== undefined;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
}
