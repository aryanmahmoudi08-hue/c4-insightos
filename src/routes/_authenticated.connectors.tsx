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
import { WebhookChannels } from "@/components/webhook-channels";

export const Route = createFileRoute("/_authenticated/connectors")({ component: Connectors });

interface ConnectorRow { id: string; name: string; category: string; description: string | null; is_available: boolean; }
interface ConnectionRow { id: string; connector_id: string; state: string; display_name: string | null; config: Record<string, unknown> | null; }

type ConfigField = { key: string; label: string; placeholder: string; help: string; type?: "text" | "url" };

const connectorConfigFields: Record<string, ConfigField[]> = {
  typeform: [
    { key: "formUrl", label: "Typeform URL", placeholder: "https://form.typeform.com/to/abc123", help: "Paste the exact form URL tied to onboarding.", type: "url" },
    { key: "webhookSecret", label: "Webhook secret", placeholder: "Create a secret in Typeform webhook settings", help: "This is used to verify Typeform submissions before they enter onboarding." },
  ],
  discord: [{ key: "webhookUrl", label: "Discord webhook URL", placeholder: "https://discord.com/api/webhooks/...", help: "This will be verified by sending a real test message to Discord.", type: "url" }],
  zapier: [
    { key: "webhookUrl", label: "Zapier Catch Hook URL", placeholder: "https://hooks.zapier.com/hooks/catch/...", help: "In Zapier, create a Zap with trigger 'Webhooks by Zapier → Catch Hook'. Paste the URL it gives you. Every app event will POST here so your Zap can fan out to Sheets, Discord, Gmail, etc.", type: "url" },
    { key: "label", label: "Label (optional)", placeholder: "EOD report fan-out", help: "Helpful when you have multiple Zaps." },
  ],
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
  const [setupConnector, setSetupConnector] = useState<ConnectorRow | null>(null);
  const [setupValues, setSetupValues] = useState<Record<string, string>>({});

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
        .select("id, connector_id, state, display_name, config")
        .eq("org_id", orgId!);
      if (error) throw error;
      return data as ConnectionRow[];
    },
  });

  const connect = useMutation({
    mutationFn: async ({ connector, config }: { connector: ConnectorRow; config: Record<string, string> }) => {
      const result = await connectConnector({ data: { connectorId: connector.id, config } });
      return (result as { name: string }).name;
    },
    onSuccess: (name) => {
      toast.success(`${name} connected`);
      setSetupConnector(null);
      setSetupValues({});
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
  const openSetup = (connector: ConnectorRow, conn?: ConnectionRow) => {
    const nextValues = Object.fromEntries(fieldsFor(connector.id).map((field) => [field.key, String(conn?.config?.[field.key] ?? "")])) as Record<string, string>;
    setSetupValues(nextValues);
    setSetupConnector(connector);
  };
  const submitSetup = () => {
    if (!setupConnector) return;
    connect.mutate({ connector: setupConnector, config: setupValues });
  };

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
            const configured = isConfigured(conn, c.id);
            const hasSetup = fieldsFor(c.id).length > 0;
            const canConnect = c.is_available && hasSetup;
            const busy = (connect.isPending && connect.variables?.connector.id === c.id) || (disconnect.isPending && disconnect.variables?.id === conn?.id);
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
                  {isConnected && configured ? (
                    <span className="rounded bg-[color:var(--color-success)]/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--color-success)] flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> connected
                    </span>
                  ) : isConnected ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">setup needed</span>
                  ) : canConnect ? (
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">available</span>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">credentials needed</span>
                  )}
                </div>
                {isConnected && hasSetup && (
                  <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    {configured ? String(conn?.config?.webhookUrl ?? "Verified connection saved") : "Add the required setup details to make this connector usable."}
                  </div>
                )}
                {!canConnect && !isConnected && (
                  <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    This is not a real one-click integration yet. It needs provider credentials or an app connector before it can be activated.
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {isConnected ? (
                    <>
                      {hasSetup && (
                        <Button size="sm" className="w-full" disabled={busy} onClick={() => openSetup(c, conn)}>
                          <Settings2 className="h-3.5 w-3.5" /> Setup
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => conn && disconnect.mutate(conn)}>
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" className="w-full" disabled={busy || !canConnect} onClick={() => openSetup(c, conn)}>
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
      <Dialog open={!!setupConnector} onOpenChange={(open) => !open && setSetupConnector(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{setupConnector ? `Set up ${setupConnector.name}` : "Set up connector"}</DialogTitle>
            <DialogDescription>Enter the required details so this connector knows exactly what software account, form, channel, or URL to use.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {setupConnector && fieldsFor(setupConnector.id).map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`connector-${field.key}`}>{field.label}</Label>
                <Input
                  id={`connector-${field.key}`}
                  type={field.type ?? "text"}
                  value={setupValues[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChange={(event) => setSetupValues((current) => ({ ...current, [field.key]: event.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{field.help}</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupConnector(null)}>Cancel</Button>
            <Button disabled={connect.isPending} onClick={submitSetup}>
              {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save and connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
