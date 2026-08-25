import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BarChart3,
  Eye,
  Heart,
  Layers3,
  Radio,
  Sparkles,
  Users,
  UserRound,
  Video,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { MECHANISMS, MECHANISM_KEYS, type MechanismKey } from "@/lib/content-mechanisms";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";
import { cn } from "@/lib/utils";

export type ContentCommandMetric = {
  captured_at?: string | null;
  views?: number | null;
  reach?: number | null;
  likes?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  followers_gained?: number | null;
  profile_visits?: number | null;
  dms_generated?: number | null;
  leads_generated?: number | null;
  calls_booked?: number | null;
  closes?: number | null;
  cash_collected_cents?: number | null;
  watch_time_seconds?: number | null;
  avg_watch_pct?: number | null;
  hook_retention_pct?: number | null;
  drop_off_rate_pct?: number | null;
  engagement_rate_pct?: number | null;
};

export type ContentCommandPiece = {
  id: string;
  title: string | null;
  hook?: string | null;
  platform: string;
  posted_at?: string | null;
  mechanism?: string | null;
  variation?: string | null;
  content_metrics?: ContentCommandMetric[] | null;
  url?: string | null;
};

export type ContentDemandSummary = {
  mix: Record<string, number>;
  insufficientData?: boolean;
  totalWeight?: number;
  minTotalWeight?: number;
  counts?: { faq: number; setter_calls: number; intakes: number; reels: number };
};

export type ContentWeeklySummary = {
  reels: number;
  missing: string[];
  untracked: number;
  best: string | null;
  worst: string | null;
  total: number;
};

type SortKey = "views" | "reach" | "engagement" | "cash";

type Props = {
  pieces: ContentCommandPiece[];
  demand?: ContentDemandSummary;
  weekly?: ContentWeeklySummary;
};

const fmt = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
const money = (cents: number) =>
  `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(cents / 100))}`;
const titleFor = (piece: ContentCommandPiece) => piece.title || piece.hook || "Untitled content";
const platformFor = (platform: string) => platform.replace(/_/g, " ");

function metricOf(piece: ContentCommandPiece) {
  return (
    [...(piece.content_metrics ?? [])].sort((a, b) =>
      String(b.captured_at ?? "").localeCompare(String(a.captured_at ?? "")),
    )[0] ?? {}
  );
}

function interactionsOf(metric: ContentCommandMetric) {
  return (metric.likes ?? 0) + (metric.comments ?? 0) + (metric.saves ?? 0) + (metric.shares ?? 0);
}

export function ContentCommandCenter({ pieces, demand, weekly }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const stats = useMemo(() => {
    const rows = pieces.map(metricOf);
    const totalViews = rows.reduce((sum, row) => sum + (row.views ?? 0), 0);
    const totalReach = rows.reduce((sum, row) => sum + (row.reach ?? 0), 0);
    const totalInteractions = rows.reduce((sum, row) => sum + interactionsOf(row), 0);
    const followersGained = rows.reduce((sum, row) => sum + (row.followers_gained ?? 0), 0);
    const profileVisits = rows.reduce((sum, row) => sum + (row.profile_visits ?? 0), 0);
    const leads = rows.reduce((sum, row) => sum + (row.leads_generated ?? 0), 0);
    const closes = rows.reduce((sum, row) => sum + (row.closes ?? 0), 0);
    const cash = rows.reduce((sum, row) => sum + (row.cash_collected_cents ?? 0), 0);
    const hasReach = rows.some((row) => row.reach != null && row.reach > 0);
    const hasFollowers = rows.some((row) => row.followers_gained != null);
    const retentionRows = rows.filter(
      (row) =>
        row.avg_watch_pct != null ||
        row.hook_retention_pct != null ||
        row.watch_time_seconds != null,
    );
    const averageWatchPct = retentionRows.length
      ? retentionRows.reduce(
          (sum, row) => sum + Number(row.avg_watch_pct ?? row.hook_retention_pct ?? 0),
          0,
        ) / retentionRows.length
      : null;

    const dayMap = new Map<
      string,
      { date: string; views: number; reach: number; interactions: number; followers: number }
    >();
    for (const piece of pieces) {
      const metrics = piece.content_metrics?.length ? piece.content_metrics : [metricOf(piece)];
      for (const metric of metrics) {
        const rawDate = metric.captured_at ?? piece.posted_at;
        if (!rawDate) continue;
        const date = rawDate.slice(0, 10);
        const existing = dayMap.get(date) ?? {
          date,
          views: 0,
          reach: 0,
          interactions: 0,
          followers: 0,
        };
        existing.views += metric.views ?? 0;
        existing.reach += metric.reach ?? 0;
        existing.interactions += interactionsOf(metric);
        existing.followers += metric.followers_gained ?? 0;
        dayMap.set(date, existing);
      }
    }
    const trend = [...dayMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map((row) => ({
        ...row,
        label: row.date.slice(5),
      }));

    const typeMap = new Map<string, number>();
    for (const piece of pieces)
      typeMap.set(
        platformFor(piece.platform),
        (typeMap.get(platformFor(piece.platform)) ?? 0) + (metricOf(piece).views ?? 0),
      );
    const types = [...typeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, views]) => ({ name, views }));

    return {
      totalViews,
      totalReach,
      totalInteractions,
      followersGained,
      profileVisits,
      leads,
      closes,
      cash,
      hasReach,
      hasFollowers,
      averageWatchPct,
      trend,
      types,
    };
  }, [pieces]);

  const sortedPieces = useMemo(
    () =>
      [...pieces]
        .sort((a, b) => {
          const left = metricOf(a);
          const right = metricOf(b);
          const value = (metric: ContentCommandMetric) => {
            if (sortKey === "reach") return metric.reach ?? -1;
            if (sortKey === "engagement")
              return metric.views ? (interactionsOf(metric) / metric.views) * 100 : -1;
            if (sortKey === "cash") return metric.cash_collected_cents ?? -1;
            return metric.views ?? -1;
          };
          return value(right) - value(left);
        })
        .slice(0, 6),
    [pieces, sortKey],
  );

  const mix = MECHANISM_KEYS.map((key) => ({
    key,
    label: MECHANISMS[key].label,
    value: demand?.mix?.[key] ?? 0,
  }));

  return (
    <section aria-labelledby="content-command-center-title" className="space-y-4">
      <div className="flex flex-col gap-3 border-l-2 border-spectrum-mid pl-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-spectrum-mid" /> ContentOS · unified intelligence
          </div>
          <h2
            id="content-command-center-title"
            className="display-serif mt-1 text-2xl tracking-tight md:text-3xl"
          >
            Content Command Center
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Performance, audience signals, retention, and content demand in one operating view.
            Existing Content Intelligence and Content Signals remain the source of truth.
          </p>
        </div>
        <Link
          to="/content-signals"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-muted/40 sm:self-auto"
        >
          Open signal engine <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <CommandKpi
          label="Total views"
          value={fmt(stats.totalViews)}
          sub="Tracked content"
          spectrum="cold"
          icon={<Eye className="h-4 w-4" />}
        />
        <CommandKpi
          label="Total reach"
          value={stats.hasReach ? fmt(stats.totalReach) : "—"}
          sub={stats.hasReach ? "Unique reach" : "Field not populated"}
          spectrum="cold"
          icon={<Radio className="h-4 w-4" />}
          muted={!stats.hasReach}
        />
        <CommandKpi
          label="Engagement rate"
          value={
            stats.totalViews > 0 && stats.totalInteractions > 0
              ? `${((stats.totalInteractions / stats.totalViews) * 100).toFixed(1)}%`
              : "—"
          }
          sub={`${fmt(stats.totalInteractions)} interactions`}
          spectrum="mid"
          icon={<Heart className="h-4 w-4" />}
          muted={stats.totalInteractions === 0}
        />
        <CommandKpi
          label="Avg views / post"
          value={pieces.length ? fmt(stats.totalViews / pieces.length) : "—"}
          sub={`${pieces.length} tracked pieces`}
          spectrum="mid"
          icon={<BarChart3 className="h-4 w-4" />}
          muted={!pieces.length}
        />
        <CommandKpi
          label="Followers gained"
          value={stats.hasFollowers ? fmt(stats.followersGained) : "—"}
          sub={stats.hasFollowers ? "From logged content" : "Field not populated"}
          spectrum="hot"
          icon={<UserRound className="h-4 w-4" />}
          muted={!stats.hasFollowers}
        />
        <CommandKpi
          label="Cash attributed"
          value={money(stats.cash)}
          sub={`${fmt(stats.leads)} leads · ${fmt(stats.closes)} closes`}
          spectrum="hot"
          icon={<Layers3 className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Content performance
              </div>
              <div className="mt-0.5 text-base font-semibold">
                Views, reach, and interactions over time
              </div>
            </div>
            <div className="hidden items-center gap-3 text-3xs text-muted-foreground sm:flex">
              <span className="flex items-center gap-1">
                <i className="h-1.5 w-1.5 rounded-full bg-spectrum-cold" />
                Views
              </span>
              {stats.hasReach && (
                <span className="flex items-center gap-1">
                  <i className="h-1.5 w-1.5 rounded-full bg-spectrum-mid" />
                  Reach
                </span>
              )}
            </div>
          </div>
          {stats.trend.length > 1 ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="contentViewsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SPECTRUM_VAR.cold} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={SPECTRUM_VAR.cold} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                    tickFormatter={(value) => fmt(value)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number, name: string) => [
                      fmt(value),
                      name === "views" ? "Views" : name === "reach" ? "Reach" : "Interactions",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="views"
                    name="views"
                    stroke={SPECTRUM_VAR.cold}
                    fill="url(#contentViewsFill)"
                    strokeWidth={2}
                  />
                  {stats.hasReach && (
                    <Area
                      type="monotone"
                      dataKey="reach"
                      name="reach"
                      stroke={SPECTRUM_VAR.mid}
                      fill="none"
                      strokeWidth={1.5}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<BarChart3 className="h-4 w-4" />}
              title="Build the performance trend"
              description="Log content metrics across more than one date to see daily views, reach, and interaction movement."
            />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Format mix
              </div>
              <div className="mt-0.5 text-base font-semibold">Views by content type</div>
            </div>
            <Video className="h-4 w-4 text-muted-foreground" />
          </div>
          {stats.types.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.types}
                  layout="vertical"
                  margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => fmt(value)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    width={78}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [fmt(value), "Views"]}
                  />
                  <Bar dataKey="views" fill={SPECTRUM_VAR.mid} radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<Video className="h-4 w-4" />}
              title="No formats tracked"
              description="Log a content piece to see which formats are earning distribution."
            />
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
            <div>
              <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Post-level performance
              </div>
              <div className="mt-0.5 text-base font-semibold">
                Top content in the current tracker
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["views", "reach", "engagement", "cash"] as SortKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSortKey(key)}
                  className={cn(
                    "rounded border px-2 py-1 text-3xs font-medium capitalize transition",
                    sortKey === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
          {sortedPieces.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[930px] text-sm">
                <thead className="bg-muted/20 text-3xs uppercase tracking-[0.12em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium md:px-5">Content</th>
                    <th className="px-3 py-3 text-right font-medium">Views</th>
                    <th className="px-3 py-3 text-right font-medium">Reach</th>
                    <th className="px-3 py-3 text-right font-medium">Engagement</th>
                    <th className="px-3 py-3 text-right font-medium">Watch / retention</th>
                    <th className="px-3 py-3 text-right font-medium">Replay</th>
                    <th className="px-4 py-3 text-right font-medium md:px-5">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPieces.map((piece) => {
                    const metric = metricOf(piece);
                    const engagement = metric.views
                      ? (interactionsOf(metric) / metric.views) * 100
                      : null;
                    const replay =
                      metric.reach && metric.reach > 0 && metric.views != null
                        ? metric.views / metric.reach
                        : null;
                    const watch =
                      metric.watch_time_seconds != null
                        ? `${metric.watch_time_seconds.toFixed(1)}s`
                        : metric.avg_watch_pct != null
                          ? `${metric.avg_watch_pct.toFixed(1)}%`
                          : metric.hook_retention_pct != null
                            ? `${metric.hook_retention_pct.toFixed(1)}%`
                            : "—";
                    return (
                      <tr
                        key={piece.id}
                        className="border-t border-border/70 transition hover:bg-muted/15"
                      >
                        <td className="max-w-[300px] px-4 py-3 md:px-5">
                          {piece.url ? (
                            <a
                              href={piece.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block max-w-full text-left"
                            >
                              <div className="truncate text-xs font-semibold hover:text-spectrum-mid">
                                {titleFor(piece)}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-3xs capitalize text-muted-foreground">
                                <span>{platformFor(piece.platform)}</span>
                                {piece.mechanism && <span>· {piece.mechanism}</span>}
                                <span>· open post ↗</span>
                              </div>
                            </a>
                          ) : (
                            <div className="block max-w-full text-left">
                              <div className="truncate text-xs font-semibold">
                                {titleFor(piece)}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-3xs capitalize text-muted-foreground">
                                <span>{platformFor(piece.platform)}</span>
                                {piece.mechanism && <span>· {piece.mechanism}</span>}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {fmt(metric.views ?? 0)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {metric.reach != null && metric.reach > 0 ? fmt(metric.reach) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {engagement != null && engagement > 0 ? `${engagement.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-xs">{watch}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                          {replay != null ? `${replay.toFixed(2)}×` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs md:px-5">
                          {money(metric.cash_collected_cents ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Eye className="h-4 w-4" />}
              title="No posts to rank"
              description="Log content and add metrics to build the post-level performance table."
            />
          )}
        </div>

        <SignalLayer demand={demand} weekly={weekly} mix={mix} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AvailabilityCard
          icon={<Users className="h-4 w-4" />}
          label="Audience snapshot"
          value="Not connected"
          detail="Followers, demographics, countries, and cities need an account-level source."
        />
        <AvailabilityCard
          icon={<Radio className="h-4 w-4" />}
          label="Stories"
          value="Not connected"
          detail="Active stories, story reach, replies, shares, and exits are not in the current tracker."
        />
        <AvailabilityCard
          icon={<BarChart3 className="h-4 w-4" />}
          label="Retention"
          value={
            stats.averageWatchPct != null ? `${stats.averageWatchPct.toFixed(1)}%` : "Not populated"
          }
          detail={
            stats.averageWatchPct != null
              ? "Average watch / hook retention from logged metrics."
              : "Add watch time or retention fields to enable this layer."
          }
        />
        <AvailabilityCard
          icon={<Sparkles className="h-4 w-4" />}
          label="Replay depth"
          value="Not connected"
          detail="Replay rate requires views divided by reach from a source that exposes both."
        />
      </div>
    </section>
  );
}

function CommandKpi({
  label,
  value,
  sub,
  spectrum,
  icon,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  spectrum: SpectrumPosition;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4 shadow-sm",
        muted && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <span>{label}</span>
        <span style={{ color: SPECTRUM_VAR[spectrum] }}>{icon}</span>
      </div>
      <div
        className="mt-3 font-mono text-2xl font-semibold tabular-nums"
        style={{ color: SPECTRUM_VAR[spectrum] }}
      >
        {value}
      </div>
      <div className="mt-1 text-3xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function AvailabilityCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background/45 p-4">
      <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-sm font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-3xs leading-relaxed text-muted-foreground">{detail}</div>
    </div>
  );
}

function SignalLayer({
  demand,
  weekly,
  mix,
}: {
  demand?: ContentDemandSummary;
  weekly?: ContentWeeklySummary;
  mix: { key: MechanismKey; label: string; value: number }[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-spectrum-mid" /> Content signals
          </div>
          <div className="mt-0.5 text-base font-semibold">What to post next</div>
        </div>
        <Link
          to="/content-signals"
          className="text-3xs text-muted-foreground hover:text-foreground"
        >
          Open full view →
        </Link>
      </div>
      {demand ? (
        <>
          <div className="mt-4 space-y-3">
            {mix.map((item) => (
              <div key={item.key}>
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span>{item.label}</span>
                  <span className="font-mono text-muted-foreground">{item.value}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, item.value))}%`,
                      background:
                        SPECTRUM_VAR[
                          item.key === "educational" || item.key === "relatability"
                            ? "cold"
                            : item.key === "credibility"
                              ? "mid"
                              : "hot"
                        ],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-3 text-3xs text-muted-foreground">
            <div>
              <span className="font-mono text-foreground">{weekly?.reels ?? 0}</span> reels this
              week
            </div>
            <div>
              <span className="font-mono text-foreground">{weekly?.untracked ?? 0}</span> untracked
            </div>
            <div>
              <span className="font-mono text-foreground">{weekly?.missing?.length ?? 0}</span>{" "}
              categories missing
            </div>
            <div>
              <span className="font-mono text-foreground">{demand.counts?.faq ?? 0}</span> FAQ
              signals
            </div>
          </div>
          {demand.insufficientData && (
            <div className="mt-3 rounded-lg border border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/[0.06] px-3 py-2 text-3xs text-[color:var(--color-warning)]">
              Limited data: this is a real computed mix, but the signal weight is below the
              workspace threshold.
            </div>
          )}
          {(weekly?.best || weekly?.worst) && (
            <div className="mt-3 rounded-lg border border-border/70 bg-background/40 px-3 py-2 text-3xs text-muted-foreground">
              <span className="text-[color:var(--color-success)]">
                Best:{" "}
                {weekly.best
                  ? (MECHANISMS[weekly.best as MechanismKey]?.label ?? weekly.best)
                  : "—"}
              </span>
              <span className="mx-2 text-border">·</span>
              <span className="text-[color:var(--color-warning)]">
                Needs attention:{" "}
                {weekly.worst
                  ? (MECHANISMS[weekly.worst as MechanismKey]?.label ?? weekly.worst)
                  : "—"}
              </span>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-4 w-4" />}
          title="Signal layer loading"
          description="The existing Content Signals engine will appear here when the workspace data is available."
        />
      )}
    </div>
  );
}
