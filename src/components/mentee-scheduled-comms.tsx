import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { daysBetween } from "@/lib/mentee-payments";

/**
 * Renewal/payment-plan communications (spec section 6: "Proposal Sandbox
 * work[ing] from scheduled communication events — email/SMS triggered by
 * payment-plan due dates / renewal dates"). This is the trigger + queue
 * architecture; actual send stays "not connected" until a real email/SMS
 * provider secret exists (Resend/Twilio/etc. — never fabricated as sent).
 */

type Client = {
  id: string;
  full_name: string;
  expected_next_payment_date: string | null;
  renewal_date: string | null;
};

type ScheduledComm = {
  id: string;
  client_id: string;
  trigger_type: string;
  channel: string;
  scheduled_for: string;
  send_status: string;
};

export function MenteeScheduledComms({
  orgId,
  clients,
}: {
  orgId: string | undefined;
  clients: Client[];
}) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: scheduled = [] } = useQuery({
    queryKey: ["scheduled-communications", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_communications")
        .select("id, client_id, trigger_type, channel, scheduled_for, send_status")
        .eq("org_id", orgId!)
        .order("scheduled_for", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ScheduledComm[];
    },
  });
  const scheduledKeys = useMemo(
    () =>
      new Set(
        scheduled.map((s) => `${s.client_id}:${s.trigger_type}:${s.scheduled_for.slice(0, 10)}`),
      ),
    [scheduled],
  );

  // Virtual (not-yet-persisted) triggers computed from real due/renewal dates
  // within the next 14 days — nothing is scheduled until explicitly queued.
  const pendingTriggers = useMemo(() => {
    const now = new Date();
    const rows: { client: Client; triggerType: "payment_due" | "renewal_due"; date: string }[] = [];
    for (const c of clients) {
      const paymentDays = daysBetween(c.expected_next_payment_date, now);
      if (
        paymentDays != null &&
        paymentDays >= 0 &&
        paymentDays <= 14 &&
        c.expected_next_payment_date
      ) {
        rows.push({ client: c, triggerType: "payment_due", date: c.expected_next_payment_date });
      }
      const renewalDays = daysBetween(c.renewal_date, now);
      if (renewalDays != null && renewalDays >= 0 && renewalDays <= 14 && c.renewal_date) {
        rows.push({ client: c, triggerType: "renewal_due", date: c.renewal_date });
      }
    }
    return rows.filter(
      (r) =>
        !scheduledKeys.has(`${r.client.id}:${r.triggerType}:${r.date}`) &&
        !dismissed.has(`${r.client.id}:${r.triggerType}:${r.date}`),
    );
  }, [clients, scheduledKeys, dismissed]);

  const queueComm = useMutation({
    mutationFn: async ({
      client,
      triggerType,
      date,
      channel,
    }: {
      client: Client;
      triggerType: "payment_due" | "renewal_due";
      date: string;
      channel: "email" | "sms";
    }) => {
      const { error } = await supabase.from("scheduled_communications").insert({
        org_id: orgId!,
        client_id: client.id,
        trigger_type: triggerType,
        channel,
        scheduled_for: new Date(`${date}T09:00:00`).toISOString(),
        subject: triggerType === "payment_due" ? "Upcoming payment reminder" : "Renewal check-in",
        body:
          triggerType === "payment_due"
            ? `Hi ${client.full_name}, your next payment is coming up on ${date}.`
            : `Hi ${client.full_name}, your renewal date (${date}) is approaching — let's talk.`,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Queued — send stays unavailable until an email/SMS provider is connected");
      qc.invalidateQueries({ queryKey: ["scheduled-communications", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("scheduled_communications")
        .update({ send_status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked sent manually");
      qc.invalidateQueries({ queryKey: ["scheduled-communications", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Send className="h-3.5 w-3.5 text-spectrum-mid" />
            Renewal & payment-plan communications
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Triggered by real payment-due and renewal dates — queuing is real, sending isn't yet
          </p>
        </div>
        <Badge variant="outline" className="gap-1 text-[10px] uppercase tracking-wider">
          No email/SMS provider connected
        </Badge>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pending triggers <span className="font-mono">{pendingTriggers.length}</span>
        </div>
        <div className="space-y-1.5">
          {pendingTriggers.slice(0, 8).map((t) => {
            const key = `${t.client.id}:${t.triggerType}:${t.date}`;
            return (
              <div
                key={key}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 p-2.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t.client.full_name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {t.triggerType === "payment_due" ? "Payment due" : "Renewal due"} · {t.date}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-2xs"
                  onClick={() =>
                    queueComm.mutate({
                      client: t.client,
                      triggerType: t.triggerType,
                      date: t.date,
                      channel: "email",
                    })
                  }
                >
                  <Mail className="mr-1 h-3 w-3" /> Queue email
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-2xs"
                  onClick={() =>
                    queueComm.mutate({
                      client: t.client,
                      triggerType: t.triggerType,
                      date: t.date,
                      channel: "sms",
                    })
                  }
                >
                  <MessageSquare className="mr-1 h-3 w-3" /> Queue SMS
                </Button>
                <button
                  className="text-3xs text-muted-foreground hover:text-foreground"
                  onClick={() => setDismissed((prev) => new Set(prev).add(key))}
                >
                  Dismiss
                </button>
              </div>
            );
          })}
          {pendingTriggers.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              No payment or renewal dates in the next 14 days need a trigger.
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Queue <span className="font-mono">{scheduled.length}</span>
        </div>
        <div className="space-y-1.5">
          {scheduled.slice(0, 10).map((s) => {
            const client = clients.find((c) => c.id === s.client_id);
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/10 p-2.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {client?.full_name ?? "Unknown mentee"}
                </span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {s.channel} · {s.trigger_type.replace("_", " ")}
                </Badge>
                <span className="text-3xs text-muted-foreground">
                  {new Date(s.scheduled_for).toLocaleDateString()}
                </span>
                <span
                  className={`text-3xs uppercase ${s.send_status === "sent" ? "text-emerald-500" : "text-amber-400"}`}
                >
                  {s.send_status.replace("_", " ")}
                </span>
                {s.send_status !== "sent" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-2xs"
                    onClick={() => markSent.mutate(s.id)}
                  >
                    Mark sent manually
                  </Button>
                )}
              </div>
            );
          })}
          {scheduled.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Nothing queued yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
