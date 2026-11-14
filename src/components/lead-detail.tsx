/**
 * The full lead record — contact, stage, source, application answers, call
 * and conversation timeline, notes, tags, transcripts.
 *
 * Shared by /leads and the CRM board so both open the same view of a lead
 * rather than two that drift apart. Moved here unchanged from
 * _authenticated.leads.tsx.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { ApplicationResponses } from "@/components/application-responses";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { FileText, Film, MessageSquare, PhoneCall, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { CHIP_TONE_CLASSES } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PlatformIcon } from "@/components/platform-icon";
import { normalizeSocialPlatform } from "@/lib/social-platform";
import { usdCentsForRow } from "@/lib/currency";
import { useFxRates } from "@/hooks/use-fx-rates";
import {
  deriveLeadAvailability,
  formatLeadAge,
  pipelineStageInfo,
  relativeTimeAgo,
} from "@/lib/lead-pipeline";

export type LeadRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  handle: string | null;
  phone: string | null;
  status: string;
  pipeline_stage: string | null;
  priority: string;
  precall_video_watched: boolean;
  intent_score: number | null;
  engagement_score: number | null;
  estimated_close_probability: number | null;
  source_connector: string | null;
  source_platform: string | null;
  source_webinar_id: string | null;
  source_format: string | null;
  source_campaign: string | null;
  first_touch_at: string | null;
  first_touch_content_id: string | null;
  assigned_setter_id: string | null;
  closer_id?: string | null;
  qualification_notes: string | null;
  application_data: Record<string, string> | null;
  notes: string | null;
  created_at: string;
  tags: string[] | null;
  ticket_tier: string | null;
  /** Derived from the `calls` join at fetch time — real per-lead call history, not a raw dial-attempt count (this schema doesn't track per-lead dial attempts; see lead-pipeline.ts). */
  callCount: number;
  lastCallAt: string | null;
  /** calls.closer_name (free text) — the reliable source going forward; calls.closer_id is an auth.users uuid the native EOD form never sets. */
  closerName: string | null;
};

/** Columns for a LeadRow, with the call join toLeadRow summarises. */
export const LEAD_ROW_SELECT =
  "id, full_name, email, handle, phone, status, pipeline_stage, priority, precall_video_watched, intent_score, engagement_score, estimated_close_probability, source_connector, source_platform, source_webinar_id, source_format, source_campaign, first_touch_at, first_touch_content_id, assigned_setter_id, qualification_notes, application_data, notes, created_at, tags, ticket_tier, calls(closer_id, closer_name, scheduled_for)";

type LeadWithCalls = LeadRow & {
  calls?: Array<{
    closer_id: string | null;
    closer_name: string | null;
    scheduled_for: string | null;
  }>;
};

/** A leads row (selected with LEAD_ROW_SELECT) as a LeadRow. */
export function toLeadRow(row: unknown): LeadRow {
  const lead = row as LeadWithCalls;
  const calls = lead.calls ?? [];
  const sortedByDate = [...calls]
    .filter((c) => !!c.scheduled_for)
    .sort((a, b) => (b.scheduled_for! < a.scheduled_for! ? -1 : 1));
  const latest = sortedByDate[0];
  return {
    ...lead,
    closer_id: latest?.closer_id ?? calls[0]?.closer_id ?? null,
    closerName: latest?.closer_name ?? calls.find((c) => c.closer_name)?.closer_name ?? null,
    callCount: calls.length,
    lastCallAt: latest?.scheduled_for ?? null,
  };
}

export function LeadDetail({
  lead,
  setterName,
  availability,
}: {
  lead: LeadRow;
  setterName: string | null;
  availability: ReturnType<typeof deriveLeadAvailability> | null;
}) {
  const { data: org } = useCurrentOrg();
  const { user, devBypass } = useAuth();
  const orgId = org?.org_id;
  const qc = useQueryClient();
  // Ticket tiers are configured in Client DNA (offer_tiers), not hardcoded
  // to high/low — same source of truth the Dialer's Active Leads tiers read.
  const { data: ticketTiers = [] } = useQuery({
    queryKey: ["offer-tiers-lead-detail", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async () => {
      if (devBypass)
        return [
          { key: "low", label: "Low Ticket" },
          { key: "high", label: "High Ticket" },
        ];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- offer_tiers exists in the DB (see supabase/migrations/20260904090000_client_dna_offer_config.sql) but predates the last generated-types.ts refresh, so it's not in the Database type yet.
      const { data, error } = await (supabase as any)
        .from("offer_tiers")
        .select("key, label")
        .eq("org_id", orgId!)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { key: string; label: string }[];
    },
  });
  const [noteDraft, setNoteDraft] = useState("");
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [transcriptType, setTranscriptType] = useState<"setting" | "closing">("setting");
  const [transcriptSource, setTranscriptSource] = useState("");
  const [transcriptDraft, setTranscriptDraft] = useState("");

  const { data: timeline } = useQuery({
    queryKey: ["lead-timeline", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const [touches, calls, convs] = await Promise.all([
        supabase
          .from("lead_content_touches")
          .select("id, touch_type, touched_at, content_id, content_pieces!inner(title, platform)")
          .eq("lead_id", lead.id)
          .eq("org_id", orgId!)
          .order("touched_at", { ascending: false })
          .limit(50),
        supabase
          .from("calls")
          .select(
            "id, status, scheduled_for, showed, closed, cash_collected_cents, call_summary, original_currency",
          )
          .eq("lead_id", lead.id)
          .eq("org_id", orgId!)
          .order("scheduled_for", { ascending: false })
          .limit(20),
        supabase
          .from("conversations")
          .select("id, channel, status, last_message_at, first_response_seconds")
          .eq("lead_id", lead.id)
          .eq("org_id", orgId!)
          .limit(10),
      ]);
      if (touches.error) throw touches.error;
      if (calls.error) throw calls.error;
      if (convs.error) throw convs.error;
      return { touches: touches.data ?? [], calls: calls.data ?? [], convs: convs.data ?? [] };
    },
  });

  const { data: notes } = useQuery({
    queryKey: ["lead-notes", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_notes")
        .select("id, body, kind, created_at, author_id")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from("lead_notes")
        .insert({ org_id: orgId!, lead_id: lead.id, body, author_id: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => {
      setNoteDraft("");
      qc.invalidateQueries({ queryKey: ["lead-notes", lead.id] });
      toast.success("Note added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTags = useMutation({
    mutationFn: async (next: string[]) => {
      const { error } = await supabase.from("leads").update({ tags: next }).eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const updateTicketTier = useMutation({
    mutationFn: async (tier: string) => {
      const { error } = await supabase
        .from("leads")
        .update({ ticket_tier: tier || null })
        .eq("id", lead.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", orgId] });
      qc.invalidateQueries({ queryKey: ["dialable-leads", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const addTag = () => {
    const t = tagDraft.trim();
    if (!t || tags.includes(t)) {
      setTagDraft("");
      return;
    }
    const next = [...tags, t];
    setTags(next);
    updateTags.mutate(next);
    setTagDraft("");
  };
  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setTags(next);
    updateTags.mutate(next);
  };

  // Per-lead call transcripts (Sales Tracking Part 1) — genuinely new: `calls`
  // has no transcript column, and the schema's only existing `transcript`
  // column is `setter_call_signals.transcript` (Content Signals' own
  // pipeline, unrelated scope). This unblocks the ContentOS/CopyOS project's
  // own automated-ingestion work, which was waiting on this schema existing —
  // that automation is a separate, later project, not built here: this ships
  // the table + a manual add/view surface only.
  const { data: transcripts } = useQuery({
    queryKey: ["lead-transcripts", lead.id],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_call_transcripts")
        .select("id, call_type, transcript, source, created_at")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addTranscript = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("lead_call_transcripts").insert({
        org_id: orgId!,
        lead_id: lead.id,
        call_type: transcriptType,
        transcript: transcriptDraft.trim(),
        source: transcriptSource.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTranscriptDraft("");
      setTranscriptSource("");
      qc.invalidateQueries({ queryKey: ["lead-transcripts", lead.id] });
      toast.success("Transcript added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Remediation (currency-mixing audit, docs/ascendos-currency-mixing-audit.md
  // — "leads.tsx" item): calls.cash_collected_cents carries a real
  // original_currency, and nothing in this schema guarantees one lead's
  // calls all share a currency (each call is logged independently, possibly
  // by different people over time) — normalize before summing rather than
  // assume single-currency. Same proven usdCentsForRow infrastructure as
  // closer.tsx.
  const leadTimelineFxRates = useFxRates({
    rows: timeline?.calls ?? [],
    getCurrency: (c: NonNullable<typeof timeline>["calls"][number]) => c.original_currency,
    getDate: (c: NonNullable<typeof timeline>["calls"][number]) => c.scheduled_for?.slice(0, 10),
  });
  let totalCashFxIncomplete = false;
  const totalCash = (timeline?.calls ?? []).reduce((s, c) => {
    const r = usdCentsForRow(
      c.cash_collected_cents,
      c.original_currency,
      c.scheduled_for?.slice(0, 10),
      leadTimelineFxRates,
    );
    if (r.excluded) totalCashFxIncomplete = true;
    return s + r.usd;
  }, 0);
  const app = lead.application_data ?? {};
  const stage = pipelineStageInfo(lead.status);
  const entryAt = lead.first_touch_at ?? lead.created_at;
  const platform = normalizeSocialPlatform(lead.source_connector, lead.source_platform);

  return (
    <div className="space-y-3">
      {/* Decision-focused summary, visible regardless of which tab is active —
          Priority 3, Section 7: pipeline stage, assigned setter, source,
          call history, and availability reasoning at a glance. */}
      <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs sm:grid-cols-4">
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">Stage</div>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-3xs font-medium ${CHIP_TONE_CLASSES[stage.tone]}`}
          >
            {stage.label}
          </span>
        </div>
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">Source</div>
          <span className="mt-0.5 inline-flex items-center gap-1.5">
            <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
            {platform}
          </span>
        </div>
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Assigned setter
          </div>
          <div className="mt-0.5">{setterName ?? "—"}</div>
        </div>
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Assigned closer
          </div>
          <div className="mt-0.5">{lead.closerName ?? "—"}</div>
        </div>
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">Lead age</div>
          <div className="mt-0.5">{formatLeadAge(entryAt, new Date().toISOString())}</div>
        </div>
        <div>
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Calls on record
          </div>
          <div className="mt-0.5">
            {lead.callCount}
            {lead.lastCallAt && (
              <span className="ml-1 text-muted-foreground">
                · last {relativeTimeAgo(lead.lastCallAt, new Date().toISOString())}
              </span>
            )}
          </div>
        </div>
        <div className="col-span-2 sm:col-span-2">
          <div className="text-3xs uppercase tracking-wider text-muted-foreground">
            Availability
          </div>
          <div className="mt-0.5">
            {availability?.headline ?? "—"}
            {availability?.detail && (
              <span className="ml-1 text-muted-foreground">· {availability.detail}</span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="application" className="space-y-3">
        <TabsList>
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="notes">Notes / Activity</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="transcripts">Transcripts</TabsTrigger>
        </TabsList>

        <TabsContent value="application" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/30 p-3 text-xs">
            <div>
              <span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Phone:</span> {lead.phone ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Handle:</span> {lead.handle ?? "—"}
            </div>
            <div>
              {/* Priority 7 — `source_connector` is the intake integration
                  ("typeform", "ingest_api"), never the acquisition channel;
                  the "Source" label above (real platform, via
                  normalizeSocialPlatform) already covers that. Labeling
                  both "Source" would repeat the exact confusion this
                  priority exists to remove. */}
              <span className="text-muted-foreground">Captured via:</span>{" "}
              {lead.source_connector ?? "—"}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Ticket tier:</span>
              <select
                value={lead.ticket_tier ?? ""}
                onChange={(e) => updateTicketTier.mutate(e.target.value)}
                className="h-6 rounded border border-border bg-background px-1 text-2xs"
              >
                <option value="">Unclassified</option>
                {ticketTiers.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-3xs uppercase tracking-wider text-muted-foreground">Tags</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="hover:text-destructive"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag…"
                className="h-6 w-24 rounded border border-input bg-background px-1.5 text-2xs"
              />
            </div>
          </div>
          <ApplicationResponses applicationData={app} />
        </TabsContent>

        <TabsContent value="notes" className="space-y-3">
          <div className="space-y-2">
            <Textarea
              placeholder="Log what happened on the call, follow-up context, anything the next person needs to know…"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              className="min-h-[80px]"
            />
            <Button
              size="sm"
              onClick={() => noteDraft.trim() && addNote.mutate(noteDraft.trim())}
              disabled={!noteDraft.trim() || addNote.isPending}
            >
              <StickyNote className="h-3.5 w-3.5 mr-1.5" /> Add note
            </Button>
          </div>
          <div className="space-y-2">
            {(notes ?? []).map((n) => (
              <div key={n.id} className="rounded border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-3xs uppercase tracking-wider text-muted-foreground">
                    {n.kind ?? "note"}
                  </span>
                  <span className="text-3xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
            {(!notes || notes.length === 0) && (
              <div className="text-xs text-muted-foreground italic">
                No notes yet — be the first to log context.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border border-border p-2 text-center">
              <Film className="h-3 w-3 mx-auto text-accent mb-1" />
              <div className="font-sans tabular-nums font-bold">
                {timeline?.touches.length ?? 0}
              </div>
              <div className="text-3xs text-muted-foreground">Content touches</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <MessageSquare className="h-3 w-3 mx-auto text-primary mb-1" />
              <div className="font-sans tabular-nums font-bold">{timeline?.convs.length ?? 0}</div>
              <div className="text-3xs text-muted-foreground">Conversations</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <PhoneCall className="h-3 w-3 mx-auto text-emerald-500 mb-1" />
              <div className="font-sans tabular-nums font-bold">{timeline?.calls.length ?? 0}</div>
              <div className="text-3xs text-muted-foreground">
                calls · ${Math.round(totalCash / 100).toLocaleString()}
                {totalCashFxIncomplete ? " (FX incomplete)" : ""}
              </div>
            </div>
          </div>

          <div>
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Film className="h-3 w-3" /> Content path (first → last)
            </div>
            <div className="space-y-1.5">
              {(timeline?.touches ?? []).map((t) => {
                const cp = Array.isArray(t.content_pieces) ? t.content_pieces[0] : t.content_pieces;
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <div className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                    <div className="flex-1 truncate">
                      {cp?.title || "(untitled)"}{" "}
                      <span className="text-muted-foreground">· {cp?.platform}</span>
                    </div>
                    <div className="text-3xs text-muted-foreground">
                      {t.touch_type} · {new Date(t.touched_at).toLocaleDateString()}
                    </div>
                  </div>
                );
              })}
              {(timeline?.touches ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground italic">
                  No content touches tracked.
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <PhoneCall className="h-3 w-3" /> Calls
            </div>
            <div className="space-y-1.5">
              {(timeline?.calls ?? []).map((c) => (
                <div key={c.id} className="rounded border border-border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium uppercase text-3xs">{c.status}</span>
                    <span className="font-sans tabular-nums text-emerald-500">
                      ${Math.round((c.cash_collected_cents ?? 0) / 100).toLocaleString()}
                    </span>
                  </div>
                  {c.call_summary && (
                    <div className="mt-1 text-muted-foreground line-clamp-2">{c.call_summary}</div>
                  )}
                  <div className="text-3xs text-muted-foreground mt-1">
                    {c.scheduled_for ? new Date(c.scheduled_for).toLocaleString() : "no date"}
                  </div>
                </div>
              ))}
              {(timeline?.calls ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground italic">No calls yet.</div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="transcripts" className="space-y-3">
          <div className="space-y-2 rounded border border-border p-3">
            <div className="flex items-center gap-1.5 text-2xs uppercase tracking-wider text-muted-foreground">
              <FileText className="h-3.5 w-3.5" /> Add transcript
            </div>
            <div className="flex gap-2">
              <select
                value={transcriptType}
                onChange={(e) => setTranscriptType(e.target.value as "setting" | "closing")}
                className="h-8 rounded border border-input bg-background px-2 text-xs"
              >
                <option value="setting">Setting call</option>
                <option value="closing">Closing call</option>
              </select>
              <input
                value={transcriptSource}
                onChange={(e) => setTranscriptSource(e.target.value)}
                placeholder="Source (Loom link, call recorder…)"
                className="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
              />
            </div>
            <Textarea
              placeholder="Paste the call transcript…"
              value={transcriptDraft}
              onChange={(e) => setTranscriptDraft(e.target.value)}
              className="min-h-[80px]"
            />
            <Button
              size="sm"
              onClick={() => transcriptDraft.trim() && addTranscript.mutate()}
              disabled={!transcriptDraft.trim() || addTranscript.isPending}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Add transcript
            </Button>
          </div>
          <div className="space-y-2">
            {(transcripts ?? []).map((t) => (
              <div key={t.id} className="rounded border border-border bg-card p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wider",
                      t.call_type === "closing"
                        ? CHIP_TONE_CLASSES.success
                        : CHIP_TONE_CLASSES.info,
                    )}
                  >
                    {t.call_type === "closing" ? "Closing call" : "Setting call"}
                  </span>
                  <span className="text-3xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleString()}
                  </span>
                </div>
                {t.source && (
                  <div className="mb-1 text-3xs text-muted-foreground">Source: {t.source}</div>
                )}
                <div className="whitespace-pre-wrap text-muted-foreground line-clamp-6">
                  {t.transcript}
                </div>
              </div>
            ))}
            {(!transcripts || transcripts.length === 0) && (
              <div className="text-xs text-muted-foreground italic">
                No transcripts logged for this lead yet.
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
