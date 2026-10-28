import { createFileRoute } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import {
  CalendarDays,
  CreditCard,
  FileText,
  Link2,
  MessageSquare,
  Megaphone,
  Plug,
  PlugZap,
  Send,
  ShieldCheck,
  Video,
  Wallet,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { TopBar } from "@/components/app-sidebar";
import {
  ConnectorCard,
  IngestEndpointCard,
  MetaConnectorCard,
  useConnections,
} from "@/components/connections-panel";
import { SlimHeader } from "@/components/slim-header";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import {
  ALL_INTEGRATIONS,
  INTEGRATION_GROUPS,
  KIND_LABEL,
  type Integration,
  type IntegrationKind,
} from "@/lib/integrations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/integrations")({
  component: IntegrationsPage,
  head: () => ({
    meta: [
      { title: "Integrations | AscendOS" },
      {
        name: "description",
        content:
          "Every outside system AscendOS reads from or writes to — what it feeds, where it lands, and how it is connected.",
      },
    ],
  }),
});

/** A glyph per system. Not the vendor's logo — see `brand` in
 *  lib/integrations.ts for why — but the mark is the vendor's own colour,
 *  so the grid still scans by brand rather than by reading every name. */
const GLYPH: Record<string, LucideIcon> = {
  typeform: FileText,
  calendly: CalendarDays,
  close: MessageSquare,
  google_forms: FileText,
  stripe: CreditCard,
  whop: Wallet,
  fanbasis: Wallet,
  paypal: Wallet,
  wise: Wallet,
  meta: Megaphone,
  webinarjam: Video,
  wistia: Video,
  twilio: MessageSquare,
  discord: Send,
  zapier: Zap,
  custom_webhook: Webhook,
};

const KIND_TONE: Record<IntegrationKind, string> = {
  webhook: "var(--spectrum-cold-vivid)",
  oauth: "var(--spectrum-mid-vivid)",
  manual: "var(--warning-vivid)",
};

/** Which ids the live connector panel can actually connect. Everything else
 *  in the catalogue is real but configured elsewhere, and says so instead of
 *  offering a button that does nothing. */
const CONNECTABLE = new Set([
  "typeform",
  "calendly",
  "close",
  "stripe",
  "whop",
  "fanbasis",
  "paypal",
  "wise",
  "webinarjam",
  "discord",
  "zapier",
]);

function IntegrationCard({
  item,
  connected,
  isAdmin,
  orgId,
  row,
}: {
  item: Integration;
  connected: boolean;
  isAdmin: boolean;
  orgId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any;
}) {
  const [open, setOpen] = useState(false);
  const Icon = GLYPH[item.id] ?? Plug;
  const canConnect = CONNECTABLE.has(item.id) || item.id === "meta";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-card p-4 transition-colors",
        connected ? "border-[color:var(--success-vivid)]/45" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[0.7rem] text-white shadow-sm"
          style={{ background: item.brand }}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{item.name}</span>
            {connected ? (
              <span
                className="delta-pill"
                style={{ "--pill-color": "var(--success-vivid)" } as CSSProperties}
              >
                Connected
              </span>
            ) : (
              <span
                className="delta-pill uppercase tracking-[0.08em]"
                style={{ "--pill-color": KIND_TONE[item.kind] } as CSSProperties}
              >
                {KIND_LABEL[item.kind]}
              </span>
            )}
          </div>
          <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{item.feeds}</p>
          <p className="mt-1 text-3xs text-muted-foreground/70">Lands on {item.landsOn}</p>
        </div>
        {canConnect && isAdmin && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors",
              open
                ? "border-border bg-muted text-foreground"
                : "border-border bg-background text-foreground hover:border-foreground/30",
            )}
          >
            {open ? "Close" : connected ? "Manage" : "Connect"}
          </button>
        )}
      </div>

      {/* The connect form lives in the card rather than in a panel further
          down the page — the setup instructions and the fields they refer
          to belong in the same place. */}
      {open && canConnect && (
        <div className="mt-3 border-t border-border/70 pt-3">
          {item.id === "meta" ? (
            <MetaConnectorCard row={row} isAdmin={isAdmin} />
          ) : (
            <ConnectorCard
              connectorId={item.id as never}
              row={row}
              isAdmin={isAdmin}
              orgId={orgId}
            />
          )}
        </div>
      )}

      {!canConnect && (
        <p className="mt-3 border-t border-border/70 pt-3 text-2xs leading-relaxed text-muted-foreground">
          {item.setup}
        </p>
      )}
    </div>
  );
}

function IntegrationsPage() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;
  const { data: rows = [] } = useConnections(orgId);
  const byId = new Map(rows.map((r) => [r.connector_id, r]));

  const connectedCount = ALL_INTEGRATIONS.filter(
    (i) => byId.get(i.id)?.state === "connected",
  ).length;
  const counts = {
    webhook: ALL_INTEGRATIONS.filter((i) => i.kind === "webhook").length,
    oauth: ALL_INTEGRATIONS.filter((i) => i.kind === "oauth").length,
    manual: ALL_INTEGRATIONS.filter((i) => i.kind === "manual").length,
  };

  return (
    <>
      <TopBar
        title="Integrations"
        subtitle="Every outside system this workspace reads from or writes to."
      />
      <div className="space-y-6 p-4 md:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["Connected", connectedCount, ShieldCheck, "var(--success-vivid)", "Live right now."],
              [
                "Webhook",
                counts.webhook,
                Webhook,
                KIND_TONE.webhook,
                "Push data in once connected here.",
              ],
              [
                "OAuth",
                counts.oauth,
                PlugZap,
                KIND_TONE.oauth,
                "Authorised here; pulls on a schedule.",
              ],
              [
                "Manual setup",
                counts.manual,
                Link2,
                KIND_TONE.manual,
                "Real, but configured elsewhere.",
              ],
            ] as const
          ).map(([label, n, Icon, tone, blurb]) => (
            <div
              key={label}
              className="metric-card"
              style={{ "--chip-color": tone } as CSSProperties}
            >
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <span className="metric-chip" aria-hidden>
                  <Icon />
                </span>
                <span className="text-3xs font-semibold uppercase tracking-[0.09em] text-foreground/75">
                  {label}
                </span>
              </div>
              <div className="px-4 pb-3 pt-2.5">
                <div className="font-sans text-[1.75rem] font-bold leading-none tabular-nums">
                  {n}
                </div>
                <div className="mt-1.5 text-2xs leading-snug text-muted-foreground">{blurb}</div>
              </div>
              <div className="accent-rule mt-auto" />
            </div>
          ))}
        </div>

        {INTEGRATION_GROUPS.map((g) => (
          <section key={g.group} className="space-y-3">
            <SlimHeader
              icon={<PlugZap />}
              title={`${g.group} · ${g.items.length}`}
              subtitle={g.blurb}
              accent={g.group === "Money" ? "success" : "accent"}
            />
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {g.items.map((item) => (
                <IntegrationCard
                  key={item.id}
                  item={item}
                  connected={byId.get(item.id)?.state === "connected"}
                  isAdmin={isAdmin}
                  orgId={orgId}
                  row={byId.get(item.id)}
                />
              ))}
            </div>
          </section>
        ))}

        <section className="space-y-3">
          <SlimHeader
            icon={<Webhook />}
            title="Generic ingest endpoint"
            subtitle="For Google Forms and anything else that can POST JSON"
          />
          <IngestEndpointCard orgId={orgId} isAdmin={isAdmin} />
        </section>
      </div>
    </>
  );
}
