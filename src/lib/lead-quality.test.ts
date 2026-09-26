import { describe, expect, it } from "vitest";
import { isDiamondLead, DIAMOND_INTENT_FLOOR } from "./lead-quality";

describe("isDiamondLead", () => {
  const hot = { intent_score: 5, precall_video_watched: true, status: "qualified" };

  it("flags a qualified lead with top intent who watched the pre-call video", () => {
    expect(isDiamondLead(hot)).toBe(true);
  });

  it("requires both signals, not either", () => {
    expect(isDiamondLead({ ...hot, precall_video_watched: false })).toBe(false);
    expect(isDiamondLead({ ...hot, intent_score: 2 })).toBe(false);
  });

  it("honours an explicit urgent priority as a manual override", () => {
    expect(isDiamondLead({ priority: "urgent", status: "dm_received" })).toBe(true);
  });

  it("never flags a closed, disqualified or ghosted lead", () => {
    for (const status of ["closed", "disqualified", "ghosted"]) {
      expect(isDiamondLead({ ...hot, status })).toBe(false);
      // Even the manual override loses to a terminal status.
      expect(isDiamondLead({ priority: "urgent", status })).toBe(false);
    }
  });

  it("is false for a lead with no signal at all", () => {
    expect(isDiamondLead({})).toBe(false);
    expect(isDiamondLead({ status: "dm_received" })).toBe(false);
  });

  // intent_score is stored on both a 0-5 and a 0-100 scale in practice;
  // scaleIntentScore normalises, so an 80/100 lead must qualify too.
  it("normalises a 0-100 intent score before comparing to the floor", () => {
    expect(isDiamondLead({ ...hot, intent_score: 90 })).toBe(true);
    expect(isDiamondLead({ ...hot, intent_score: 40 })).toBe(false);
  });

  it("treats the floor as inclusive", () => {
    expect(isDiamondLead({ ...hot, intent_score: DIAMOND_INTENT_FLOOR })).toBe(true);
  });
});
