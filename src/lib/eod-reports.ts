import type { ActivityRole } from "@/components/activity-module";
import type { TeamRole } from "@/components/team-member-picker";
import { DISPLAY_CURRENCIES } from "@/lib/currency";
import { OTHER_OBJECTION_VALUE, objectionCategoryLabel } from "@/lib/objection-taxonomy";

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
  | "scale"
  | "objection-multiselect"
  | "followup-details";

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
  /** Renders an inline currency dropdown (EOD_CURRENCY_OPTIONS) beside this
   * money field, bound to the submission's one shared `original_currency`
   * value — not a separate question/step. Only meaningful alongside
   * `money: true`. */
  currency?: boolean;
  /** Conditional step — omitted from the flow entirely (not just hidden)
   * whenever this returns false for the submission's current values.
   * Recomputed on every render, so answering an earlier question can make
   * a later step appear/disappear before the rep reaches it. */
  showIf?: (values: EodValues) => boolean;
}

export type EodValues = Record<string, string | number | boolean | undefined>;

const today = () => new Date().toISOString().slice(0, 10);

// Currency options for every EOD schema's money fields — same
// DISPLAY_CURRENCIES list the dashboard-wide currency selector uses
// (src/lib/currency.ts), not a separate currency system. The picker itself
// is NOT a standalone question/step — it renders inline within each
// `money: true` question (see QuestionField's "number" case in
// eod-step-flow.tsx), all bound to the one shared `original_currency` value
// on the submission. Defaults to USD so existing behavior is unchanged
// unless a rep actively picks something else. Cash/revenue are stored in
// their as-entered currency (see buildSetterActivityPayload/
// buildClosureCallPayload's `original_currency`) rather than silently
// converted — this schema doesn't have a live FX lookup available at submit
// time, so mixed-currency totals stay honestly separated rather than
// pretending to be directly comparable USD.
export const EOD_CURRENCY_OPTIONS: EodSelectOption[] = DISPLAY_CURRENCIES.map((c) => ({
  value: c,
  label: c,
}));

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

// The two canonical Lead Status values that mean "this needs a structured
// follow-up" — the ONLY source of truth for whether the Follow-Up Details
// step shows, and for which follow-up type (short vs long term) a
// follow-up-pipeline record carries. Never inferred from a date or any
// other field.
export const FOLLOWUP_LEAD_STATUSES = ["Follow Up (short term)", "Follow Up (long term)"] as const;
export function isFollowUpLeadStatus(status: unknown): boolean {
  return (FOLLOWUP_LEAD_STATUSES as readonly string[]).includes(String(status ?? ""));
}
/** Compact type label for wherever the Follow-Up Pipeline needs to
 * distinguish short vs long term (derived from the same raw eod_lead_status
 * text the Lead Status question already writes verbatim — no separate
 * "follow-up type" column). Returns null for a call that was never tagged
 * as a follow-up at all. */
export function followUpTypeLabel(eodLeadStatus: unknown): "Short Term" | "Long Term" | null {
  const raw = String(eodLeadStatus ?? "");
  if (raw === "Follow Up (short term)") return "Short Term";
  if (raw === "Follow Up (long term)") return "Long Term";
  return null;
}

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
    currency: true,
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
    currency: true,
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
    currency: true,
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
    currency: true,
    defaultValue: 0,
  },
  { key: "rate_today", label: "Rate Today 1-10", type: "scale", required: true, min: 1, max: 10 },
  { key: "objections", label: "Objections", type: "text", required: true },
  { key: "notes", label: "Notes", type: "text", required: true },
];

/** Closer Post-Call (Closer EOD) — exact order requested:
 * Name, Date, Email, Offer, Lead Status, Objections?, Call Summary,
 * Cash Collected, Total Revenue, Call Recording. Existing field labels/
 * behavior are unchanged; the only new field is Objections?, now a
 * structured multiple-choice pull from the canonical objection taxonomy
 * (src/lib/objection-taxonomy.ts) instead of free text, with an "Other"
 * option that reveals a required explanation input (see
 * "objection-multiselect" in eod-step-flow.tsx). */
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
  // Conditional — only shown when Lead Status is one of the two follow-up
  // values (isFollowUpLeadStatus above). Connects directly to the existing
  // Closer Dashboard Follow-Up Pipeline: no new table, this is additional
  // columns on the same `calls` row a follow-up Lead Status already
  // creates (see buildClosureCallPayload and the
  // 20260918090000_closer_followup_details.sql migration).
  {
    key: "followup_details",
    label: "Follow-Up Details",
    helper: "This lead needs a follow-up — capture when, what was pitched, and why.",
    type: "followup-details",
    required: true,
    showIf: (values) => isFollowUpLeadStatus(values.status),
  },
  {
    key: "objections_categories",
    label: "Objections?",
    helper: "What prevented or delayed the prospect from buying? Select all that apply.",
    type: "objection-multiselect",
    required: true,
  },
  { key: "summary", label: "Call Summary", type: "textarea", required: true },
  {
    key: "cash_collected",
    label: "Cash Collected",
    type: "number",
    required: true,
    min: 0,
    step: 0.01,
    money: true,
    currency: true,
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
    currency: true,
    defaultValue: 0,
  },
  // Remediation (metric-dictionary audit, SALE-0394): calls.payment_plan is
  // a real column, but this native EOD flow never wrote to it (only
  // closer.tsx's separate "Log a sales call" dialog now does — see
  // buildClosureCallPayload below). Explicit closer intent, matching that
  // same checkbox — never inferred from deposit/installment amounts.
  {
    key: "payment_plan",
    label: "Payment Plan",
    helper: "Is this a payment plan (not paid in full)?",
    type: "checkbox",
    required: false,
    defaultValue: false,
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
  /** Currency the rep actually entered cash_collected/total_revenue in —
   * the cents columns above store that amount as-is, never silently
   * converted (no FX lookup available at submit time), so aggregation
   * across mixed currencies must treat this as a real dimension, not
   * assume everything is USD. */
  original_currency: string;
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
    original_currency: STR(values.original_currency) || "USD",
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
  const isFollowUp = isFollowUpLeadStatus(rawStatus);
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
    // As-entered currency, not silently converted — see SetterActivityPayload's
    // original_currency for why (no FX lookup available at submit time).
    original_currency: STR(values.original_currency) || "USD",
    call_summary: STR(values.summary) || null,
    recording_url: STR(values.recording_url) || null,
    // Follow-up detail columns — only ever populated for the two follow-up
    // Lead Status values. A normal call (Closed, Lost, etc.) always writes
    // these as null, same as before this feature existed. The requested
    // follow-up date/time is stored separately from scheduled_for (the
    // original call date) and from this submission's own timestamp — never
    // substituted for either.
    requested_followup_at:
      isFollowUp && values.followup_requested_at
        ? new Date(STR(values.followup_requested_at)).toISOString()
        : null,
    followup_amount_pitched_cents:
      isFollowUp && values.followup_amount_pitched !== undefined
        ? Math.round(NUM(values.followup_amount_pitched) * 100)
        : null,
    followup_reason: isFollowUp ? STR(values.followup_reason) || null : null,
    followup_reason_other:
      isFollowUp && STR(values.followup_reason) === OTHER_OBJECTION_VALUE
        ? STR(values.followup_reason_other) || null
        : null,
    followup_notes: isFollowUp ? STR(values.followup_notes) || null : null,
    // Remediation (metric-dictionary audit, SALE-0394): explicit closer
    // intent from the Payment Plan question above — never inferred from
    // deposit_cents/contract_value_cents.
    payment_plan: values.payment_plan === true,
  };
}

/** Comma-joined canonical category values (this question's own stored
 * value, e.g. "money,timing") → the exact shape closer.tsx's "Log a sales
 * call" objection insert already uses (org_id, call_id, objection,
 * category, resolved), so both entry points feed the same
 * objection-frequency instrument / "By category" breakdown unchanged. One
 * row per selected category — never a duplicate `calls` row and never
 * duplicated cash/revenue, both of which live on the one `calls` row this
 * function doesn't touch. */
export function buildClosureCallObjectionRows(orgId: string, callId: string, values: EodValues) {
  const selected = STR(values.objections_categories)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return selected.map((category) => ({
    org_id: orgId,
    call_id: callId,
    objection:
      category === OTHER_OBJECTION_VALUE
        ? STR(values.objections_other) || objectionCategoryLabel(category)
        : objectionCategoryLabel(category),
    category,
    resolved: false,
  }));
}

/** Whether a question's current value counts as "answered" for per-step required-blocking. 0 is a valid answer for numbers (e.g. "Downsells: 0"). Takes the whole submission (not just this question's own value) since "objection-multiselect" needs to cross-check the paired objections_other field when "Other" is selected. */
export function isAnswered(q: EodQuestion, values: EodValues): boolean {
  const value = values[q.key];
  if (!q.required) return true;
  if (q.type === "objection-multiselect") {
    const selected = STR(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (selected.length === 0) return false;
    if (selected.includes(OTHER_OBJECTION_VALUE) && !STR(values.objections_other)) return false;
    return true;
  }
  if (q.type === "followup-details") {
    if (!STR(values.followup_requested_at)) return false;
    const amount = values.followup_amount_pitched;
    if (amount === undefined || amount === "" || Number.isNaN(Number(amount))) return false;
    const reason = STR(values.followup_reason);
    if (!reason) return false;
    if (reason === OTHER_OBJECTION_VALUE && !STR(values.followup_reason_other)) return false;
    // Follow-Up Notes is explicitly optional — never gates required-ness.
    return true;
  }
  if (q.type === "number" || q.type === "scale")
    return value !== undefined && value !== "" && !Number.isNaN(Number(value));
  if (q.type === "checkbox") return value !== undefined;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
}
