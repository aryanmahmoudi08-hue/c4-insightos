import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  mockConnectorSyncStatus,
  mockEventBusEvents,
  mockRawPayloads,
  mockWebhookDeliveries,
  mockWebhookSubscriptions,
} from "@/lib/dev-mock-data";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Activity,
  Webhook,
  Radio,
  AlertCircle,
  Plus,
  Copy,
  RefreshCw,
  Check,
  Inbox,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getOrCreateIngestToken, rotateIngestToken } from "@/lib/ingest.functions";
import {
  DISPATCHED_EVENTS,
  STREAM_ONLY_EVENTS,
  discordIdentityFor,
  maskWebhookUrl,
  undeliverableEventTypes,
  webhookChannelFor,
} from "@/lib/event-catalog";
import { useRole } from "@/hooks/use-role";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { GlassTableShell } from "@/components/glass-table";
import { EmptyState } from "@/components/empty-state";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { cn } from "@/lib/utils";

/** Discord role IDs typed into the Add dialog: digits only, deduplicated. */
function parseRoleIds(raw: string): string[] {
  return Array.from(new Set(raw.split(/[\s,]+/).filter((t) => /^\d{5,25}$/.test(t))));
}

/** mention_role_ids is ahead of the generated row type. */
function rolesOf(s: unknown): string[] {
  const v = (s as { mention_role_ids?: unknown }).mention_role_ids;
  return Array.isArray(v) ? (v as string[]) : [];
}

export const Route = createFileRoute("/_authenticated/events")({ component: EventsBus });

function EventsBus() {
  const { data: org } = useCurrentOrg();
  const { devBypass } = useAuth();
  const orgId = org?.org_id;
  const { range } = useDateRange();
  const fromISO = `${range.from}T00:00:00`;
  const toISO = `${range.to}T23:59:59`;
  const qc = useQueryClient();
  const { canManage } = useRole();
  const [open, setOpen] = useState(false);
  const [draftTypes, setDraftTypes] = useState<string[]>(["call.closed_won", "payment.collected"]);

  const { data: events } = useQuery({
    queryKey: ["events", orgId, range.from, range.to, devBypass],
    enabled: devBypass || !!orgId,
    refetchInterval: devBypass ? false : 5000,
    queryFn: async () => {
      if (devBypass) return mockEventBusEvents();
      const { data, error } = await supabase
        .from("events")
        .select("id, event_type, subject_type, payload, occurred_at, actor_user_id")
        .eq("org_id", orgId!)
        .gte("occurred_at", fromISO)
        .lte("occurred_at", toISO)
        .order("occurred_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  // Subscriptions are webhook config, not a time-scoped log — a date range
  // would hide an active subscription created outside the window, same
  // reasoning as the clients/hiring/leads roster pages.
  const { data: subs } = useQuery({
    queryKey: ["webhook-subs", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (devBypass) return mockWebhookSubscriptions();
      // Deliberately not `select("*")`: that shipped `signing_secret` into
      // the browser payload on every page load, for a column nothing on this
      // page renders. Name the columns so adding a secret column later cannot
      // silently leak it.
      // mention_role_ids is ahead of the generated types (20261113090000),
      // so the row shape is stated here rather than inferred.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("webhook_subscriptions")
        .select(
          "id, name, target_url, channel, category, event_types, active, created_at, mention_role_ids",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        target_url: string;
        channel: string;
        category: string | null;
        event_types: string[];
        active: boolean;
        created_at: string;
        mention_role_ids: string[] | null;
      }>;
    },
  });

  const { data: deliveries } = useQuery({
    queryKey: ["webhook-deliveries", orgId, range.from, range.to, devBypass],
    enabled: devBypass || !!orgId,
    refetchInterval: devBypass ? false : 10000,
    queryFn: async () => {
      if (devBypass) return mockWebhookDeliveries();
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("id, status, response_code, attempt, created_at, subscription_id")
        .eq("org_id", orgId!)
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Per-connector current sync state, not a log — filtering by date would
  // hide a connector whose last sync predates the window, same reasoning as
  // the clients/hiring/leads roster pages.
  const { data: syncs } = useQuery({
    queryKey: ["sync-status", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (devBypass) return mockConnectorSyncStatus();
      const { data, error } = await supabase
        .from("connector_sync_status")
        .select("*")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: raw } = useQuery({
    queryKey: ["raw-payloads", orgId, range.from, range.to, devBypass],
    enabled: devBypass || !!orgId,
    refetchInterval: devBypass ? false : 10000,
    queryFn: async () => {
      if (devBypass) return mockRawPayloads();
      const { data, error } = await supabase
        .from("raw_payloads")
        .select("id, resource, connector_id, received_at, processed_at, process_error")
        .eq("org_id", orgId!)
        .gte("received_at", fromISO)
        .lte("received_at", toISO)
        .order("received_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (f: FormData) => {
      // Types come from the checked boxes, not a free-text field. Typing a
      // type by hand is how a subscription ended up naming events nothing
      // emits — it saved, reported Active, and was silent forever.
      const event_types = draftTypes;
      if (!event_types.length) throw new Error("Pick at least one event type");
      const target_url = String(f.get("target_url") || "");
      const mention_role_ids = parseRoleIds(String(f.get("mention_role_ids") || ""));
      const bot_name = String(f.get("bot_name") || "").trim() || null;
      const bot_avatar_url = String(f.get("bot_avatar_url") || "").trim() || null;
      if (bot_avatar_url && !/^https:\/\//i.test(bot_avatar_url))
        throw new Error("The bot icon must be an https:// image URL");
      // mention_role_ids is ahead of the generated types (20261113090000).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("webhook_subscriptions").insert({
        org_id: orgId!,
        name: String(f.get("name") || ""),
        target_url,
        // Was never set here, so the column fell to its 'slack' default and a
        // Discord target got raw JSON and a 400 on every event. Dispatch now
        // reads the URL too, but store it correctly so the row is honest.
        channel: webhookChannelFor(target_url),
        signing_secret: String(f.get("secret") || "") || null,
        event_types,
        mention_role_ids,
        bot_name,
        bot_avatar_url,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Webhook subscription added");
      qc.invalidateQueries({ queryKey: ["webhook-subs"] });
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // A subscription could be created but never paused or removed, so a stale
  // one kept firing (and kept failing) with the only remedy being direct
  // database access. `webhook-channels.tsx` had both controls and was never
  // mounted anywhere, which is why this went unnoticed.
  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("webhook_subscriptions")
        .update({ active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.active ? "Subscription resumed" : "Subscription paused");
      qc.invalidateQueries({ queryKey: ["webhook-subs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subscription deleted");
      qc.invalidateQueries({ queryKey: ["webhook-subs"] });
      qc.invalidateQueries({ queryKey: ["webhook-deliveries"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const failed = (deliveries ?? []).filter(
    (d) => d.status !== "delivered" && d.status !== "pending",
  ).length;

  return (
    <>
      <TopBar
        title="Event Bus & Webhooks"
        subtitle="Live event stream, subscriptions, and ingestion payloads"
        showDateRange
      />
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
                  <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Live Event Stream
                  </div>
                  <div className="font-sans text-4xl font-bold tabular-nums">
                    {events?.length ?? 0}
                  </div>
                  <div className="text-2xs text-muted-foreground">
                    Events in range · refreshing every 5s
                  </div>
                </div>
              </div>
              <div className="relative h-10 w-px bg-border" />
              <div className="relative flex items-center gap-2">
                <AlertCircle
                  className={`h-4 w-4 ${failed ? "text-destructive" : "text-[color:var(--color-success)]"}`}
                />
                <div>
                  <div
                    className={`font-sans text-2xl font-bold tabular-nums ${failed ? "text-destructive" : "text-[color:var(--color-success)]"}`}
                  >
                    {failed}
                  </div>
                  <div className="text-2xs text-muted-foreground">Failed deliveries</div>
                </div>
              </div>
            </div>
          </BentoCell>
        </BentoGrid>

        <InboundIngestCard orgId={orgId} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Events (recent)"
            value={events?.length ?? 0}
            icon={<Activity className="h-4 w-4" />}
            accent="primary"
          />
          <StatCard
            label="Active subscriptions"
            value={(subs ?? []).filter((s) => s.active).length}
            icon={<Webhook className="h-4 w-4" />}
            accent="accent"
          />
          <StatCard
            label="Failed deliveries"
            value={failed}
            accent={failed ? "destructive" : "success"}
            icon={<AlertCircle className="h-4 w-4" />}
          />
          <StatCard
            label="Sync streams"
            value={syncs?.length ?? 0}
            icon={<Radio className="h-4 w-4" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground flex justify-between items-center">
              <span>Live event stream</span>
              <span className="font-mono">Refresh 5s</span>
            </div>
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {/* dispatch.lookup_failed (dispatch.server.ts) is a genuine query
                  failure, not a business event — never let it blend into the
                  normal accent-colored stream. */}
              {(events ?? []).map((e) => {
                const isDispatchFailure = e.event_type === "dispatch.lookup_failed";
                return (
                  <div
                    key={e.id}
                    className={cn("p-3 hover:bg-muted/20", isDispatchFailure && "bg-destructive/5")}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "font-mono text-xs",
                          isDispatchFailure ? "text-destructive" : "text-accent",
                        )}
                      >
                        {e.event_type}
                      </span>
                      <span className="text-3xs text-muted-foreground">
                        {new Date(e.occurred_at).toLocaleTimeString()}
                      </span>
                    </div>
                    {isDispatchFailure ? (
                      <div className="flex items-center gap-1 text-2xs text-destructive mt-0.5">
                        <AlertCircle className="h-3 w-3" /> Query failed, not a real dispatch —{" "}
                        {String(
                          (e.payload as Record<string, unknown> | null)?.error ?? "unknown error",
                        )}
                      </div>
                    ) : (
                      <div className="text-2xs text-muted-foreground mt-0.5">
                        {e.subject_type ?? "—"}
                      </div>
                    )}
                  </div>
                );
              })}
              {(!events || events.length === 0) && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  No events emitted yet.
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
                <span className="text-2xs uppercase tracking-wider text-muted-foreground">
                  Webhook subscriptions
                </span>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-6 text-xs">
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New webhook subscription</DialogTitle>
                    </DialogHeader>
                    <form
                      className="space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        create.mutate(new FormData(e.currentTarget));
                      }}
                    >
                      <div className="space-y-1.5">
                        <Label>Name</Label>
                        <Input name="name" placeholder="Slack #closes channel" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Target URL</Label>
                        <Input name="target_url" type="url" required />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Signing secret (optional)</Label>
                        <Input name="secret" type="password" />
                        <div className="text-3xs text-muted-foreground">
                          Not needed for Discord, which does not verify signatures.
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Discord roles to ping (optional)</Label>
                        <Input
                          name="mention_role_ids"
                          inputMode="numeric"
                          placeholder="e.g. 1570643974073487430, 1570644095586664649"
                        />
                        <div className="text-3xs text-muted-foreground">
                          Role IDs, comma-separated. In Discord: Server Settings → Roles →
                          right-click a role → Copy Role ID (needs Developer Mode). Each message
                          mentions them and they get notified.
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Bot name (optional)</Label>
                          <Input
                            name="bot_name"
                            maxLength={80}
                            placeholder={
                              discordIdentityFor(draftTypes[0] ?? "")?.username ??
                              "e.g. CALL BOOKED"
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Bot icon URL (optional)</Label>
                          <Input name="bot_avatar_url" type="url" placeholder="https://…png" />
                        </div>
                      </div>
                      <div className="text-3xs text-muted-foreground">
                        Discord only. Left empty, each event posts under its own name and icon (e.g.
                        CALL BOOKED with 📅), so you rarely need these.
                      </div>
                      <div className="space-y-1.5">
                        <Label>Events to send</Label>
                        <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                          {DISPATCHED_EVENTS.map((e) => {
                            const checked = draftTypes.includes(e.type);
                            return (
                              <label
                                key={e.type}
                                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50"
                              >
                                <input
                                  type="checkbox"
                                  className="accent-[color:var(--color-accent)]"
                                  checked={checked}
                                  onChange={() =>
                                    setDraftTypes((prev) =>
                                      checked
                                        ? prev.filter((t) => t !== e.type)
                                        : [...prev, e.type],
                                    )
                                  }
                                />
                                <span className="flex-1">{e.label}</span>
                                <span className="font-mono text-3xs text-muted-foreground">
                                  {e.type}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="text-3xs text-muted-foreground">
                          These are the events the app dispatches to webhooks.{" "}
                          {STREAM_ONLY_EVENTS.map((e) => e.type).join(", ")} appear in the live
                          stream but are never dispatched, so they are not offered here.
                        </div>
                      </div>
                      <Button type="submit" className="w-full" disabled={create.isPending}>
                        Subscribe
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="divide-y divide-border max-h-60 overflow-y-auto">
                {(subs ?? []).map((s) => {
                  const dead = undeliverableEventTypes(s.event_types);
                  return (
                    <div key={s.id} className="p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-3xs ${s.active ? "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]" : "bg-muted"}`}
                        >
                          {s.active ? "Active" : "Paused"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {/* The path of a Discord/Slack/n8n webhook URL is the
                            credential — it is all anyone needs to post as this
                            app. Masked so a screenshot of this panel does not
                            hand it out; Copy still gives the real URL to the
                            clipboard for whoever needs to check it. */}
                        <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground">
                          {maskWebhookUrl(s.target_url)}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 shrink-0 px-1 text-3xs"
                          onClick={() => {
                            navigator.clipboard.writeText(s.target_url ?? "").then(
                              () => toast.success("Target URL copied"),
                              () => toast.error("Could not copy"),
                            );
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="mt-1 text-3xs text-muted-foreground">
                        {(s.event_types ?? []).length} event type
                        {(s.event_types ?? []).length === 1 ? "" : "s"}
                        {(s.event_types ?? []).length > 0 && (
                          <span className="font-mono"> · {(s.event_types ?? []).join(", ")}</span>
                        )}
                      </div>
                      {rolesOf(s).length > 0 && (
                        <div className="mt-0.5 text-3xs text-muted-foreground">
                          Pings {rolesOf(s).length} Discord role{rolesOf(s).length === 1 ? "" : "s"}
                        </div>
                      )}
                      {dead.length > 0 && (
                        /* An event type nothing dispatches makes a subscription
                           permanently silent while still reporting Active. Say
                           so here rather than leaving the reader to wonder why
                           a correctly-configured row never fires. */
                        <div className="mt-1 flex items-start gap-1 text-3xs text-[color:var(--color-warning)]">
                          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                          <span>
                            Never delivers: <span className="font-mono">{dead.join(", ")}</span> is
                            not dispatched to webhooks.
                          </span>
                        </div>
                      )}
                      {canManage && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <label className="flex cursor-pointer items-center gap-1.5 text-3xs text-muted-foreground">
                            <Switch
                              checked={!!s.active}
                              disabled={setActive.isPending}
                              onCheckedChange={(active) => setActive.mutate({ id: s.id, active })}
                            />
                            {s.active ? "Sending" : "Paused"}
                          </label>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-1.5 text-3xs text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete “{s.name}”?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Events will stop being sent to{" "}
                                  <span className="font-mono">{maskWebhookUrl(s.target_url)}</span>.
                                  This cannot be undone — the target URL and signing secret are
                                  deleted with it, and its delivery history goes too. To stop
                                  deliveries without losing the configuration, pause it instead.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => remove.mutate(s.id)}
                                  disabled={remove.isPending}
                                >
                                  Delete subscription
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!subs || subs.length === 0) && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No subscriptions configured.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground">
                Connector sync status
              </div>
              <div className="divide-y divide-border max-h-48 overflow-y-auto">
                {(syncs ?? []).map((s) => (
                  <div key={s.id} className="p-3 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-mono">{s.resource}</div>
                      <div className="text-3xs text-muted-foreground">
                        {s.last_sync_at
                          ? `last ${new Date(s.last_sync_at).toLocaleTimeString()}`
                          : "never"}{" "}
                        · {s.records_synced ?? 0} records
                      </div>
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-3xs uppercase bg-muted">
                      {s.state}
                    </span>
                  </div>
                ))}
                {(!syncs || syncs.length === 0) && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    No sync streams.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GlassTableShell
            toolbar={
              <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                Webhook deliveries
              </div>
            }
            maxHeight="360px"
          >
            <table className="w-full text-xs">
              <thead className="sticky-thead text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Attempt</th>
                  <th className="text-left p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(deliveries ?? []).map((d) => (
                  <tr key={d.id} className="border-t border-border/70">
                    <td className="p-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-3xs ${d.status === "delivered" ? CHIP_TONE_CLASSES.success : d.status === "pending" ? CHIP_TONE_CLASSES.default : CHIP_TONE_CLASSES.destructive}`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td className="p-2 font-mono">{d.response_code ?? "—"}</td>
                    <td className="p-2 font-mono">{d.attempt}</td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(d.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {(!deliveries || deliveries.length === 0) && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={<Webhook className="h-4 w-4" />}
                        title="No deliveries yet"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
          <GlassTableShell
            toolbar={
              <div className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">
                Raw ingestion payloads
              </div>
            }
            maxHeight="360px"
          >
            <table className="w-full text-xs">
              <thead className="sticky-thead text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left p-2">Connector</th>
                  <th className="text-left p-2">Resource</th>
                  <th className="text-left p-2">Processed</th>
                  <th className="text-left p-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {(raw ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border/70">
                    <td className="p-2 font-mono">{r.connector_id}</td>
                    <td className="p-2">{r.resource}</td>
                    <td className="p-2">
                      {r.process_error ? (
                        <span className="text-destructive">Err</span>
                      ) : r.processed_at ? (
                        "✓"
                      ) : (
                        <span className="text-muted-foreground">Queued</span>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(r.received_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {(!raw || raw.length === 0) && (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState
                        icon={<Inbox className="h-4 w-4" />}
                        title="No payloads ingested yet"
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
        </div>
      </div>
    </>
  );
}

const EXAMPLES: Record<string, { label: string; table: string; payload: Record<string, unknown> }> =
  {
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
    onSuccess: (d) => {
      qc.setQueryData(["ingest-token", orgId], d);
      toast.success("Token rotated");
    },
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
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div>
          <div className="eyebrow text-primary">Inbound Webhook</div>
          <h2 className="display-serif text-xl mt-1">Your workspace ingest endpoint</h2>
          <p className="text-xs text-muted-foreground mt-1">
            POST JSON with an <code className="font-mono text-accent">event_type</code> field. The
            endpoint routes the payload to the right table automatically.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => rotateMut.mutate()}
          disabled={rotateMut.isPending}
          className="text-xs"
        >
          <RefreshCw className="h-3 w-3" /> Rotate
        </Button>
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label className="text-3xs uppercase tracking-wider text-muted-foreground">
            Endpoint URL
          </Label>
          <div className="flex gap-2">
            <Input
              readOnly
              value={isLoading ? "Loading…" : url}
              className="font-mono text-xs bg-background"
            />
            <Button variant="outline" size="sm" onClick={() => copy(url, "url")} disabled={!url}>
              {copied === "url" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
            </Button>
          </div>
          <p className="text-3xs text-muted-foreground">
            Treat this URL as a secret — anyone with it can write into your workspace. Rotate if
            leaked.
          </p>
        </div>

        <div className="rule-gold" />

        <div>
          <Label className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 block">
            Payload schemas by event type
          </Label>
          <Tabs defaultValue="closer_call">
            <TabsList className="grid grid-cols-5 w-full">
              {Object.entries(EXAMPLES).map(([k, v]) => (
                <TabsTrigger key={k} value={k} className="text-2xs">
                  {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {Object.entries(EXAMPLES).map(([k, v]) => {
              const json = JSON.stringify(v.payload, null, 2);
              const curl = url
                ? `curl -X POST '${url}' \\\n  -H 'content-type: application/json' \\\n  -d '${json.replace(/'/g, "'\\''")}'`
                : "";
              return (
                <TabsContent key={k} value={k} className="mt-3 space-y-3">
                  <div className="text-2xs text-muted-foreground">
                    Routes to <span className="font-mono text-accent">{v.table}</span>
                  </div>
                  <div className="rounded-md border border-border bg-background overflow-hidden">
                    <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                      <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                        JSON body
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-3xs"
                        onClick={() => copy(json, `json-${k}`)}
                      >
                        {copied === `json-${k}` ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}{" "}
                        Copy
                      </Button>
                    </div>
                    <pre className="p-3 text-2xs font-mono overflow-x-auto max-h-72">{json}</pre>
                  </div>
                  {url && (
                    <div className="rounded-md border border-border bg-background overflow-hidden">
                      <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
                        <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                          cURL
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-3xs"
                          onClick={() => copy(curl, `curl-${k}`)}
                        >
                          {copied === `curl-${k}` ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}{" "}
                          Copy
                        </Button>
                      </div>
                      <pre className="p-3 text-2xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                        {curl}
                      </pre>
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
