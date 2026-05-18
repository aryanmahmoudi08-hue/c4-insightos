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
import { Textarea } from "@/components/ui/textarea";
import { Plus, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dm-setter")({ component: DmSetter });

function DmSetter() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: leads } = useQuery({
    queryKey: ["dm-leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads")
        .select("id, full_name, handle, status, intent_score, engagement_score, created_at, conversations(id, channel, first_response_seconds)")
        .eq("org_id", orgId!).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const stats = {
    total: leads?.length ?? 0,
    booked: leads?.filter(l => l.status === "call_booked").length ?? 0,
    closed: leads?.filter(l => l.status === "closed").length ?? 0,
    ghosted: leads?.filter(l => l.status === "ghosted").length ?? 0,
  };

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const { error } = await supabase.from("leads").insert({
        org_id: orgId!,
        full_name: String(form.get("name") || "") || null,
        handle: String(form.get("handle") || "") || null,
        email: String(form.get("email") || "") || null,
        status: (form.get("status") as "dm_received") || "dm_received",
        intent_score: Number(form.get("intent") || 0),
        qualification_notes: String(form.get("notes") || "") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lead created"); qc.invalidateQueries({ queryKey: ["dm-leads"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title="DM Setter" subtitle="Conversations → booked calls" />
      <div className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Leads" value={stats.total} accent="accent" />
          <StatCard label="Booked" value={stats.booked} accent="success" />
          <StatCard label="Closed" value={stats.closed} accent="primary" />
          <StatCard label="Ghosted" value={stats.ghosted} accent="warning" />
        </div>

        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{leads?.length ?? 0} recent leads</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Add lead</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New lead</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Name</Label><Input name="name" /></div>
                  <div className="space-y-1.5"><Label>Handle</Label><Input name="handle" placeholder="@" /></div>
                </div>
                <div className="space-y-1.5"><Label>Email</Label><Input name="email" type="email" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Status</Label>
                    <Select name="status" defaultValue="dm_received"><SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{["dm_received","qualified","pre_call_assets_sent","call_booked","showed","closed","ghosted","disqualified","follow_up","no_show"].map(s =>
                        <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Intent score (0-100)</Label><Input name="intent" type="number" min={0} max={100} defaultValue={50} /></div>
                </div>
                <div className="space-y-1.5"><Label>Notes</Label><Textarea name="notes" rows={3} /></div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Add lead"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Lead</th><th className="text-left p-3">Status</th>
                <th className="text-right p-3 font-mono">Intent</th><th className="text-right p-3 font-mono">Engage</th>
                <th className="text-left p-3">Convos</th><th className="text-right p-3">Added</th></tr>
            </thead>
            <tbody>
              {(leads ?? []).map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{l.full_name || l.handle || "(unknown)"}</div>
                        {l.handle && l.full_name && <div className="text-[11px] text-muted-foreground">{l.handle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="p-3"><StatusPill s={l.status} /></td>
                  <td className="p-3 text-right font-mono">{l.intent_score ?? 0}</td>
                  <td className="p-3 text-right font-mono">{l.engagement_score ?? 0}</td>
                  <td className="p-3 text-xs text-muted-foreground">{l.conversations?.length ?? 0}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {(!leads || leads.length === 0) && (
                <tr><td colSpan={6} className="p-10 text-center text-sm text-muted-foreground">No leads yet. Add your first.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, string> = {
    new: "bg-muted text-muted-foreground",
    contacted: "bg-primary/15 text-primary",
    qualifying: "bg-accent/15 text-accent",
    booked: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
    showed: "bg-[color:var(--color-success)]/20 text-[color:var(--color-success)]",
    closed: "bg-primary/25 text-primary",
    ghosted: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
    disqualified: "bg-destructive/15 text-destructive",
  };
  return <span className={`rounded px-2 py-0.5 text-[11px] uppercase tracking-wide ${map[s] ?? "bg-muted"}`}>{s}</span>;
}
