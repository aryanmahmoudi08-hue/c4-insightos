import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { paymentRecoveryStatus } from "@/lib/operating-workflows";

export type MenteeOperationsClient = {
  id: string;
  full_name: string;
  renewal_date: string | null;
  renewal_stage: string | null;
  expected_next_payment_date: string | null;
  expected_next_payment_cents: number | null;
  invested_to_date_cents: number | null;
  contract_value_cents: number | null;
};

export type MenteeOperationsPayment = {
  id: string;
  client_id: string | null;
  amount_cents: number;
  status: string;
  collected_at: string;
};

function daysBetween(date: string | null, now = new Date()) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`).getTime();
  const today = new Date(now.toDateString()).getTime();
  return Math.round((target - today) / 86400e3);
}

export function MenteeOperationsPanel({
  clients,
  payments,
  renewalAtRiskDays,
}: {
  clients: MenteeOperationsClient[];
  payments: MenteeOperationsPayment[];
  renewalAtRiskDays: number;
}) {
  const today = new Date();
  const recoveryRows = clients
    .map((client) => {
      const dueDays = daysBetween(client.expected_next_payment_date, today);
      if (dueDays == null || dueDays > 0) return null;
      const clientPayments = payments.filter(
        (payment) => payment.client_id === client.id && payment.status === "paid",
      );
      const latest = clientPayments.sort((a, b) => b.collected_at.localeCompare(a.collected_at))[0];
      const status = paymentRecoveryStatus({ dueDays, paymentStatus: latest?.status ?? null });
      return { client, dueDays, latest, status };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);
  const renewals = clients
    .map((client) => ({ client, days: daysBetween(client.renewal_date, today) }))
    .filter((row) => row.days != null && row.days <= renewalAtRiskDays)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  const money = (cents: number | null | undefined) =>
    cents == null ? "Unavailable" : `$${Math.round(cents / 100).toLocaleString()}`;
  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card/70 p-4"
      aria-label="Mentee payment recovery and renewal operations"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5 text-spectrum-hot" />
            Recovery & renewal operations
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Internal queue and state visibility from verified workspace records
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          <ShieldAlert className="h-3 w-3 text-amber-400" />
          Provider execution unavailable
        </Badge>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
            Payment recovery queue <span className="ml-auto font-mono">{recoveryRows.length}</span>
          </div>
          <div className="space-y-2">
            {recoveryRows.slice(0, 8).map(({ client, dueDays, latest, status }) => (
              <div key={client.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {client.full_name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {dueDays < 0 ? `${Math.abs(dueDays)}d overdue` : "due today"}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-5">
                  <span className="text-muted-foreground">
                    Status
                    <strong className="block capitalize text-foreground">
                      {status.replaceAll("_", " ")}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Amount
                    <strong className="block text-foreground">
                      {money(client.expected_next_payment_cents)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Payment ID
                    <strong className="block truncate font-mono text-foreground">
                      {latest?.id ?? "Unavailable"}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Owner<strong className="block text-amber-300">Unassigned</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Next action
                    <strong className="block text-amber-300">Provider unavailable</strong>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                  <span>
                    Last payment:{" "}
                    {latest?.collected_at
                      ? new Date(latest.collected_at).toLocaleString()
                      : "Unavailable"}
                  </span>
                  <span>Audit: internal queue record</span>
                </div>
              </div>
            ))}
            {recoveryRows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                <CheckCircle2 className="mr-2 inline h-3.5 w-3.5 text-emerald-400" />
                No due or overdue payment records in the current workspace.
              </div>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5 text-cyan-400" />
            Renewal workflow <span className="ml-auto font-mono">{renewals.length}</span>
          </div>
          <div className="space-y-2">
            {renewals.slice(0, 8).map(({ client, days }) => (
              <div key={client.id} className="rounded-lg border border-border/60 bg-muted/10 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {client.full_name}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {days! < 0 ? `${Math.abs(days!)}d overdue` : `in ${days}d`}
                  </Badge>
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                  <span className="text-muted-foreground">
                    Stage
                    <strong className="block capitalize text-foreground">
                      {(client.renewal_stage ?? "not_started").replaceAll("_", " ")}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Owner<strong className="block text-cyan-300">Unassigned</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Next action<strong className="block text-cyan-300">Needs owner action</strong>
                  </span>
                  <span className="text-muted-foreground">
                    Action date
                    <strong className="block text-foreground">
                      {client.renewal_date ?? "Unavailable"}
                    </strong>
                  </span>
                </div>
              </div>
            ))}
            {renewals.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
                <AlertTriangle className="mr-2 inline h-3.5 w-3.5" />
                No renewal records inside the configured risk window.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
