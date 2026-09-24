import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Check, Copy, RefreshCw, Unplug, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  connectWorkspaceConnector,
  disconnectWorkspaceConnector,
  getOrCreateConnectorEndpoint,
} from "@/lib/connectors.functions";
import { getOrCreateIngestToken, rotateIngestToken } from "@/lib/ingest.functions";
import { useAuth } from "@/hooks/use-auth";

type ConnectorRow = {
  connector_id: string;
  state: string;
  config: Record<string, unknown> | null;
};

/** One connector's real, org-specific state — never assumed connected just
 * because the backend logic exists. Read straight from connector_connections
 * (RLS-scoped to the caller's org), the same table connectWorkspaceConnector
 * writes. */
function useConnections(orgId?: string) {
  return useQuery({
    queryKey: ["connector-connections", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connector_connections")
        .select("connector_id, state, config")
        .eq("org_id", orgId!);
      if (error) throw new Error(error.message);
      return (data ?? []) as ConnectorRow[];
    },
  });
}

function StateBadge({ state }: { state?: string }) {
  const connected = state === "connected";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-2xs",
        connected
          ? "border-[color:var(--color-success)]/40 text-[color:var(--color-success)]"
          : "border-border text-muted-foreground",
      )}
    >
      {connected ? <Check className="h-3 w-3" /> : null}
      {connected ? "Connected" : "Not connected"}
    </Badge>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-2xs text-muted-foreground">{label}</Label>
      <div className="flex gap-1.5">
        <Input
          readOnly
          value={value}
          className="font-mono text-2xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied");
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

/** Inbound automation endpoint — the ONE thing every Zap/n8n flow you build
 * against this plan (leads, closer_call, dm_setter_day, inbound_dialer_day,
 * content_post, onboarding_response) points at. Same token/endpoint already
 * surfaced on the Event Bus page — repeated here so "Connections" is one
 * complete stop rather than sending you hunting across two settings pages. */
function IngestEndpointCard({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getOrCreateIngestToken);
  const rotateFn = useServerFn(rotateIngestToken);
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["ingest-token", orgId],
    enabled: !devBypass && !!orgId,
    queryFn: () => getFn({ data: { orgId: orgId! } }),
  });

  const rotate = useMutation({
    mutationFn: () => rotateFn({ data: { orgId: orgId! } }),
    onSuccess: (res) => {
      qc.setQueryData(["ingest-token", orgId], res);
      toast.success("Token rotated — update every Zap/automation using the old one");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const token = devBypass ? "dev-bypass-token" : (data?.token ?? "");
  const url = token ? `${origin}/api/public/ingest/${token}` : "";

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            Automation inbound endpoint
            <Badge
              variant="outline"
              className="gap-1 border-[color:var(--color-success)]/40 text-2xs text-[color:var(--color-success)]"
            >
              <Check className="h-3 w-3" /> Live
            </Badge>
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            The one URL every Zap, n8n flow, or automation should send data to.
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <p className="text-2xs text-muted-foreground">
            This endpoint already accepts five real event types —{" "}
            <code className="rounded bg-muted px-1">closer_call</code>,{" "}
            <code className="rounded bg-muted px-1">dm_setter_day</code>,{" "}
            <code className="rounded bg-muted px-1">inbound_dialer_day</code>,{" "}
            <code className="rounded bg-muted px-1">content_post</code>,{" "}
            <code className="rounded bg-muted px-1">onboarding_response</code> — point a Zap's
            webhook action at the URL below with a JSON body of{" "}
            <code className="rounded bg-muted px-1">{"{ event_type, data }"}</code>.
          </p>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <CopyField label="Endpoint URL" value={url} />
              {isAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => rotate.mutate()}
                  disabled={rotate.isPending || devBypass}
                >
                  {rotate.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Rotate token
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type FieldSpec = { key: string; label: string; placeholder: string; hint?: string };

const CONNECTOR_FIELDS: Record<string, FieldSpec[]> = {
  typeform: [
    {
      key: "formUrl",
      label: "Typeform form URL",
      placeholder: "https://yourname.typeform.com/to/AbCdEf",
    },
    {
      key: "webhookSecret",
      label: "Webhook secret (you choose this)",
      placeholder: "A random string, 12+ characters",
      hint: "Make one up — a password generator works fine. You'll paste this exact value into Typeform in step 2 below.",
    },
  ],
  discord: [
    {
      key: "webhookUrl",
      label: "Discord webhook URL",
      placeholder: "https://discord.com/api/webhooks/…",
      hint: "Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
    },
  ],
  zapier: [
    {
      key: "webhookUrl",
      label: "Zapier Catch Hook URL",
      placeholder: "https://hooks.zapier.com/hooks/catch/…",
      hint: 'In Zapier: create a Zap, add trigger "Webhooks by Zapier" → "Catch Hook", copy the URL it gives you.',
    },
    { key: "label", label: "Label (optional)", placeholder: "e.g. Close.io new lead" },
  ],
  stripe: [
    {
      key: "webhookSecret",
      label: "Webhook signing secret",
      placeholder: "whsec_…",
      hint: "You'll get this from Stripe in step 2 below — after you create the webhook endpoint, not before.",
    },
  ],
  whop: [
    {
      key: "webhookSecret",
      label: "Webhook secret",
      placeholder: "ws_…",
      hint: "Use it exactly as Whop shows it — don't strip the ws_ prefix or re-encode it.",
    },
  ],
  fanbasis: [
    {
      key: "webhookSecret",
      label: "Webhook secret_key",
      placeholder: "The secret_key Commas returned",
      hint: "You'll get this back from Commas in step 2 below, in the same API call that registers the webhook.",
    },
  ],
  wise: [
    {
      key: "publicKey",
      label: "Wise public key (PEM)",
      placeholder: "-----BEGIN PUBLIC KEY-----…",
      hint: "Copy the full key, including the BEGIN/END lines, from Wise's webhook signature docs.",
    },
  ],
  paypal: [
    {
      key: "webhookId",
      label: "Webhook ID",
      placeholder: "e.g. 8PT5...",
      hint: "Shown by PayPal right after you create the webhook — step 2 below.",
    },
    { key: "clientId", label: "REST API Client ID", placeholder: "From your PayPal app" },
    { key: "clientSecret", label: "REST API Secret", placeholder: "From your PayPal app" },
  ],
  close: [
    {
      key: "signatureKey",
      label: "Webhook signature_key",
      placeholder: "058bfb6a3d8cfdc4da7c3be5901b16ae…",
      hint: "Close returns this in the response when you create the webhook subscription in step 2 — it's a hex string, paste it exactly.",
    },
  ],
  webinarjam: [
    {
      key: "webhookSecret",
      label: "Bearer token (you choose this)",
      placeholder: "A random string, 12+ characters",
      hint: "Make one up — a password generator works fine. You'll paste this exact value into WebinarJam's custom webhook Authorization field in step 2 below.",
    },
  ],
};

const CONNECTOR_COPY: Record<string, { name: string; blurb: string; steps: string[] }> = {
  typeform: {
    name: "Typeform",
    blurb:
      "New form submissions land as real leads — application data, qualification notes, and automatic ticket-tier classification included.",
    steps: [
      "Fill in your form URL and make up a webhook secret below, then click Connect.",
      "Copy the webhook URL this app generates for you (appears once connected).",
      'In Typeform: your form → Connect → Webhooks → Add a webhook → paste that URL, and paste the SAME secret into Typeform\'s "Secret" field.',
      "Submit a test response on your form — it should appear in Legacy Leads within seconds.",
    ],
  },
  discord: {
    name: "Discord",
    blurb:
      "Real app events (new lead, call booked, deal closed, payment collected, weekly digest) post straight to a channel.",
    steps: [
      "In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
      "Paste it below and click Connect — this app sends one test message to confirm it's live.",
    ],
  },
  zapier: {
    name: "Zapier",
    blurb:
      "Fan real app events (new lead, call booked, deal closed, payment collected, weekly digest) out to any Zap — the other direction from the inbound endpoint below.",
    steps: [
      'In Zapier: new Zap → trigger "Webhooks by Zapier" → "Catch Hook" → copy the URL it shows you.',
      "Paste it below and click Connect — this app sends one test event so your Zap has real sample data to build from.",
    ],
  },
  stripe: {
    name: "Stripe",
    blurb:
      "Every successful (or failed) charge lands as a real payment — Total Cash Collected, the Payments ledger, and the Recovery Queue all start filling in from real data.",
    steps: [
      "Copy the webhook URL below — it's ready immediately, before you've connected anything.",
      "In Stripe: Developers → Webhooks → Add endpoint → paste that URL → select events charge.succeeded and charge.failed → Add endpoint.",
      'Stripe now shows you a signing secret starting with "whsec_" — copy it.',
      "Paste that secret below and click Connect.",
    ],
  },
  whop: {
    name: "Whop",
    blurb:
      "Every successful (or failed) membership/product payment lands as a real payment record.",
    steps: [
      "Copy the webhook URL below — it's ready immediately.",
      "In Whop: Developer → Webhooks → Create webhook → paste that URL → select events payment.succeeded and payment.failed.",
      'Whop shows you a secret starting with "ws_" — copy it exactly.',
      "Paste that secret below and click Connect.",
    ],
  },
  fanbasis: {
    name: "Fanbasis (Commas)",
    blurb:
      "Every successful (or failed) installment payment lands as a real payment record — this is the processor most coaching businesses run payment plans through.",
    steps: [
      "Copy the webhook URL below.",
      "Register it as a webhook subscription against the Commas API (POST /public-api/webhook-subscriptions) with that URL — this requires your own Commas API key, either via their dashboard if one exists or a direct API call.",
      "The response includes a secret_key — copy it.",
      "Paste that secret below and click Connect.",
    ],
  },
  wise: {
    name: "Wise",
    blurb:
      "Incoming balance credits (money received into your Wise account) land as real payments. Wise doesn't include a payer email on this event, so these always need manual client matching — flagged clearly wherever they show up.",
    steps: [
      "Copy the webhook URL below.",
      "In Wise: register a webhook subscription (Developer tools → Webhooks) for the balances#update event, pointed at that URL.",
      "Copy Wise's published public key (PEM format) for webhook signature verification from their developer docs — not a secret you generate, a fixed key Wise publishes.",
      "Paste that key below and click Connect.",
    ],
  },
  paypal: {
    name: "PayPal",
    blurb:
      "Every completed (or denied) capture lands as a real payment. PayPal verifies differently from the others — this app calls PayPal's own verification API using your REST app credentials rather than checking a signature locally.",
    steps: [
      "Copy the webhook URL below.",
      "In your PayPal Developer app: Webhooks → Add Webhook → paste that URL → select events PAYMENT.CAPTURE.COMPLETED and PAYMENT.CAPTURE.DENIED.",
      "Copy the Webhook ID PayPal shows you, plus your app's Client ID and Secret (same Developer app page).",
      "Paste all three below and click Connect.",
    ],
  },
  close: {
    name: "Close CRM",
    blurb:
      "One-way mirror: leads created or updated in Close appear here automatically. Close stays the system of record — AscendOS never writes back to it, and never changes a lead's status here from Close data.",
    steps: [
      "Copy the webhook URL below — it's ready immediately.",
      "Create a webhook subscription against the Close API (POST /api/v1/webhook/) pointed at that URL, subscribing to the lead object's created and updated events. This needs your own Close API key.",
      "The response includes a signature_key — copy it.",
      "Paste that key below and click Connect.",
    ],
  },
  webinarjam: {
    name: "WebinarJam",
    blurb:
      "Registration and attendance events start landing as real webinar data. Early stage: incoming events are captured verbatim for now while the exact field mapping gets confirmed against your first real delivery — see docs/ascendos-current-state.md for what's left before this reaches Webinar Analytics.",
    steps: [
      "Make up a bearer token below and click Connect (WebinarJam needs this before it can hand you anything back — same self-chosen-secret order as Typeform).",
      "Copy the webhook URL this app generates for you (appears once connected).",
      'In WebinarJam: Settings → Integrations → Custom Webhook → paste that URL, choose "Bearer Token" as the authentication method, and paste the SAME token into WebinarJam\'s Authorization field.',
      "Trigger one real registration or attendance event (or use WebinarJam's own test-send if their custom-webhook screen offers one) so the real payload shape can be confirmed.",
    ],
  },
};

const PRE_CONNECT_URL_CONNECTORS = new Set([
  "stripe",
  "whop",
  "fanbasis",
  "wise",
  "paypal",
  "close",
]);
/** Connectors whose secret is self-chosen up front (like Typeform) — their
 * webhook URL is only known AFTER connecting, generated from the new
 * connection's id, and shown back via `row.config.webhookUrl`. */
const POST_CONNECT_URL_CONNECTORS = new Set(["typeform", "webinarjam"]);

function ConnectorCard({
  connectorId,
  row,
  isAdmin,
  orgId,
}: {
  connectorId: keyof typeof CONNECTOR_FIELDS;
  row: ConnectorRow | undefined;
  isAdmin: boolean;
  orgId?: string;
}) {
  const qc = useQueryClient();
  const connectFn = useServerFn(connectWorkspaceConnector);
  const disconnectFn = useServerFn(disconnectWorkspaceConnector);
  const endpointFn = useServerFn(getOrCreateConnectorEndpoint);
  const copy = CONNECTOR_COPY[connectorId];
  const fields = CONNECTOR_FIELDS[connectorId];
  const connected = row?.state === "connected";
  const [open, setOpen] = useState(!connected);
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Every processor here except Typeform hands you its secret/ID only after
  // you've already created a webhook endpoint pointing at a real URL — the
  // opposite order from Typeform (self-chosen secret first), so their URL
  // has to be available before you're connected.
  const needsPreConnectUrl = PRE_CONNECT_URL_CONNECTORS.has(connectorId) && !connected;
  const {
    data: preConnectEndpoint,
    isLoading: preConnectLoading,
    isError: preConnectErrored,
  } = useQuery({
    queryKey: ["connector-endpoint", connectorId, orgId],
    enabled: needsPreConnectUrl && !!orgId && open,
    queryFn: () => endpointFn({ data: { connectorId } }),
    retry: false,
  });

  const connect = useMutation({
    mutationFn: () => connectFn({ data: { connectorId, config: draft } }),
    onSuccess: () => {
      toast.success(`${copy.name} connected`);
      qc.invalidateQueries({ queryKey: ["connector-connections", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: () => disconnectFn({ data: { connectorId, config: {} } }),
    onSuccess: () => {
      toast.success(`${copy.name} disconnected`);
      qc.invalidateQueries({ queryKey: ["connector-connections", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generatedWebhookUrl =
    POST_CONNECT_URL_CONNECTORS.has(connectorId) && row?.config?.webhookUrl
      ? String(row.config.webhookUrl)
      : undefined;

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            {copy.name}
            <StateBadge state={row?.state} />
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">{copy.blurb}</p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <ol className="list-inside list-decimal space-y-1 text-2xs text-muted-foreground">
            {copy.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>

          {connected && generatedWebhookUrl && (
            <CopyField
              label={`Webhook URL to paste into ${copy.name}`}
              value={generatedWebhookUrl}
            />
          )}

          {needsPreConnectUrl && preConnectLoading && (
            <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Generating your webhook URL…
            </div>
          )}
          {needsPreConnectUrl && preConnectErrored && (
            <p className="text-2xs text-destructive">
              Couldn't generate a webhook URL — reload the page and try again. If this keeps
              happening, you may not be signed in with a real session (dev bypass can't reach this).
            </p>
          )}
          {needsPreConnectUrl && preConnectEndpoint?.webhookUrl && (
            <CopyField
              label={`Webhook URL to paste into ${copy.name}`}
              value={preConnectEndpoint.webhookUrl}
            />
          )}

          {!connected && isAdmin && (
            <div className="space-y-2.5">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-2xs">{f.label}</Label>
                  <Input
                    value={draft[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    className="text-xs"
                  />
                  {f.hint && <p className="text-3xs text-muted-foreground">{f.hint}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            {!connected && isAdmin && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
              >
                {connect.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Connect
              </Button>
            )}
            {connected && isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unplug className="h-3.5 w-3.5" />
                )}
                Disconnect
              </Button>
            )}
            {!isAdmin && (
              <p className="text-2xs text-muted-foreground">
                Only workspace owners and admins can connect or disconnect integrations.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Real, org-scoped integration connections — every card here writes to the
 * same connector_connections/webhook_subscriptions tables the rest of the app
 * already reads from (dispatch.server.ts, the Typeform webhook handler). This
 * is genuinely the ONE settings surface that answers "how do I connect this
 * for a new client workspace": no code changes per client, just paste your
 * own account's credentials here. */
export function ConnectionsPanel({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { data: rows, isLoading } = useConnections(orgId);
  const byId = new Map((rows ?? []).map((r) => [r.connector_id, r]));

  return (
    <div className="space-y-3">
      <p className="text-2xs text-muted-foreground">
        Each card below is real — connecting one here writes a live row this workspace's own backend
        already reads from. This is per-workspace: a second client's workspace connects its own
        accounts here too, using the exact same cards, with no new code required.
      </p>
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-2.5">
          <ConnectorCard
            connectorId="whop"
            row={byId.get("whop")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="fanbasis"
            row={byId.get("fanbasis")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="wise"
            row={byId.get("wise")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="stripe"
            row={byId.get("stripe")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="paypal"
            row={byId.get("paypal")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="typeform"
            row={byId.get("typeform")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="zapier"
            row={byId.get("zapier")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="discord"
            row={byId.get("discord")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="webinarjam"
            row={byId.get("webinarjam")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <ConnectorCard
            connectorId="close"
            row={byId.get("close")}
            isAdmin={isAdmin}
            orgId={orgId}
          />
          <IngestEndpointCard orgId={orgId} isAdmin={isAdmin} />
        </div>
      )}
    </div>
  );
}
