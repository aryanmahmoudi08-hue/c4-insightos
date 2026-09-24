import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { ensureWorkspaceForUser } from "./workspace.server";

const ConnectorInput = z.object({
  connectorId: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()).optional().default({}),
});

const connectorRequirements = {
  typeform: z.object({
    formUrl: z.string().trim().url("Enter a valid Typeform URL").max(500),
    webhookSecret: z
      .string()
      .trim()
      .min(12, "Use a Typeform webhook secret with at least 12 characters")
      .max(160),
  }),
  discord: z.object({
    webhookUrl: z.string().trim().url("Enter a valid Discord webhook URL").max(500),
  }),
  zapier: z.object({
    webhookUrl: z
      .string()
      .trim()
      .url("Paste the Catch Hook URL from your Zap")
      .max(500)
      .refine(
        (u) => /^https:\/\/hooks\.zapier\.com\/hooks\/catch\//.test(u),
        "Must be a Zapier Catch Hook URL (https://hooks.zapier.com/hooks/catch/...)",
      ),
    label: z.string().trim().max(80).optional(),
  }),
  stripe: z.object({
    webhookSecret: z
      .string()
      .trim()
      .min(12, "Use the real signing secret Stripe shows you — it starts with whsec_")
      .max(200),
  }),
  whop: z.object({
    webhookSecret: z
      .string()
      .trim()
      .regex(
        /^ws_/,
        "Whop's webhook secret starts with ws_ — use it exactly as shown, don't edit it",
      )
      .max(200),
  }),
  fanbasis: z.object({
    webhookSecret: z
      .string()
      .trim()
      .min(12, "Paste the secret_key Commas returned when you created the webhook subscription")
      .max(200),
  }),
  wise: z.object({
    publicKey: z
      .string()
      .trim()
      .includes("BEGIN PUBLIC KEY", {
        message: "Paste the full PEM public key Wise publishes for webhook verification",
      })
      .max(2000),
  }),
  paypal: z.object({
    webhookId: z
      .string()
      .trim()
      .min(8, "Paste the Webhook ID PayPal shows after you create the webhook")
      .max(80),
    clientId: z.string().trim().min(8, "Paste your PayPal REST API Client ID").max(200),
    clientSecret: z.string().trim().min(8, "Paste your PayPal REST API Secret").max(200),
    env: z.enum(["live", "sandbox"]).default("live"),
  }),
  calendly: z.object({
    signingKey: z
      .string()
      .trim()
      .min(8, "Paste the signing key returned when you created the webhook subscription")
      .max(200),
    apiToken: z
      .string()
      .trim()
      .min(
        20,
        "Paste a Calendly personal access token — the webhook only carries a link to each booking's time, so reading it needs API access",
      )
      .max(500),
  }),
  close: z.object({
    signatureKey: z
      .string()
      .trim()
      .regex(
        /^[0-9a-fA-F]+$/,
        "Close's signature_key is a hex string — paste it exactly as the subscription response returned it",
      )
      .min(32, "That looks too short to be Close's signature_key")
      .max(256),
  }),
  webinarjam: z.object({
    webhookSecret: z
      .string()
      .trim()
      .min(
        12,
        "Make up a random string, 12+ characters — you'll paste this exact value into WebinarJam's custom webhook Authorization field",
      )
      .max(200),
  }),
} as const;

function validateConnectorConfig(connectorId: string, rawConfig: Record<string, unknown>) {
  const schema = connectorRequirements[connectorId as keyof typeof connectorRequirements];
  if (!schema)
    throw new Error("This connector needs real provider credentials before it can be connected.");
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
    body: JSON.stringify({
      content: "Connector verified. App event alerts can be sent to this Discord channel.",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Discord rejected the webhook [${response.status}]: ${body || response.statusText}`,
    );
  }
}

async function verifyZapierWebhook(webhookUrl: string) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_type: "connector.verified",
      source: "lovable",
      timestamp: new Date().toISOString(),
      message: "Test event from Lovable — your Zap is connected.",
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Zapier rejected the webhook [${response.status}]: ${body || response.statusText}`,
    );
  }
}

async function getOrgId(supabase: SupabaseClient<Database>, userId: string) {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.org_id) return data.org_id as string;
  const workspace = await ensureWorkspaceForUser(userId);
  if (!workspace) throw new Error("No workspace — access not yet approved");
  return workspace.org_id;
}

/** Every connector where the provider hands you its secret/ID only AFTER
 * you've already registered a webhook pointing at a real URL — the reverse
 * order from Discord/Zapier (where you paste in a URL/secret you already
 * have) and Typeform (whose secret is self-chosen up front). All five of
 * these need a stable URL to exist before the real credential is known. */
const URL_BASED_CONNECTORS = new Set([
  "typeform",
  "stripe",
  "whop",
  "fanbasis",
  "wise",
  "paypal",
  "webinarjam",
  "close",
  "calendly",
]);

async function upsertDefaultSync(
  supabase: SupabaseClient<Database>,
  orgId: string,
  connectionId: string,
  state: "connected" | "error",
  lastError: string | null = null,
) {
  const { data: syncRow, error: syncLookupError } = await supabase
    .from("connector_sync_status")
    .select("id")
    .eq("connection_id", connectionId)
    .eq("resource", "default")
    .limit(1)
    .maybeSingle();
  if (syncLookupError) throw new Error(syncLookupError.message);

  const payload = {
    org_id: orgId,
    state,
    last_error: lastError,
    last_sync_at: new Date().toISOString(),
  };
  if (syncRow?.id) {
    const { error } = await supabase
      .from("connector_sync_status")
      .update(payload)
      .eq("id", syncRow.id);
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
    const validatedConfig = validateConnectorConfig(data.connectorId, data.config) as Record<
      string,
      string
    >;

    const { data: connector, error: connectorError } = await supabase
      .from("connector_registry")
      .select("id, name, is_available")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (connectorError) throw new Error(connectorError.message);
    if (!connector) throw new Error("Connector is not in the registry yet");
    if (!connector.is_available)
      throw new Error("This connector is not available as a real integration yet.");

    if (data.connectorId === "discord") {
      await verifyDiscordWebhook(validatedConfig.webhookUrl);
    }
    if (data.connectorId === "zapier") {
      await verifyZapierWebhook(validatedConfig.webhookUrl);
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
    let config: Record<string, string> = {
      ...validatedConfig,
      verifiedAt: new Date().toISOString(),
    };

    if (connectionId) {
      if (URL_BASED_CONNECTORS.has(data.connectorId)) {
        config = {
          ...config,
          webhookUrl: `${appOrigin()}/api/public/${data.connectorId}?connection_id=${connectionId}`,
        };
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
        .insert({
          org_id: orgId,
          connector_id: data.connectorId,
          state: "connected",
          display_name: connector.name,
          config,
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted?.id) throw new Error("Connection was not created");
      connectionId = inserted.id;
      if (URL_BASED_CONNECTORS.has(data.connectorId)) {
        config = {
          ...config,
          webhookUrl: `${appOrigin()}/api/public/${data.connectorId}?connection_id=${connectionId}`,
        };
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
          event_types: [
            "lead.created",
            "call.booked",
            "call.closed_won",
            "payment.collected",
            "onboarding.submitted",
            "alert.fired",
            "digest.weekly",
          ],
          active: true,
        });
      }
    }

    if (data.connectorId === "zapier") {
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
          name: validatedConfig.label || "Zapier fan-out",
          target_url: validatedConfig.webhookUrl,
          channel: "zapier",
          event_types: [
            "lead.created",
            "call.booked",
            "call.closed_won",
            "payment.collected",
            "onboarding.submitted",
            "alert.fired",
            "digest.weekly",
          ],
          active: true,
        });
      }
    }

    await upsertDefaultSync(supabase, orgId, connectionId, "connected");
    return { name: connector.name as string, config };
  });

/** Lazily creates (or reuses) the connector_connections row so a stable
 * webhook URL exists to show before the real secret/ID is known, without
 * marking the connector "connected" until connectWorkspaceConnector is
 * called with the real credential — see URL_BASED_CONNECTORS above. */
export const getOrCreateConnectorEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectorId: string }) => input)
  .handler(async ({ data, context }) => {
    if (!URL_BASED_CONNECTORS.has(data.connectorId)) {
      throw new Error("This connector doesn't use a generated webhook URL.");
    }
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);

    const { data: connector, error: connectorError } = await supabase
      .from("connector_registry")
      .select("id, is_available")
      .eq("id", data.connectorId)
      .maybeSingle();
    if (connectorError) throw new Error(connectorError.message);
    if (!connector?.is_available) throw new Error("This connector is not available yet.");

    const { data: existing, error: existingError } = await supabase
      .from("connector_connections")
      .select("id")
      .eq("org_id", orgId)
      .eq("connector_id", data.connectorId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let connectionId = existing?.id as string | undefined;
    if (!connectionId) {
      const { data: inserted, error } = await supabase
        .from("connector_connections")
        .insert({
          org_id: orgId,
          connector_id: data.connectorId,
          state: "not_connected",
          config: {},
          created_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!inserted?.id) throw new Error("Could not create connection");
      connectionId = inserted.id;
    }

    return {
      connectionId,
      webhookUrl: `${appOrigin()}/api/public/${data.connectorId}?connection_id=${connectionId}`,
    };
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
