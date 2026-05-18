import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Webhook, Radio, AlertCircle, Plus } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = [
  "lead.created","lead.status_changed","conversation.started","call.booked","call.showed","call.closed_won","call.closed_lost",
  "payment.collected","content.posted","content.milestone_10k","onboarding.submitted","alert.fired","client.renewed",
];

export const Route = createFileRoute("/_authenticated/events")({ component: EventsBus });

function EventsBus() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: events } = useQuery({
    queryKey: ["events", orgId],
    enabled: !!orgId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.from("events").select("id, event_type, subject_type, payload, occurred_at, actor_user_id")
        .eq("org_id", orgId!).order("occurred_at", { ascending: false }).limit(60);
      if (error) throw error;
      return data;
    },
  });

  const { data: subs } = useQuery({
    queryKey: ["webhook-subs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("webhook_subscriptions").select("*").eq("org_id", orgId!);
      if (error) throw error;
      return data;
    },
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries", orgId],
    enabled: !!orgId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase.from("webhook_deliveries").select("id, status, response_code, attempt, created_at, subscription_id")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(40);
      return data ?? [];
    },
  });

  const { data: syncs } = useQuery({
    queryKey: ["sync-status", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("connector_sync_status").select("*").eq("org_id", orgId!).order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: raw } = useQuery({
    queryKey: ["raw-payloads", orgId],
    enabled: !!orgId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data } = await supabase.from("raw_payloads").select("id, resource, connector_id, received_at, processed_at, process_error")
        .eq("org_id", orgId!).order("received_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      const event_types = String(f.get("event_types") || "").split(",").map(s => s.trim()).filter(Boolean);
      const { error } = await supabase.from("webhook_subscriptions").insert({
        org_id: orgId!,
        name: String(f.get("name") || ""),
        target_url: String(f.get("target_url") || ""),
        signing_secret: String(f.get("secret") || ""),
        event_types,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Webhook subscription added"); qc.invalidateQueries({ queryKey: ["webhook-subs"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const failed = (deliveries ?? []).filter(d => d.status !== "delivered" && d.status !== "pending").length;

  return (
    <>
      <TopBar title="Event Bus & Webhooks" subtitle="Live event stream, subscriptions, and ingestion payloads" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Events (recent)" value={events?.length ?? 0} icon={<Activity className="h-4 w-4" />} accent="primary" />
          <StatCard label="Active subscriptions" value={(subs ?? []).filter(s => s.is_active).length} icon={<Webhook className="h-4 w-4" />} accent="accent" />
          <StatCard label="Failed deliveries" value={failed} accent={failed ? "destructive" : "success"} icon={<AlertCircle className="h-4 w-4" />} />
          <StatCard label="Sync streams" value={syncs?.length ?? 0} icon={<Radio className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground flex justify-between items-center">
              <span>Live event stream</span><span className="font-mono">refresh 5s</span>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {(events ?? []).map(e => (
                <div key={e.id} className="p-3 hover:bg-muted/20">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-accent">{e.event_type}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(e.occurred_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{e.subject_type ?? "—"}</div>
                </div>
              ))}
              {(!events || events.length === 0) && <div className="p-10 text-center text-xs text-muted-foreground">No events emitted yet.</div>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Webhook subscriptions</span>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild><Button size="sm" variant="ghost" className="h-6 text-xs"><Plus className="h-3 w-3" />Add</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>New webhook subscription</DialogTitle></DialogHeader>
                    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                      <div className="space-y-1.5"><Label>Name</Label><Input name="name" placeholder="Slack #closes channel" required /></div>
                      <div className="space-y-1.5"><Label>Target URL</Label><Input name="target_url" type="url" required /></div>
                      <div className="space-y-1.5"><Label>Signing secret</Label><Input name="secret" type="password" required /></div>
                      <div className="space-y-1.5"><Label>Event types (comma)</Label>
                        <Input name="event_types" defaultValue="call.closed_won,payment.collected" />
                        <div className="text-[10px] text-muted-foreground">Available: {EVENT_TYPES.join(", ")}</div>
                      </div>
                      <Button type="submit" className="w-full" disabled={create.isPending}>Subscribe</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {(subs ?? []).map(s => (
                  <div key={s.id} className="p-3 text-xs">
                    <div className="flex justify-between"><span className="font-medium">{s.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${s.is_active ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]" : "bg-muted"}`}>{s.is_active ? "active" : "off"}</span></div>
                    <div className="text-muted-foreground truncate mt-0.5 font-mono">{s.target_url}</div>
                    <div className="text-[10px] text-muted-foreground mt-1">{(s.event_types ?? []).length} event types</div>
                  </div>
                ))}
                {(!subs || subs.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No subscriptions configured.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Connector sync status</div>
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {(syncs ?? []).map(s => (
                  <div key={s.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-mono">{s.resource}</div>
                      <div className="text-[10px] text-muted-foreground">{s.last_sync_at ? `last ${new Date(s.last_sync_at).toLocaleTimeString()}` : "never"} · {s.records_synced ?? 0} records</div>
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-[10px] uppercase bg-muted">{s.state}</span>
                  </div>
                ))}
                {(!syncs || syncs.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No sync streams.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Webhook deliveries</div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left p-2">Status</th><th className="text-left p-2">Code</th><th className="text-left p-2">Attempt</th><th className="text-left p-2">When</th></tr></thead>
              <tbody>{(deliveries ?? []).map(d => (
                <tr key={d.id} className="border-t border-border">
                  <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-[10px] ${d.status === "delivered" ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]" : d.status === "pending" ? "bg-muted" : "bg-destructive/20 text-destructive"}`}>{d.status}</span></td>
                  <td className="p-2 font-mono">{d.response_code ?? "—"}</td>
                  <td className="p-2 font-mono">{d.attempt}</td>
                  <td className="p-2 text-muted-foreground">{new Date(d.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
                {(!deliveries || deliveries.length === 0) && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No deliveries yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">Raw ingestion payloads</div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left p-2">Connector</th><th className="text-left p-2">Resource</th><th className="text-left p-2">Processed</th><th className="text-left p-2">Received</th></tr></thead>
              <tbody>{(raw ?? []).map(r => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-2 font-mono">{r.connector_id}</td>
                  <td className="p-2">{r.resource}</td>
                  <td className="p-2">{r.process_error ? <span className="text-destructive">err</span> : r.processed_at ? "✓" : <span className="text-muted-foreground">queued</span>}</td>
                  <td className="p-2 text-muted-foreground">{new Date(r.received_at).toLocaleTimeString()}</td>
                </tr>
              ))}
                {(!raw || raw.length === 0) && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No payloads ingested yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
