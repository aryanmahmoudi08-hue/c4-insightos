import { describe, expect, it } from "vitest";
import {
  answerValue,
  formQuestions,
  hiddenAttribution,
  indexTypeformAnswers,
  normalizeFieldKey,
  resolveSlot,
} from "./typeform-answers";

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

describe("hiddenAttribution", () => {
  it("pulls utm_source and utm_campaign off the hidden block", () => {
    const out = hiddenAttribution({
      hidden: { utm_source: "ascendos_test", utm_campaign: "postfix_verify" },
    });
    expect(out.sourcePlatform).toBe("ascendos_test");
    expect(out.sourceCampaign).toBe("postfix_verify");
  });

  it("keeps every hidden field verbatim, not just the mapped two", () => {
    const out = hiddenAttribution({
      hidden: { utm_source: "meta", utm_medium: "paid", utm_term: "procurement" },
    });
    expect(out.hidden).toEqual({
      utm_source: "meta",
      utm_medium: "paid",
      utm_term: "procurement",
    });
  });

  it("treats empty strings and the xxxxx placeholder as no attribution", () => {
    const out = hiddenAttribution({
      hidden: { utm_source: "", utm_campaign: "xxxxx", utm_medium: "  " },
    });
    expect(out.sourcePlatform).toBeNull();
    expect(out.sourceCampaign).toBeNull();
    expect(out.hidden).toEqual({});
  });

  it("returns nulls rather than throwing when there is no hidden block", () => {
    expect(hiddenAttribution({}).sourcePlatform).toBeNull();
    expect(hiddenAttribution(null).hidden).toEqual({});
    expect(hiddenAttribution({ hidden: "nope" }).hidden).toEqual({});
  });
});

describe("formQuestions", () => {
  it("lists ref/title/type for each field", () => {
    expect(
      formQuestions({ fields: [{ ref: "r1", title: "Income?", type: "short_text" }] }),
    ).toEqual([{ ref: "r1", title: "Income?", type: "short_text" }]);
  });
  it("skips fields with no ref or no title, which cannot be offered as a choice", () => {
    expect(formQuestions({ fields: [{ ref: "r1" }, { title: "T" }, null] })).toEqual([]);
  });
  it("returns nothing when no definition has been seen yet", () => {
    expect(formQuestions(null)).toEqual([]);
    expect(formQuestions({})).toEqual([]);
  });
});

describe("resolveSlot", () => {
  const answers = { "uuid-income": "120k", income: "legacy-value", salary: "fallback-value" };

  it("prefers the explicitly mapped question", () => {
    expect(resolveSlot("income", { income: "uuid-income" }, answers)).toBe("120k");
  });

  it("falls back to ref/title matching when the slot is unmapped", () => {
    expect(resolveSlot("income", {}, answers)).toBe("legacy-value");
    expect(resolveSlot("income", null, answers)).toBe("legacy-value");
  });

  it("uses the extra fallback keys when the slot name itself misses", () => {
    expect(resolveSlot("income", {}, { salary: "fallback-value" }, ["salary"])).toBe(
      "fallback-value",
    );
  });

  it("stays empty when the mapped question had no answer, rather than substituting", () => {
    // The mapping says where this slot comes from. Falling back here would
    // put another question's answer under this label.
    expect(resolveSlot("income", { income: "uuid-missing" }, answers)).toBe("");
  });

  it("returns empty for a slot with no mapping and no match", () => {
    expect(resolveSlot("time", {}, answers)).toBe("");
  });
});
