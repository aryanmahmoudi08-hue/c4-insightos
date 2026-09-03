import { describe, expect, it } from "vitest";
import {
  accessRequestState,
  isScopedOnboardingFallbackValid,
  transitionAccessRequest,
  type AccessRequest,
} from "./access-workflow";

const BASE: AccessRequest = {
  id: "req-1",
  email: "rep@example.com",
  role: "setter",
  scope: "org-1",
  state: "pending",
  expiresAt: "2026-09-03T00:00:00Z",
  acceptedAt: null,
  revokedAt: null,
};

describe("access request lifecycle", () => {
  it("expires pending requests deterministically", () => {
    expect(accessRequestState(BASE, new Date("2026-09-02T00:00:00Z"))).toBe("pending");
    expect(accessRequestState(BASE, new Date("2026-09-04T00:00:00Z"))).toBe("expired");
  });

  it("records acceptance and revocation timestamps", () => {
    const accepted = transitionAccessRequest(BASE, "accepted", new Date("2026-09-02T12:00:00Z"));
    expect(accepted).toMatchObject({ state: "accepted", acceptedAt: "2026-09-02T12:00:00.000Z" });
    const revoked = transitionAccessRequest(accepted, "revoked", new Date("2026-09-02T13:00:00Z"));
    expect(revoked).toMatchObject({ state: "revoked", revokedAt: "2026-09-02T13:00:00.000Z" });
    expect(() => transitionAccessRequest(revoked, "accepted")).toThrow(
      "Invalid access request transition",
    );
  });

  it("validates single-use scoped onboarding tokens", () => {
    expect(
      isScopedOnboardingFallbackValid(
        { token: "abc", expectedToken: "abc", expiresAt: "2026-09-03T00:00:00Z" },
        new Date("2026-09-02T00:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isScopedOnboardingFallbackValid(
        { token: "abc", expectedToken: "bad", expiresAt: "2026-09-03T00:00:00Z" },
        new Date("2026-09-02T00:00:00Z"),
      ),
    ).toBe(false);
    expect(
      isScopedOnboardingFallbackValid(
        { token: "abc", expectedToken: "abc", expiresAt: "2026-09-01T00:00:00Z" },
        new Date("2026-09-02T00:00:00Z"),
      ),
    ).toBe(false);
  });
});
