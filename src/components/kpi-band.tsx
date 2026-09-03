import {
  Activity,
  CalendarCheck,
  CircleDollarSign,
  Eye,
  Flame,
  Gauge,
  Link2,
  ListChecks,
  MessageCircle,
  PhoneCall,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Minus,
  UserCheck,
  Users,
} from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { InteractiveSparkline } from "@/components/interactive-sparkline";
import { SPECTRUM_VAR, type SpectrumPosition } from "@/lib/spectrum";

const KPI_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Views: Eye,
  "Total Views": Eye,
  Dials: PhoneCall,
  Connections: MessageCircle,
  "Qualified Convos": Users,
  "Leads Contacted": Users,
  Sets: CalendarCheck,
  "Calls Booked": CalendarCheck,
  Showed: UserCheck,
  Closes: Flame,
  "Cash Collected": CircleDollarSign,
  "Revenue Generated": CircleDollarSign,
  "Contract Value": CircleDollarSign,
  "Links Sent": Link2,
  "Inbound DMs Sent": MessageCircle,
  "Outbound DMs Sent": MessageCircle,
  "Follow-ups Sent": MessageCircle,
  "Links Clicked": Link2,
  "Post-booking Page Visits": Eye,
  "Pre-call Video Watches": Eye,
  "Average Call Length": PhoneCall,
  "Average Talk Time": PhoneCall,
  Downsells: Target,
  "Offers Made": Sparkles,
  "Close Rate": Target,
  "Show Rate": UserCheck,
  "Offer Rate": Sparkles,
  "Offer → Close Rate": Target,
  "Pickup Rate": PhoneCall,
  "Pick-up Rate": PhoneCall,
  "Qualified Rate": Users,
  "Revenue / Lead": CircleDollarSign,
  "Client Momentum": TrendingUp,
  "Rep Efficiency": Gauge,
  Applications: ListChecks,
  "Traffic → VSL": Eye,
};

export interface KpiBandItem {
  key: string;
  label: string;
  value: string;
  spectrum: SpectrumPosition;
  deltaPct?: number;
  priorValue?: string;
  featured?: boolean;
  wide?: boolean;
  empty?: boolean;
  emptyHint?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  spark?: number[];
  sparkLabels?: string[];
  sparkVariant?: "line" | "bar";
}

export function KpiBand({
  items,
  title = "Key metrics",
}: {
  items: KpiBandItem[];
  title?: string;
}) {
  return (
    <div className="relative">
      <div className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-foreground">
        {title}
      </div>
      <div className="grid gap-4 overflow-visible sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((it) => {
          const hasDelta = it.deltaPct !== undefined && Number.isFinite(it.deltaPct);
          const up = hasDelta && it.deltaPct! > 0.5;
          const down = hasDelta && it.deltaPct! < -0.5;
          const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;
          const trend = hasDelta ? (
            <span
              className={
                up
                  ? "text-[color:var(--color-success)]"
                  : down
                    ? "text-destructive"
                    : "text-muted-foreground"
              }
            >
              <DeltaIcon className="mr-1 inline h-3 w-3" />
              {Math.abs(it.deltaPct!).toFixed(0)}%
            </span>
          ) : undefined;
          const supporting = it.empty ? (
            (it.emptyHint ?? "—")
          ) : it.priorValue ? (
            <>vs {it.priorValue} prior</>
          ) : undefined;
          return (
            <KpiCard
              key={it.key}
              label={it.label}
              value={it.empty ? "—" : it.value}
              supporting={supporting}
              trend={trend}
              icon={
                it.icon ??
                (() => {
                  const Icon = KPI_ICONS[it.label] ?? Activity;
                  return <Icon className="h-3.5 w-3.5" />;
                })()
              }
              chart={
                it.spark && it.spark.length > 1 ? (
                  <div className="flex h-16 items-center px-2">
                    <InteractiveSparkline
                      data={it.spark}
                      labels={it.sparkLabels}
                      variant={it.sparkVariant ?? "line"}
                      width={220}
                      height={44}
                      stroke={SPECTRUM_VAR[it.spectrum]}
                      fill={SPECTRUM_VAR[it.spectrum]}
                      strokeWidth={1.5}
                    />
                  </div>
                ) : (
                  <div
                    className="flex h-8 items-end gap-1 px-2 opacity-45"
                    aria-label="No daily series available"
                  >
                    {Array.from({ length: 8 }).map((_, index) => (
                      <span
                        key={index}
                        className="h-px flex-1 rounded-full bg-muted-foreground/60"
                      />
                    ))}
                  </div>
                )
              }
              spectrum={it.spectrum}
              onClick={it.onClick}
              className={it.wide ? "sm:col-span-2" : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
