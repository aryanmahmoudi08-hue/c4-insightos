import { describe, expect, it } from "vitest";
import {
  allRoles,
  defaultPerm,
  rolesLabel,
  splitRoles,
  toggleRole,
  unionPerm,
  type AppRole,
} from "./permissions";
import { allowedEodRolesForAppRoles, canAccessEodRole } from "./eod-rbac";
import { tableColumnsFromMigrations } from "./__test-support__/migration-columns";

describe("splitRoles", () => {
  it("combines any of DM setter, dialer and closer, led by the furthest along", () => {
    expect(splitRoles(["setter", "closer"])).toEqual({
      ok: true,
      primary: "closer",
      additional: ["setter"],
    });
    expect(splitRoles(["setter", "inbound_dialer"])).toEqual({
      ok: true,
      primary: "inbound_dialer",
      additional: ["setter"],
    });
    expect(splitRoles(["setter", "inbound_dialer", "closer"])).toEqual({
      ok: true,
      primary: "closer",
      additional: ["inbound_dialer", "setter"],
    });
  });

  it("keeps a single role as it is", () => {
    expect(splitRoles(["setter"])).toEqual({ ok: true, primary: "setter", additional: [] });
  });

  it("lets a manager or admin also hold sales roles", () => {
    expect(splitRoles(["closer", "sales_manager"])).toEqual({
      ok: true,
      primary: "sales_manager",
      additional: ["closer"],
    });
  });

  it("refuses two non-sales roles, or viewer with a sales role", () => {
    expect(splitRoles(["sales_manager", "growth_ops"]).ok).toBe(false);
    expect(splitRoles(["viewer", "closer"]).ok).toBe(false);
    expect(splitRoles([]).ok).toBe(false);
  });
});

describe("toggleRole", () => {
  it("toggles sales roles freely", () => {
    expect(toggleRole(["setter"], "closer")).toEqual(["setter", "closer"]);
    expect(toggleRole(["setter", "closer"], "setter")).toEqual(["closer"]);
  });

  it("swaps one non-sales role for another, keeping the sales roles", () => {
    expect(toggleRole(["closer", "sales_manager"], "growth_ops")).toEqual(["growth_ops", "closer"]);
  });

  it("treats viewer as exclusive", () => {
    expect(toggleRole(["setter", "closer"], "viewer")).toEqual(["viewer"]);
    expect(toggleRole(["viewer"], "setter")).toEqual(["setter"]);
  });

  it("never builds a set splitRoles rejects", () => {
    const all: AppRole[] = [
      "admin",
      "sales_manager",
      "growth_ops",
      "setter",
      "inbound_dialer",
      "closer",
      "viewer",
    ];
    let state: AppRole[] = ["setter"];
    for (let i = 0; i < 200; i++) {
      state = toggleRole(state, all[(i * 7 + 3) % all.length]);
      if (state.length) expect(splitRoles(state).ok, state.join(",")).toBe(true);
    }
  });
});

describe("permissions for someone with several roles", () => {
  it("opens a page when any of their roles opens it", () => {
    const perm = (resource: string) =>
      unionPerm(allRoles("closer", ["setter"]), (r) => defaultPerm(r, resource));
    // The DM Setter dashboard is editable by setters, not closers.
    expect(defaultPerm("closer", "dm_setter").can_edit).toBe(false);
    expect(perm("dm_setter").can_edit).toBe(true);
    // Payments come from the closer role.
    expect(perm("payments").can_view).toBe(true);
  });

  it("lets them fill in the EOD for each of their roles", () => {
    expect(allowedEodRolesForAppRoles(["closer", "inbound_dialer"])).toEqual([
      "inbound_dialer",
      "closer",
    ]);
    expect(
      canAccessEodRole({ appRole: "closer", additionalRoles: ["setter"], eodRole: "dm_setter" }),
    ).toBe(true);
    expect(canAccessEodRole({ appRole: "closer", eodRole: "dm_setter" })).toBe(false);
  });

  it("lists and labels every role once, primary first", () => {
    expect(allRoles("closer", ["setter", "closer", "nonsense"])).toEqual(["closer", "setter"]);
    expect(rolesLabel(["closer", "setter"])).toBe("Closer + DM setter");
  });
});

describe("schema", () => {
  it("has the columns the app reads", () => {
    expect(tableColumnsFromMigrations("memberships").has("additional_roles")).toBe(true);
    expect(tableColumnsFromMigrations("membership_requests").has("requested_roles")).toBe(true);
  });
});
