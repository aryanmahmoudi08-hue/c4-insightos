import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Link2,
  MessageCircle,
  PhoneIncoming,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type OperationalWorkflowPanelProps = {
  role: "dm_setter" | "inbound_dialer";
  qualified: number;
  sets: number;
  booked: number;
  closes: number;
  cashLabel: string;
  linksSent?: number;
  connectorAvailable?: boolean;
};

function Stage({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success";
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-muted/10 px-3 py-2">
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          tone === "success"
            ? "mt-1 text-lg font-semibold text-emerald-400"
            : tone === "accent"
              ? "mt-1 text-lg font-semibold text-accent"
              : "mt-1 text-lg font-semibold"
        }
      >
        {value}
      </div>
    </div>
  );
}

export function OperationalWorkflowPanel({
  role,
  qualified,
  sets,
  booked,
  closes,
  cashLabel,
  linksSent = 0,
  connectorAvailable = false,
}: OperationalWorkflowPanelProps) {
  const isDialer = role === "inbound_dialer";
  return (
    <section
      className="rounded-xl border border-border bg-card/80 p-4 shadow-sm"
      aria-label={
        isDialer ? "Inbound response and callback workflow" : "DM setter lifecycle workflow"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {isDialer ? (
              <PhoneIncoming className="h-3.5 w-3.5 text-cyan-400" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5 text-cyan-400" />
            )}
            {isDialer ? "Inbound response & callback workflow" : "DM setter lifecycle workflow"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Canonical record path · verified workspace activity only
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          {connectorAvailable ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-3 w-3 text-amber-400" />
          )}
          {connectorAvailable ? "Provider connected" : "Provider unavailable"}
        </Badge>
      </div>
      <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Stage
          label={isDialer ? "Inbound leads" : "Inbound DMs"}
          value="Verified activity"
          tone="accent"
        />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
        <Stage label="Qualified convos" value={qualified} />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
        <Stage label="Sets" value={sets} />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
        <Stage label="Booked calls" value={booked} />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
        <Stage label="Closes" value={closes} tone="success" />
        <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
        <Stage label="Cash" value={cashLabel} tone="success" />
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 text-cyan-400" />
          Links sent <strong className="ml-auto text-foreground">{linksSent}</strong>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 text-amber-400" />
          SLA / callback{" "}
          <strong className="ml-auto text-amber-300">
            {connectorAvailable ? "Active" : "Unavailable"}
          </strong>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
          Provider events{" "}
          <strong className="ml-auto text-foreground">
            {connectorAvailable ? "Connected" : "Not connected"}
          </strong>
        </div>
      </div>
    </section>
  );
}
