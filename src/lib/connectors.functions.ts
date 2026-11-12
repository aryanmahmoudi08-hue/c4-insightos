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
      // A Calendly personal access token is a JWT and runs to about a
      // thousand characters; Calendly issues no shorter form. The old
      // max(500) could therefore never accept a real token, which made the
      // connector impossible to connect at all.
      //
      // The floor is 100 rather than 20 to catch the failure this field
      // actually sees: pasting the 64-character webhook signing key into
      // the token box. Both are opaque strings, the boxes sit next to each
      // other, and the resulting 401 at request time is far harder to trace
      // than a message here.
      .min(
        100,
        "That looks like the signing key, not the token — a Calendly personal access token is much longer and starts with eyJ",
      )
      .max(2000),
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
      // Name the field, and report every failing one rather than only the
      // first. Without this the UI can say a length is wrong but not which
      // of two adjacent secret boxes is wrong, which turns a typo into
      // several rounds of guessing.
      const described = error.issues.map((issue) => {
        const field = issue.path.filter((p) => typeof p === "string").join(".");
        return field ? `${field}: ${issue.message}` : issue.message;
      });
      throw new Error(described.join("; ") || "Connector setup is incomplete");
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

/**
 * Prove the Calendly token can actually talk to Calendly, before storing it.
 *
 * The token is not decoration: the webhook only carries a link to each
 * booking, so every booking's time is resolved by calling Calendly with
 * this token. A bad one fails at that point — hours later, per booking,
 * with the card still reading "Connected" — which is the same silent class
 * of failure as a webhook that was never registered.
 *
 * `/users/me` is the cheapest authenticated call Calendly offers and needs
 * no scope beyond the token itself.
 */
/** Connectors whose Connect step makes a live call to the provider and
 *  fails if the credential is rejected. Everything else is stored on trust,
 *  and `config.verifiedAt` must not claim otherwise. */
const VERIFIED_ON_CONNECT = new Set(["discord", "zapier", "calendly"]);

async function verifyCalendlyToken(apiToken: string) {
  let response: Response;
  try {
    response = await fetch("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
  } catch {
    // A network failure here is not the same as a bad token, and saying so
    // stops someone re-pasting a perfectly good credential.
    throw new Error(
      "Could not reach Calendly to check that token. Check your connection and try again.",
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      "Calendly rejected that token — check you copied the whole value from Integrations → API & webhooks → Personal access tokens.",
    );
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Calendly could not confirm that token [${response.status}]: ${body.slice(0, 200) || response.statusText}`,
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
    if (data.connectorId === "calendly") {
      await verifyCalendlyToken(validatedConfig.apiToken);
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
    // `verifiedAt` used to be stamped on every connector, including the ones
    // nothing checks — a timestamp asserting a verification that never
    // happened, which is worse than no field at all for anyone reading the
    // config later to decide whether a credential is good. It now appears
    // only when a live call to the provider actually succeeded; everything
    // else records when it was saved, which is all that is really known.
    const savedAt = new Date().toISOString();
    let config: Record<string, string> = {
      ...validatedConfig,
      ...(VERIFIED_ON_CONNECT.has(data.connectorId) ? { verifiedAt: savedAt } : { savedAt }),
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

/**
 * The form's questions and the slot mapping, for the mapping UI.
 *
 * `form_definition` is whatever the last webhook delivery carried, so this
 * returns nothing until the form has fired at least once — which is the
 * honest state: before a delivery, nobody knows what questions the form has.
 */
export const getTypeformFieldMap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    // `field_map` / `form_definition` are added by
    // 20261112160000_typeform_field_map and are not in the generated types
    // until those are regenerated against a database that has them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("connector_connections")
      .select("id, field_map, form_definition")
      .eq("org_id", orgId)
      .eq("connector_id", "typeform")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      connectionId: (data?.id as string) ?? null,
      fieldMap: (data?.field_map ?? {}) as Record<string, string>,
      formDefinition: data?.form_definition ?? null,
    };
  });

const FieldMapInput = z.object({
  // A slot key maps to a Typeform field ref, or to "" meaning deliberately
  // unmapped — Erika's form has no question about hours available, so `time`
  // has no honest source and clearing it has to be expressible.
  fieldMap: z.record(z.string().max(60), z.string().trim().max(120)),
});

export const saveTypeformFieldMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => FieldMapInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    // Drop the blanks rather than storing them: an absent key means "fall
    // back to matching", and an empty string would be a third state nothing
    // downstream knows how to read.
    const cleaned = Object.fromEntries(
      Object.entries(data.fieldMap).filter(([, ref]) => ref.trim().length > 0),
    );
    // `field_map` / `form_definition` are added by
    // 20261112160000_typeform_field_map and are not in the generated types
    // until those are regenerated against a database that has them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("connector_connections")
      .update({ field_map: cleaned })
      .eq("org_id", orgId)
      .eq("connector_id", "typeform");
    if (error) throw new Error(error.message);
    return { ok: true, mapped: Object.keys(cleaned).length };
  });
