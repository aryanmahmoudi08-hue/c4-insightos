import { createFileRoute } from "@tanstack/react-router";
import { ActivityModule } from "@/components/activity-module";

export const Route = createFileRoute("/_authenticated/dm-setter")({
  component: () => <ActivityModule role="dm_setter" title="DM Setter" subtitle="Per-rep daily DM outreach activity" />,
});
