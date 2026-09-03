import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockAttributionPaths } from "@/lib/dev-mock-data";
import { evaluateAttributionEvidence } from "@/lib/acquisition";
import { TopBar } from "@/components/app-sidebar";
import { useDateRange } from "@/hooks/use-date-range";
import { StatCard } from "@/components/stat-card";
import { Route as RouteIcon, Plus } from "lucide-react";
import { GlassTableShell, FilterPills } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { Sankey, Tooltip, ResponsiveContainer, Rectangle, Layer } from "recharts";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/attribution")({ component: Attribution });

const money = (cents: number) => "$" + Math.round(cents / 100).toLocaleString();

function Attribution() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const { data } = useQuery({
    queryKey: ["attr", orgId, range.from, range.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      // Confirmed real conflict (found while adding the date-range regression
      // test below): a full devBypass short-circuit here would skip every
      // Supabase call, including the one that test verifies actually re-fires
      // with new range bounds. So the real requests still always fire — same
      // per-query mocking pattern team.tsx already established (some queries
      // mocked, the range-tested one left real) — only `paths` (which needs a
      // real session to read content_pieces/content_metrics) falls back to a
      // mock when the real join comes back empty under devBypass.
      const [touches, leads, closed, contentPaths] = await Promise.all([
        supabase
          .from("lead_content_touches")
          .select("id")
          .eq("org_id", orgId!)
          .gte("touched_at", fromISO)
          .lte("touched_at", toISO),
        supabase
          .from("leads")
          .select("id, first_touch_content_id")
          .eq("org_id", orgId!)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        supabase
          .from("calls")
          .select("id, contract_value_cents, cash_collected_cents, lead_id")
          .eq("org_id", orgId!)
          .eq("closed", true)
          .gte("created_at", fromISO)
          .lte("created_at", toISO),
        // Top performing content paths — inner-joins content_metrics so only
        // pieces with metrics logged inside the selected range are counted.
        supabase
          .from("content_pieces")
          .select(
            "id, title, platform, content_metrics!inner(views, leads_generated, closes, cash_collected_cents, captured_at)",
          )
          .eq("org_id", orgId!)
          .gte("content_metrics.captured_at", fromISO)
          .lte("content_metrics.captured_at", toISO)
          .limit(100),
      ]);

      // Aggregate per content
      const realPaths = (contentPaths.data ?? [])
        .map((c) => {
          const metrics = Array.isArray(c.content_metrics) ? c.content_metrics : [];
          const views = metrics.reduce((s: number, m) => s + (m.views ?? 0), 0);
          const leads = metrics.reduce((s: number, m) => s + (m.leads_generated ?? 0), 0);
          const closes = metrics.reduce((s: number, m) => s + (m.closes ?? 0), 0);
          const cash = metrics.reduce((s: number, m) => s + (m.cash_collected_cents ?? 0), 0);
          return {
            id: c.id,
            title: c.title ?? "(untitled)",
            platform: c.platform,
            views,
            leads,
            closes,
            cash,
          };
        })
        .filter((p) => p.cash > 0 || p.leads > 0)
        .sort((a, b) => b.cash - a.cash);
      const paths = devBypass && realPaths.length === 0 ? mockAttributionPaths() : realPaths;

      return {
        touches: touches.data?.length ?? 0,
        leads: leads.data?.length ?? 0,
        attributed: leads.data?.filter((l) => l.first_touch_content_id).length ?? 0,
        closes: closed.data?.length ?? 0,
        cash: (closed.data ?? []).reduce((s, c) => s + (c.contract_value_cents ?? 0), 0),
        cashCollected: (closed.data ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0),
        paths,
      };
    },
  });

  const attrRate = (data?.leads ?? 0) > 0 ? (data!.attributed / data!.leads) * 100 : 0;

  const platforms = useMemo(
    () => Array.from(new Set((data?.paths ?? []).map((p) => p.platform).filter(Boolean))).sort(),
    [data?.paths],
  );
  const filteredPaths = useMemo(
    () =>
      platformFilter === "all"
        ? (data?.paths ?? [])
        : (data?.paths ?? []).filter((p) => p.platform === platformFilter),
    [data?.paths, platformFilter],
  );

  // Content → Cash Sankey (Sales Tracking Part 5) — confirmed no Sankey/
  // alluvial component existed anywhere in this codebase; recharts already
  // ships one (this app's existing chart library), so this reuses it rather
  // than a hand-rolled river of styled divs or a new charting dependency.
  // Three-tier flow: top content pieces → their platform → total cash
  // collected, so filtering by platform above visibly reshapes the diagram.
  const sankeyData = useMemo(() => {
    const top = [...filteredPaths].sort((a, b) => b.cash - a.cash).slice(0, 8);
    if (top.length === 0) return null;
    const platformNames = Array.from(new Set(top.map((p) => String(p.platform ?? "unknown"))));
    const nodes = [
      ...top.map((p) => ({ name: p.title.length > 24 ? p.title.slice(0, 24) + "…" : p.title })),
      ...platformNames.map((pl) => ({ name: pl })),
      { name: "Cash Collected" },
    ];
    const platformIndex = (pl: string) => top.length + platformNames.indexOf(pl);
    const cashNodeIndex = nodes.length - 1;
    const links = [
      ...top.map((p, i) => ({
        source: i,
        target: platformIndex(p.platform ?? "unknown"),
        value: Math.max(1, Math.round(p.cash / 100)),
      })),
      ...platformNames.map((pl) => ({
        source: platformIndex(pl),
        target: cashNodeIndex,
        value: Math.max(
          1,
          Math.round(
            top.filter((p) => (p.platform ?? "unknown") === pl).reduce((s, p) => s + p.cash, 0) /
              100,
          ),
        ),
      })),
    ];
    return { nodes, links };
  }, [filteredPaths]);

  return (
    <>
      <TopBar title="Lead Attribution" subtitle="Content → lead → call → cash" showDateRange />
      <div className="p-6 space-y-6">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Content touches"
            value={(data?.touches ?? 0).toLocaleString()}
            spectrum="cold"
          />
          <StatCard label="Leads" value={(data?.leads ?? 0).toLocaleString()} spectrum="cold" />
          <StatCard
            label="Attributed"
            value={`${attrRate.toFixed(0)}%`}
            spectrum="mid"
            hint={`${data?.attributed ?? 0} of ${data?.leads ?? 0}`}
          />
          <StatCard label="Closes" value={(data?.closes ?? 0).toLocaleString()} spectrum="hot" />
          <StatCard
            label="Contract value"
            value={"$" + Math.round((data?.cash ?? 0) / 100).toLocaleString()}
            spectrum="hot"
          />
        </div>

        {platforms.length > 0 && (
          <FilterPills
            options={[
              { key: "all", label: "All platforms", count: (data?.paths ?? []).length },
              ...platforms.map((pl) => ({ key: pl, label: pl })),
            ]}
            value={platformFilter}
            onChange={setPlatformFilter}
          />
        )}

        {/* Content → Cash Sankey — the page's hero moment (B1), replacing the
            old hand-rolled div "river" with a real flow diagram (recharts'
            own Sankey, this app's existing chart library — no new dependency,
            no hand-rolled SVG). Reshapes live with the platform filter above. */}
        <BentoGrid cols={2} rowHeight="9.5rem">
          <BentoCell span="hero">
            <div className="hover-lift relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative mb-2">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Content → Cash Flow
                </div>
                <div className="display-serif mt-0.5 text-2xl">
                  Top content, by platform, into cash collected
                </div>
              </div>
              <div className="relative flex-1">
                {sankeyData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <Sankey
                      data={sankeyData}
                      nodePadding={20}
                      nodeWidth={10}
                      linkCurvature={0.5}
                      link={{ stroke: "var(--spectrum-hot)", strokeOpacity: 0.25 }}
                      node={<SankeyNodeLabel />}
                    >
                      <Tooltip formatter={(v: number) => money(v * 100)} />
                    </Sankey>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    icon={<RouteIcon className="h-4 w-4" />}
                    title="No attributed content yet"
                    description="Log content_metrics rows with leads_generated + cash_collected_cents to populate this."
                    action={
                      <Link to="/content" className="text-xs text-primary hover:underline">
                        Open Content →
                      </Link>
                    }
                  />
                )}
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        {/* Top content paths */}
        <GlassTableShell
          toolbar={
            <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
              Top revenue-driving content paths
            </div>
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-2xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">#</th>
                <th className="text-left p-3">Content</th>
                <th className="text-left p-3">Platform</th>
                <th className="text-right p-3 font-mono">Views</th>
                <th className="text-right p-3 font-mono">Leads</th>
                <th className="text-right p-3 font-mono">Closes</th>
                <th className="text-right p-3 font-mono">Cash</th>
                <th className="text-left p-3 w-52">Attribution confidence</th>
              </tr>
            </thead>
            <tbody>
              {filteredPaths.slice(0, 20).map((p, i) => {
                const w = Math.max(
                  4,
                  Math.round((p.cash / Math.max(1, filteredPaths[0].cash)) * 100),
                );
                const evidence = evaluateAttributionEvidence({
                  model: "first_touch",
                  supportingEvents: ["content_metrics"],
                  sampleSize: p.closes,
                  directOutcomeLinked: false,
                  drilldownKey: p.id,
                });
                return (
                  <tr key={p.id} className="border-t border-border/70 hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium">{p.title}</td>
                    <td className="p-3 text-xs uppercase">{p.platform}</td>
                    <td className="p-3 text-right font-mono">{p.views.toLocaleString()}</td>
                    <td className="p-3 text-right font-mono text-spectrum-cold">{p.leads}</td>
                    <td className="p-3 text-right font-mono text-spectrum-mid">{p.closes}</td>
                    <td className="p-3 text-right font-mono text-spectrum-hot">
                      ${Math.round(p.cash / 100).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-3xs uppercase tracking-wider">
                          <span className="text-spectrum-hot">{evidence.coverage}</span>
                          <span className="text-muted-foreground">
                            {evidence.model.replaceAll("_", " ")}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-spectrum-hot" style={{ width: `${w}%` }} />
                        </div>
                        <div className="text-3xs text-muted-foreground">
                          {evidence.knownTouchpoints} known touchpoint
                          {evidence.knownTouchpoints === 1 ? "" : "s"}
                          {evidence.sampleWarning ? ` · ${evidence.sampleWarning}` : ""}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPaths.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<RouteIcon className="h-4 w-4" />}
                      title={
                        platformFilter === "all"
                          ? "No attributed content yet"
                          : `No attributed content for ${platformFilter}`
                      }
                      description="Log content_metrics rows with leads_generated + cash_collected_cents to populate this."
                      action={
                        platformFilter !== "all" ? (
                          <button
                            onClick={() => setPlatformFilter("all")}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Plus className="h-3 w-3 rotate-45" /> Clear filter
                          </button>
                        ) : (
                          <Link to="/content" className="text-xs text-primary hover:underline">
                            Open Content →
                          </Link>
                        )
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>
      </div>
    </>
  );
}

/** Custom Sankey node — recharts' default node has no text, just a bare
 * rectangle; this labels each node with its name so the diagram is readable
 * without a legend.
 *
 * Confirmed real bug while verifying: recharts' Sankey does NOT pass a
 * `containerWidth` prop to custom node renderers (only x/y/width/height/
 * index/payload — checked against the installed recharts source directly),
 * so a `containerWidth`-based side heuristic always evaluated against
 * `undefined` and silently clipped the terminal "Cash Collected" label off
 * the right edge. Fixed by keying the label side off the known terminal
 * node name instead of a prop that was never actually there. */
function SankeyNodeLabel(props: unknown) {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: { name: string };
  };
  const isOut = payload.name === "Cash Collected";
  return (
    <Layer>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill="var(--spectrum-hot)"
        fillOpacity={0.8}
      />
      <text
        x={isOut ? x - 6 : x + width + 6}
        y={y + height / 2}
        textAnchor={isOut ? "end" : "start"}
        dominantBaseline="middle"
        className="fill-foreground text-[10px]"
      >
        {payload.name}
      </text>
    </Layer>
  );
}
