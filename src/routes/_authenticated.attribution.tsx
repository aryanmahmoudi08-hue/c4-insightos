import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";

export const Route = createFileRoute("/_authenticated/attribution")({ component: Attribution });

function Attribution() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

  const { data } = useQuery({
    queryKey: ["attr", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [touches, leads, closed] = await Promise.all([
        supabase.from("lead_content_touches").select("id").eq("org_id", orgId!),
        supabase.from("leads").select("id, first_touch_content_id").eq("org_id", orgId!),
        supabase.from("calls").select("id, contract_value_cents, lead_id").eq("org_id", orgId!).eq("closed", true),
      ]);
      return {
        touches: touches.data?.length ?? 0,
        leads: leads.data?.length ?? 0,
        attributed: leads.data?.filter(l => l.first_touch_content_id).length ?? 0,
        closes: closed.data?.length ?? 0,
        cash: (closed.data ?? []).reduce((s,c) => s + (c.contract_value_cents ?? 0), 0),
      };
    },
  });

  return (
    <>
      <TopBar title="Lead Attribution" subtitle="Content → cash path" />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Touches Tracked" value={(data?.touches ?? 0).toLocaleString()} />
          <StatCard label="Leads" value={(data?.leads ?? 0).toLocaleString()} accent="accent" />
          <StatCard label="First-touch attributed" value={`${data?.attributed ?? 0} / ${data?.leads ?? 0}`} accent="primary" />
          <StatCard label="Closes" value={(data?.closes ?? 0).toLocaleString()} accent="success" />
          <StatCard label="Attributed Cash" value={"$" + Math.round((data?.cash ?? 0) / 100).toLocaleString()} accent="success" />
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-sm font-semibold mb-1">Path Sankey</div>
          <p className="text-xs text-muted-foreground">Full content → lead → call → cash Sankey visualizes once you have ingestion connectors firing <code className="font-mono">lead_content_touches</code> rows. Schema and event spine are ready.</p>
        </div>
      </div>
    </>
  );
}
