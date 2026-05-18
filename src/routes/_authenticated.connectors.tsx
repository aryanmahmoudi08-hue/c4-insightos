import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TopBar } from "@/components/app-sidebar";
import { Plug } from "lucide-react";

export const Route = createFileRoute("/_authenticated/connectors")({ component: Connectors });

function Connectors() {
  const { data } = useQuery({
    queryKey: ["connector-registry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("connector_registry").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  return (
    <>
      <TopBar title="Platform Connectors" subtitle="Native ingestion adapters" />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-semibold">All connectors enabled</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Every platform below is available for your workspace. Pick one to begin OAuth provisioning,
            or keep using manual entry via the <span className="text-foreground">Log day / Log call</span> buttons on each dashboard.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(data ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border border-border bg-card p-4 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-muted-foreground" />
                  <div className="font-semibold text-sm capitalize">{c.name}</div></div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{c.category}</div>
                {c.description && <p className="mt-2 text-xs text-muted-foreground">{c.description}</p>}
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${c.is_available ? "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]" : "bg-muted text-muted-foreground"}`}>
                {c.is_available ? "available" : "coming soon"}
              </span>
            </div>
          ))}
          {(!data || data.length === 0) && <div className="text-sm text-muted-foreground">Registry empty. Seeded on next migration.</div>}
        </div>
      </div>
    </>
  );
}
