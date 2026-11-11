import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CalendarPlus, CalendarX2, KanbanSquare, Phone, RefreshCw, Mail } from "lucide-react";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { PageHero } from "@/components/page-hero";
import { KanbanBoard, KanbanCardAnatomy } from "@/components/kanban-board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchWorkspaceSettings } from "@/lib/workspace-settings.functions";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { mockCrmBoard, withMockDelay } from "@/lib/dev-mock-data";
import { moveLeadToStage } from "@/lib/crm-board.functions";
import {
  boardTabs,
  BOARD_PIPELINES,
  cardTitle,
  BOARD_SEGMENTS,
  segmentOf,
  stagesBySegment,
  type BoardTab,
  groupLeadsByStage,
  sortStages,
  upcomingCall,
  type BoardCall,
  type BoardLead,
  type BoardStage,
} from "@/lib/crm-board";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/crm")({
  component: CrmPage,
  head: () => ({ meta: [{ title: "CRM | AscendOS" }] }),
});

/** Stage name -> chip tone. Terminal stages read differently from live ones. */
function toneFor(name: string, won: boolean, lost: boolean) {
  if (won) return "success" as const;
  if (lost) return "destructive" as const;
  if (name.startsWith("Follow")) return "warning" as const;
  return "default" as const;
}

function fmtWhen(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The per-card actions menu.
 *
 * Cancel and Reschedule use the URLs Calendly itself issued for that specific
 * booking, which the webhook already stores on the call row — so they take you
 * to the real booking, not a generic page. When there is no upcoming call
 * there is nothing to cancel or reschedule, and the buttons say that rather
 * than linking somewhere useless.
 */
function CallForms({ lead, bookingUrl }: { lead: BoardLead; bookingUrl: string | null }) {
  const next = upcomingCall(lead.calls, new Date());
  const when = fmtWhen(next?.scheduled_for ?? null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-full justify-start gap-1.5 text-3xs"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-3 w-3" />
          Call forms
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <div className="px-3 pt-2.5 pb-1 text-3xs uppercase tracking-wider text-muted-foreground">
          Book
        </div>
        <div className="px-2 pb-2">
          <a
            href={bookingUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!bookingUrl}
            onClick={(e) => {
              if (!bookingUrl) e.preventDefault();
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              bookingUrl
                ? "hover:bg-muted cursor-pointer"
                : "opacity-50 cursor-not-allowed pointer-events-auto",
            )}
          >
            <CalendarPlus className="h-4 w-4 shrink-0" />
            Book a meeting
          </a>
          {next ? (
            <p className="px-2 pt-1 text-3xs text-[color:var(--color-warning)]">
              Already has an upcoming meeting{when ? ` — ${when}` : ""}.
            </p>
          ) : null}
          {!bookingUrl ? (
            <p className="px-2 pt-1 text-3xs text-muted-foreground">
              No scheduling link set for this workspace yet — add one in Settings.
            </p>
          ) : null}
        </div>

        <div className="border-t border-border px-3 pt-2.5 pb-1 text-3xs uppercase tracking-wider text-muted-foreground">
          Cancel
        </div>
        <div className="px-2 pb-2.5">
          <a
            href={next?.calendly_cancel_url ?? undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!next?.calendly_cancel_url) e.preventDefault();
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive",
              next?.calendly_cancel_url ? "hover:bg-muted" : "opacity-50 cursor-not-allowed",
            )}
          >
            <CalendarX2 className="h-4 w-4 shrink-0" />
            Cancel call
          </a>
          <a
            href={next?.calendly_reschedule_url ?? undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => {
              if (!next?.calendly_reschedule_url) e.preventDefault();
            }}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[color:var(--color-warning)]",
              next?.calendly_reschedule_url ? "hover:bg-muted" : "opacity-50 cursor-not-allowed",
            )}
          >
            <RefreshCw className="h-4 w-4 shrink-0" />
            Reschedule call
          </a>
          {!next ? (
            <p className="px-2 pt-1 text-3xs text-muted-foreground">
              No upcoming call to cancel or reschedule.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CrmPage() {
  const [pipeline, setPipeline] = useState<string>("Sales");
  // The board is a worklist, so it opens on what still needs doing. Closed-out
  // stages grow forever while the live ones stay roughly constant.
  const [segment, setSegment] = useState<BoardTab>("in_play");
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const { devBypass } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const moveFn = useServerFn(moveLeadToStage);

  /**
   * Read straight through the RLS-scoped browser client, like every other
   * route in the app. The board is plain org-scoped reads — routing them
   * through a server function would add a second access path to the same
   * rows and, because server functions need a real bearer token, would
   * leave the page dead under Dev Bypass. Moves still go through a server
   * function: those validate the stage and write an audit activity.
   */
  const board = useQuery({
    queryKey: ["crm-board", orgId, pipeline, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (devBypass) return withMockDelay(mockCrmBoard(pipeline), 120);
      const { data: pipelineRows, error: pErr } = await supabase
        .from("crm_pipelines")
        .select("id, name, is_default")
        .eq("org_id", orgId!)
        .eq("is_archived", false)
        .order("name");
      if (pErr) throw pErr;
      const pipelines = (pipelineRows ?? []) as {
        id: string;
        name: string;
        is_default: boolean;
      }[];
      if (!pipelines.length) {
        return { stages: [] as BoardStage[], leads: [] as BoardLead[], bookingUrl: null };
      }

      const active =
        pipelines.find((p) => p.name === pipeline) ??
        pipelines.find((p) => p.is_default) ??
        pipelines[0];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: stageRows, error: sErr } = await (supabase as any)
        .from("crm_pipeline_stages")
        .select("id, name, position, is_closed_won, is_closed_lost, board_segment")
        .eq("org_id", orgId!)
        .eq("pipeline_id", active.id)
        .eq("is_archived", false);
      if (sErr) throw sErr;
      const stages = sortStages((stageRows ?? []) as BoardStage[]);
      const stageIds = stages.map((s) => s.id);

      let leads: BoardLead[] = [];
      if (stageIds.length) {
        // `crm_stage_id` is added by 20261111090000_crm_board and is not in
        // the generated Supabase types until they are regenerated against a
        // database that has the migration — same situation eod_lead_status
        // was in. Cast rather than hand-edit the generated file.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: leadRows, error: lErr } = await (supabase as any)
          .from("leads")
          .select(
            "id, full_name, email, phone, crm_stage_id, ticket_tier, source_platform, assigned_setter_id, created_at",
          )
          .eq("org_id", orgId!)
          .in("crm_stage_id", stageIds)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (lErr) throw lErr;
        leads = (leadRows ?? []) as BoardLead[];
      }

      // Calls are attached in memory rather than embedded: PostgREST can only
      // embed across a declared foreign key, and a missing one is exactly what
      // left the Team roster silently empty.
      if (leads.length) {
        const { data: callRows } = await supabase
          .from("calls")
          .select(
            "id, lead_id, scheduled_for, status, cancelled, calendly_cancel_url, calendly_reschedule_url",
          )
          .eq("org_id", orgId!)
          .in(
            "lead_id",
            leads.map((l) => l.id),
          );
        const byLead = new Map<string, BoardCall[]>();
        for (const row of (callRows ?? []) as (BoardCall & { lead_id: string | null })[]) {
          if (!row.lead_id) continue;
          const { lead_id, ...call } = row;
          byLead.set(lead_id, [...(byLead.get(lead_id) ?? []), call]);
        }
        for (const lead of leads) lead.calls = byLead.get(lead.id) ?? [];
      }

      // Validated through the same schema the Settings page writes, rather
      // than poking at the raw jsonb — organizations.settings is shared and
      // holds other callers' keys too.
      const settings = await fetchWorkspaceSettings(supabase, orgId!);
      const bookingUrl = settings.scheduling.calendlyUrl.trim() || null;

      return { stages, leads, bookingUrl };
    },
  });

  const unsorted = useQuery({
    queryKey: ["crm-unsorted", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: async () => {
      if (devBypass) return 4;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!)
        .is("crm_stage_id", null);
      return count ?? 0;
    },
  });

  const move = useMutation({
    mutationFn: (v: { leadId: string; stageId: string }) => moveFn({ data: v }),
    onSuccess: (res) => {
      if (res && "moved" in res && res.moved) {
        // Dropping a card into a stage outside the current tab makes it
        // vanish from view. Say where it went, or that reads as a bug.
        const landed = stages.find((st) => st.name === res.stageName);
        const landedSegment = landed ? segmentOf(landed) : null;
        const leftView = landedSegment && landedSegment !== activeSegment;
        const segLabel = BOARD_SEGMENTS.find((x) => x.key === landedSegment)?.label;
        toast.success(
          leftView ? `Moved to ${res.stageName} — now in ${segLabel}` : `Moved to ${res.stageName}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["crm-board"] });
      qc.invalidateQueries({ queryKey: ["crm-unsorted"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not move that lead"),
  });

  // Memoised because `?? []` makes a fresh array every render, which would
  // re-run the grouping memo below on every keystroke.
  const stages = useMemo(() => board.data?.stages ?? [], [board.data?.stages]);
  const bookingUrl = board.data?.bookingUrl ?? null;

  const filtered = useMemo(() => {
    const leads = board.data?.leads ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.full_name, l.email, l.phone].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [board.data?.leads, search]);

  const segmentGroups = useMemo(() => boardTabs(stages), [stages]);

  // A pipeline whose stages all sit in one segment gets no control at all —
  // Applications has nothing partial, so it would otherwise show a tab that
  // is always empty.
  const activeSegment = segmentGroups.some((g) => g.key === segment)
    ? segment
    : (segmentGroups[0]?.key ?? "in_play");

  const visibleStages = useMemo(
    () => segmentGroups.find((g) => g.key === activeSegment)?.stages ?? [],
    [segmentGroups, activeSegment],
  );

  // Grouping runs over every stage, not just the visible ones, so the per-tab
  // counts are real rather than only counting what is on screen.
  const { byStage } = useMemo(() => groupLeadsByStage(filtered, stages), [filtered, stages]);

  const countFor = (seg: BoardTab) =>
    (segmentGroups.find((g) => g.key === seg)?.stages ?? []).reduce(
      (n, st) => n + (byStage.get(st.id)?.length ?? 0),
      0,
    );

  const columns = visibleStages.map((s) => ({
    key: s.id,
    label: s.name,
    tone: toneFor(s.name, s.is_closed_won, s.is_closed_lost),
  }));

  return (
    <>
      {/* This page renders its own PageHero below, with the unsorted-lead
            pill TopBar cannot derive — so TopBar stands its hero down rather
            than the page showing two. */}
      <TopBar title="CRM" subtitle="Pipelines, stages, and lead cards" hero={false} />
      <main className="space-y-6 p-4 md:p-6">
        <PageHero
          eyebrow="Sales tracking"
          title="CRM Board"
          subtitle="Pipelines, stages, and lead cards — drag a card to move it."
          icon={<KanbanSquare className="h-6 w-6" />}
          status={
            unsorted.data
              ? [{ label: `${unsorted.data} unsorted`, tone: "warning" as const }]
              : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select value={pipeline} onValueChange={setPipeline}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOARD_PIPELINES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…"
            className="h-9 w-full max-w-xs"
          />
          {segmentGroups.length > 1 ? (
            <div className="rail-x flex max-w-full items-center gap-0.5 rounded-full border border-border bg-muted/30 p-0.5">
              {segmentGroups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={g.key === activeSegment}
                  onClick={() => setSegment(g.key)}
                  className={cn(
                    "shrink-0 cursor-pointer rounded-full px-2.5 py-1 text-2xs font-medium transition-all",
                    g.key === activeSegment
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {g.label}
                  <span className="ml-1 tabular-nums opacity-70">{countFor(g.key)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <span className="text-2xs text-muted-foreground tabular-nums">
            {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
          </span>
        </div>

        {board.isError ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            Could not load the board.{" "}
            {board.error instanceof Error ? board.error.message : "Unknown error."}
          </div>
        ) : (
          <KanbanBoard
            columns={columns}
            itemsByColumn={byStage}
            layout="scroll"
            dense
            loading={board.isLoading}
            emptyHint="No leads here"
            onDropItem={(leadId, stageId) => move.mutate({ leadId, stageId })}
            renderCard={(lead: BoardLead) => {
              const next = upcomingCall(lead.calls, new Date());
              const when = fmtWhen(next?.scheduled_for ?? null);
              return (
                <div className="space-y-1.5">
                  <KanbanCardAnatomy
                    title={cardTitle(lead)}
                    metaLines={[
                      lead.email ? (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3 shrink-0" />
                          {lead.email}
                        </span>
                      ) : null,
                      lead.phone ?? null,
                      next && when ? (
                        <span className="text-[color:var(--color-success)]">
                          Upcoming call — {when}
                        </span>
                      ) : null,
                    ].filter(Boolean)}
                  />
                  {lead.ticket_tier || lead.source_platform ? (
                    <div className="flex flex-wrap gap-1">
                      {[lead.ticket_tier, lead.source_platform].filter(Boolean).map((t) => (
                        <span
                          key={String(t)}
                          className="rounded bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <CallForms lead={lead} bookingUrl={bookingUrl} />
                </div>
              );
            }}
          />
        )}

        {!board.isLoading && stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This workspace has no pipelines yet. They are seeded by migration — if this persists,
            the CRM board migration has not been applied.
          </p>
        ) : null}
      </main>
    </>
  );
}
