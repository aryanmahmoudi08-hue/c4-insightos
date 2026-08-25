import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Inbox, Mail, MessageSquare, PhoneCall, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TopBar } from "@/components/app-sidebar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCrmInbox } from "@/lib/crm-foundation.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sales/inbox")({ component: SalesInbox });

type InboxThread = Awaited<ReturnType<typeof getCrmInbox>>[number];

function relativeTime(value?: string | null) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SalesInbox() {
  const inboxFn = useServerFn(getCrmInbox);
  const inboxQuery = useQuery({ queryKey: ["sales-crm-inbox"], queryFn: () => inboxFn() });
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState("all");
  const threads = inboxQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((thread: InboxThread) => {
      if (channel !== "all" && thread.channel !== channel) return false;
      if (!q) return true;
      return [thread.display_name, thread.subject, thread.latest_message?.body, thread.channel].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [threads, query, channel]);

  return <><TopBar title="Sales CRM Inbox" subtitle="Preserved conversations and provider-neutral communication threads" /><main className="mx-auto max-w-[1500px] space-y-4 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><Link to="/sales" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Sales CRM</Link><div className="rounded bg-muted px-2 py-1 text-3xs uppercase tracking-wide text-muted-foreground">Read-only until a provider account is configured</div></div><section className="overflow-hidden rounded-xl border border-border/80 bg-card"><div className="flex flex-col gap-3 border-b border-border/70 p-4 lg:flex-row lg:items-center lg:justify-between"><div><h1 className="flex items-center gap-2 text-lg font-semibold"><Inbox className="h-4.5 w-4.5 text-accent" />Unified inbox</h1><p className="mt-1 text-xs text-muted-foreground">Legacy DM conversations remain visible here while Gmail and Twilio threads will join the same operating surface after secure provider setup.</p></div><label className="relative w-full lg:w-80"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations…" className="pl-9" /></label></div><div className="border-b border-border/70 px-4 py-2"><Tabs value={channel} onValueChange={setChannel}><TabsList className="h-auto bg-transparent p-0"><TabsTrigger value="all">All</TabsTrigger><TabsTrigger value="instagram_dm"><MessageSquare className="mr-1 h-3 w-3" />DM</TabsTrigger><TabsTrigger value="sms"><PhoneCall className="mr-1 h-3 w-3" />SMS</TabsTrigger><TabsTrigger value="email"><Mail className="mr-1 h-3 w-3" />Email</TabsTrigger></TabsList></Tabs></div><div className="divide-y divide-border/60">{inboxQuery.isLoading && <div className="p-10 text-center text-sm text-muted-foreground">Loading conversations…</div>}{!inboxQuery.isLoading && filtered.map((thread: InboxThread) => <InboxRow key={`${thread.record_source}-${thread.id}`} thread={thread} />)}{!inboxQuery.isLoading && !filtered.length && <div className="p-12 text-center"><Inbox className="mx-auto h-7 w-7 text-muted-foreground/50" /><p className="mt-3 text-sm font-medium">No conversations in this view</p><p className="mt-1 text-xs text-muted-foreground">Existing conversations will remain visible. New Gmail and Twilio messages appear only after the relevant provider account is configured.</p></div>}</div></section></main></>;
}

function InboxRow({ thread }: { thread: InboxThread }) {
  const Icon = thread.channel === "email" ? Mail : thread.channel === "sms" ? PhoneCall : MessageSquare;
  const href = thread.legacy_lead_id ? `/sales/contacts/${thread.legacy_lead_id}` : "/sales";
  return <Link to={href as "/sales"} className="block px-4 py-3 transition-colors hover:bg-muted/25"><div className="flex items-center gap-3"><span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", thread.unread_count ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground")}><Icon className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><div className="truncate text-sm font-medium">{thread.display_name}</div><time className="shrink-0 text-2xs text-muted-foreground">{relativeTime(thread.last_message_at ?? thread.created_at)}</time></div><div className="mt-0.5 truncate text-xs text-muted-foreground">{thread.subject ?? thread.latest_message?.body ?? "No message content retained"}</div><div className="mt-1 flex items-center gap-2 text-3xs uppercase tracking-wide text-muted-foreground"><span>{thread.channel.replaceAll("_", " ")}</span><span>·</span><span>{thread.record_source === "legacy_conversation" ? "Preserved history" : "CRM thread"}</span>{thread.latest_message?.status && <><span>·</span><span>{thread.latest_message.status}</span></>}</div></div></div></Link>;
}
