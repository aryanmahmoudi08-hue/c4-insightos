import { describe, expect, it } from "vitest";
import { recommendStageFromScore, scoreApplicant } from "./hiring.functions";

/**
 * `scoreApplicant` moved out of the Hiring route when the public ingest
 * endpoint became a second entry point (a Google/Typeform application posting
 * straight into the pipeline). These pin the behaviour so the two paths can't
 * drift, and so the move itself was provably behaviour-preserving — it had no
 * tests at all while it lived in the route file.
 */
describe("scoreApplicant", () => {
  it("starts from a neutral 5 and says why when there's nothing to go on", () => {
    const { score, reasoning } = scoreApplicant({});
    expect(score).toBe(5);
    expect(reasoning).toBe("limited experience");
  });

  it("rewards experience in bands rather than linearly", () => {
    expect(scoreApplicant({ years_experience: 0.5 }).score).toBe(5);
    expect(scoreApplicant({ years_experience: 1 }).score).toBe(5.5);
    expect(scoreApplicant({ years_experience: 2 }).score).toBe(6.5);
    expect(scoreApplicant({ years_experience: 5 }).score).toBe(7.5);
    // the top band doesn't keep climbing with more years
    expect(scoreApplicant({ years_experience: 30 }).score).toBe(7.5);
  });

  it("credits niche fit and signals found in notes", () => {
    expect(scoreApplicant({ niche: "High-ticket coaching" }).score).toBe(6.5);
    expect(scoreApplicant({ notes: "Consistently exceeded quota" }).score).toBe(6);
    expect(scoreApplicant({ notes: "Available full-time, remote" }).score).toBe(5.5);
  });

  it("never leaves the 0-10 range however much stacks up", () => {
    const { score } = scoreApplicant({
      years_experience: 20,
      niche: "coaching agency saas consult",
      notes: "closed quota commission exceeded hit — remote full-time available",
    });
    expect(score).toBeLessThanOrEqual(10);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("explains itself — reasoning lists the factors that moved the score", () => {
    const { reasoning } = scoreApplicant({
      years_experience: 6,
      niche: "info products",
      notes: "hit quota every month",
    });
    expect(reasoning).toContain("6y experience (strong)");
    expect(reasoning).toContain("niche fit");
    expect(reasoning).toContain("perf signals in notes");
  });
});

describe("score to recommended stage", () => {
  it("maps the bands the Hiring page and the ingest endpoint both rely on", () => {
    expect(recommendStageFromScore(9)).toBe("trial_call");
    expect(recommendStageFromScore(8.5)).toBe("trial_call");
    expect(recommendStageFromScore(7)).toBe("interview_worthy");
    expect(recommendStageFromScore(5)).toBe("needs_grading");
    expect(recommendStageFromScore(4.9)).toBe("rejected");
  });

  it("a strong applicant is only ever RECOMMENDED a later stage", () => {
    // Nothing in either write path sets `stage` from this — an applicant
    // always lands in "applied" until a human moves them. This test exists to
    // make that contract visible next to the scorer that tempts otherwise.
    const { score } = scoreApplicant({
      years_experience: 8,
      niche: "coaching",
      notes: "exceeded quota, available full-time",
    });
    expect(recommendStageFromScore(score)).not.toBe("applied");
  });
});
