import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Hash, Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { v: "", label: "All categories" },
  { v: "hooks", label: "Hooks" },
  { v: "reels", label: "Reels / Shorts" },
  { v: "story", label: "Stories" },
  { v: "email", label: "Email" },
  { v: "long-form", label: "Long-form" },
  { v: "lead", label: "Lead events" },
  { v: "sale", label: "Sales (closed-won)" },
  { v: "digest", label: "Weekly digest" },
];

const EVENT_OPTIONS = [
  "content.ready_to_post",
  "lead.created",
  "lead.qualified",
  "call.closed_won",
  "digest.weekly",
];

interface SubRow {
  id: string;
  name: string;
  target_url: string;
  channel: string;
  category: string | null;
  event_types: string[];
  active: boolean;
}

export function WebhookChannels() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", target_url: "", channel: "discord", category: "", event_types: ["content.ready_to_post"] });

  const { data: subs } = useQuery({
    queryKey: ["webhook-subs", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_subscriptions")
        .select("id, name, target_url, channel, category, event_types, active")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SubRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("webhook_subscriptions").insert({
        org_id: orgId!,
        name: draft.name || `${draft.channel} · ${draft.category || "all"}`,
        target_url: draft.target_url,
        channel: draft.channel,
        category: draft.category || null,
        event_types: draft.event_types,
        active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Channel added");
      setAdding(false);
      setDraft({ name: "", target_url: "", channel: "discord", category: "", event_types: ["content.ready_to_post"] });
      qc.invalidateQueries({ queryKey: ["webhook-subs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("webhook_subscriptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["webhook-subs"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("webhook_subscriptions").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-subs"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Webhook className="h-4 w-4 text-accent" /> Admin channels (Discord / Slack / n8n)
          </div>
          <div className="text-[11px] text-muted-foreground">
            Route specific event categories to specific channels. Example: send "Ready to Post · reels" scripts to <span className="font-mono">#admin-reels</span>, "sale" events to <span className="font-mono">#wins</span>.
          </div>
        </div>
        <Button size="sm" onClick={() => setAdding(v => !v)}><Plus className="h-3.5 w-3.5" />Add channel</Button>
      </div>

      {adding && (
        <div className="rounded border border-dashed border-border p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Label</Label>
              <Input placeholder="#admin-reels" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <Label className="text-[11px]">Channel type</Label>
              <Select value={draft.channel} onValueChange={v => setDraft(d => ({ ...d, channel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord webhook</SelectItem>
                  <SelectItem value="slack">Slack webhook</SelectItem>
                  <SelectItem value="n8n">n8n / generic JSON</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Webhook URL</Label>
            <Input placeholder="https://discord.com/api/webhooks/..." value={draft.target_url} onChange={e => setDraft(d => ({ ...d, target_url: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Category filter</Label>
              <Select value={draft.category || "_all"} onValueChange={v => setDraft(d => ({ ...d, category: v === "_all" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c.v || "_all"} value={c.v || "_all"}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px]">Event types</Label>
              <Select value={draft.event_types[0]} onValueChange={v => setDraft(d => ({ ...d, event_types: [v] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" disabled={create.isPending || !draft.target_url} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="h-3 w-3 animate-spin" />}Save
            </Button>
          </div>
        </div>
      )}

      <div className="divide-y divide-border">
        {(subs ?? []).map(s => (
          <div key={s.id} className="flex items-center justify-between py-2 text-xs">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                <Hash className="h-3 w-3 text-muted-foreground" /> {s.name}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{s.channel}</span>
                {s.category && <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[10px] uppercase tracking-wider">{s.category}</span>}
                {!s.active && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">paused</span>}
              </div>
              <div className="text-[10px] text-muted-foreground truncate max-w-[420px] font-mono">{s.target_url}</div>
              <div className="text-[10px] text-muted-foreground">{s.event_types.join(" · ")}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => toggleActive.mutate({ id: s.id, active: !s.active })}>{s.active ? "Pause" : "Resume"}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
            </div>
          </div>
        ))}
        {(!subs || subs.length === 0) && <div className="text-xs text-muted-foreground py-4 text-center">No channels yet. Add one to route ready-to-post scripts, leads, or wins to Discord/Slack/n8n.</div>}
      </div>
    </div>
  );
}
