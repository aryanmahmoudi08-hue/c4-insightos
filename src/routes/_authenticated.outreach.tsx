import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Mail, MessageSquare, Plus, Send, Calendar, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { BentoGrid, BentoCell } from "@/components/bento-grid";
import { SPECTRUM_VAR, SPECTRUM_TEXT_CLASS, type SpectrumPosition } from "@/lib/spectrum";

export const Route = createFileRoute("/_authenticated/outreach")({ component: Outreach });

const STATUS_TONE: Record<string, string> = {
  draft: CHIP_TONE_CLASSES.default,
  scheduled: CHIP_TONE_CLASSES.warning,
  sending: CHIP_TONE_CLASSES.info,
  sent: CHIP_TONE_CLASSES.success,
  failed: CHIP_TONE_CLASSES.destructive,
};

function MessagePipelineHero({ counts, lists }: { counts: { draft: number; scheduled: number; sending: number; sent: number; failed: number }; lists: number }) {
  const stages: { label: string; value: number; spectrum: SpectrumPosition }[] = [
    { label: "Draft", value: counts.draft, spectrum: "cold" },
    { label: "Scheduled / Sending", value: counts.scheduled + counts.sending, spectrum: "mid" },
    { label: "Sent", value: counts.sent, spectrum: "hot" },
  ];
  const max = Math.max(1, ...stages.map(s => s.value));
  return (
    <div className="hover-lift relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Message Pipeline</div>
          <div className="display-serif mt-0.5 text-2xl">{lists} list{lists === 1 ? "" : "s"} in play</div>
        </div>
        {counts.failed > 0 && (
          <span className="badge-glass shrink-0 font-mono normal-case tracking-normal text-destructive">{counts.failed} failed</span>
        )}
      </div>
      <div className="relative flex flex-1 flex-col justify-center gap-2.5 py-3">
        {stages.map(s => {
          const width = Math.max(4, Math.round((s.value / max) * 100));
          return (
            <div key={s.label} className="space-y-1">
              <div className="flex items-center justify-between text-2xs">
                <span className="font-medium">{s.label}</span>
                <span className={`font-mono font-semibold ${SPECTRUM_TEXT_CLASS[s.spectrum]}`}>{s.value}</span>
              </div>
              <div className="h-2 rounded bg-muted/30 overflow-hidden">
                <div className="h-full rounded transition-all duration-500" style={{ width: `${width}%`, background: SPECTRUM_VAR[s.spectrum] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Outreach() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const { data: lists } = useQuery({
    queryKey: ["outreach-lists", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_lists")
        .select("id, name, kind, created_at, outreach_recipients(count)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["outreach-messages", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outreach_messages")
        .select("id, kind, subject, body, scheduled_for, sent_at, status, list_id, created_at, outreach_lists(name)")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createList = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") || "").trim();
      const kind = String(form.get("kind") || "email");
      if (!name) throw new Error("Name required");
      const { error } = await supabase.from("outreach_lists").insert({ org_id: orgId!, name, kind });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("List created"); qc.invalidateQueries({ queryKey: ["outreach-lists"] }); setListOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Message Pipeline hero (B1) — draft/scheduled/sending are pre-send (cold/mid),
  // sent is the converted state (hot); failed is a genuine at-risk state, kept red.
  const statusCounts = useMemo(() => {
    const counts = { draft: 0, scheduled: 0, sending: 0, sent: 0, failed: 0 };
    for (const m of messages ?? []) {
      if (m.status in counts) counts[m.status as keyof typeof counts] += 1;
    }
    return counts;
  }, [messages]);

  const createMessage = useMutation({
    mutationFn: async (form: FormData) => {
      const kind = String(form.get("kind") || "email");
      const list_id = String(form.get("list_id") || "") || null;
      const subject = String(form.get("subject") || "") || null;
      const body = String(form.get("body") || "").trim();
      const scheduledRaw = String(form.get("scheduled_for") || "").trim();
      const scheduled_for = scheduledRaw ? new Date(scheduledRaw).toISOString() : null;
      const sendNow = String(form.get("send_now") || "") === "1";
      if (!body) throw new Error("Body required");
      const { error } = await supabase.from("outreach_messages").insert({
        org_id: orgId!, kind, list_id, subject, body,
        scheduled_for: sendNow ? null : scheduled_for,
        status: sendNow ? "queued" : scheduled_for ? "scheduled" : "draft",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Message saved · queued for next cron tick"); qc.invalidateQueries({ queryKey: ["outreach-messages"] }); setComposeOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title="Outreach" subtitle="Schedule SMS + email blasts to your lists" />
      <div className="p-6 space-y-5">
        <BentoGrid cols={2} rowHeight="8rem">
          <BentoCell span="hero">
            <MessagePipelineHero counts={statusCounts} lists={lists?.length ?? 0} />
          </BentoCell>
        </BentoGrid>

        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{lists?.length ?? 0} lists · {messages?.length ?? 0} messages</div>
          <div className="flex gap-2">
            <Dialog open={listOpen} onOpenChange={setListOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4" />New list</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create outreach list</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); createList.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
                  <div className="space-y-1.5"><Label>Name</Label><Input name="name" placeholder="e.g. June warm leads" required /></div>
                  <div className="space-y-1.5"><Label>Channel</Label>
                    <Select name="kind" defaultValue="email">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={createList.isPending}>Create list</Button>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
              <DialogTrigger asChild><Button size="sm"><Send className="h-4 w-4" />Compose</Button></DialogTrigger>
              <DialogContent className="max-w-xl">
                <DialogHeader><DialogTitle>Compose message</DialogTitle></DialogHeader>
                <form onSubmit={e => { e.preventDefault(); createMessage.mutate(new FormData(e.currentTarget)); }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5"><Label>Channel</Label>
                      <Select name="kind" defaultValue="email">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="sms">SMS</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5"><Label>List</Label>
                      <Select name="list_id">
                        <SelectTrigger><SelectValue placeholder="Pick list" /></SelectTrigger>
                        <SelectContent>
                          {(lists ?? []).map(l => <SelectItem key={l.id} value={l.id}>{l.name} ({l.kind})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5"><Label>Subject (email only)</Label><Input name="subject" placeholder="Subject line" /></div>
                  <div className="space-y-1.5"><Label>Body</Label><Textarea name="body" rows={8} placeholder="Write your message…" required /></div>
                  <div className="space-y-1.5"><Label>Schedule for (leave blank to save as draft)</Label><Input name="scheduled_for" type="datetime-local" /></div>
                  <div className="flex gap-2">
                    <Button type="submit" name="send_now" value="1" className="flex-1" disabled={createMessage.isPending}><Send className="h-4 w-4" />Queue to send now</Button>
                    <Button type="submit" variant="outline" className="flex-1" disabled={createMessage.isPending}><Calendar className="h-4 w-4" />Save / schedule</Button>
                  </div>
                  <p className="text-2xs text-muted-foreground">
                    Messages are queued in the database. A scheduled cron tick processes <span className="font-mono">queued</span> + due <span className="font-mono">scheduled</span> rows through your email / SMS provider once configured.
                  </p>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Tabs defaultValue="messages">
          <TabsList>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="lists">Lists</TabsTrigger>
          </TabsList>

          <TabsContent value="messages">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-2xs uppercase tracking-wider text-muted-foreground grid grid-cols-12 gap-2">
                <div className="col-span-1">Channel</div>
                <div className="col-span-4">Subject / preview</div>
                <div className="col-span-2">List</div>
                <div className="col-span-2">When</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2"></div>
              </div>
              {(messages ?? []).length === 0 && (
                <div className="p-10 text-center text-xs text-muted-foreground">
                  <Send className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  No messages yet — click <span className="font-semibold">Compose</span> to draft your first one.
                </div>
              )}
              {(messages ?? []).map(m => (
                <div key={m.id} className="border-t border-border px-3 py-2 grid grid-cols-12 gap-2 items-center text-sm hover:bg-muted/20">
                  <div className="col-span-1">
                    {m.kind === "email" ? <Mail className="h-4 w-4 text-accent" /> : <MessageSquare className="h-4 w-4 text-accent" />}
                  </div>
                  <div className="col-span-4 min-w-0">
                    <div className="truncate font-medium text-xs">{m.subject || (m.body ?? "").slice(0, 80)}</div>
                    {m.subject && <div className="truncate text-2xs text-muted-foreground">{(m.body ?? "").slice(0, 80)}</div>}
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground truncate">{m.outreach_lists?.name ?? "—"}</div>
                  <div className="col-span-2 text-2xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {m.sent_at ? new Date(m.sent_at).toLocaleString() : m.scheduled_for ? new Date(m.scheduled_for).toLocaleString() : "—"}
                  </div>
                  <div className="col-span-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-3xs font-mono uppercase ${STATUS_TONE[m.status] ?? "bg-muted text-muted-foreground"}`}>{m.status}</span>
                  </div>
                  <div className="col-span-2 text-right"></div>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="lists">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(lists ?? []).map(l => {
                const count = (l.outreach_recipients as { count: number }[] | null)?.[0]?.count ?? 0;
                return (
                  <div key={l.id} className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm flex items-center gap-2">
                        {l.kind === "email" ? <Mail className="h-4 w-4 text-accent" /> : <MessageSquare className="h-4 w-4 text-accent" />}
                        {l.name}
                      </div>
                      <span className="text-3xs font-mono uppercase text-muted-foreground">{l.kind}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" /> {count} recipient{count === 1 ? "" : "s"}
                    </div>
                    <div className="text-3xs text-muted-foreground">Created {new Date(l.created_at).toLocaleDateString()}</div>
                  </div>
                );
              })}
              {(lists ?? []).length === 0 && (
                <div className="col-span-full p-10 text-center text-xs text-muted-foreground rounded-lg border border-dashed border-border">
                  No lists yet — create one to group leads/customers by channel.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
