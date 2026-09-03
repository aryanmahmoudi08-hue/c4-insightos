export type SetterLifecycleStage =
  | "dm"
  | "qualification"
  | "set"
  | "booking"
  | "call"
  | "close"
  | "cash";

export type CallbackStatus = "requested" | "due" | "completed" | "booked" | "closed" | "cash";
export type PaymentRecoveryStatus =
  | "due"
  | "paid"
  | "missed"
  | "overdue"
  | "failed"
  | "retry"
  | "recovered"
  | "refunded";
export type RenewalStage =
  | "not_started"
  | "outreach_started"
  | "renewal_conversation"
  | "proposal_sent"
  | "renewed"
  | "churned";
export type CloserDisposition =
  | "closed_won"
  | "closed_lost"
  | "deposit_pending"
  | "follow_up"
  | "no_show"
  | "reschedule"
  | "not_qualified"
  | "unknown";

const transitions: Record<SetterLifecycleStage, SetterLifecycleStage[]> = {
  dm: ["qualification"],
  qualification: ["set"],
  set: ["booking"],
  booking: ["call"],
  call: ["close"],
  close: ["cash"],
  cash: [],
};

export function canAdvanceSetterLifecycle(
  from: SetterLifecycleStage,
  to: SetterLifecycleStage,
): boolean {
  return transitions[from].includes(to);
}

export function advanceSetterLifecycle(
  from: SetterLifecycleStage,
  to: SetterLifecycleStage,
): SetterLifecycleStage {
  if (!canAdvanceSetterLifecycle(from, to))
    throw new Error(`Invalid lifecycle transition: ${from} -> ${to}`);
  return to;
}

const callbackTransitions: Record<CallbackStatus, CallbackStatus[]> = {
  requested: ["due", "completed"],
  due: ["completed"],
  completed: ["booked"],
  booked: ["closed"],
  closed: ["cash"],
  cash: [],
};

export function canAdvanceCallback(from: CallbackStatus, to: CallbackStatus): boolean {
  return callbackTransitions[from].includes(to);
}

export function advanceCallback(from: CallbackStatus, to: CallbackStatus): CallbackStatus {
  if (!canAdvanceCallback(from, to))
    throw new Error(`Invalid callback transition: ${from} -> ${to}`);
  return to;
}

const recoveryTransitions: Record<PaymentRecoveryStatus, PaymentRecoveryStatus[]> = {
  due: ["paid", "missed", "overdue", "failed"],
  paid: ["recovered", "refunded"],
  missed: ["retry", "overdue", "recovered"],
  overdue: ["retry", "recovered", "refunded"],
  failed: ["retry", "recovered", "refunded"],
  retry: ["paid", "failed", "overdue"],
  recovered: ["refunded"],
  refunded: [],
};

export function paymentRecoveryStatus(input: {
  dueDays: number;
  paymentStatus: string | null;
}): PaymentRecoveryStatus {
  if (input.paymentStatus === "failed") return "failed";
  if (input.paymentStatus === "refunded") return "refunded";
  if (input.paymentStatus === "paid" && input.dueDays <= 0) return "paid";
  if (input.dueDays < 0) return "overdue";
  return "due";
}

export function canAdvancePaymentRecovery(
  from: PaymentRecoveryStatus,
  to: PaymentRecoveryStatus,
): boolean {
  return recoveryTransitions[from].includes(to);
}

export function advancePaymentRecovery(
  from: PaymentRecoveryStatus,
  to: PaymentRecoveryStatus,
): PaymentRecoveryStatus {
  if (!canAdvancePaymentRecovery(from, to))
    throw new Error(`Invalid recovery transition: ${from} -> ${to}`);
  return to;
}

const renewalTransitions: Record<RenewalStage, RenewalStage[]> = {
  not_started: ["outreach_started", "churned"],
  outreach_started: ["renewal_conversation", "churned"],
  renewal_conversation: ["proposal_sent", "renewed", "churned"],
  proposal_sent: ["renewed", "churned"],
  renewed: [],
  churned: [],
};

export function canAdvanceRenewal(from: RenewalStage, to: RenewalStage): boolean {
  return renewalTransitions[from].includes(to);
}

export function advanceRenewal(from: RenewalStage, to: RenewalStage): RenewalStage {
  if (!canAdvanceRenewal(from, to)) throw new Error(`Invalid renewal transition: ${from} -> ${to}`);
  return to;
}

export type PaymentQualityInput = {
  depositsCents: number;
  contractedCents: number;
  collectedCents: number;
  scheduledFutureCents: number;
  failedCount: number;
  onTimeCount: number;
  paymentCount: number;
};

export function paymentQuality(input: PaymentQualityInput) {
  return {
    depositConversionPct:
      input.contractedCents > 0 ? (input.depositsCents / input.contractedCents) * 100 : null,
    averageDepositCents:
      input.paymentCount > 0 ? Math.round(input.depositsCents / input.paymentCount) : null,
    depositPercentage:
      input.contractedCents > 0 ? (input.depositsCents / input.contractedCents) * 100 : null,
    outstandingCents: Math.max(input.contractedCents - input.collectedCents, 0),
    onTimeRatePct: input.paymentCount > 0 ? (input.onTimeCount / input.paymentCount) * 100 : null,
    failedCount: input.failedCount,
    scheduledFutureCents: input.scheduledFutureCents,
  };
}

export type WebinarProfitInput = {
  contractedRevenueCents: number | null;
  cashCollectedCents: number | null;
  realizedRevenueCents: number;
  attributableCostsCents: number | null;
};

export function webinarProfit(input: WebinarProfitInput) {
  if (input.attributableCostsCents == null) {
    return { netProfitCents: null, profitMarginPct: null, status: "unavailable" as const };
  }
  const netProfitCents = input.realizedRevenueCents - input.attributableCostsCents;
  return {
    netProfitCents,
    profitMarginPct:
      input.realizedRevenueCents > 0 ? (netProfitCents / input.realizedRevenueCents) * 100 : null,
    status: "computed" as const,
  };
}

export function normalizeCloserDisposition(
  status: string | null | undefined,
  closed: boolean | null | undefined = false,
  offerMade: boolean | null | undefined = false,
): CloserDisposition {
  if (closed || status === "closed") return "closed_won";
  if (status === "no_show") return "no_show";
  if (status === "rescheduled") return "reschedule";
  if (status === "disqualified") return "not_qualified";
  if (status === "follow_up" || offerMade) return "follow_up";
  if (status === "offer_made") return "deposit_pending";
  if (status === "booked" || status === "showed") return "follow_up";
  return "unknown";
}

export const CLOSER_DISPOSITIONS: ReadonlyArray<{ value: CloserDisposition; label: string }> = [
  { value: "closed_won", label: "Closed Won" },
  { value: "closed_lost", label: "Closed Lost" },
  { value: "deposit_pending", label: "Deposit Pending" },
  { value: "follow_up", label: "Follow-up" },
  { value: "no_show", label: "No-show" },
  { value: "reschedule", label: "Reschedule" },
  { value: "not_qualified", label: "Not Qualified" },
  { value: "unknown", label: "Unknown / Unavailable" },
];
