/**
 * Canonical `leads.application_data` field keys -> human labels (matches
 * the Typeform ingestion mapping in `routes/api/public/typeform.ts`). One
 * shared list so Legacy Leads' Application tab and the Calls on Calendar
 * detail drawer's "Lead Form Responses" section (Master Plan Priority 6/45)
 * can never drift into two different labelings of the same data.
 */
export const APPLICATION_FIELD_LABELS: { key: string; label: string; width?: string }[] = [
  { key: "experience", label: "Experience", width: "min-w-[140px]" },
  { key: "work_school", label: "Work/School", width: "min-w-[140px]" },
  { key: "focus", label: "Focus", width: "min-w-[140px]" },
  { key: "goal", label: "Goal", width: "min-w-[110px]" },
  { key: "candidate_fit", label: "Candidate Fit", width: "min-w-[200px]" },
  { key: "serious_status", label: "Serious", width: "min-w-[140px]" },
  { key: "time", label: "Time", width: "min-w-[90px]" },
  { key: "income", label: "Income", width: "min-w-[110px]" },
  { key: "capital", label: "Capital", width: "min-w-[110px]" },
  { key: "credit", label: "Credit", width: "min-w-[100px]" },
  { key: "commitment", label: "Commit", width: "min-w-[80px]" },
];

/**
 * Ordered, human-readable question/answer pairs for a lead's raw
 * application_data — every known narrowed field with a real (non-empty)
 * answer, in APPLICATION_FIELD_LABELS' fixed order. Never dumps raw JSON,
 * never fabricates a response that isn't actually present.
 */
export function applicationFormResponses(
  applicationData: Record<string, unknown> | null | undefined,
): Array<{ question: string; answer: string }> {
  if (!applicationData) return [];
  const rows: Array<{ question: string; answer: string }> = [];
  for (const { key, label } of APPLICATION_FIELD_LABELS) {
    const value = applicationData[key];
    if (typeof value === "string" && value.trim()) {
      rows.push({ question: label, answer: value.trim() });
    }
  }
  return rows;
}
