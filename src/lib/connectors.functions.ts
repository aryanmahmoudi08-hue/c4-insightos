import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ConnectorInput = z.object({ connectorId: z.string().min(1).max(80) });

async function getOrgId(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.org_id) throw new Error("No workspace found for this account");
  return data.org_id as string;
}

export const connectWorkspaceConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);

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
        .update({ state: "connected", display_name: connector.name })
        .eq("id", connectionId)
        .eq("org_id", orgId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("connector_connections")
        .insert({ org_id: orgId, connector_id: data.connectorId, state: "connected", display_name: connector.name, created_by: userId })
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