import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ensureWorkspaceForUser } from "./workspace.server";

const ConnectorInput = z.object({
  connectorId: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const connectorRequirements = {
  typeform: z.object({
    formUrl: z.string().trim().url("Enter a valid Typeform URL").max(500),
    webhookSecret: z.string().trim().min(12, "Use a Typeform webhook secret with at least 12 characters").max(160),
  }),
  discord: z.object({
    webhookUrl: z.string().trim().url("Enter a valid Discord webhook URL").max(500),
  }),
} as const;

function validateConnectorConfig(connectorId: string, rawConfig: Record<string, unknown>) {
  const schema = connectorRequirements[connectorId as keyof typeof connectorRequirements];
  if (!schema) throw new Error("This connector needs real provider credentials before it can be connected.");
  try {
    return schema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(error.issues[0]?.message ?? "Connector setup is incomplete");
    }
    throw error;
  }
}

function appOrigin() {
  const request = getRequest();
  return request ? new URL(request.url).origin : "";
}

async function verifyDiscordWebhook(webhookUrl: string) {
  if (!/^https:\/\/(discord(app)?\.com)\/api\/webhooks\//.test(webhookUrl)) {
    throw new Error("Enter a real Discord webhook URL from Discord channel settings.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Connector verified. App event alerts can be sent to this Discord channel." }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord rejected the webhook [${response.status}]: ${body || response.statusText}`);
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

async function upsertDefaultSync(supabase: any, orgId: string, connectionId: string, state: "connected" | "error", lastError: string | null = null) {
  const { data: syncRow, error: syncLookupError } = await supabase
    .from("connector_sync_status")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("resource", "default")
    .limit(1)
    .maybeSingle();
  if (syncLookupError) throw new Error(syncLookupError.message);

  const payload = { org_id: orgId, state, last_error: lastError, last_sync_at: new Date().toISOString() };
  if (syncRow?.id) {
    const { error } = await supabase.from("connector_sync_status").update(payload).eq("id", syncRow.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("connector_sync_status").insert({
    ...payload,
    connection_id: connectionId,
    resource: "default",
  });
  if (error) throw new Error(error.message);
}

export const connectWorkspaceConnector = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ConnectorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    const validatedConfig = validateConnectorConfig(data.connectorId, data.config);

    const { data: connector, error: connectorError } = await supabase
      .from("connector_registry")
      .select("id, name, is_available")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (connectorError) throw new Error(connectorError.message);
    if (!connector) throw new Error("Connector is not in the registry yet");
    if (!connector.is_available) throw new Error("This connector is not available as a real integration yet.");

    if (data.connectorId === "discord") {
      await verifyDiscordWebhook(validatedConfig.webhookUrl);
    }

    const { data: existing, error: existingError } = await supabase
      .from("connector_connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("connector_id", data.connectorId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let connectionId = existing?.id as string | undefined;
    let config: Record<string, unknown> = { ...validatedConfig, verifiedAt: new Date().toISOString() };

    if (connectionId) {
      if (data.connectorId === "typeform") {
        config = { ...config, webhookUrl: `${appOrigin()}/api/public/typeform?connection_id=${connectionId}` };
      }
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
      if (data.connectorId === "typeform") {
        config = { ...config, webhookUrl: `${appOrigin()}/api/public/typeform?connection_id=${connectionId}` };
        const { error: updateError } = await supabase
          .from("connector_connections")
          .update({ config })
          .eq("id", connectionId)
          .eq("org_id", orgId);
        if (updateError) throw new Error(updateError.message);
      }
    }

    if (data.connectorId === "discord") {
      const { data: subscription } = await supabase
        .from("webhook_subscriptions")
        .select("id")
        .eq("org_id", orgId)
        .eq("target_url", validatedConfig.webhookUrl)
        .limit(1)
        .maybeSingle();
      if (!subscription?.id) {
        await supabase.from("webhook_subscriptions").insert({
          org_id: orgId,
          name: "Discord event alerts",
          target_url: validatedConfig.webhookUrl,
          channel: "discord",
          event_types: ["lead.created", "call.booked", "call.closed_won", "payment.collected", "onboarding.submitted", "alert.fired"],
          active: true,
        });
      }
    }

    await upsertDefaultSync(supabase, orgId, connectionId, "connected");
    return { name: connector.name as string, config };
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
