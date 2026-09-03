import { describe, expect, it } from "vitest";
import { allowedEodRolesForAppRole, canAccessEodRole, eodAccessDeniedMessage } from "./eod-rbac";

describe("EOD RBAC policy", () => {
  it("maps each rep role to only its own workflow", () => {
    expect(allowedEodRolesForAppRole("setter")).toEqual(["dm_setter"]);
    expect(allowedEodRolesForAppRole("inbound_dialer")).toEqual(["inbound_dialer"]);
    expect(allowedEodRolesForAppRole("closer")).toEqual(["closer"]);
  });

  it("allows administrative and sales-manager roles to manage all workflows", () => {
    for (const role of ["owner", "admin", "sales_manager"]) {
      expect(allowedEodRolesForAppRole(role)).toEqual(["dm_setter", "inbound_dialer", "closer"]);
    }
  });

  it("denies unknown and viewer roles by default", () => {
    expect(allowedEodRolesForAppRole("viewer")).toEqual([]);
    expect(allowedEodRolesForAppRole("not-a-role")).toEqual([]);
    expect(canAccessEodRole({ appRole: "setter", eodRole: "closer" })).toBe(false);
  });

  it("honors an explicit eod_reports view denial", () => {
    expect(
      canAccessEodRole({ appRole: "admin", eodRole: "closer", canViewEodResource: false }),
    ).toBe(false);
  });

  it("uses a non-sensitive access-denied message", () => {
    expect(eodAccessDeniedMessage()).toBe("You don't have permission to access this EOD workflow.");
  });
});
