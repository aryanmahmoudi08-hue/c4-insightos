import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { HomeSection, HomeStat, FocusRow, FocusEmpty } from "./home-shared";
import { clientAtRiskReason, daysUntilDate } from "@/lib/client-risk";
import {
  buildRecoveryQueue,
  RECOVERY_BUCKET_LABELS,
  type RecoveryBucketKey,
} from "@/lib/mentee-payments";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DollarSign,
  PhoneCall,
  Users,
  UserPlus,
} from "lucide-react";
import {
  mockAdminPaymentsToday,
  mockAdminCallsToday,
  mockAdminClients,
  mockAdminClientPayments,
  MOCK_ADMIN_HIRING_COUNTS,
} from "@/lib/home-dev-mock-data";

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_RENEWAL_AT_RISK_DAYS = 14;

const OVERDUE_BUCKETS: RecoveryBucketKey[] = ["overdue_1_7", "overdue_8_30", "overdue_30_plus"];

export function HomeAdmin({ orgId }: { orgId: string }) {
  const { devBypass } = useAuth();

  const { data: paymentsToday = [] } = useQuery({
    queryKey: ["home-admin-payments-today", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockAdminPaymentsToday();
      const { data, error } = await supabase
        .from("payments")
        .select("amount_cents, status, collected_at")
        .eq("org_id", orgId)
        .eq("status", "paid")
        .gte("collected_at", `${TODAY}T00:00:00`)
        .lte("collected_at", `${TODAY}T23:59:59`);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: calls = [] } = useQuery({
    queryKey: ["home-admin-calls-today", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockAdminCallsToday();
      const { data, error } = await supabase
        .from("calls")
        .select("id, status, closed, contract_value_cents, scheduled_for")
        .eq("org_id", orgId)
        .gte("scheduled_for", `${TODAY}T00:00:00`)
        .lte("scheduled_for", `${TODAY}T23:59:59`)
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["home-admin-clients", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return mockAdminClients();
      const { data, error } = await supabase
        .from("clients")
        .select(
          "id, full_name, offer_name, status, renewal_date, renewal_conv_started, expected_next_payment_date, expected_next_payment_cents, contract_value_cents, invested_to_date_cents",
        )
        .eq("org_id", orgId)
        .eq("status", "active")
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientPayments = [] } = useQuery({
    queryKey: ["home-admin-client-payments", orgId, devBypass],
    enabled: !!orgId && clients.length > 0,
    queryFn: async () => {
      if (devBypass) return mockAdminClientPayments();
      const { data, error } = await supabase
        .from("payments")
        .select("client_id, status, collected_at")
        .eq("org_id", orgId)
        .in(
          "client_id",
          clients.map((c) => c.id),
        );
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: hiringCounts } = useQuery({
    queryKey: ["home-admin-hiring", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return MOCK_ADMIN_HIRING_COUNTS;
      const { data, error } = await supabase
        .from("hiring_applicants" as never)
        .select("stage")
        .eq("org_id", orgId);
      if (error) throw error;
      const rows = (data ?? []) as Array<{ stage: string }>;
      return {
        needsGrading: rows.filter((r) => r.stage === "needs_grading").length,
        interviewWorthy: rows.filter((r) => r.stage === "interview_worthy").length,
        trialCall: rows.filter((r) => r.stage === "trial_call").length,
      };
    },
  });

  const cashToday = paymentsToday.reduce((s, p) => s + (p.amount_cents ?? 0), 0);
  const closesToday = calls.filter((c) => c.closed || c.status === "closed").length;

  const renewalsAtRisk = clients
    .map((c) => ({
      client: c,
      reason: clientAtRiskReason(c, DEFAULT_RENEWAL_AT_RISK_DAYS),
    }))
    .filter((r) => r.reason !== null);

  const recoveryRows =
    clientPayments.length >= 0 && clients.length > 0
      ? buildRecoveryQueue(
          clients.map((c) => ({
            id: c.id,
            full_name: c.full_name,
            offer_name: c.offer_name,
            expected_next_payment_date: c.expected_next_payment_date,
            expected_next_payment_cents: c.expected_next_payment_cents,
            contract_value_cents: c.contract_value_cents,
            invested_to_date_cents: c.invested_to_date_cents,
          })),
          clientPayments.map((p) => ({
            client_id: p.client_id,
            status: p.status,
            collected_at: p.collected_at!,
          })),
        )
      : [];
  const overdueRows = recoveryRows.filter((r) => OVERDUE_BUCKETS.includes(r.bucket));
  const atRiskCents = overdueRows.reduce((s, r) => s + r.amountCents, 0);

  return (
    <div className="space-y-4">
      <HomeSection
        title="Business Health · Today"
        icon={<Building2 className="h-4 w-4" />}
        tone="hot"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HomeStat
            label="Cash Collected"
            value={`$${(cashToday / 100).toLocaleString()}`}
            icon={<DollarSign className="h-4 w-4" />}
            tone="hot"
          />
          <HomeStat
            label="Closes"
            value={closesToday}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="mid"
          />
          <HomeStat
            label="Active Mentees"
            value={clients.length}
            icon={<Users className="h-4 w-4" />}
            tone="cold"
          />
        </div>
      </HomeSection>

      <HomeSection
        title="Attention Required"
        icon={<AlertTriangle className="h-4 w-4" />}
        tone="destructive"
      >
        {overdueRows.length === 0 && renewalsAtRisk.length === 0 ? (
          <FocusEmpty label="No overdue installments or renewal risk detected." />
        ) : (
          <>
            {overdueRows.length > 0 && (
              <FocusRow
                tone="destructive"
                label={`${overdueRows.length} overdue installment${overdueRows.length === 1 ? "" : "s"} — $${(atRiskCents / 100).toLocaleString()} at risk`}
                to="/payments"
              />
            )}
            {renewalsAtRisk.length > 0 && (
              <FocusRow
                tone="warning"
                label={`${renewalsAtRisk.length} renewal${renewalsAtRisk.length === 1 ? "" : "s"} due soon or overdue`}
                detail={renewalsAtRisk
                  .slice(0, 3)
                  .map((r) => `${r.client.full_name} (${r.reason})`)
                  .join(" · ")}
                to="/payments"
              />
            )}
          </>
        )}
      </HomeSection>

      <HomeSection title="Team & Hiring" icon={<Users className="h-4 w-4" />} tone="mid">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <HomeStat
            label="Calls Today"
            value={calls.length}
            icon={<PhoneCall className="h-4 w-4" />}
            tone="cold"
          />
          <HomeStat
            label="Hiring — Needs Grading"
            value={hiringCounts?.needsGrading ?? 0}
            icon={<UserPlus className="h-4 w-4" />}
            tone="warning"
          />
          <HomeStat
            label="Hiring — Interview-Worthy"
            value={hiringCounts?.interviewWorthy ?? 0}
            icon={<UserPlus className="h-4 w-4" />}
            tone="mid"
          />
        </div>
      </HomeSection>

      <HomeSection title="Renewals" icon={<Building2 className="h-4 w-4" />} tone="warning">
        {renewalsAtRisk.length === 0 ? (
          <FocusEmpty label="No renewals due within the configured window." />
        ) : (
          renewalsAtRisk
            .slice(0, 6)
            .map(({ client, reason }) => (
              <FocusRow
                key={client.id}
                label={client.full_name}
                detail={`${reason} · ${client.offer_name ?? "No offer on file"}${
                  client.renewal_date
                    ? ` · ${daysUntilDate(client.renewal_date)! >= 0 ? "in" : ""} ${Math.abs(daysUntilDate(client.renewal_date)!)}d ${daysUntilDate(client.renewal_date)! >= 0 ? "" : "overdue"}`
                    : ""
                }`}
                to="/payments"
                search={{ client: client.id }}
              />
            ))
        )}
      </HomeSection>
    </div>
  );
}
