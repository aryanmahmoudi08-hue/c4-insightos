import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { StatCard } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMemo, useState } from "react";
import { Search, Users, MessageSquare, PhoneCall, DollarSign, Film } from "lucide-react";

export const Route = createFileRoute("/_authenticated/leads")({ component: Leads });

type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  handle: string | null;
  phone: string | null;
  status: string;
  intent_score: number | null;
  engagement_score: number | null;
  estimated_close_probability: number | null;
  source_connector: string | null;
  first_touch_content_id: string | null;
  qualification_notes: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  dm_received: "bg-muted text-muted-foreground",
  qualified: "bg-accent/15 text-accent",
  call_booked: "bg-primary/15 text-primary",
  showed: "bg-[color:var(--color-warning)]/15 text-[color:var(--color-warning)]",
  closed_won: "bg-[color:var(--color-success)]/15 text-[color:var(--color-success)]",
  closed_lost: "bg-destructive/15 text-destructive",
  disqualified: "bg-destructive/10 text-muted-foreground",
};

function Leads() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<LeadRow | null>(null);

  const { data: leads } = useQuery({
    queryKey: ["leads", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, email, handle, phone, status, intent_score, engagement_score, estimated_close_probability, source_connector, first_touch_content_id, qualification_notes, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter(l => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.full_name, l.email, l.handle, l.phone, l.qualification_notes].some(v => (v ?? "").toLowerCase().includes(q));
    });
  }, [leads, query, statusFilter]);

  const stats = useMemo(() => {
    const all = leads ?? [];
    return {
      total: all.length,
      qualified: all.filter(l => l.status === "qualified" || l.status === "call_booked").length,
      booked: all.filter(l => l.status === "call_booked" || l.status === "showed").length,
      attributed: all.filter(l => !!l.first_touch_content_id).length,
    };
  }, [leads]);

  const statuses = Array.from(new Set((leads ?? []).map(l => l.status))).filter(Boolean);

  return (
    <>
      <TopBar title="Leads CRM" subtitle="Full lead pipeline with intent + attribution" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total leads" value={stats.total} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Qualified" value={stats.qualified} accent="primary" />
          <StatCard label="Booked / Showed" value={stats.booked} accent="success" />
          <StatCard label="Content-attributed" value={`${stats.attributed} / ${stats.total}`} accent="accent" hint="First-touch tracked" />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, email, handle, notes…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8 h-9" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-xs">
            <option value="all">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>
          <div className="text-xs text-muted-foreground">{view.length} / {leads?.length ?? 0}</div>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Lead</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3 font-mono">Intent</th>
                <th className="text-right p-3 font-mono">Engage</th>
                <th className="text-right p-3 font-mono">Close %</th>
                <th className="text-left p-3">Attributed</th>
                <th className="text-left p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {view.map(l => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/20 cursor-pointer" onClick={() => setSelected(l)}>
                  <td className="p-3">
                    <div className="font-medium">{l.full_name || l.handle || l.email || "(no name)"}</div>
                    <div className="text-[11px] text-muted-foreground">{l.email || l.handle || l.phone || "—"}</div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{l.source_connector ?? "—"}</td>
                  <td className="p-3"><span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${STATUS_TONE[l.status] ?? "bg-muted"}`}>{l.status.replace(/_/g, " ")}</span></td>
                  <td className="p-3 text-right font-mono">{Number(l.intent_score ?? 0).toFixed(0)}</td>
                  <td className="p-3 text-right font-mono">{Number(l.engagement_score ?? 0).toFixed(0)}</td>
                  <td className="p-3 text-right font-mono text-[color:var(--color-success)]">{Math.round(Number(l.estimated_close_probability ?? 0) * 100)}%</td>
                  <td className="p-3 text-xs">{l.first_touch_content_id ? <span className="text-accent">✓ tracked</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-3 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {view.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-sm text-muted-foreground">No leads match these filters.</td></tr>}
            </tbody>
          </table>
        </div>

        <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected?.full_name || selected?.handle || selected?.email || "Lead"}</DialogTitle></DialogHeader>
            {selected && <LeadDetail lead={selected} />}
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function LeadDetail({ lead }: { lead: LeadRow }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;

  const { data: timeline } = useQuery({
    queryKey: ["lead-timeline", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const [touches, events, calls, convs] = await Promise.all([
        supabase.from("lead_content_touches").select("id, touch_type, touched_at, content_id, content_pieces!inner(title, platform)").eq("lead_id", lead.id).eq("org_id", orgId!).order("touched_at", { ascending: false }).limit(50),
        supabase.from("lead_events").select("id, event_type, occurred_at, payload").eq("lead_id", lead.id).eq("org_id", orgId!).order("occurred_at", { ascending: false }).limit(50),
        supabase.from("calls").select("id, status, scheduled_for, showed, closed, cash_collected_cents, call_summary").eq("lead_id", lead.id).eq("org_id", orgId!).order("scheduled_for", { ascending: false }).limit(20),
        supabase.from("conversations").select("id, channel, status, last_message_at, first_response_seconds").eq("lead_id", lead.id).eq("org_id", orgId!).limit(10),
      ]);
      return { touches: touches.data ?? [], events: events.data ?? [], calls: calls.data ?? [], convs: convs.data ?? [] };
    },
  });

  const totalCash = (timeline?.calls ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-xs">
        <div><span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}</div>
        <div><span className="text-muted-foreground">Handle:</span> {lead.handle ?? "—"}</div>
        <div><span className="text-muted-foreground">Phone:</span> {lead.phone ?? "—"}</div>
        <div><span className="text-muted-foreground">Source:</span> {lead.source_connector ?? "—"}</div>
        <div><span className="text-muted-foreground">Intent:</span> <span className="font-mono">{Number(lead.intent_score ?? 0).toFixed(0)}</span></div>
        <div><span className="text-muted-foreground">Engagement:</span> <span className="font-mono">{Number(lead.engagement_score ?? 0).toFixed(0)}</span></div>
      </div>

      {lead.qualification_notes && <div className="rounded border border-border bg-card p-3 text-xs"><div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>{lead.qualification_notes}</div>}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded border border-border p-2 text-center"><Film className="h-3 w-3 mx-auto text-accent mb-1" /><div className="font-mono font-bold">{timeline?.touches.length ?? 0}</div><div className="text-[10px] text-muted-foreground">content touches</div></div>
        <div className="rounded border border-border p-2 text-center"><MessageSquare className="h-3 w-3 mx-auto text-primary mb-1" /><div className="font-mono font-bold">{timeline?.convs.length ?? 0}</div><div className="text-[10px] text-muted-foreground">conversations</div></div>
        <div className="rounded border border-border p-2 text-center"><PhoneCall className="h-3 w-3 mx-auto text-[color:var(--color-success)] mb-1" /><div className="font-mono font-bold">{timeline?.calls.length ?? 0}</div><div className="text-[10px] text-muted-foreground">calls · ${Math.round(totalCash / 100).toLocaleString()}</div></div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Film className="h-3 w-3" /> Content path (first → last)</div>
        <div className="space-y-1.5">
          {(timeline?.touches ?? []).map(t => {
            const cp = Array.isArray(t.content_pieces) ? t.content_pieces[0] : t.content_pieces;
            return (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                <div className="flex-1 truncate">{cp?.title || "(untitled)"} <span className="text-muted-foreground">· {cp?.platform}</span></div>
                <div className="text-[10px] text-muted-foreground">{t.touch_type} · {new Date(t.touched_at).toLocaleDateString()}</div>
              </div>
            );
          })}
          {(timeline?.touches ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No content touches tracked.</div>}
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><PhoneCall className="h-3 w-3" /> Calls</div>
        <div className="space-y-1.5">
          {(timeline?.calls ?? []).map(c => (
            <div key={c.id} className="rounded border border-border p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium uppercase text-[10px]">{c.status}</span>
                <span className="font-mono text-[color:var(--color-success)]">${Math.round((c.cash_collected_cents ?? 0) / 100).toLocaleString()}</span>
              </div>
              {c.call_summary && <div className="mt-1 text-muted-foreground line-clamp-2">{c.call_summary}</div>}
              <div className="text-[10px] text-muted-foreground mt-1">{c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "no date"}</div>
            </div>
          ))}
          {(timeline?.calls ?? []).length === 0 && <div className="text-xs text-muted-foreground italic">No calls yet.</div>}
        </div>
      </div>
    </div>
  );
}
