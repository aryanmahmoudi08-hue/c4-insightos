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
  | "text" | "email" | "url" | "number" | "date" | "datetime"
  | "textarea" | "select" | "checkbox" | "team-member" | "lead-picker";

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

const LEAD_SOURCES = ["Instagram Spiderweb", "Keyword", "Inbound", "Referral", "Ads", "Other"];

const today = () => new Date().toISOString().slice(0, 10);

const SHARED_ACTIVITY_TAIL: EodQuestion[] = [
  { key: "qualified_convos", label: "How many qualified conversations did you have?", helper: "A qualified convo is someone who's a real fit and engaged.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "sets", label: "How many calls did you set today?", helper: "Every call you personally got on the calendar.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "calls_on_calendar", label: "How many calls are now on the calendar?", helper: "Running total of booked calls tied to your work today.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "live_calls", label: "How many of those calls actually showed?", helper: "Only count calls that happened live.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "closes", label: "How many of those calls closed?", helper: "A close means the deal is done, not just offered.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "downsells", label: "How many downsells did you get?", helper: "Smaller offers accepted instead of the full program.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "cash_collected", label: "How much cash did you personally help collect today?", helper: "Actual dollars collected, not the full contract value.", type: "number", required: true, min: 0, step: 0.01, money: true, defaultValue: 0 },
  { key: "total_revenue", label: "What's the total revenue tied to today's activity?", helper: "Full contract value of anything closed today.", type: "number", required: true, min: 0, step: 0.01, money: true, defaultValue: 0 },
  { key: "rate_today", label: "Rate your day from 1 to 10.", helper: "A gut-check number — how did today actually go?", type: "number", required: true, min: 1, max: 10 },
  { key: "objections", label: "What objections came up today?", helper: "Comma-separated — price, timing, spouse, etc.", type: "textarea", required: true, placeholder: "price, timing, spouse…" },
  { key: "notes", label: "Anything else worth noting?", type: "textarea", required: true },
];

export const DM_SETTER_EOD_SCHEMA: EodQuestion[] = [
  { key: "team_member_name", label: "Who's logging this?", helper: "Pick your name from the roster, or add yourself if it's your first entry.", type: "team-member", teamRole: "dm_setter", required: true },
  { key: "activity_date", label: "What day is this for?", helper: "Defaults to today — change it if you're logging a past day.", type: "date", required: true, defaultValue: today() },
  { key: "lead_source", label: "Where did most of today's leads come from?", type: "select", options: LEAD_SOURCES.map((s) => ({ value: s, label: s })) },
  { key: "leads_contacted", label: "How many leads did you contact today?", helper: "Every DM, comment reply, or cold outreach counts.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "links_sent", label: "How many booking links did you send?", type: "number", min: 0, defaultValue: 0 },
  ...SHARED_ACTIVITY_TAIL,
];

export const INBOUND_DIALER_EOD_SCHEMA: EodQuestion[] = [
  { key: "team_member_name", label: "Who's logging this?", helper: "Pick your name from the roster, or add yourself if it's your first entry.", type: "team-member", teamRole: "inbound_dialer", required: true },
  { key: "activity_date", label: "What day is this for?", helper: "Defaults to today — change it if you're logging a past day.", type: "date", required: true, defaultValue: today() },
  { key: "lead_source", label: "Where did most of today's leads come from?", type: "select", options: LEAD_SOURCES.map((s) => ({ value: s, label: s })) },
  { key: "dials", label: "How many dials did you make today?", helper: "Every outbound call attempt counts.", type: "number", required: true, min: 0, defaultValue: 0 },
  { key: "connections", label: "How many of those turned into a real connection?", helper: "A connection means someone actually picked up and talked.", type: "number", required: true, min: 0, defaultValue: 0 },
  ...SHARED_ACTIVITY_TAIL,
];

export const CLOSER_EOD_SCHEMA: EodQuestion[] = [
  { key: "closer_name", label: "Who's logging this?", helper: "Pick your name from the roster, or add yourself if it's your first entry.", type: "team-member", teamRole: "closer", required: true },
  { key: "date_of_call", label: "When did this call happen?", type: "datetime", required: true },
  { key: "lead_id", label: "Which lead was this call with?", helper: "Optional — picking one pre-fills their email on the next screen.", type: "lead-picker" },
  { key: "lead_email", label: "What's the lead's email?", type: "email", required: true },
  { key: "status", label: "What's the lead status now?", type: "select", defaultValue: "closed", options: [
    { value: "booked", label: "Booked" },
    { value: "showed", label: "Showed" },
    { value: "no_show", label: "No Show" },
    { value: "offer_made", label: "Offer Made" },
    { value: "closed", label: "Closed Won" },
    { value: "disqualified", label: "DQ" },
    { value: "follow_up", label: "Follow Up" },
    { value: "rescheduled", label: "Rescheduled" },
  ] },
  { key: "showed", label: "Did they show up?", type: "checkbox", defaultValue: true },
  { key: "offer_made", label: "Did you make an offer?", type: "checkbox", defaultValue: true },
  { key: "cash_collected", label: "How much cash did you collect on this call?", type: "number", required: true, min: 0, step: 0.01, money: true, defaultValue: 0 },
  { key: "deposit", label: "Was a deposit collected? How much?", type: "number", min: 0, step: 0.01, money: true, defaultValue: 0 },
  { key: "total_revenue", label: "What's the total contract value?", type: "number", required: true, min: 0, step: 0.01, money: true, defaultValue: 0 },
  { key: "ttc_min", label: "How many minutes was the call?", helper: "Time actually spent on the call, in minutes.", type: "number", min: 0, placeholder: "e.g. 45" },
  { key: "key_moment", label: "What was the key moment that unlocked this outcome?", type: "text", placeholder: "What unlocked the close?" },
  { key: "objections", label: "What objections came up?", helper: "Comma-separated — price, timing, spouse, need to think…", type: "textarea", placeholder: "price, timing, spouse, need to think…" },
  { key: "recording_url", label: "Paste the call recording link.", type: "url", required: true, placeholder: "https://" },
  { key: "summary", label: "Summarize the call.", type: "textarea", required: true },
];

const NUM = (v: unknown) => Number(v ?? 0) || 0;
const STR = (v: unknown) => String(v ?? "").trim();

export function buildSetterActivityPayload(role: ActivityRole, orgId: string, values: EodValues) {
  return {
    org_id: orgId,
    role,
    team_member_name: STR(values.team_member_name),
    activity_date: STR(values.activity_date) || today(),
    rate_today: values.rate_today ? Number(values.rate_today) : null,
    objections: STR(values.objections) || null,
    notes: STR(values.notes) || null,
    lead_source: STR(values.lead_source) || null,
    leads_contacted: NUM(values.leads_contacted),
    links_sent: NUM(values.links_sent),
    qualified_convos: NUM(values.qualified_convos),
    sets: NUM(values.sets),
    calls_on_calendar: NUM(values.calls_on_calendar),
    live_calls: NUM(values.live_calls),
    closes: NUM(values.closes),
    downsells: NUM(values.downsells),
    cash_collected_cents: Math.round(NUM(values.cash_collected) * 100),
    total_revenue_cents: Math.round(NUM(values.total_revenue) * 100),
    dials: NUM(values.dials),
    connections: NUM(values.connections),
  };
}

export type CallStatus = "booked" | "showed" | "no_show" | "offer_made" | "closed" | "disqualified" | "follow_up" | "rescheduled";

export function buildCallPayload(orgId: string, values: EodValues) {
  const status = (STR(values.status) || "closed") as CallStatus;
  const closed = status === "closed";
  return {
    org_id: orgId,
    lead_id: STR(values.lead_id) || null,
    closer_name: STR(values.closer_name) || null,
    lead_email: STR(values.lead_email) || null,
    status,
    scheduled_for: values.date_of_call ? new Date(STR(values.date_of_call)).toISOString() : null,
    showed: values.showed === true,
    offer_made: values.offer_made === true,
    closed,
    contract_value_cents: Math.round(NUM(values.total_revenue) * 100),
    cash_collected_cents: Math.round(NUM(values.cash_collected) * 100),
    deposit_cents: Math.round(NUM(values.deposit) * 100),
    call_summary: STR(values.summary) || null,
    recording_url: STR(values.recording_url) || null,
    time_to_close_seconds: NUM(values.ttc_min) > 0 ? Math.round(NUM(values.ttc_min) * 60) : null,
    key_moment: STR(values.key_moment) || null,
  };
}

export function buildObjectionRows(orgId: string, callId: string, objectionsRaw: unknown, resolved: boolean) {
  const parts = STR(objectionsRaw).split(/[,;\n|]+/).map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => ({ org_id: orgId, call_id: callId, objection: p, resolved }));
}

/** Whether a question's current value counts as "answered" for per-step required-blocking. 0 is a valid answer for numbers (e.g. "Downsells: 0"). */
export function isAnswered(q: EodQuestion, value: string | number | boolean | undefined): boolean {
  if (!q.required) return true;
  if (q.type === "number") return value !== undefined && value !== "" && !Number.isNaN(Number(value));
  if (q.type === "checkbox") return true;
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined;
}
