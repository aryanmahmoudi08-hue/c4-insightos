import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockSentinelReply, withMockDelay } from "@/lib/dev-mock-data";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { EmptyState } from "@/components/empty-state";
import { Sparkles, Send, Inbox, AlertTriangle } from "lucide-react";
import { askSentinelFn } from "@/lib/sentinel.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/insights")({ component: Sentinel });

type ChatMessage = { role: "user" | "assistant"; content: string; toolsUsed?: string[] };

const STARTER_QUESTIONS = [
  "How's this week going?",
  "Any clients at risk?",
  "What's our content mix look like?",
  "Any open alerts I should know about?",
];

function Sentinel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { user, devBypass } = useAuth();
  const askFn = useServerFn(askSentinelFn);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: alerts } = useQuery({
    queryKey: ["sentinel-open-alerts", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass) return [
        { id: "mock-alert-1", severity: "warning", title: "Show rate dipped below 70% this week", created_at: new Date().toISOString() },
        { id: "mock-alert-2", severity: "info", title: "3 leads have gone 5+ days without a follow-up", created_at: new Date(Date.now() - 86400e3).toISOString() },
      ];
      const { data } = await supabase.from("alerts").select("id, severity, title, created_at").eq("org_id", orgId!).eq("acknowledged", false).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const next: ChatMessage[] = [...messages, { role: "user", content: question }];
      setMessages(next);
      if (devBypass) {
        const r = await withMockDelay(mockSentinelReply(question));
        return r;
      }
      // In-session memory only (V1 scope) — the last 12 turns of real
      // conversation, not a persisted thread.
      const history = next.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      return askFn({ data: { messages: history } });
    },
    onSuccess: (r) => setMessages((prev) => [...prev, { role: "assistant", content: r.reply, toolsUsed: r.toolsUsed }]),
    onError: (e) => setMessages((prev) => [...prev, { role: "assistant", content: `Something went wrong: ${e instanceof Error ? e.message : "unknown error"}` }]),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, ask.isPending]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || ask.isPending) return;
    setDraft("");
    ask.mutate(q);
  };

  return (
    <>
      <TopBar title="C4 Sentinel" subtitle="Ask a direct question — grounded in your real data, never a plausible-sounding guess" showDateRange={false} />
      <div className="p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Chat column */}
          <div className="hover-lift relative flex h-[calc(100vh-11rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
            <div className="relative flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent/15 text-accent"><Sparkles className="h-4 w-4" /></div>
              <div>
                <div className="text-sm font-semibold">C4 Sentinel</div>
                <div className="text-2xs text-muted-foreground">Read-only — answers questions, never changes data.</div>
              </div>
            </div>

            <div ref={scrollRef} className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-full border border-border bg-background/60 text-accent">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">Ask C4 Sentinel anything about your business</div>
                    <div className="mt-1 max-w-sm text-xs text-muted-foreground">Grounded in your real cash, calls, content, and client data — if it doesn't have enough data to answer, it'll say so.</div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {STARTER_QUESTIONS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="rounded-full border border-border bg-background/60 px-3 py-1.5 text-2xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i} className={cn("flex items-start gap-2.5", m.role === "user" && "flex-row-reverse")}>
                  {m.role === "user" ? (
                    <AvatarInitials name={user?.email ?? "You"} size="sm" />
                  ) : (
                    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Sparkles className="h-3.5 w-3.5" /></div>
                  )}
                  <div className={cn("max-w-[75%] space-y-1", m.role === "user" && "flex flex-col items-end")}>
                    <div className={cn(
                      "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.role === "user" ? "bg-primary/15 text-foreground" : "bg-muted/50 text-foreground",
                    )}>
                      {m.content}
                    </div>
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <div className="text-3xs text-muted-foreground">Grounded on: {m.toolsUsed.join(", ")}</div>
                    )}
                  </div>
                </div>
              ))}

              {ask.isPending && (
                <div className="flex items-start gap-2.5">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent"><Sparkles className="h-3.5 w-3.5" /></div>
                  <div className="rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm text-muted-foreground">Thinking…</div>
                </div>
              )}
            </div>

            <div className="relative border-t border-border p-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
                  placeholder="Ask about cash, calls, content, clients, alerts…"
                  rows={1}
                  className="min-h-[40px] resize-none text-sm"
                />
                <Button size="icon" onClick={() => send(draft)} disabled={ask.isPending || !draft.trim()} aria-label="Send">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Open Alerts — first-class side panel, not a separate list. */}
          <div className="hover-lift relative overflow-hidden rounded-2xl border border-border bg-card">
            <div className="glass-highlight pointer-events-none absolute inset-0 rounded-2xl" />
            <div className="relative flex items-center gap-2 border-b border-border px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-[color:var(--color-warning)]" />
              <div className="text-sm font-semibold">Open Alerts</div>
              <span className="ml-auto font-mono text-2xs text-muted-foreground">{alerts?.length ?? 0}</span>
            </div>
            <div className="relative divide-y divide-border">
              {(alerts ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => send(`Tell me more about this alert: "${a.title}"`)}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-muted/30"
                >
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", a.severity === "critical" ? "bg-destructive" : a.severity === "warning" ? "bg-[color:var(--color-warning)]" : "bg-primary")} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium leading-snug">{a.title}</div>
                    <div className="mt-0.5 text-3xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                </button>
              ))}
              {(!alerts || alerts.length === 0) && (
                <EmptyState icon={<Inbox className="h-4 w-4" />} title="All systems nominal" description="No open alerts right now." />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
