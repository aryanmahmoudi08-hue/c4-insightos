/**
 * Pure derivation logic for the Calls-on-Calendar confirmation workflow.
 * Nothing here writes anything — call blocks, the detail drawer, and the
 * server-side enforcement function all import from here so a touchpoint's
 * status/label is computed exactly once, not re-implemented per surface.
 *
 * There is no real outbound messaging integration in this codebase today
 * (confirmed: the Twilio webhook is inbound-only) — every `*_sent_at` is a
 * rep manually marking a touchpoint done. `*_scheduled_at` fields exist so a
 * future real integration can populate a genuine "queued to send" state
 * without a schema/logic change; until one exists they stay null and never
 * produce a "scheduled" status here.
 */

export type Touchpoint = "night_before" | "morning" | "one_hour" | "thirty_min" | "ten_min";

export type TouchpointStatus =
  | "not_due"
  | "due"
  | "scheduled"
  | "manually_sent"
  | "responded"
  | "not_sent";

export const TOUCHPOINT_LABELS: Record<Touchpoint, string> = {
  night_before: "Night before — pre-call homework video",
  morning: "Morning of call — goals & anticipation",
  one_hour: "1 hour before — meeting link reminder",
  thirty_min: "30 minutes before — confirmation",
  ten_min: "10 minutes before — final message",
};

/** Minutes-before-call the window opens (becomes "due") / closes (becomes
 * "not_sent" if still unsent). Reasonable fixed windows for what each
 * touchpoint's name already means (e.g. "the night before"), distinct from
 * the org-configurable confirmation/cancellation deadline in
 * `confirmation_policy`, which governs the overall booking's fate, not these
 * message-timing windows. */
const TOUCHPOINT_WINDOWS: Record<
  Touchpoint,
  { opensMinutesBefore: number; closesMinutesBefore: number }
> = {
  night_before: { opensMinutesBefore: 24 * 60, closesMinutesBefore: 4 * 60 },
  morning: { opensMinutesBefore: 8 * 60, closesMinutesBefore: 60 },
  one_hour: { opensMinutesBefore: 2 * 60, closesMinutesBefore: 20 },
  thirty_min: { opensMinutesBefore: 45, closesMinutesBefore: 10 },
  ten_min: { opensMinutesBefore: 15, closesMinutesBefore: 0 },
};

export type CallConfirmationRow = {
  night_before_scheduled_at: string | null;
  night_before_sent_at: string | null;
  morning_scheduled_at: string | null;
  morning_sent_at: string | null;
  morning_reason_for_change: string | null;
  morning_goal_1: string | null;
  morning_goal_2: string | null;
  morning_goal_3: string | null;
  morning_response_notes: string | null;
  morning_responded_at: string | null;
  one_hour_scheduled_at: string | null;
  one_hour_sent_at: string | null;
  thirty_min_scheduled_at: string | null;
  thirty_min_sent_at: string | null;
  thirty_min_confirmed: boolean;
  thirty_min_confirmed_at: string | null;
  ten_min_scheduled_at: string | null;
  ten_min_sent_at: string | null;
  overall_status: "awaiting" | "confirmed" | "overdue" | "at_risk" | "cancelled" | "rescheduled";
  confirmed_at: string | null;
  cancelled_reason: string | null;
} | null;

const FIELD_MAP: Record<
  Touchpoint,
  {
    scheduled: keyof NonNullable<CallConfirmationRow>;
    sent: keyof NonNullable<CallConfirmationRow>;
    responded?: keyof NonNullable<CallConfirmationRow>;
  }
> = {
  night_before: { scheduled: "night_before_scheduled_at", sent: "night_before_sent_at" },
  morning: {
    scheduled: "morning_scheduled_at",
    sent: "morning_sent_at",
    responded: "morning_responded_at",
  },
  one_hour: { scheduled: "one_hour_scheduled_at", sent: "one_hour_sent_at" },
  thirty_min: {
    scheduled: "thirty_min_scheduled_at",
    sent: "thirty_min_sent_at",
    responded: "thirty_min_confirmed_at",
  },
  ten_min: { scheduled: "ten_min_scheduled_at", sent: "ten_min_sent_at" },
};

export function deriveTouchpointStatus(
  touchpoint: Touchpoint,
  confirmation: CallConfirmationRow,
  scheduledFor: string,
  now: Date = new Date(),
): TouchpointStatus {
  const fields = FIELD_MAP[touchpoint];
  const sentAt = confirmation?.[fields.sent] as string | null | undefined;
  const respondedAt = fields.responded
    ? (confirmation?.[fields.responded] as string | null | undefined)
    : null;
  if (respondedAt) return "responded";
  if (sentAt) return "manually_sent";

  const scheduledAt = confirmation?.[fields.scheduled] as string | null | undefined;
  if (scheduledAt) return "scheduled";

  const callTime = new Date(scheduledFor).getTime();
  const minutesUntilCall = (callTime - now.getTime()) / 60_000;
  const window = TOUCHPOINT_WINDOWS[touchpoint];
  if (minutesUntilCall > window.opensMinutesBefore) return "not_due";
  if (minutesUntilCall < window.closesMinutesBefore) return "not_sent";
  return "due";
}

export type OverallConfirmationStatus = NonNullable<CallConfirmationRow>["overall_status"];

/** Awaiting -> overdue -> at_risk, purely from the org's confirmation_policy
 * thresholds and time-until-call — never touches `calls.cancelled` itself
 * (that's the separate, opt-in auto-cancel step in the server enforcement
 * function, gated behind `confirmation_policy.auto_cancel_enabled`). */
export function deriveOverallStatus(
  currentStatus: OverallConfirmationStatus,
  scheduledFor: string,
  policy: { overdueAfterHours: number; atRiskAfterHours: number },
  now: Date = new Date(),
): OverallConfirmationStatus {
  if (
    currentStatus === "confirmed" ||
    currentStatus === "cancelled" ||
    currentStatus === "rescheduled"
  ) {
    return currentStatus;
  }
  const hoursUntilCall = (new Date(scheduledFor).getTime() - now.getTime()) / 3_600_000;
  if (hoursUntilCall <= policy.atRiskAfterHours) return "at_risk";
  if (hoursUntilCall <= policy.overdueAfterHours) return "overdue";
  return "awaiting";
}

export type NextAction =
  | "Confirm lead"
  | "Send homework"
  | "Capture morning goals"
  | "Send 1-hour reminder"
  | "Confirm 30-minute"
  | "Send 10-minute message"
  | "Ready"
  | "At risk"
  | "Cancelled"
  | "No action required";

const CHECKLIST_ORDER: Array<{ touchpoint: Touchpoint; action: NextAction }> = [
  { touchpoint: "night_before", action: "Send homework" },
  { touchpoint: "morning", action: "Capture morning goals" },
  { touchpoint: "one_hour", action: "Send 1-hour reminder" },
  { touchpoint: "thirty_min", action: "Confirm 30-minute" },
  { touchpoint: "ten_min", action: "Send 10-minute message" },
];

/** Single human-readable next step — always computed, never hand-typed. */
export function deriveNextAction(
  overallStatus: OverallConfirmationStatus,
  confirmation: CallConfirmationRow,
  scheduledFor: string,
  callAlreadyHappened: boolean,
  now: Date = new Date(),
): NextAction {
  if (callAlreadyHappened) return "No action required";
  if (overallStatus === "cancelled") return "Cancelled";
  if (overallStatus === "at_risk") return "At risk";
  if (overallStatus === "overdue" || overallStatus === "awaiting") {
    if (overallStatus === "overdue") return "Confirm lead";
  }

  for (const { touchpoint, action } of CHECKLIST_ORDER) {
    const status = deriveTouchpointStatus(touchpoint, confirmation, scheduledFor, now);
    if (status === "due") return action;
  }

  if (overallStatus !== "confirmed") return "Confirm lead";
  return "Ready";
}

/** Pre-call readiness checklist — mixes real signals (video watched) with
 * honest manual-log signals (message sent). Never marks "watched" from a
 * "sent" event or "confirmed" from a "delivered" event. */
export function buildPreCallChecklist(confirmation: CallConfirmationRow, videoWatched: boolean) {
  return [
    { label: "Night-before homework sent", done: !!confirmation?.night_before_sent_at },
    { label: "Pre-call video watched", done: videoWatched },
    { label: "Morning message sent", done: !!confirmation?.morning_sent_at },
    { label: "Morning response received", done: !!confirmation?.morning_responded_at },
    {
      label: "Goals captured",
      done: !!(
        confirmation?.morning_goal_1 ||
        confirmation?.morning_goal_2 ||
        confirmation?.morning_goal_3
      ),
    },
    { label: "1-hour reminder sent", done: !!confirmation?.one_hour_sent_at },
    { label: "30-minute confirmation sent", done: !!confirmation?.thirty_min_sent_at },
    { label: "Final 10-minute message sent", done: !!confirmation?.ten_min_sent_at },
  ];
}
