import { createFileRoute } from "@tanstack/react-router";
import { SalesCrm } from "./_authenticated.sales";

export const Route = createFileRoute("/_authenticated/sales/")({
  component: SalesCrm,
});
