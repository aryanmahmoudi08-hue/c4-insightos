/**
 * The lead fields a Discord message shows — name, contact, LinkedIn, and the
 * application answers a rep sizes a lead up by — pulled from a lead row once,
 * so every event that mentions a lead carries the same block.
 *
 * The answers come from the lead's own Typeform application (the slots
 * typeform-answers.ts resolves). A lead who never applied — someone who went
 * straight to the calendar — has none, and the message leaves those lines
 * out rather than printing blanks.
 */
import { findLinkedIn } from "./discord-format";

export type LeadCard = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  current_salary: string | null;
  target_salary: string | null;
  budget: string | null;
  credit: string | null;
  source_platform: string | null;
  source_medium: string | null;
  source_campaign: string | null;
};

export const LEAD_CARD_COLUMNS =
  "id, full_name, email, phone, application_data, source_platform, source_medium, source_campaign";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function leadCardFrom(row: Record<string, unknown> | null | undefined): LeadCard {
  const r = row ?? {};
  const app = (
    r.application_data && typeof r.application_data === "object" ? r.application_data : {}
  ) as Record<string, unknown>;
  return {
    id: str(r.id),
    full_name: str(r.full_name),
    email: str(r.email),
    phone: str(r.phone),
    linkedin: findLinkedIn(app.answers_by_title, app.raw_answers) || null,
    current_salary: str(app.income),
    target_salary: str(app.goal),
    budget: str(app.capital),
    credit: str(app.credit),
    source_platform: str(r.source_platform),
    source_medium: str(r.source_medium),
    source_campaign: str(r.source_campaign),
  };
}

/**
 * How the call got on the calendar, from what the call row records: the
 * booking tool (or the setter who logged it by hand), and where the lead
 * came from when that is known.
 */
export function bookedVia(
  sourceConnector: string | null | undefined,
  setterName: string | null | undefined,
  leadSource: string | null | undefined,
): string {
  const how =
    sourceConnector === "calendly"
      ? "Calendly"
      : sourceConnector
        ? sourceConnector.charAt(0).toUpperCase() + sourceConnector.slice(1)
        : setterName
          ? `Set by ${setterName}`
          : "";
  const from = leadSource?.trim() ? `from ${leadSource.trim()}` : "";
  return [how, from].filter(Boolean).join(" · ");
}
