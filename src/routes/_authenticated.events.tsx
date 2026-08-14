import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Activity, Webhook, Radio, AlertCircle, Plus, Copy, RefreshCw, Check, Inbox } from "lucide-react";
import { toast } from "sonner";
import { getOrCreateIngestToken, rotateIngestToken } from "@/lib/ingest.functions";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { cn } from "@/lib/utils";

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
      const { data, error } = await supabase.from("webhook_deliveries").select("id, status, response_code, attempt, created_at, subscription_id")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: syncs } = useQuery({
    queryKey: ["sync-status", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("connector_sync_status").select("*").eq("org_id", orgId!).order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: raw } = useQuery({
    queryKey: ["raw-payloads", orgId],
    enabled: !!orgId,
    refetchInterval: 10000,
    queryFn: async () => {
      const { data, error } = await supabase.from("raw_payloads").select("id, resource, connector_id, received_at, processed_at, process_error")
        .eq("org_id", orgId!).order("received_at", { ascending: false }).limit(30);
      if (error) throw error;
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
        {/* Page hero (B1) — bounded, fixed-shape content (unlike InboundIngestCard
            below, whose tab content grows with each payload example, which would
            fight a fixed-height bento cell). Failed-deliveries stays a threshold
            state color (destructive when >0), not a funnel miscolor. */}
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="wide">
            <div className="hover-lift relative flex h-full items-center gap-6 overflow-hidden rounded-2xl border border-border bg-card p-5">
              <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
              <div className="relative flex items-center gap-2">
                <span className="status-dot text-spectrum-hot ticker-pulse" />
                <div>
                  <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Live Event Stream</div>
                  <div className="font-mono text-4xl font-bold tabular-nums">{events?.length ?? 0}</div>
                  <div className="text-2xs text-muted-foreground">events in range · refreshing every 5s</div>
                </div>
              </div>
              <div className="relative h-10 w-px bg-border" />
              <div className="relative flex items-center gap-2">
                <AlertCircle className={`h-4 w-4 ${failed ? "text-destructive" : "text-[color:var(--color-success)]"}`} />
                <div>
                  <div className={`font-mono text-2xl font-bold tabular-nums ${failed ? "text-destructive" : "text-[color:var(--color-success)]"}`}>{failed}</div>
                  <div className="text-2xs text-muted-foreground">failed deliveries</div>
                </div>
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        <InboundIngestCard orgId={orgId} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Events (recent)" value={events?.length ?? 0} icon={<Activity className="h-4 w-4" />} accent="primary" />
          <StatCard label="Active subscriptions" value={(subs ?? []).filter(s => s.active).length} icon={<Webhook className="h-4 w-4" />} accent="accent" />
          <StatCard label="Failed deliveries" value={failed} accent={failed ? "destructive" : "success"} icon={<AlertCircle className="h-4 w-4" />} />
          <StatCard label="Sync streams" value={syncs?.length ?? 0} icon={<Radio className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground flex justify-between items-center">
              <span>Live event stream</span><span className="font-mono">refresh 5s</span>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {/* dispatch.lookup_failed (dispatch.server.ts) is a genuine query
                  failure, not a business event — never let it blend into the
                  normal accent-colored stream. */}
              {(events ?? []).map(e => {
                const isDispatchFailure = e.event_type === "dispatch.lookup_failed";
                return (
                  <div key={e.id} className={cn("p-3 hover:bg-muted/20", isDispatchFailure && "bg-destructive/5")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("font-mono text-xs", isDispatchFailure ? "text-destructive" : "text-accent")}>{e.event_type}</span>
                      <span className="text-3xs text-muted-foreground">{new Date(e.occurred_at).toLocaleTimeString()}</span>
                    </div>
                    {isDispatchFailure ? (
                      <div className="flex items-center gap-1 text-2xs text-destructive mt-0.5">
                        <AlertCircle className="h-3 w-3" /> Query failed, not a real dispatch — {String((e.payload as Record<string, unknown> | null)?.error ?? "unknown error")}
                      </div>
                    ) : (
                      <div className="text-2xs text-muted-foreground mt-0.5">{e.subject_type ?? "—"}</div>
                    )}
                  </div>
                );
              })}
              {(!events || events.length === 0) && <div className="p-10 text-center text-xs text-muted-foreground">No events emitted yet.</div>}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                <span className="text-2xs uppercase tracking-wider text-muted-foreground">Webhook subscriptions</span>
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
                        <div className="text-3xs text-muted-foreground">Available: {EVENT_TYPES.join(", ")}</div>
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
                      <span className={`rounded px-1.5 py-0.5 text-3xs ${s.active ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]" : "bg-muted"}`}>{s.active ? "active" : "off"}</span></div>
                    <div className="text-muted-foreground truncate mt-0.5 font-mono">{s.target_url}</div>
                    <div className="text-3xs text-muted-foreground mt-1">{(s.event_types ?? []).length} event types</div>
                  </div>
                ))}
                {(!subs || subs.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No subscriptions configured.</div>}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground">Connector sync status</div>
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {(syncs ?? []).map(s => (
                  <div key={s.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-mono">{s.resource}</div>
                      <div className="text-3xs text-muted-foreground">{s.last_sync_at ? `last ${new Date(s.last_sync_at).toLocaleTimeString()}` : "never"} · {s.records_synced ?? 0} records</div>
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-3xs uppercase bg-muted">{s.state}</span>
                  </div>
                ))}
                {(!syncs || syncs.length === 0) && <div className="p-6 text-center text-xs text-muted-foreground">No sync streams.</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassTableShell
            toolbar={<div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Webhook deliveries</div>}
            maxHeight="360px"
          >
            <table className="w-full text-xs">
              <thead className="sticky-thead text-muted-foreground bg-muted/40"><tr><th className="text-left p-2">Status</th><th className="text-left p-2">Code</th><th className="text-left p-2">Attempt</th><th className="text-left p-2">When</th></tr></thead>
              <tbody>{(deliveries ?? []).map(d => (
                <tr key={d.id} className="border-t border-border/70">
                  <td className="p-2"><span className={`rounded px-1.5 py-0.5 text-3xs ${d.status === "delivered" ? CHIP_TONE_CLASSES.success : d.status === "pending" ? CHIP_TONE_CLASSES.default : CHIP_TONE_CLASSES.destructive}`}>{d.status}</span></td>
                  <td className="p-2 font-mono">{d.response_code ?? "—"}</td>
                  <td className="p-2 font-mono">{d.attempt}</td>
                  <td className="p-2 text-muted-foreground">{new Date(d.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
                {(!deliveries || deliveries.length === 0) && (
                  <tr><td colSpan={4}><EmptyState icon={<Webhook className="h-4 w-4" />} title="No deliveries yet" /></td></tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
          <GlassTableShell
            toolbar={<div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Raw ingestion payloads</div>}
            maxHeight="360px"
          >
            <table className="w-full text-xs">
              <thead className="sticky-thead text-muted-foreground bg-muted/40"><tr><th className="text-left p-2">Connector</th><th className="text-left p-2">Resource</th><th className="text-left p-2">Processed</th><th className="text-left p-2">Received</th></tr></thead>
              <tbody>{(raw ?? []).map(r => (
                <tr key={r.id} className="border-t border-border/70">
                  <td className="p-2 font-mono">{r.connector_id}</td>
                  <td className="p-2">{r.resource}</td>
                  <td className="p-2">{r.process_error ? <span className="text-destructive">err</span> : r.processed_at ? "✓" : <span className="text-muted-foreground">queued</span>}</td>
                  <td className="p-2 text-muted-foreground">{new Date(r.received_at).toLocaleTimeString()}</td>
                </tr>
              ))}
                {(!raw || raw.length === 0) && (
                  <tr><td colSpan={4}><EmptyState icon={<Inbox className="h-4 w-4" />} title="No payloads ingested yet" /></td></tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
        </div>
      </div>
    </>
  );
}

const EXAMPLES: Record<string, { label: string; table: string; payload: Record<string, unknown> }> = {
  closer_call: {
    label: "Closer call",
    table: "calls",
    payload: {
      event_type: "closer_call",
      data: {
        closer_name: "Alex Smith",
        lead_email: "lead@example.com",
        scheduled_for: "2026-05-19T17:00:00Z",
        status: "closed",
        showed: true,
        offer_made: true,
        closed: true,
        cash_collected_cents: 250000,
        contract_value_cents: 500000,
        deposit_cents: 100000,
        payment_plan: true,
        call_summary: "Strong fit. Closed on payment plan.",
        key_moment: "Pricing handled with bonus stack",
      },
    },
  },
  dm_setter_day: {
    label: "DM setter day",
    table: "setter_activity (role=dm_setter)",
    payload: {
      event_type: "dm_setter_day",
      data: {
        team_member_name: "Jordan",
        activity_date: "2026-05-19",
        lead_source: "Instagram Spiderweb",
        leads_contacted: 80,
        connections: 35,
        qualified_convos: 18,
        sets: 6,
        links_sent: 12,
        calls_on_calendar: 6,
        live_calls: 4,
        closes: 2,
        downsells: 0,
        cash_collected_cents: 400000,
        total_revenue_cents: 800000,
        objections: "price; timing; spouse",
        notes: "Strong day on Reels",
      },
    },
  },
  inbound_dialer_day: {
    label: "Inbound dialer day",
    table: "setter_activity (role=inbound_dialer)",
    payload: {
      event_type: "inbound_dialer_day",
      data: {
        team_member_name: "Sam",
        activity_date: "2026-05-19",
        lead_source: "Inbound",
        dials: 120,
        connections: 42,
        qualified_convos: 22,
        sets: 9,
        live_calls: 7,
        closes: 3,
        cash_collected_cents: 600000,
        total_revenue_cents: 1200000,
        objections: "need to think; price",
        notes: "Hot lead surge after launch email",
      },
    },
  },
  content_post: {
    label: "Content post",
    table: "content_pieces",
    payload: {
      event_type: "content_post",
      data: {
        platform: "reel",
        title: "3 reasons your offer isn't closing",
        url: "https://instagram.com/p/abc",
        hook: "Your offer isn't broken — your promise is",
        body: "Walk through the 3 promise levels…",
        cta: "DM the word PROMISE",
        topic: "Offer creation",
        pain_point: "Low close rate",
        funnel_stage: "TOFU",
        awareness_stage: "problem_aware",
        posted_at: "2026-05-19T14:00:00Z",
        duration_seconds: 47,
      },
    },
  },
  onboarding_response: {
    label: "Onboarding response",
    table: "onboarding_responses",
    payload: {
      event_type: "onboarding_response",
      data: {
        client_id: "00000000-0000-0000-0000-000000000000",
        submitted_at: "2026-05-19T20:00:00Z",
        responses: {
          business_name: "Acme Co",
          revenue_goal_usd: 100000,
          biggest_bottleneck: "lead flow",
          ideal_client: "B2B SaaS founders",
        },
      },
    },
  },
};

function InboundIngestCard({ orgId }: { orgId: string | undefined }) {
  const getToken = useServerFn(getOrCreateIngestToken);
  const rotate = useServerFn(rotateIngestToken);
  const qc = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ingest-token", orgId],
    enabled: !!orgId,
    queryFn: () => getToken({ data: { orgId: orgId! } }),
  });

  const rotateMut = useMutation({
    mutationFn: () => rotate({ data: { orgId: orgId! } }),
    onSuccess: (d) => { qc.setQueryData(["ingest-token", orgId], d); toast.success("Token rotated"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = data?.token ? `${origin}/api/public/ingest/${data.token}` : "";

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success("Copied");
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1200);
    } catch { toast.error("Copy failed"); }
  };

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-primary">Inbound Webhook</div>
          <h2 className="display-serif text-xl mt-1">Your workspace ingest endpoint</h2>
          <p className="text-xs text-muted-foreground mt-1">
            POST JSON with an <code className="font-mono text-accent">event_type</code> field. The endpoint routes the payload to the right table automatically.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => rotateMut.mutate()} disabled={rotateMut.isPending} className="text-xs">
          <RefreshCw className="h-3 w-3" /> Rotate
        </Button>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-3xs uppercase tracking-wider text-muted-foreground">Endpoint URL</Label>
          <div className="flex gap-2">
            <Input readOnly value={isLoading ? "Loading…" : url} className="font-mono text-xs bg-background" />
            <Button variant="outline" size="sm" onClick={() => copy(url, "url")} disabled={!url}>
              {copied === "url" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
            </Button>
          </div>
          <p className="text-3xs text-muted-foreground">Treat this URL as a secret — anyone with it can write into your workspace. Rotate if leaked.</p>
        </div>

        <div className="rule-gold" />

        <div>
          <Label className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 block">Payload schemas by event type</Label>
          <Tabs defaultValue="closer_call">
            <TabsList className="grid grid-cols-5 w-full">
              {Object.entries(EXAMPLES).map(([k, v]) => (
                <TabsTrigger key={k} value={k} className="text-2xs">{v.label}</TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(EXAMPLES).map(([k, v]) => {
              const json = JSON.stringify(v.payload, null, 2);
              const curl = url ? `curl -X POST '${url}' \\\n  -H 'content-type: application/json' \\\n  -d '${json.replace(/'/g, "'\\''")}'` : "";
              return (
                <TabsContent key={k} value={k} className="mt-3 space-y-3">
                  <div className="text-2xs text-muted-foreground">
                    Routes to <span className="font-mono text-accent">{v.table}</span>
                  </div>
                  <div className="rounded-md border border-border bg-background overflow-hidden">
                    <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                      <span className="text-3xs uppercase tracking-wider text-muted-foreground">JSON body</span>
                      <Button variant="ghost" size="sm" className="h-6 text-3xs" onClick={() => copy(json, `json-${k}`)}>
                        {copied === `json-${k}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                      </Button>
                    </div>
                    <pre className="p-3 text-2xs font-mono overflow-x-auto max-h-72">{json}</pre>
                  </div>
                  {url && (
                    <div className="rounded-md border border-border bg-background overflow-hidden">
                      <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                        <span className="text-3xs uppercase tracking-wider text-muted-foreground">cURL</span>
                        <Button variant="ghost" size="sm" className="h-6 text-3xs" onClick={() => copy(curl, `curl-${k}`)}>
                          {copied === `curl-${k}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
                        </Button>
                      </div>
                      <pre className="p-3 text-2xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
                    </div>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
