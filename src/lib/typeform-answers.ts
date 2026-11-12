/**
 * Turning a Typeform `form_response` into something the lead insert can read.
 *
 * This used to live inline in the webhook route and keyed every answer by
 * `field.ref` alone. That works only while a form's refs are hand-authored
 * semantic words — "email", "first_name" — which is how the original form
 * was built. Rebuild the form, or build it on another Typeform account, and
 * Typeform issues fresh UUID refs; every lookup then matches nothing and a
 * webhook delivery is accepted with a completely empty lead behind it, which
 * is exactly what happened on form YMjkDIVy.
 *
 * So index an answer under everything about it that is stable:
 *
 *   - its ref, so forms with semantic refs keep behaving exactly as before;
 *   - its field id;
 *   - its field title, normalised to the same shape the semantic keys use;
 *   - and, for email and phone, the answer's own `type`, which is set by the
 *     question type and cannot be renamed by whoever built the form.
 *
 * Title and type survive a rebuild. Refs do not.
 */

export type TypeformIndex = {
  /** Every stable key -> answer: refs, ids, and normalised titles together. */
  answers: Record<string, string>;
  /** Title -> answer, titles verbatim as a person reads them. */
  answersByTitle: Record<string, string>;
  /** First answer whose question type is `email`, if any. */
  typedEmail: string;
  /** First answer whose question type is `phone_number`, if any. */
  typedPhone: string;
};

/** "First name" -> "first_name", so a title lines up with a semantic key. */
export function normalizeFieldKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Typeform's answer shapes, as far as this file needs to know them. */
type RawAnswer = {
  type?: unknown;
  text?: unknown;
  email?: unknown;
  phone_number?: unknown;
  url?: unknown;
  number?: unknown;
  boolean?: unknown;
  date?: unknown;
  choice?: { label?: unknown } | null;
  choices?: { labels?: unknown } | null;
  field?: { ref?: unknown; id?: unknown; title?: unknown; type?: unknown } | null;
};

type RawFormResponse = {
  answers?: unknown;
  definition?: { fields?: unknown } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** The single scalar an answer carries, whatever shape Typeform used for it. */
export function answerValue(answer: unknown): string {
  if (answer == null || typeof answer !== "object") return "";
  const a = answer as RawAnswer;
  if (typeof a.text === "string") return a.text;
  if (typeof a.email === "string") return a.email;
  if (typeof a.phone_number === "string") return a.phone_number;
  if (typeof a.url === "string") return a.url;
  if (typeof a.number === "number") return String(a.number);
  if (typeof a.boolean === "boolean") return String(a.boolean);
  if (a.choice?.label != null) return String(a.choice.label);
  if (Array.isArray(a.choices?.labels)) return a.choices.labels.join(", ");
  if (a.date != null) return String(a.date);
  return JSON.stringify(a);
}

export function indexTypeformAnswers(formResponse: unknown): TypeformIndex {
  const fr = (formResponse ?? {}) as RawFormResponse;

  // A field's title is on the answer for some question types and only in the
  // form definition for others, so build the lookup first and fall back to it.
  const titleByRef = new Map<string, string>();
  const fields = Array.isArray(fr.definition?.fields) ? fr.definition.fields : [];
  for (const raw of fields) {
    const field = (raw ?? {}) as NonNullable<RawAnswer["field"]>;
    if (str(field.ref) && str(field.title)) {
      titleByRef.set(str(field.ref), str(field.title));
    }
  }

  const answers: Record<string, string> = {};
  const answersByTitle: Record<string, string> = {};
  let typedEmail = "";
  let typedPhone = "";

  const rawAnswers = Array.isArray(fr.answers) ? fr.answers : [];
  for (const raw of rawAnswers) {
    const value = answerValue(raw);
    if (!value) continue;
    const answer = (raw ?? {}) as RawAnswer;
    const ref = str(answer.field?.ref);
    const id = str(answer.field?.id);
    const title = str(answer.field?.title) || (titleByRef.get(ref) ?? "");

    if (ref) answers[ref] = value;
    if (id) answers[id] = value;
    if (title) {
      answersByTitle[title] = value;
      const key = normalizeFieldKey(title);
      // A ref already written under this key wins: a form with semantic refs
      // is saying what the field means, which beats a title that merely reads
      // the same way.
      if (key && !(key in answers)) answers[key] = value;
    }

    if (!typedEmail && answer.type === "email") typedEmail = value;
    if (!typedPhone && answer.type === "phone_number") typedPhone = value;
  }

  return { answers, answersByTitle, typedEmail, typedPhone };
}

/**
 * The UTM values Typeform carries in `form_response.hidden`.
 *
 * The webhook handler never read this block at all, so a lead captured from
 * an ad arrived with no attribution whatsoever and displayed as "Unknown /
 * Unattributed" — not because attribution failed to interpret the values,
 * but because they were discarded before anything could.
 *
 * Only two UTMs have a column on `leads`: utm_source maps to
 * `source_platform` (the raw value, which `normalizeAcquisitionSource` then
 * categorises at read time) and utm_campaign to `source_campaign`. The rest
 * are kept verbatim so nothing that arrived is thrown away, but they are
 * deliberately not forced into `source_format` or `source_content_id`,
 * which mean something else.
 */
export type HiddenAttribution = {
  sourcePlatform: string | null;
  sourceCampaign: string | null;
  /** Every hidden field exactly as delivered, for audit. */
  hidden: Record<string, string>;
};

export function hiddenAttribution(formResponse: unknown): HiddenAttribution {
  const raw = (formResponse ?? {}) as { hidden?: unknown };
  const hidden: Record<string, string> = {};
  if (raw.hidden && typeof raw.hidden === "object") {
    for (const [key, value] of Object.entries(raw.hidden as Record<string, unknown>)) {
      const v = str(value).trim();
      // Typeform sends unfilled hidden fields as empty strings, and some
      // funnels pass the literal "xxxxx" placeholder through. Neither is
      // attribution, and storing either would read as real evidence.
      if (v && v.toLowerCase() !== "xxxxx") hidden[key] = v;
    }
  }
  return {
    sourcePlatform: hidden.utm_source ?? null,
    sourceCampaign: hidden.utm_campaign ?? null,
    hidden,
  };
}

/* ------------------------------------------------------------------ */
/* Application slots                                                   */
/* ------------------------------------------------------------------ */

/**
 * The qualification slots a lead's `application_data` carries.
 *
 * One list, shared by the webhook that fills them and the UI that maps
 * questions onto them, so the two can never drift into disagreeing about
 * what a slot is called.
 */
export const APPLICATION_SLOTS = [
  { key: "experience", label: "Experience" },
  { key: "work_school", label: "Work / School" },
  { key: "focus", label: "Focus" },
  { key: "goal", label: "Goal" },
  { key: "candidate_fit", label: "Candidate Fit" },
  { key: "serious_status", label: "Serious" },
  { key: "time", label: "Time" },
  { key: "income", label: "Income" },
  { key: "capital", label: "Capital" },
  { key: "credit", label: "Credit" },
  { key: "commitment", label: "Commit" },
] as const;

export type ApplicationSlotKey = (typeof APPLICATION_SLOTS)[number]["key"];

/** A question as the mapping UI needs to show it. */
export type FormQuestion = { ref: string; title: string; type: string };

/** The questions on the last delivery, for the mapping dropdowns. */
export function formQuestions(formDefinition: unknown): FormQuestion[] {
  const def = (formDefinition ?? {}) as { fields?: unknown };
  const fields = Array.isArray(def.fields) ? def.fields : [];
  const out: FormQuestion[] = [];
  for (const raw of fields) {
    const f = (raw ?? {}) as Record<string, unknown>;
    const ref = str(f.ref);
    const title = str(f.title);
    if (ref && title) out.push({ ref, title, type: str(f.type) });
  }
  return out;
}

/**
 * The value for one slot: the explicitly mapped question first, then the
 * old ref/id/title matching.
 *
 * The fallback is kept so a connection nobody has mapped keeps behaving
 * exactly as it does today — a form with hand-authored semantic refs needs
 * no configuration at all, and mapping is only required where a client's
 * wording does not happen to match the vocabulary.
 *
 * A slot mapped to a question that produced no answer stays empty rather
 * than falling back: the mapping is an explicit statement about where that
 * slot comes from, and quietly substituting another question's answer would
 * put text under a label it does not belong to.
 */
export function resolveSlot(
  slot: string,
  fieldMap: Record<string, string> | null | undefined,
  answers: Record<string, string>,
  fallbackKeys: string[] = [],
): string {
  const mappedRef = fieldMap?.[slot];
  if (mappedRef) return answers[mappedRef] ?? "";
  for (const key of [slot, ...fallbackKeys]) {
    if (answers[key]) return answers[key];
  }
  return "";
}
