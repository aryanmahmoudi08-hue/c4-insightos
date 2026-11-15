import { describe, expect, it } from "vitest";
import { hiddenAttribution, indexTypeformAnswers } from "./typeform-answers";
import { upsertApplicationLead, type ApplicationInput } from "./typeform-ingest.server";
import { buildSourceBoard } from "./source-leaderboard";
import { tableColumnsFromMigrations } from "./__test-support__/migration-columns";

/* In-memory stand-in for the Supabase client: just the builder calls the
 * ingest path makes, plus the (org_id, typeform_response_token) unique index
 * so a racing insert behaves like the real one. */
type Row = Record<string, unknown>;
function fakeDb() {
  const leads: Row[] = [];
  const likeRe = (p: string) =>
    new RegExp(
      "^" +
        p.replace(/\\([\\%_])|([.*+?^${}()|[\]])|%|_/g, (m, esc, sp) =>
          esc ? `\\${esc}` : sp ? `\\${sp}` : m === "%" ? ".*" : ".",
        ) +
        "$",
      "i",
    );
  const db = {
    from: (table: string) => {
      if (table !== "leads") throw new Error(`unexpected table ${table}`);
      const filters: Array<(r: Row) => boolean> = [];
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
        ilike: (c: string, p: string) => (
          filters.push((r) => likeRe(p).test(String(r[c] ?? ""))),
          q
        ),
        order: () => q,
        limit: () => q,
        maybeSingle: async () => ({
          data: [...leads].reverse().find((r) => filters.every((f) => f(r))) ?? null,
          error: null,
        }),
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              const clash = leads.find(
                (l) =>
                  row.typeform_response_token != null &&
                  l.org_id === row.org_id &&
                  l.typeform_response_token === row.typeform_response_token,
              );
              if (clash) return { data: null, error: { code: "23505", message: "duplicate" } };
              const withId = { id: `lead-${leads.length + 1}`, ...row };
              leads.push(withId);
              return { data: withId, error: null };
            },
          }),
        }),
        update: (patch: Row) => {
          const conds: Array<[string, unknown]> = [];
          const u = {
            eq: (c: string, v: unknown) => {
              conds.push([c, v]);
              if (conds.length < 2) return u;
              for (const r of leads)
                if (conds.every(([k, val]) => r[k] === val)) Object.assign(r, patch);
              return Promise.resolve({ error: null });
            },
          };
          return u;
        },
      };
      return q;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, leads };
}

/* Real-shaped deliveries for one response: the partial stops after the
 * contact details; the completion carries every answer. Same token. */
const TOKEN = "a1b2c3d4partialtoken";
const definition = {
  title: "Career AI Accelerator",
  fields: [
    { ref: "f-name", title: "First name", type: "short_text" },
    { ref: "f-email", title: "Email", type: "email" },
    { ref: "f-phone", title: "Phone", type: "phone_number" },
    { ref: "f-income", title: "What are you earning now?", type: "multiple_choice" },
  ],
};
const contact = [
  { type: "text", text: "Partial Test", field: { ref: "f-name", type: "short_text" } },
  { type: "email", email: "partial.test@example.com", field: { ref: "f-email", type: "email" } },
  {
    type: "phone_number",
    phone_number: "+12015550299",
    field: { ref: "f-phone", type: "phone_number" },
  },
];
const hidden = { utm_source: "instagram", utm_medium: "bio", utm_campaign: "evergreen" };

const partialPayload = {
  event_type: "form_response_partial",
  form_response: { token: TOKEN, definition, hidden, answers: contact },
};
const completePayload = {
  event_type: "form_response",
  form_response: {
    token: TOKEN,
    definition,
    hidden,
    answers: [
      ...contact,
      {
        type: "choice",
        choice: { label: "$95-120K" },
        field: { ref: "f-income", type: "multiple_choice" },
      },
    ],
  },
};

/** What the route builds from a delivery, minus the Typeform-specific glue. */
function inputFrom(payload: typeof partialPayload | typeof completePayload): ApplicationInput {
  const fr = payload.form_response;
  const idx = indexTypeformAnswers(fr);
  const a = hiddenAttribution(fr);
  return {
    orgId: "org",
    token: fr.token,
    isPartial: payload.event_type === "form_response_partial",
    full_name: idx.answers.first_name ?? null,
    email: idx.typedEmail || null,
    phone: idx.typedPhone || null,
    handle: null,
    application_data: {
      income: idx.answers.what_are_you_earning_now ?? "",
      answers_by_title: idx.answersByTitle,
    },
    qualification_notes: null,
    attribution: {
      source_platform: a.sourcePlatform,
      source_campaign: a.sourceCampaign,
      source_medium: a.sourceMedium,
      source_content_tag: a.contentTag,
      source_content_id: null,
    },
  };
}

describe("a partial followed by its completion", () => {
  it("makes one lead and announces the applicant exactly once", async () => {
    const { db, leads } = fakeDb();
    const announced: string[] = [];
    const deliver = async (p: typeof partialPayload | typeof completePayload) => {
      const out = await upsertApplicationLead(db, inputFrom(p));
      if (out.kind !== "ignored" && out.announce) announced.push(out.leadId);
      return out;
    };

    // The partial: stored, marked, not announced.
    const first = await deliver(partialPayload);
    expect(first).toEqual({ kind: "created", leadId: "lead-1", announce: false });
    expect(leads[0]).toMatchObject({
      application_partial: true,
      typeform_response_token: TOKEN,
      email: "partial.test@example.com",
      phone: "+12015550299",
      source_medium: "bio",
    });

    // Typeform sends the partial again: same lead, still not announced.
    expect(await deliver(partialPayload)).toEqual({
      kind: "updated",
      leadId: "lead-1",
      announce: false,
    });

    // The completion finishes the same lead and is announced.
    expect(await deliver(completePayload)).toEqual({
      kind: "updated",
      leadId: "lead-1",
      announce: true,
    });
    expect(leads[0].application_partial).toBe(false);
    expect((leads[0].application_data as Row).income).toBe("$95-120K");

    // Typeform retries the completion: nothing changes, nothing is posted.
    expect(await deliver(completePayload)).toMatchObject({
      kind: "ignored",
      reason: "duplicate completion",
    });

    // A partial arriving late, after the completion, cannot undo it.
    expect(await deliver(partialPayload)).toMatchObject({
      kind: "ignored",
      reason: "late partial",
    });
    expect(leads[0].application_partial).toBe(false);

    expect(leads).toHaveLength(1);
    expect(announced).toEqual(["lead-1"]);
  });

  it("announces a completion that never had a partial, as before", async () => {
    const { db, leads } = fakeDb();
    expect(await upsertApplicationLead(db, inputFrom(completePayload))).toEqual({
      kind: "created",
      leadId: "lead-1",
      announce: true,
    });
    expect(leads[0].application_partial).toBe(false);
  });

  it("finds the partial by email when the completion has no token", async () => {
    const { db, leads } = fakeDb();
    await upsertApplicationLead(db, inputFrom(partialPayload));
    const out = await upsertApplicationLead(db, { ...inputFrom(completePayload), token: null });
    expect(out).toEqual({ kind: "updated", leadId: "lead-1", announce: true });
    expect(leads).toHaveLength(1);
  });

  it("treats a returning applicant as a new application, not an update to the old one", async () => {
    const { db, leads } = fakeDb();
    await upsertApplicationLead(db, inputFrom(completePayload));
    // Months later, the same person starts again on a new response.
    const again = { ...inputFrom(partialPayload), token: "a-brand-new-token" };
    expect(await upsertApplicationLead(db, again)).toMatchObject({
      kind: "created",
      announce: false,
    });
    expect(leads).toHaveLength(2);
  });

  it("never blanks contact details a previous delivery recorded", async () => {
    const { db, leads } = fakeDb();
    await upsertApplicationLead(db, inputFrom(partialPayload));
    await upsertApplicationLead(db, { ...inputFrom(completePayload), phone: null });
    expect(leads[0].phone).toBe("+12015550299");
  });
});

describe("partials are not applications", () => {
  it("counts a partial as a lead but not as an application", () => {
    const base = {
      email: null,
      source_platform: "instagram",
      source_content_id: null,
      first_touch_content_id: null,
      created_at: "2026-11-14T12:00:00Z",
    };
    const board = buildSourceBoard(
      [
        { ...base, id: "a", application_data: { income: "x" }, application_partial: true },
        { ...base, id: "b", application_data: { income: "y" }, application_partial: false },
      ],
      [],
      [],
      new Map(),
    );
    expect(board.sources[0]).toMatchObject({ leads: 2, applications: 1 });
  });

  it("writes only columns public.leads has", () => {
    const cols = tableColumnsFromMigrations("leads");
    for (const k of ["typeform_response_token", "application_partial", "source_medium"]) {
      expect(cols.has(k), k).toBe(true);
    }
  });
});
