import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockHubMetrics } from "@/lib/dev-mock-data";
import { useDateRange } from "@/hooks/use-date-range";
import { Sparkline } from "@/components/sparkline";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { Eye, PlayCircle, PhoneCall, FileText, Trophy, Gauge, Users, ArrowUpRight, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
const rate = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

/** Question fields we expect on a Typeform application — drives completion + quality scoring. */
const APP_FIELDS = [
  "experience", "work_school", "focus", "goal", "contact", "handle",
  "candidate_fit", "serious_status", "time", "income", "capital", "credit", "commitment",
];

export function HubMetrics() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const { range } = useDateRange();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["hub-metrics", orgId, range.from, range.to, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      // Same rationale as the main exec-dashboard query — no real session, so skip straight to mock data.
      if (devBypass) return mockHubMetrics();

      const fromISO = `${range.from}T00:00:00`;
      const toISO = `${range.to}T23:59:59`;

      const [acts, vsls, leads, calls, wins, clientsRes] = await Promise.all([
        supabase.from("setter_activity")
          .select("activity_date, role, dials, connections, links_sent, leads_contacted, qualified_convos, sets, calls_on_calendar, live_calls, closes")
          .eq("org_id", orgId!).gte("activity_date", range.from).lte("activity_date", range.to),
        supabase.from("vsl_metric_snapshots")
          .select("captured_at, page_loads, total_plays, unique_viewers, play_rate, avg_percent_watched")
          .eq("org_id", orgId!).gte("captured_at", fromISO).lte("captured_at", toISO)
          .order("captured_at", { ascending: true }),
        supabase.from("leads")
          .select("id, created_at, application_data, intent_score, priority, pipeline_stage, precall_video_watched")
          .eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("calls")
          .select("showed, closed, offer_made, scheduled_for, created_at")
          .eq("org_id", orgId!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("daily_wins")
          .select("win_date, win_types, financial_amount_cents, energy_score")
          .eq("org_id", orgId!).gte("win_date", range.from).lte("win_date", range.to),
        supabase.from("clients").select("id, status").eq("org_id", orgId!),
      ]);

      const actList = acts.data ?? [];
      const dials = actList.reduce((s, a) => s + (a.dials ?? 0), 0);
      const connections = actList.reduce((s, a) => s + (a.connections ?? 0), 0);
      const contacted = actList.reduce((s, a) => s + (a.leads_contacted ?? 0), 0);
      const qualified = actList.reduce((s, a) => s + (a.qualified_convos ?? 0), 0);
      const linksSent = actList.reduce((s, a) => s + (a.links_sent ?? 0), 0);

      const vslList = vsls.data ?? [];
      const visits = vslList.reduce((s, v) => s + (v.page_loads ?? 0), 0);
      const plays = vslList.reduce((s, v) => s + (v.total_plays ?? 0), 0);
      const viewers = vslList.reduce((s, v) => s + (v.unique_viewers ?? 0), 0);
      const engagementVals = vslList.map(v => Number(v.avg_percent_watched ?? 0)).filter(n => n > 0);
      const engagement = engagementVals.length ? engagementVals.reduce((s, n) => s + n, 0) / engagementVals.length : 0;

      const leadList = leads.data ?? [];
      const apps = leadList.filter(l => l.application_data && Object.keys(l.application_data as object).length > 0);
      const completion = apps.length
        ? apps.reduce((s, l) => {
            const d = (l.application_data ?? {}) as Record<string, unknown>;
            const filled = APP_FIELDS.filter(k => String(d[k] ?? "").trim().length > 0).length;
            const answered = filled || Object.values(d).filter(v => String(v ?? "").trim().length > 0).length;
            return s + Math.min(1, answered / APP_FIELDS.length);
          }, 0) / apps.length
        : 0;
      // Quality 1–5: intent score when present, else completeness + diamond priority.
      const quality = apps.length
        ? apps.reduce((s, l) => {
            const intent = Number(l.intent_score ?? 0);
            if (intent > 0) return s + Math.max(1, Math.min(5, intent > 5 ? intent / 20 : intent));
            const d = (l.application_data ?? {}) as Record<string, unknown>;
            const answered = Object.values(d).filter(v => String(v ?? "").trim().length > 0).length;
            const base = 1 + Math.min(3, (answered / APP_FIELDS.length) * 3);
            return s + base + (l.priority === "diamond" ? 1 : 0);
          }, 0) / apps.length
        : 0;
      const precallWatched = leadList.filter(l => l.precall_video_watched).length;

      const callList = calls.data ?? [];
      const booked = callList.length;
      const showed = callList.filter(c => c.showed).length;
      const closed = callList.filter(c => c.closed).length;

      const winList = wins.data ?? [];
      const financialWins = winList.filter(w => (w.win_types ?? []).includes("financial")).length;
      const winCash = winList.reduce((s, w) => s + (w.financial_amount_cents ?? 0), 0);
      const energyVals = winList.map(w => Number(w.energy_score ?? 0)).filter(n => n > 0);
      const avgEnergy = energyVals.length ? energyVals.reduce((s, n) => s + n, 0) / energyVals.length : 0;

      const clientList = clientsRes.data ?? [];
      const activeClients = clientList.filter(c => c.status === "active").length;

      // Sparklines
      const dayKeys = [...new Set(actList.map(a => a.activity_date))].sort();
      const dialSpark = dayKeys.map(d => actList.filter(a => a.activity_date === d).reduce((s, a) => s + (a.dials ?? 0), 0));
      const visitSpark = vslList.map(v => v.page_loads ?? 0);
      const playSpark = vslList.map(v => v.total_plays ?? 0);
      const appSpark = (() => {
        const map = new Map<string, number>();
        for (const l of apps) {
          const k = String(l.created_at).slice(0, 10);
          map.set(k, (map.get(k) ?? 0) + 1);
        }
        return [...map.keys()].sort().map(k => map.get(k)!);
      })();

      return {
        dials, connections, contacted, qualified, linksSent,
        visits, plays, viewers, engagement,
        apps: apps.length, leads: leadList.length, completion, quality, precallWatched,
        booked, showed, closed,
        wins: winList.length, financialWins, winCash, avgEnergy,
        activeClients,
        dialSpark, visitSpark, playSpark, appSpark,
      };
    },
  });

  const d = data;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => <BandSkeleton key={i} />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-destructive">Couldn't load operating metrics</div>
          <div className="text-xs text-muted-foreground truncate">{error instanceof Error ? error.message : "Unknown error"}</div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <Band
        icon={<Eye className="h-3.5 w-3.5" />}
        title="Traffic → VSL"
        to="/vsl"
        tiles={[
          { label: "VSL page visits", value: fmt(d?.visits ?? 0), spark: d?.visitSpark },
          { label: "VSL plays", value: fmt(d?.plays ?? 0), spark: d?.playSpark },
          { label: "Play rate", value: rate(d?.plays ?? 0, d?.visits ?? 0), tone: "accent" },
          { label: "Engagement rate", value: d?.engagement ? `${d.engagement.toFixed(1)}%` : "—", tone: (d?.engagement ?? 0) >= 50 ? "success" : "warning" },
          { label: "Unique viewers", value: fmt(d?.viewers ?? 0) },
        ]}
      />

      <Band
        icon={<FileText className="h-3.5 w-3.5" />}
        title="Applications"
        to="/leads"
        tiles={[
          { label: "Applications submitted", value: fmt(d?.apps ?? 0), spark: d?.appSpark },
          { label: "Completion rate", value: d?.completion ? `${(d.completion * 100).toFixed(0)}%` : "—", tone: (d?.completion ?? 0) >= 0.8 ? "success" : "warning" },
          { label: "Application quality", value: d?.quality ? `${d.quality.toFixed(1)}/5` : "—", tone: (d?.quality ?? 0) >= 3.5 ? "success" : "warning" },
          { label: "App → booked", value: rate(d?.booked ?? 0, d?.apps ?? 0), tone: "accent" },
          { label: "Pre-call vids watched", value: fmt(d?.precallWatched ?? 0) },
        ]}
      />

      <Band
        icon={<PhoneCall className="h-3.5 w-3.5" />}
        title="Rep efficiency"
        to="/dm-setter"
        tiles={[
          { label: "Dials", value: fmt(d?.dials ?? 0), spark: d?.dialSpark },
          { label: "Pick-up rate", value: rate(d?.connections ?? 0, d?.dials ?? 0), tone: (d?.connections ?? 0) / Math.max(1, d?.dials ?? 1) >= 0.2 ? "success" : "warning" },
          { label: "Qualified convo rate", value: rate(d?.qualified ?? 0, d?.contacted ?? 0), tone: "accent" },
          { label: "Show rate", value: rate(d?.showed ?? 0, d?.booked ?? 0), tone: (d?.showed ?? 0) / Math.max(1, d?.booked ?? 1) >= 0.6 ? "success" : "warning" },
          { label: "Close rate (on show)", value: rate(d?.closed ?? 0, d?.showed ?? 0), tone: "success" },
          { label: "Links sent", value: fmt(d?.linksSent ?? 0) },
        ]}
      />

      <Band
        icon={<Trophy className="h-3.5 w-3.5" />}
        title="Client momentum"
        to="/fulfillment"
        tiles={[
          { label: "Active clients", value: fmt(d?.activeClients ?? 0) },
          { label: "Daily W logs", value: fmt(d?.wins ?? 0) },
          { label: "Financial wins", value: fmt(d?.financialWins ?? 0), tone: "success" },
          { label: "Student cash logged", value: "$" + fmt((d?.winCash ?? 0) / 100), tone: "success" },
          { label: "Avg student energy", value: d?.avgEnergy ? `${d.avgEnergy.toFixed(1)}/10` : "—", tone: (d?.avgEnergy ?? 0) < 5 && (d?.avgEnergy ?? 0) > 0 ? "danger" : "default" },
        ]}
      />
    </div>
  );
}

type Tile = { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" | "accent"; spark?: number[] };

function BandSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 divide-border sm:divide-x">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="p-3 space-y-1.5">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Band({ icon, title, to, tiles }: { icon: React.ReactNode; title: string; to: string; tiles: Tile[] }) {
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider">{icon}{title}</div>
        <Link to={to} className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
          Open <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 divide-border sm:divide-x">
        {tiles.map(t => (
          <div key={t.label} className="p-3">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">{t.label}</div>
            <div className={cn("mt-1 font-mono text-xl font-semibold tabular-nums",
              t.tone === "success" && "text-[color:var(--color-success)]",
              t.tone === "warning" && "text-[color:var(--color-warning)]",
              t.tone === "danger" && "text-destructive",
              t.tone === "accent" && "text-accent")}>{t.value}</div>
            {t.spark && t.spark.length > 1 && <div className="mt-1.5 h-6"><Sparkline data={t.spark} /></div>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function HubQuickLinks() {
  const links = [
    { to: "/leads", label: "Leads CRM", icon: Users },
    { to: "/team-calendar", label: "Team calendars", icon: Gauge },
    { to: "/vsl", label: "VSL analytics", icon: PlayCircle },
    { to: "/content-calendar", label: "Content calendar", icon: FileText },
    { to: "/fulfillment", label: "Client results", icon: Trophy },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {links.map(l => (
        <Link key={l.to} to={l.to}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-2xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
          <l.icon className="h-3.5 w-3.5" /> {l.label}
        </Link>
      ))}
    </div>
  );
}
