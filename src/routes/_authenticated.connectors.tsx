import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Plug, CheckCircle2, Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { connectWorkspaceConnector, disconnectWorkspaceConnector } from "@/lib/connectors.functions";

export const Route = createFileRoute("/_authenticated/connectors")({ component: Connectors });

interface ConnectorRow { id: string; name: string; category: string; description: string | null; is_available: boolean; }
interface ConnectionRow { id: string; connector_id: string; state: string; display_name: string | null; config: Record<string, unknown> | null; }

type ConfigField = { key: string; label: string; placeholder: string; help: string; type?: "text" | "url" };

const connectorConfigFields: Record<string, ConfigField[]> = {
  typeform: [{ key: "formUrl", label: "Typeform URL", placeholder: "https://form.typeform.com/to/abc123", help: "Paste the exact form URL you want this connector to read.", type: "url" }],
  instagram: [{ key: "accountUrl", label: "Instagram profile URL", placeholder: "https://instagram.com/yourbrand", help: "Use the account that owns the content and DMs.", type: "url" }],
  tiktok: [{ key: "accountUrl", label: "TikTok profile URL", placeholder: "https://tiktok.com/@yourbrand", help: "Use the account you want analytics tied to.", type: "url" }],
  youtube: [{ key: "channelUrl", label: "YouTube channel URL", placeholder: "https://youtube.com/@yourchannel", help: "Use the channel URL for videos and shorts.", type: "url" }],
  stripe: [{ key: "accountLabel", label: "Stripe account name", placeholder: "Main Stripe account", help: "Name the payment account so reports know where revenue is coming from." }],
  calendly: [{ key: "schedulingUrl", label: "Calendly URL", placeholder: "https://calendly.com/yourteam/strategy-call", help: "Paste the event or scheduling page used for booked calls.", type: "url" }],
  gohighlevel: [{ key: "locationId", label: "GoHighLevel location ID", placeholder: "Enter location ID", help: "Use the location connected to contacts, pipelines, and calls." }],
  slack: [{ key: "channelName", label: "Slack channel", placeholder: "#sales-alerts", help: "Choose where alerts should be routed." }],
  discord: [{ key: "webhookUrl", label: "Discord webhook URL", placeholder: "https://discord.com/api/webhooks/...", help: "Paste the webhook for the channel receiving alerts.", type: "url" }],
  meta_ads: [{ key: "adAccountId", label: "Meta ad account ID", placeholder: "act_123456789", help: "Use the ad account that owns spend, CPL, and ROAS data." }],
};

function fieldsFor(connectorId: string) {
  return connectorConfigFields[connectorId] ?? [];
}

function isConfigured(conn: ConnectionRow | undefined, connectorId: string) {
  const fields = fieldsFor(connectorId);
  if (!conn || fields.length === 0) return true;
  return fields.every((field) => typeof conn.config?.[field.key] === "string" && String(conn.config[field.key]).trim().length > 0);
}

function Connectors() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const connectConnector = useServerFn(connectWorkspaceConnector);
  const disconnectConnector = useServerFn(disconnectWorkspaceConnector);

  const { data: registry } = useQuery({
    queryKey: ["connector-registry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("connector_registry").select("*").order("name");
      if (error) throw error;
      return data as ConnectorRow[];
    },
  });

  const { data: connections } = useQuery({
    queryKey: ["connector-connections", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connector_connections")
        .select("id, connector_id, state, display_name")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data as ConnectionRow[];
    },
  });

  const connect = useMutation({
    mutationFn: async (c: ConnectorRow) => {
      const result = await connectConnector({ data: { connectorId: c.id } });
      return result.name;
    },
    onSuccess: (name) => {
      toast.success(`${name} connected`);
      qc.invalidateQueries({ queryKey: ["current-org"] });
      qc.invalidateQueries({ queryKey: ["connector-connections"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not connect this connector"),
  });

  const disconnect = useMutation({
    mutationFn: async (conn: ConnectionRow) => {
      await disconnectConnector({ data: { connectorId: conn.connector_id } });
    },
    onSuccess: () => { toast.success("Disconnected"); qc.invalidateQueries({ queryKey: ["connector-connections"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not disconnect this connector"),
  });

  const stateFor = (cid: string) => (connections ?? []).find(c => c.connector_id === cid);

  return (
    <>
      <TopBar title="Platform Connectors" subtitle="Click a card to connect it to this workspace" />
      <div className="p-6 space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-sm font-semibold">All connectors enabled</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Click any connector below to attach it to your workspace. Each dashboard will pick up the connection automatically.
            You can also keep logging data manually via the <span className="text-foreground">Log day / Log call</span> buttons.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(registry ?? []).map((c) => {
            const conn = stateFor(c.id);
            const isConnected = conn?.state === "connected";
            const busy = (connect.isPending && connect.variables?.id === c.id) || (disconnect.isPending && disconnect.variables?.id === conn?.id);
            return (
              <div key={c.id} className={`rounded-lg border bg-card p-4 transition-colors ${isConnected ? "border-[color:var(--color-success)]/60" : "border-border hover:border-primary/40"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      <div className="font-semibold text-sm capitalize truncate">{c.name}</div>
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{c.category}</div>
                    {c.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                  </div>
                  {isConnected ? (
                    <span className="rounded bg-[color:var(--color-success)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-success)] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> connected
                    </span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">available</span>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  {isConnected ? (
                    <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => conn && disconnect.mutate(conn)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
                    </Button>
                  ) : (
                    <Button size="sm" className="w-full" disabled={busy} onClick={() => connect.mutate(c)}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {(!registry || registry.length === 0) && <div className="text-sm text-muted-foreground">Registry empty.</div>}
        </div>
      </div>
    </>
  );
}
