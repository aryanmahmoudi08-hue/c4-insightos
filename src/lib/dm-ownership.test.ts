import { describe, expect, it } from "vitest";
import {
  matchClaim,
  memberForTag,
  normHandle,
  normPhone,
  tagName,
  type DmClaimLike,
} from "./dm-ownership";

const now = new Date("2026-11-26T12:00:00Z");
const claim = (over: Partial<DmClaimLike>): DmClaimLike => ({
  id: "c1",
  setter_member_id: "m1",
  setter_name: "Jordan",
  lead_name: null,
  handle: null,
  email: null,
  phone: null,
  created_at: "2026-11-25T12:00:00Z",
  matched_lead_id: null,
  ...over,
});
const lead = {
  full_name: "Dana Reed",
  email: "Dana@Gmail.com",
  phone: "+1 (404) 555-0182",
  handle: null,
};

describe("normalisers", () => {
  it("reads handles however they're pasted", () => {
    expect(normHandle("@Dana.Reed")).toBe("danareed");
    expect(normHandle("https://www.instagram.com/dana.reed/?hl=en")).toBe("danareed");
    expect(normHandle("linkedin.com/in/dana-reed")).toBe("danareed");
  });
  it("compares phones on the last 10 digits", () => {
    expect(normPhone("+1 (404) 555-0182")).toBe(normPhone("404.555.0182"));
  });
  it("only treats dm-<name> as a setter tag", () => {
    expect(tagName("dm-Jordan")).toBe("jordan");
    expect(tagName("reel-1114-layoff")).toBeNull();
  });
});

describe("memberForTag", () => {
  const roster = [
    { name: "Jordan Smith", role: "closer" },
    { name: "Jordan Lee", role: "dm_setter" },
    { name: "Maya", role: "dm_setter" },
  ];
  it("matches a first name, preferring the DM setter on a clash", () => {
    expect(memberForTag("jordan", roster)?.name).toBe("Jordan Lee");
    expect(memberForTag("maya", roster)?.name).toBe("Maya");
    expect(memberForTag("jordanlee", roster)?.name).toBe("Jordan Lee");
    expect(memberForTag("sam", roster)).toBeNull();
  });
});

describe("matchClaim", () => {
  it("matches on email first", () => {
    const r = matchClaim(lead, [claim({ email: "dana@gmail.com" })], now);
    expect(r?.on).toBe("email");
  });
  it("matches a phone typed differently", () => {
    expect(matchClaim(lead, [claim({ phone: "404-555-0182" })], now)?.on).toBe("phone");
  });
  it("matches a handle when the application has one", () => {
    const r = matchClaim(
      { ...lead, email: null, phone: null, handle: "dana.reed" },
      [claim({ handle: "@Dana.Reed" })],
      now,
    );
    expect(r?.on).toBe("handle");
  });
  it("matches a full name but never a first name alone", () => {
    expect(
      matchClaim({ ...lead, email: null, phone: null }, [claim({ lead_name: "dana  reed" })], now)
        ?.on,
    ).toBe("name");
    expect(
      matchClaim(
        { ...lead, full_name: "Dana", email: null, phone: null },
        [claim({ lead_name: "Dana" })],
        now,
      ),
    ).toBeNull();
  });
  it("ignores claims older than 30 days or already used", () => {
    expect(
      matchClaim(
        lead,
        [claim({ email: "dana@gmail.com", created_at: "2026-10-01T00:00:00Z" })],
        now,
      ),
    ).toBeNull();
    expect(
      matchClaim(lead, [claim({ email: "dana@gmail.com", matched_lead_id: "x" })], now),
    ).toBeNull();
  });
});

describe("DM LEAD line on Discord alerts", () => {
  it("tops the applicant alert when a setter owns the lead", async () => {
    const { formatDiscordMessage } = await import("./discord-format");
    const msg = formatDiscordMessage("lead.application_submitted", {
      lead: { id: "l1", full_name: "Dana Reed", dm_owned_via: "claim", dm_setter_name: "Jordan" },
      application_data: {},
    });
    expect(msg.content).toContain("DM LEAD (Jordan's). Dialers: don't call.");
    const plain = formatDiscordMessage("lead.application_submitted", {
      lead: { id: "l2", full_name: "Sam Lee" },
      application_data: {},
    });
    expect(plain.content).not.toContain("DM LEAD");
  });
});
