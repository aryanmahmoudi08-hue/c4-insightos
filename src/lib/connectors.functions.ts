import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureWorkspaceForUser } from "./workspace.server";

const ConnectorInput = z.object({
  connectorId: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const connectorRequirements = {
  typeform: z.object({ formUrl: z.string().trim().url("Enter a valid Typeform URL").max(500) }),
  instagram: z.object({ accountUrl: z.string().trim().url("Enter a valid Instagram profile URL").max(500) }),
  tiktok: z.object({ accountUrl: z.string().trim().url("Enter a valid TikTok profile URL").max(500) }),
  youtube: z.object({ channelUrl: z.string().trim().url("Enter a valid YouTube channel URL").max(500) }),
  stripe: z.object({ accountLabel: z.string().trim().min(2, "Name this Stripe account").max(80) }),
  calendly: z.object({ schedulingUrl: z.string().trim().url("Enter a valid Calendly URL").max(500) }),
  gohighlevel: z.object({ locationId: z.string().trim().min(2, "Enter the GoHighLevel location ID").max(120) }),
  slack: z.object({ channelName: z.string().trim().min(1, "Enter a Slack channel").max(80) }),
  discord: z.object({ webhookUrl: z.string().trim().url("Enter a valid Discord webhook URL").max(500) }),
  meta_ads: z.object({ adAccountId: z.string().trim().min(2, "Enter the Meta ad account ID").max(120) }),
} as const;

function validateConnectorConfig(connectorId: string, rawConfig: Record<string, unknown>) {
  const schema = connectorRequirements[connectorId as keyof typeof connectorRequirements];
  if (!schema) return {};
  try {
    return schema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.issues[0]?.message ?? "Connector setup is incomplete");
    }
    throw error;
  }
}

async function getOrgId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.org_id) return data.org_id as string;
  const workspace = await ensureWorkspaceForUser(userId);
  return workspace.org_id;
}

export const connectWorkspaceConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    const config = validateConnectorConfig(data.connectorId, data.config);

    const { data: connector, error: connectorError } = await supabase
      .from("connector_registry")
      .select("id, name")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (connectorError) throw new Error(connectorError.message);
    if (!connector) throw new Error("Connector is not in the registry yet");

    const { data: existing, error: existingError } = await supabase
      .from("connector_connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("connector_id", data.connectorId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let connectionId = existing?.id as string | undefined;
    if (connectionId) {
      const { error } = await supabase
        .from("connector_connections")
        .update({ state: "connected", display_name: connector.name, config })
        .eq("id", connectionId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("connector_connections")
        .insert({ org_id: orgId, connector_id: data.connectorId, state: "connected", display_name: connector.name, config, created_by: userId })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted?.id) throw new Error("Connection was not created");
      connectionId = inserted.id;
    }

    const { data: syncRow, error: syncLookupError } = await supabase
      .from("connector_sync_status")
      .select("id")
      .eq("connection_id", connectionId)
      .eq("resource", "default")
      .limit(1)
      .maybeSingle();
    if (syncLookupError) throw new Error(syncLookupError.message);

    if (syncRow?.id) {
      const { error } = await supabase
        .from("connector_sync_status")
        .update({ org_id: orgId, state: "connected", last_error: null, last_sync_at: new Date().toISOString() })
        .eq("id", syncRow.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("connector_sync_status").insert({
        org_id: orgId,
        connection_id: connectionId,
        resource: "default",
        state: "connected",
        last_sync_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
    }

    return { name: connector.name as string };
  });

export const disconnectWorkspaceConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    const { error } = await supabase
      .from("connector_connections")
      .update({ state: "not_connected" })
      .eq("org_id", orgId)
      .eq("connector_id", data.connectorId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });