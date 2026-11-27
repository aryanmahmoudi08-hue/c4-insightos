import { createFileRoute } from "@tanstack/react-router";
import { ActivityModule } from "@/components/activity-module";
import { TrackedLinksPanelForCurrentOrg } from "@/components/tracked-links-panel";
import { DmClaimsPanel } from "@/components/dm-claims-panel";

/** Trackable links sit under the module rather than inside it: the EOD's
 * self-reported `links_sent` is rep-entered and range-scoped, this is a live
 * click count across all links, and interleaving the two would imply they
 * measure the same window. */
function DmSetterPage() {
  return (
    <>
      <ActivityModule
        role="dm_setter"
        title="DM Setter"
        subtitle="Per-rep daily DM outreach activity"
      />
      <div className="space-y-4 px-4 pb-6 md:px-6">
        <DmClaimsPanel />
        <TrackedLinksPanelForCurrentOrg />
      </div>
    </>
  );
}

export const Route = createFileRoute("/_authenticated/dm-setter")({
  component: DmSetterPage,
});
