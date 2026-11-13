import { describe, expect, it } from "vitest";
import { classifyLead, parseCurrencyToCents, type ClassificationRule } from "./lead-classification";

const LOW: ClassificationRule = {
  id: "rule-low",
  priority: 1,
  typeform_field_key: "investment_budget",
  operator: "lt",
  threshold_cents: 300_000,
  tier_key: "low",
  is_active: true,
};
const HIGH: ClassificationRule = {
  id: "rule-high",
  priority: 2,
  typeform_field_key: "investment_budget",
  operator: "gte",
  threshold_cents: 300_000,
  tier_key: "high",
  is_active: true,
};

describe("parseCurrencyToCents", () => {
  it("parses plain numbers, dollar signs, and commas", () => {
    expect(parseCurrencyToCents("5000")).toBe(500_000);
    expect(parseCurrencyToCents("$5,000")).toBe(500_000);
    expect(parseCurrencyToCents("5,000.50")).toBe(500_050);
  });
  it("parses shorthand 'k' amounts", () => {
    expect(parseCurrencyToCents("5k")).toBe(500_000);
    expect(parseCurrencyToCents("$2.5k")).toBe(250_000);
  });
  it("returns null for empty/unparseable input — never guesses", () => {
    expect(parseCurrencyToCents("")).toBeNull();
    expect(parseCurrencyToCents(undefined)).toBeNull();
    expect(parseCurrencyToCents(null)).toBeNull();
    expect(parseCurrencyToCents("Not sure")).toBeNull();
    expect(parseCurrencyToCents("N/A")).toBeNull();
  });
});

describe("classifyLead", () => {
  it("classifies under the threshold as Low Ticket", () => {
    const result = classifyLead({ investment_budget: "$2,000" }, [LOW, HIGH]);
    expect(result.tierKey).toBe("low");
    expect(result.ruleId).toBe("rule-low");
    expect(result.rawValue).toBe("$2,000");
  });
  it("classifies at or over the threshold as High Ticket", () => {
    const result = classifyLead({ investment_budget: "$5,000" }, [LOW, HIGH]);
    expect(result.tierKey).toBe("high");
    expect(result.ruleId).toBe("rule-high");
  });
  it("classifies exactly at the threshold as High Ticket (gte, not gt)", () => {
    const result = classifyLead({ investment_budget: "$3,000" }, [LOW, HIGH]);
    expect(result.tierKey).toBe("high");
  });
  it("leaves the lead Unknown/Unclassified when the field is missing", () => {
    const result = classifyLead({ some_other_field: "yes" }, [LOW, HIGH]);
    expect(result.tierKey).toBeNull();
    expect(result.ruleId).toBeNull();
  });
  it("leaves the lead Unknown/Unclassified when the response can't be read as a dollar amount — never guesses", () => {
    const result = classifyLead({ investment_budget: "Not sure yet" }, [LOW, HIGH]);
    expect(result.tierKey).toBeNull();
  });
  it("ignores inactive rules", () => {
    const result = classifyLead({ investment_budget: "$1,000" }, [
      { ...LOW, is_active: false },
      HIGH,
    ]);
    expect(result.tierKey).toBeNull();
  });
  it("evaluates in priority order regardless of array order", () => {
    const result = classifyLead({ investment_budget: "$1,000" }, [HIGH, LOW]);
    expect(result.tierKey).toBe("low");
  });
  it("returns Unknown/Unclassified with no active rules at all", () => {
    const result = classifyLead({ investment_budget: "$5,000" }, []);
    expect(result.tierKey).toBeNull();
  });
});

describe("parseCurrencyToCents — ranges", () => {
  // A dropdown of capital bands is the normal shape for this question, and
  // every one of these used to parse into a number nobody wrote down.
  it("reads a dollar range as its lower bound", () => {
    // Was 3000500000 ($30,005,000) — the two ends concatenated.
    expect(parseCurrencyToCents("$3,000-$5,000")).toBe(300000);
  });

  it("reads a k-suffixed range as its lower bound", () => {
    // Was 3500 ($35) — the k regex failed, then digits were concatenated.
    expect(parseCurrencyToCents("$3k-$5k")).toBe(300000);
    // The unit is written once, on the end: this is $95,000-$120,000, so the
    // lower bound is $95,000. Parsing the bare left side as $95 would be off
    // by a thousand and would silently fail every threshold.
    expect(parseCurrencyToCents("$95-120K")).toBe(9500000);
    expect(parseCurrencyToCents("95k to 120k")).toBe(9500000);
  });

  it("accepts en dash, em dash and the word to", () => {
    expect(parseCurrencyToCents("$3,000 – $5,000")).toBe(300000);
    expect(parseCurrencyToCents("$3,000 — $5,000")).toBe(300000);
    expect(parseCurrencyToCents("3,000 to 5,000")).toBe(300000);
  });

  it("takes the smaller end when a range is written backwards", () => {
    expect(parseCurrencyToCents("$5,000-$3,000")).toBe(300000);
  });

  it("still reads a plain amount, with or without a trailing plus", () => {
    expect(parseCurrencyToCents("$5,000")).toBe(500000);
    expect(parseCurrencyToCents("5000")).toBe(500000);
    expect(parseCurrencyToCents("5k")).toBe(500000);
    expect(parseCurrencyToCents("750+")).toBe(75000);
    expect(parseCurrencyToCents("$10,000+")).toBe(1000000);
    expect(parseCurrencyToCents("10k+")).toBe(1000000);
  });

  it("does not mistake a trailing plus or a hyphenated word for a range", () => {
    expect(parseCurrencyToCents("$10,000+")).toBe(1000000);
    expect(parseCurrencyToCents("self-employed")).toBeNull();
  });

  it("returns null when a side of the range has no usable number", () => {
    expect(parseCurrencyToCents("some to none")).toBeNull();
  });
});

describe("classifyLead — field map", () => {
  const RULE: ClassificationRule = {
    id: "rule-capital",
    priority: 1,
    typeform_field_key: "capital",
    operator: "gte",
    threshold_cents: 300000,
    tier_key: "high",
    is_active: true,
  };

  it("resolves the rule's key through the connection's mapping", () => {
    // The client's question is worded their way, so its ref is a UUID and its
    // title does not normalise to "capital". Only the mapping connects them.
    const answers = { "9f1c-uuid": "$3,000-$5,000" };
    const out = classifyLead(answers, [RULE], { capital: "9f1c-uuid" });
    expect(out.tierKey).toBe("high");
    expect(out.rawValue).toBe("$3,000-$5,000");
  });

  it("stays unclassified when the mapped question was left blank", () => {
    // The mapping is an explicit statement about where this rule reads from.
    // Falling back would classify the lead on another question's answer.
    const answers = { capital: "$9,000" };
    expect(classifyLead(answers, [RULE], { capital: "unanswered-ref" }).tierKey).toBeNull();
  });

  it("falls back to key matching for a rule the mapping does not cover", () => {
    const answers = { capital: "$9,000" };
    expect(classifyLead(answers, [RULE], { income: "other-ref" }).tierKey).toBe("high");
  });

  it("behaves exactly as before with no mapping passed", () => {
    const answers = { capital: "$9,000" };
    expect(classifyLead(answers, [RULE]).tierKey).toBe("high");
    expect(classifyLead(answers, [RULE], null).tierKey).toBe("high");
    expect(classifyLead(answers, [RULE], {}).tierKey).toBe("high");
  });
});
