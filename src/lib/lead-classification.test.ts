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
