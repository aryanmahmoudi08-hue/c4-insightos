import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PhoneCall, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-auth";
import { useDateRange } from "@/hooks/use-date-range";
import { logSetterSignalFn } from "@/lib/content-signals.functions";
import { MECHANISMS, type MechanismKey } from "@/lib/content-mechanisms";

/**
 * Setter Signals, moved here from the standalone Content Signals page
 * (src/routes/_authenticated.content-signals.tsx) as part of the Content
 * Command Center consolidation — this is now the only place it renders.
 * Purpose: sales-call conversations/transcripts -> detected demand,
 * questions, and problems -> content opportunities. Self-fetches org/date
 * range via the shared hooks (both are available anywhere under
 * _authenticated.tsx's DateRangeProvider) instead of taking them as props,
 * so it composes into Content Command Center without changing that
 * component's Props type.
 */
export function SetterSignalsPanel() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { range } = useDateRange();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [transcript, setTranscript] = useState("");
  const [notes, setNotes] = useState("");

  const { data: rows } = useQuery({
    queryKey: ["setter-signals", orgId, range.from, range.to],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("setter_call_signals")
        .select("id, setter_name, call_date, limiting_beliefs, objections, mechanism, ai_summary")
        .eq("org_id", orgId!)
        .gte("call_date", range.from)
        .lte("call_date", range.to)
        .order("call_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const logFn = useServerFn(logSetterSignalFn);
  const m = useMutation({
    mutationFn: () =>
      logFn({
        data: {
          setter_name: name.trim(),
          call_date: date,
          transcript: transcript || undefined,
          notes: notes || undefined,
          screen: true,
        },
      }),
    onSuccess: () => {
      toast.success("Screened — beliefs and objections mapped to a mechanism.");
      setTranscript("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["setter-signals"] });
      qc.invalidateQueries({ queryKey: ["content-demand"] });
      qc.invalidateQueries({ queryKey: ["content-command-demand"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <PhoneCall className="h-3.5 w-3.5" /> Setter Signals
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          Sales-call conversations → detected demand, questions and problems → content
          opportunities. Paste the setting-call transcript (or the setter's notes) — AI pulls the
          limiting beliefs and objections, then decides which mechanism kills them.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Input placeholder="Setter name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Button
          disabled={!name.trim() || (!transcript.trim() && !notes.trim()) || m.isPending}
          onClick={() => m.mutate()}
        >
          {m.isPending ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              Screening…
            </>
          ) : (
            "Screen call"
          )}
        </Button>
      </div>
      <Textarea
        rows={3}
        placeholder="Paste transcript…"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      <Textarea
        rows={2}
        placeholder="Or setter notes / word tracks…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <div className="max-h-64 divide-y divide-border overflow-y-auto">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="space-y-1 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{r.setter_name}</span>
              <span className="font-sans text-3xs tabular-nums text-muted-foreground">
                {r.call_date}
              </span>
              {r.mechanism && (
                <Badge variant="outline" className="text-3xs">
                  {MECHANISMS[r.mechanism as MechanismKey]?.label ?? r.mechanism}
                </Badge>
              )}
            </div>
            {(r.limiting_beliefs ?? []).length > 0 && (
              <div>
                <span className="text-3xs uppercase tracking-wider text-destructive">Beliefs</span>{" "}
                — {(r.limiting_beliefs ?? []).join(" · ")}
              </div>
            )}
            {(r.objections ?? []).length > 0 && (
              <div>
                <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                  Objections
                </span>{" "}
                — {(r.objections ?? []).join(" · ")}
              </div>
            )}
            {r.ai_summary && <div className="text-muted-foreground">{r.ai_summary}</div>}
          </div>
        ))}
        {(rows ?? []).length === 0 && (
          <div className="py-6 text-center text-2xs italic text-muted-foreground">
            No setting-call signals in this window.
          </div>
        )}
      </div>
    </Card>
  );
}
