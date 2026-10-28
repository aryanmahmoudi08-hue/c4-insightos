import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { Link2, PlugZap, ShieldCheck, Webhook } from "lucide-react";
import { TopBar } from "@/components/app-sidebar";
import { ConnectionsPanel } from "@/components/connections-panel";
import { SlimHeader } from "@/components/slim-header";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import {
  ALL_INTEGRATIONS,
  INTEGRATION_GROUPS,
  KIND_LABEL,
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

const KIND_TONE: Record<IntegrationKind, string> = {
  webhook: "var(--spectrum-cold-vivid)",
  oauth: "var(--spectrum-mid-vivid)",
  manual: "var(--warning-vivid)",
};

function KindPill({ kind }: { kind: IntegrationKind }) {
  return (
    <span
      className="delta-pill uppercase tracking-[0.08em]"
      style={{ "--pill-color": KIND_TONE[kind] } as CSSProperties}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function IntegrationsPage() {
  const { data: org } = useCurrentOrg();
  const { isAdmin } = useRole();
  const orgId = (org as { org_id?: string } | undefined)?.org_id;

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
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["webhook", counts.webhook, Webhook, "Push data in once connected here."],
              ["oauth", counts.oauth, ShieldCheck, "Authorised here; pulls on a schedule."],
              ["manual", counts.manual, Link2, "Real, but set up outside this page."],
            ] as const
          ).map(([kind, n, Icon, blurb]) => (
            <div
              key={kind}
              className="metric-card"
              style={{ "--chip-color": KIND_TONE[kind] } as CSSProperties}
            >
              <div className="flex items-center gap-2.5 px-4 pt-4">
                <span className="metric-chip" aria-hidden>
                  <Icon />
                </span>
                <span className="text-3xs font-semibold uppercase tracking-[0.09em] text-foreground/75">
                  {KIND_LABEL[kind]}
                </span>
              </div>
              <div className="px-4 pb-3 pt-2.5">
                <div className="font-sans text-[1.75rem] font-bold leading-none tabular-nums">
                  {n}
                </div>
                <div className="mt-1.5 text-2xs leading-snug text-muted-foreground">{blurb}</div>
              </div>
              <div className="mt-auto accent-rule" />
            </div>
          ))}
        </div>

        {/* The catalogue first, the live connectors below it. Someone opening
            this page usually wants to know whether a system is wired at all
            and what it brings in — connecting one is the rarer trip. */}
        {INTEGRATION_GROUPS.map((g) => (
          <section key={g.group} className="space-y-3">
            <SlimHeader
              icon={<PlugZap />}
              title={g.group}
              subtitle={g.blurb}
              accent={g.group === "Money" ? "success" : "accent"}
            />
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[46rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-3xs uppercase tracking-[0.12em] text-muted-foreground">
                    <th className="px-4 py-2.5 font-semibold">System</th>
                    <th className="px-4 py-2.5 font-semibold">How it connects</th>
                    <th className="px-4 py-2.5 font-semibold">What it brings in</th>
                    <th className="px-4 py-2.5 font-semibold">Lands on</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((i, idx) => (
                    <tr
                      key={i.id}
                      className={cn("align-top", idx > 0 && "border-t border-border/60")}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{i.name}</div>
                        <div className="mt-1.5">
                          <KindPill kind={i.kind} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-2xs leading-relaxed text-muted-foreground">
                        {i.setup}
                      </td>
                      <td className="px-4 py-3 text-2xs leading-relaxed text-muted-foreground">
                        {i.feeds}
                      </td>
                      <td className="px-4 py-3 text-2xs text-muted-foreground">{i.landsOn}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <section className="space-y-3">
          <SlimHeader
            icon={<Webhook />}
            title="Connect & disconnect"
            subtitle="The live state of every connector on this workspace"
          />
          {/* The same panel that used to live buried in Settings — one home
              for connections, next to the catalogue that explains them. */}
          <ConnectionsPanel orgId={orgId} isAdmin={isAdmin} />
        </section>
      </div>
    </>
  );
}
