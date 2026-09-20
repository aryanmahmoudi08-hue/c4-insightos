import type { SopDoc } from "@/lib/sop-types";
import type { Role } from "@/hooks/use-role";
import { adminSop } from "./admin";
import { growthOpsSop } from "./growth-ops";
import { salesManagerSop } from "./sales-manager";
import { dmSetterSop } from "./dm-setter";
import { inboundDialerSop } from "./inbound-dialer";
import { closerSop } from "./closer";

export type SopKey = SopDoc["key"];

export const SOP_DOCS: Record<SopKey, SopDoc> = {
  admin: adminSop,
  growth_ops: growthOpsSop,
  sales_manager: salesManagerSop,
  dm_setter: dmSetterSop,
  inbound_dialer: inboundDialerSop,
  closer: closerSop,
};

export const SOP_ORDER: SopKey[] = [
  "admin",
  "growth_ops",
  "sales_manager",
  "dm_setter",
  "inbound_dialer",
  "closer",
];

/** Maps a real membership role (memberships.role / useRole()'s `role`) to
 * the SOP a signed-in, non-dev-bypass user should see — the one and only
 * document their role can open. `owner` reads the admin SOP (owners are a
 * superset of admin access). `viewer` has no SOP of its own (not one of
 * the six roles this library was written for) and gets an honest
 * "not written yet" state rather than being silently shown someone else's. */
export function sopKeyForRealRole(role: Role | null): SopKey | null {
  switch (role) {
    case "owner":
    case "admin":
      return "admin";
    case "sales_manager":
      return "sales_manager";
    case "growth_ops":
      return "growth_ops";
    case "setter":
      return "dm_setter";
    case "inbound_dialer":
      return "inbound_dialer";
    case "closer":
      return "closer";
    default:
      return null;
  }
}
