import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Video, Layers } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import type { Database } from "@/integrations/supabase/types";

type Platform = Database["public"]["Enums"]["content_platform"];
type Angle = Database["public"]["Enums"]["content_angle"];

export const Route = createFileRoute("/_authenticated/content")({ component: ContentIntel });

function ContentIntel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slidesFor, setSlidesFor] = useState<string | null>(null);

  const { data: pieces } = useQuery({
    queryKey: ["content", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("content_pieces")
        .select("id, title, platform, hook, angle, posted_at, url, content_metrics(views, leads_generated, closes, cash_collected_cents, hook_retention_pct)")
        .eq("org_id", orgId!)
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (form: FormData) => {
      const payload = {
        org_id: orgId!,
        title: String(form.get("title") || ""),
        hook: String(form.get("hook") || "") || null,
        platform: form.get("platform") as Platform,
        angle: (form.get("angle") as Angle) || null,
        url: String(form.get("url") || "") || null,
        posted_at: new Date().toISOString(),
      };
      const { data: piece, error } = await supabase.from("content_pieces").insert(payload).select("id").single();
      if (error) throw error;
      const m = {
        org_id: orgId!,
        content_id: piece.id,
        views: Number(form.get("views") || 0),
        leads_generated: Number(form.get("leads") || 0),
        hook_retention_pct: Number(form.get("retention") || 0),
      };
      await supabase.from("content_metrics").insert(m);
    },
    onSuccess: () => { toast.success("Content logged"); qc.invalidateQueries({ queryKey: ["content"] }); setOpen(false); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <>
      <TopBar title="Content Intelligence" subtitle="Hooks, retention, cash-per-view" />
      <div className="p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="text-xs text-muted-foreground">{pieces?.length ?? 0} pieces tracked</div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" />Log content</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log content piece</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(new FormData(e.currentTarget)); }}>
                <div className="space-y-1.5"><Label>Title</Label><Input name="title" required /></div>
                <div className="space-y-1.5"><Label>Hook (first 3 sec)</Label><Textarea name="hook" rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Platform</Label>
                    <Select name="platform" defaultValue="instagram"><SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{["instagram","tiktok","youtube","x","linkedin","podcast","email","blog","other"].map(p =>
                        <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Angle</Label>
                    <Select name="angle" defaultValue="authority"><SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{["authority","story","contrarian","tutorial","case_study","aspirational","fear","social_proof"].map(p =>
                        <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="space-y-1.5"><Label>URL</Label><Input name="url" type="url" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5"><Label>Views</Label><Input name="views" type="number" defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Leads</Label><Input name="leads" type="number" defaultValue={0} /></div>
                  <div className="space-y-1.5"><Label>Retention %</Label><Input name="retention" type="number" step="0.1" defaultValue={0} /></div>
                </div>
                <Button type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "…" : "Save"}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Hook / Title</th><th className="text-left p-3">Platform</th><th className="text-left p-3">Angle</th>
                <th className="text-right p-3 font-mono">Views</th><th className="text-right p-3 font-mono">Leads</th>
                <th className="text-right p-3 font-mono">Closes</th><th className="text-right p-3 font-mono">Cash</th>
                <th className="text-right p-3 font-mono">Retention</th><th className="text-right p-3"></th></tr>
            </thead>
            <tbody>
              {(pieces ?? []).map((p) => {
                const m = (p.content_metrics ?? [])[0];
                return (
                  <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                    <td className="p-3">
                      <div className="flex items-center gap-2"><Video className="h-3.5 w-3.5 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{p.title || "(untitled)"}</div>
                          {p.hook && <div className="truncate text-[11px] text-muted-foreground">{p.hook}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs uppercase text-muted-foreground">{p.platform}</td>
                    <td className="p-3 text-xs">{p.angle ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{m?.views?.toLocaleString() ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{m?.leads_generated ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{m?.closes ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{m?.cash_collected_cents ? "$"+Math.round(m.cash_collected_cents/100) : "—"}</td>
                    <td className="p-3 text-right font-mono">{m?.hook_retention_pct ? m.hook_retention_pct+"%" : "—"}</td>
                    <td className="p-3 text-right">
                      {p.platform === "instagram" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSlidesFor(p.id)}>
                          <Layers className="h-3 w-3" />Slides
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!pieces || pieces.length === 0) && (
                <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">No content yet. Log your first piece.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
