// Legacy Leads pipeline-stage + available-to-call derivation (Priority 3).
// Pure, no Supabase import, so every rule here is unit-testable without a
// database. Sourced entirely from the real `lead_status` Postgres enum
// (dm_received, qualified, pre_call_assets_sent, call_booked, showed,
// closed, disqualified, follow_up, no_show, ghosted) — NOT from this page's
// existing STATUS_OPTIONS/BUCKET_STATUSES vocabulary (opt_in, rescheduling,
// lt_closed, deposit, bad_fit, ...), which writes/matches values that don't
// exist in the real column at all (confirmed against
// supabase/migrations/20260518151934_...sql's `create type lead_status` and
// the generated types.ts — the two vocabularies only overlap on
// call_booked/closed/no_show/disqualified). That pre-existing mismatch is
// a real, documented data-integrity conflict (see the final report), not
// something this pass fixes — it just means the NEW pipeline-stage display
// built here deliberately does not reuse that unreliable vocabulary.

export type LeadStatusValue =
  | "dm_received"
  | "qualified"
  | "pre_call_assets_sent"
  | "call_booked"
  | "showed"
  | "closed"
  | "disqualified"
  | "follow_up"
  | "no_show"
  | "ghosted";

export type AvailabilityBucket = "new" | "attempted" | "followup" | "unavailable";

export interface PipelineStageInfo {
  label: string;
  tone: "default" | "success" | "warning" | "destructive" | "info";
  availability: AvailabilityBucket;
  /** Only set for availability: "unavailable" — the reason shown after the stage label. */
  unavailableReason?: string;
}

export const PIPELINE_STAGE_INFO: Record<LeadStatusValue, PipelineStageInfo> = {
  dm_received: { label: "New / Not Contacted", tone: "default", availability: "new" },
  pre_call_assets_sent: { label: "Attempted Contact", tone: "info", availability: "attempted" },
  qualified: { label: "Qualified", tone: "info", availability: "attempted" },
  follow_up: { label: "Follow-up", tone: "warning", availability: "followup" },
  no_show: { label: "No-show", tone: "warning", availability: "followup" },
  call_booked: {
    label: "Booked",
    tone: "success",
    availability: "unavailable",
    unavailableReason: "remove from active call queue",
  },
  showed: {
    label: "Showed",
    tone: "success",
    availability: "unavailable",
    unavailableReason: "already had a call — remove from active call queue",
  },
  closed: {
    label: "Closed",
    tone: "success",
    availability: "unavailable",
    unavailableReason: "remove from active call queue",
  },
  disqualified: {
    label: "Lost / Disqualified",
    tone: "destructive",
    availability: "unavailable",
    unavailableReason: "no longer appropriate to call",
  },
  ghosted: {
    label: "Lost / Disqualified",
    tone: "destructive",
    availability: "unavailable",
    unavailableReason: "no longer appropriate to call",
  },
};

export function pipelineStageInfo(status: string): PipelineStageInfo {
  return (
    PIPELINE_STAGE_INFO[status as LeadStatusValue] ?? {
      label: "Unknown",
      tone: "default",
      availability: "unavailable",
      unavailableReason: "status not recognized",
    }
  );
}

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "2h ago" / "3d ago" / "just now" — coarse, one-unit relative time. */
export function relativeTimeAgo(iso: string, nowISO: string): string {
  const diff = new Date(nowISO).getTime() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

/** "3d" / "5h" / "<1h" — coarse lead age since creation, one unit. */
export function formatLeadAge(createdAtISO: string, nowISO: string): string {
  const diff = new Date(nowISO).getTime() - new Date(createdAtISO).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "—";
  if (diff < HOUR) return "<1h";
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  return `${Math.floor(diff / DAY)}d`;
}

export interface LeadAvailabilityInput {
  status: string;
  /** Count of `calls` rows on record for this lead — a real, per-lead countable signal. Distinct from raw dial attempts, which this schema does not track per lead. */
  callCount: number;
  lastCallAt: string | null;
  callbackDueAt: string | null;
  nowISO: string;
}

export interface LeadAvailability {
  bucket: AvailabilityBucket;
  headline: string;
  detail: string | null;
}

/**
 * "Has this lead already been worked, and where are they in the process?"
 * — the exact question Priority 3 asks the dialer to be able to answer at a
 * glance. Stage (from the real lead_status enum) is authoritative for
 * whether a lead is callable at all; call count / callback due date are
 * secondary, real, per-lead signals layered on top for the headline text.
 */
export function deriveLeadAvailability(input: LeadAvailabilityInput): LeadAvailability {
  const stage = pipelineStageInfo(input.status);

  if (stage.availability === "unavailable") {
    return {
      bucket: "unavailable",
      headline: `${stage.label} — ${stage.unavailableReason ?? "not available to call"}`,
      detail: null,
    };
  }

  if (stage.availability === "followup") {
    let detail: string | null = null;
    if (input.callbackDueAt) {
      const dueDay = input.callbackDueAt.slice(0, 10);
      const today = input.nowISO.slice(0, 10);
      if (dueDay === today) detail = "Callback due today";
      else if (dueDay < today) detail = `Callback overdue since ${dueDay}`;
      else detail = `Callback scheduled for ${dueDay}`;
    }
    return { bucket: "followup", headline: stage.label, detail };
  }

  // new / attempted — headline driven by real call count on this lead.
  if (input.callCount <= 0) {
    return { bucket: "new", headline: "New — 0 calls on record", detail: null };
  }
  const plural = input.callCount === 1 ? "call" : "calls";
  const lastCall = input.lastCallAt
    ? ` · last call ${relativeTimeAgo(input.lastCallAt, input.nowISO)}`
    : "";
  return {
    bucket: "attempted",
    headline: `Attempted — ${input.callCount} ${plural} on record${lastCall}`,
    detail: null,
  };
}
