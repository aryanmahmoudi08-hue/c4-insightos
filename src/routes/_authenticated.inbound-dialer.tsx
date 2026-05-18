import { createFileRoute } from "@tanstack/react-router";
import { ActivityModule } from "@/components/activity-module";

export const Route = createFileRoute("/_authenticated/inbound-dialer")({
  component: () => <ActivityModule role="inbound_dialer" title="Inbound Dialer" subtitle="Inbound phone response — pickup, qualify, set" />,
});
