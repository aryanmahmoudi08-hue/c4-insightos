import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Trophy, Plus, ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Win = {
  id: string;
  client_id: string | null;
  title: string;
  body: string | null;
  screenshot_url: string | null;
  magnitude: string;
  occurred_at: string;
};

export function ClientWins({ clientId, clientName }: { clientId?: string; clientName?: string }) {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [magnitude, setMagnitude] = useState("minor");
  const [file, setFile] = useState<File | null>(null);

  const { data: wins } = useQuery({
    queryKey: ["client-wins", orgId, clientId ?? "all"],
    enabled: !!orgId,
    queryFn: async () => {
      let q = (supabase as any).from("client_wins").select("id, client_id, title, body, screenshot_url, magnitude, occurred_at").eq("org_id", orgId!).order("occurred_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return (data ?? []) as Win[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      let screenshot_url: string | null = null;
      if (file) {
        const path = `${orgId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("client-wins").upload(path, file, { upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("client-wins").getPublicUrl(path);
        screenshot_url = pub.publicUrl;
      }
      const { error } = await (supabase as any).from("client_wins").insert({
        org_id: orgId!, client_id: clientId ?? null, title, body: body || null, magnitude, screenshot_url, created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-wins", orgId, clientId ?? "all"] });
      toast.success("Win logged");
      setOpen(false); setTitle(""); setBody(""); setMagnitude("minor"); setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await (supabase as any).from("client_wins").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client-wins", orgId, clientId ?? "all"] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Wins {clientName && <span className="text-muted-foreground font-normal">· {clientName}</span>}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-3.5 w-3.5 mr-1" /> Log win</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log a student win</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Headline (e.g. 'Closed first $5k client')" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="What happened? Context, numbers, caption…" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[100px]" />
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={magnitude === "minor"} onChange={() => setMagnitude("minor")} /> Minor
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={magnitude === "major"} onChange={() => setMagnitude("major")} /> Major
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <ImageIcon className="h-3.5 w-3.5" />
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-xs" />
              </label>
              <Button onClick={() => title.trim() && create.mutate()} disabled={!title.trim() || create.isPending} className="w-full">
                {create.isPending ? "Saving…" : "Save win"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {(wins ?? []).map(w => (
          <div key={w.id} className={`rounded border p-3 text-xs space-y-1.5 ${w.magnitude === "major" ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="font-semibold text-sm">{w.title}</div>
              <button onClick={() => remove.mutate(w.id)} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-3 w-3" /></button>
            </div>
            {w.body && <div className="text-muted-foreground whitespace-pre-wrap">{w.body}</div>}
            {w.screenshot_url && <img src={w.screenshot_url} alt="" className="rounded border border-border max-h-48 object-cover w-full" />}
            <div className="flex items-center justify-between text-[10px] text-muted-foreground uppercase tracking-wider">
              <span className={w.magnitude === "major" ? "text-amber-600 dark:text-amber-400 font-semibold" : ""}>{w.magnitude}</span>
              <span>{new Date(w.occurred_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {(!wins || wins.length === 0) && (
          <div className="col-span-full text-center py-8 text-xs text-muted-foreground italic">No wins yet — log the first one above.</div>
        )}
      </div>
    </div>
  );
}
