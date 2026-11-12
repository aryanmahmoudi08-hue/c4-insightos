import { describe, expect, it } from "vitest";
import { answerValue, indexTypeformAnswers, normalizeFieldKey } from "./typeform-answers";

/** The real shape Typeform delivered on form YMjkDIVy — UUID refs, because
 *  the form was rebuilt on a new account. This is the payload that produced
 *  a completely empty lead. */
const REBUILT_FORM = {
  definition: {
    fields: [
      { ref: "ccefc4d9-c175-462a-94b2-f564379081f2", title: "Email", type: "email" },
      { ref: "6547f526-8a2a-4899-b963-374e35c1b8ab", title: "Phone", type: "phone_number" },
      { ref: "733675f9-21dc-46e6-b2b9-bc717735ccad", title: "First name", type: "short_text" },
    ],
  },
  answers: [
    {
      type: "email",
      email: "lead@example.com",
      field: { type: "email", ref: "ccefc4d9-c175-462a-94b2-f564379081f2" },
    },
    {
      type: "phone_number",
      phone_number: "+15550001111",
      field: { type: "phone_number", ref: "6547f526-8a2a-4899-b963-374e35c1b8ab" },
    },
    {
      type: "text",
      text: "AscendOS",
      field: { type: "short_text", ref: "733675f9-21dc-46e6-b2b9-bc717735ccad" },
    },
  ],
};

describe("normalizeFieldKey", () => {
  it("turns a title into the semantic key shape", () => {
    expect(normalizeFieldKey("First name")).toBe("first_name");
    expect(normalizeFieldKey("What's your monthly income?")).toBe("what_s_your_monthly_income");
  });
  it("trims leading and trailing separators", () => {
    expect(normalizeFieldKey("  Email  ")).toBe("email");
    expect(normalizeFieldKey("!!!")).toBe("");
  });
});

describe("answerValue", () => {
  it("reads each answer shape Typeform uses", () => {
    expect(answerValue({ text: "hi" })).toBe("hi");
    expect(answerValue({ email: "a@b.c" })).toBe("a@b.c");
    expect(answerValue({ phone_number: "+1555" })).toBe("+1555");
    expect(answerValue({ number: 12 })).toBe("12");
    expect(answerValue({ boolean: false })).toBe("false");
    expect(answerValue({ choice: { label: "Yes" } })).toBe("Yes");
    expect(answerValue({ choices: { labels: ["A", "B"] } })).toBe("A, B");
  });
  it("returns empty for nothing", () => {
    expect(answerValue(null)).toBe("");
    expect(answerValue("nope")).toBe("");
  });
});

describe("indexTypeformAnswers", () => {
  it("finds email and phone by answer type, whatever the refs are", () => {
    const out = indexTypeformAnswers(REBUILT_FORM);
    expect(out.typedEmail).toBe("lead@example.com");
    expect(out.typedPhone).toBe("+15550001111");
  });

  it("makes a UUID-ref field reachable by its title", () => {
    // This is the regression: before, only the UUID was a key, so a lookup
    // for "first_name" found nothing and the lead had no name.
    const out = indexTypeformAnswers(REBUILT_FORM);
    expect(out.answers.first_name).toBe("AscendOS");
    expect(out.answersByTitle["First name"]).toBe("AscendOS");
  });

  it("still keys by ref, so semantic-ref forms behave exactly as before", () => {
    const out = indexTypeformAnswers(REBUILT_FORM);
    expect(out.answers["733675f9-21dc-46e6-b2b9-bc717735ccad"]).toBe("AscendOS");
  });

  it("lets a semantic ref win over a title that normalises to the same key", () => {
    const out = indexTypeformAnswers({
      answers: [
        { type: "text", text: "from-ref", field: { ref: "first_name" } },
        { type: "text", text: "from-title", field: { ref: "zzz", title: "First name" } },
      ],
    });
    expect(out.answers.first_name).toBe("from-ref");
  });

  it("reads a title off the answer when the definition is absent", () => {
    const out = indexTypeformAnswers({
      answers: [{ type: "text", text: "Ada", field: { ref: "uuid-1", title: "First name" } }],
    });
    expect(out.answers.first_name).toBe("Ada");
  });

  it("skips answers with no value rather than storing empties", () => {
    const out = indexTypeformAnswers({
      answers: [{ type: "text", text: "", field: { ref: "r", title: "Email" } }],
    });
    expect(out.answers).toEqual({});
    expect(out.answersByTitle).toEqual({});
  });

  it("takes the first typed answer when a form asks twice", () => {
    const out = indexTypeformAnswers({
      answers: [
        { type: "email", email: "first@example.com", field: { ref: "a" } },
        { type: "email", email: "second@example.com", field: { ref: "b" } },
      ],
    });
    expect(out.typedEmail).toBe("first@example.com");
  });

  it("survives a partial response with nothing in it", () => {
    expect(indexTypeformAnswers({ answers: [] })).toEqual({
      answers: {},
      answersByTitle: {},
      typedEmail: "",
      typedPhone: "",
    });
    expect(indexTypeformAnswers(null).typedEmail).toBe("");
    expect(indexTypeformAnswers({}).answers).toEqual({});
  });
});
