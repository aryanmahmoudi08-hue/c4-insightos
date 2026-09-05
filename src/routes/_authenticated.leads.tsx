import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg, useAuth } from "@/hooks/use-auth";
import { TopBar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  MessageSquare,
  PhoneCall,
  Film,
  StickyNote,
  Gem,
  Sparkles,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Copy,
  FileText,
  CalendarDays,
} from "lucide-react";
import { generatePreCallVideoLinkFn } from "@/lib/pre-call-video.functions";
import { toast } from "sonner";
import { analyzeLeads } from "@/lib/lead-insights.functions";
import { PageHero } from "@/components/page-hero";
import { MetricCard } from "@/components/metric-card";
import {
  GlassTableShell,
  TableSearch,
  FilterPills,
  Pagination,
  usePagination,
  ColumnGroupToggle,
} from "@/components/glass-table";
import { mockLeads, mockLeadInsights, withMockDelay } from "@/lib/dev-mock-data";
import { CHIP_TONE_CLASSES, type ChipTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DateRangePicker, RANGES, type DateRange } from "@/components/date-range-picker";
import { PlatformIcon } from "@/components/platform-icon";
import { normalizeSocialPlatform } from "@/lib/social-platform";
import { MetricDetailPanel, type DetailColumn } from "@/components/metric-detail-panel";
import {
  deriveCap,
  deriveWorking,
  type FunnelStage,
  type Derivation,
} from "@/lib/funnel-derivation";
import { priorPeriod, pctDelta } from "@/lib/trend";
import {
  deriveLeadAvailability,
  pipelineStageInfo,
  formatLeadAge,
  relativeTimeAgo,
  type AvailabilityBucket,
} from "@/lib/lead-pipeline";
import {
  PieChart,
  Pie,
  Cell as RechartsCell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
} from "@/lib/workspace-settings.functions";

export const Route = createFileRoute("/_authenticated/leads")({
  component: Leads,
  validateSearch: (s: Record<string, unknown>) => ({
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
  }),
});

type LeadRow = {
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

// Row tint (subtle, 5%) for the same tone family used by chips (15%) — one 4-accent
// system for everything: success/warning/destructive/info + neutral default.
const ROW_TINT: Record<ChipTone, string> = {
  default: "",
  success: "bg-[color:var(--color-success)]/5",
  warning: "bg-[color:var(--color-warning)]/5",
  destructive: "bg-destructive/5",
  info: "bg-accent/5",
};

const PIPELINE_STAGES = [
  { v: "", label: "—", tone: "default" as ChipTone },
  { v: "cold", label: "Cold", tone: "default" as ChipTone },
  { v: "warm", label: "Warm", tone: "warning" as ChipTone },
  { v: "hot", label: "Hot", tone: "success" as ChipTone },
  { v: "diamond", label: "💎 Diamond", tone: "info" as ChipTone },
];
const stageChip = (v: string | null) =>
  CHIP_TONE_CLASSES[PIPELINE_STAGES.find((s) => s.v === (v ?? ""))?.tone ?? "default"];

const PRIORITY_OPTIONS = [
  { v: "low", label: "Low" },
  { v: "normal", label: "Normal" },
  { v: "high", label: "High" },
  { v: "diamond", label: "💎 Diamond" },
];

// Status dropdown options (Opt-In is the first/default)
const STATUS_OPTIONS = [
  { v: "opt_in", label: "Opt-In" },
  { v: "call_booked", label: "Call Booked" },
  { v: "applied_qualified_no_book", label: "Applied [Qualified] Did Not Book" },
  { v: "applied_unqualified_no_book", label: "Applied [Unqualified] Did Not Book" },
  { v: "rescheduling", label: "Rescheduling" },
  { v: "no_show", label: "Didn't Show Up" },
  { v: "follow_up_short", label: "Follow Up (short term)" },
  { v: "follow_up_long", label: "Follow Up (long term)" },
  { v: "deposit", label: "Deposit" },
  { v: "closed", label: "Closed" },
  { v: "lt_closed", label: "LT Closed" },
  { v: "no_close", label: "No Close" },
  { v: "bad_fit", label: "Bad Fit" },
  { v: "disqualified", label: "Disqualified" },
  { v: "cancelled", label: "Cancelled" },
  { v: "ignore", label: "IGNORE" },
];

// Every status collapses onto the same 4-accent + neutral system as everything
// else in the app (was 8 raw hues: amber/yellow/blue/indigo/emerald + destructive/muted).
const STATUS_TONE_KEY: Record<string, ChipTone> = {
  opt_in: "default",
  call_booked: "warning",
  applied_qualified_no_book: "warning",
  applied_unqualified_no_book: "default",
  rescheduling: "warning",
  no_show: "destructive",
  follow_up_short: "info",
  follow_up_long: "info",
  deposit: "success",
  closed: "success",
  lt_closed: "success",
  no_close: "destructive",
  bad_fit: "default",
  disqualified: "default",
  cancelled: "destructive",
  ignore: "default",
};
const STATUS_TONE: Record<string, { row: string; chip: string }> = Object.fromEntries(
  Object.entries(STATUS_TONE_KEY).map(([status, t]) => [
    status,
    {
      row: status === "ignore" ? "opacity-50" : ROW_TINT[t],
      chip:
        status === "closed" || status === "lt_closed"
          ? `${CHIP_TONE_CLASSES[t]} font-semibold`
          : CHIP_TONE_CLASSES[t],
    },
  ]),
);
const tone = (s: string) => STATUS_TONE[s] ?? STATUS_TONE.opt_in;

// Real lead_status values implying a call was scheduled for this lead at
// some point (whether or not they showed) — used for the pipeline-stage
// donut's cap/working derivation, not this file's own (disconnected)
// REACHED_CALL_STATUSES-style vocabulary above.
const REACHED_CALL_REAL_STATUSES = ["call_booked", "showed", "closed", "no_show"];

// Application data keys (match typeform mapping)
const APP_COLS: { key: string; label: string; width?: string }[] = [
  { key: "experience", label: "Experience", width: "min-w-[140px]" },
  { key: "work_school", label: "Work/School", width: "min-w-[140px]" },
  { key: "focus", label: "Focus", width: "min-w-[140px]" },
  { key: "goal", label: "Goal", width: "min-w-[110px]" },
  { key: "candidate_fit", label: "Candidate Fit", width: "min-w-[200px]" },
  { key: "serious_status", label: "Serious", width: "min-w-[140px]" },
  { key: "time", label: "Time", width: "min-w-[90px]" },
  { key: "income", label: "Income", width: "min-w-[110px]" },
  { key: "capital", label: "Capital", width: "min-w-[110px]" },
  { key: "credit", label: "Credit", width: "min-w-[100px]" },
  { key: "commitment", label: "Commit", width: "min-w-[80px]" },
];

const BUCKET_STATUSES: Record<string, string[]> = {
  active: ["opt_in", "rescheduling", "follow_up_short", "follow_up_long", "deposit"],
  booked: ["call_booked"],
  closed: ["closed", "lt_closed"],
  lost: [
    "no_show",
    "no_close",
    "bad_fit",
    "disqualified",
    "cancelled",
    "ignore",
    "applied_qualified_no_book",
    "applied_unqualified_no_book",
  ],
};

/** Saved smart views (Sales Tracking Part 1) — a named combination of the
 * search/status-filter bar's existing filters. Local-only (browser
 * localStorage): this is a personal working-set shortcut for whoever's
 * looking at the table right now, not shared team data, so it doesn't need
 * a migration/table of its own. */
type SavedView = { id: string; name: string; query: string; statusFilter: string; bucket: string };
const SAVED_VIEWS_KEY = "c4-leads-saved-views";

function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function SmartViewsBar({
  current,
  onApply,
}: {
  current: { query: string; statusFilter: string; bucket: string };
  onApply: (v: SavedView) => void;
}) {
  const [views, setViews] = useState<SavedView[]>(loadSavedViews);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const persist = (next: SavedView[]) => {
    setViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };
  const save = () => {
    const n = name.trim();
    if (!n) return;
    persist([...views, { id: crypto.randomUUID(), name: n, ...current }]);
    setName("");
    setNaming(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span
          key={v.id}
          className="group flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-2xs text-muted-foreground hover:border-ring/40"
        >
          <button type="button" onClick={() => onApply(v)} className="hover:text-foreground">
            {v.name}
          </button>
          <button
            type="button"
            onClick={() => persist(views.filter((x) => x.id !== v.id))}
            className="opacity-0 group-hover:opacity-100 hover:text-destructive"
            title="Delete view"
          >
            ×
          </button>
        </span>
      ))}
      {naming ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") {
                setNaming(false);
                setName("");
              }
            }}
            placeholder="View name…"
            className="h-7 w-32 rounded border border-input bg-background px-2 text-2xs"
          />
          <button type="button" onClick={save} className="text-2xs font-medium text-primary">
            Save
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="rounded-full border border-dashed border-border px-2.5 py-1 text-2xs text-muted-foreground hover:border-ring/40 hover:text-foreground"
        >
          + Save view
        </button>
      )}
    </div>
  );
}

const LEAD_DETAIL_COLUMNS: DetailColumn<LeadRow>[] = [
  { key: "name", label: "Name", render: (l) => l.full_name || l.handle || l.email || "(no name)" },
  {
    key: "stage",
    label: "Stage",
    render: (l) => (
      <span
        className={`rounded px-1.5 py-0.5 text-3xs font-medium ${CHIP_TONE_CLASSES[pipelineStageInfo(l.status).tone]}`}
      >
        {pipelineStageInfo(l.status).label}
      </span>
    ),
  },
  { key: "phone", label: "Phone", render: (l) => l.phone ?? "—" },
  { key: "email", label: "Email", render: (l) => l.email ?? "—" },
  {
    key: "created",
    label: "Created",
    render: (l) => new Date(l.first_touch_at ?? l.created_at).toLocaleDateString(),
  },
];

/**
 * The Available-to-Call worklist (Priority 3, Section 2/4) — a dedicated
 * component rather than MetricDetailPanel because it needs richer per-lead
 * diagnostic columns (stage/setter/calls-on-record/availability reasoning)
 * than a generic count drilldown's cap/working narrative applies to.
 * Reuses the same Sheet/GlassTableShell primitives (now widened) so it
 * stays visually consistent with every other drilldown in the app.
 */
function AvailableToCallDrawer({
  open,
  onOpenChange,
  rows,
  availabilityByLeadId,
  setterProfiles,
  onSelectLead,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: LeadRow[];
  availabilityByLeadId: Map<string, ReturnType<typeof deriveLeadAvailability>>;
  setterProfiles: Record<string, string>;
  onSelectLead: (l: LeadRow) => void;
}) {
  const nowISO = new Date().toISOString();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle>Available to call</SheetTitle>
          <div className="text-xs text-muted-foreground">
            {rows.length} lead{rows.length === 1 ? "" : "s"} in the current range/filters, not yet
            booked/closed/lost.
          </div>
        </SheetHeader>
        <div className="mt-4">
          <GlassTableShell maxHeight="70vh">
            <table className="w-full text-xs">
              <thead className="sticky-thead bg-muted/40 text-3xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Lead</th>
                  <th className="p-2 text-left">Phone</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Source</th>
                  <th className="p-2 text-left">Created / Age</th>
                  <th className="p-2 text-left">Stage</th>
                  <th className="p-2 text-left">Setter</th>
                  <th className="p-2 text-left">Availability</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const availability = availabilityByLeadId.get(l.id);
                  const entryAt = l.first_touch_at ?? l.created_at;
                  const setterName = l.assigned_setter_id
                    ? (setterProfiles[l.assigned_setter_id] ?? "Unknown")
                    : "—";
                  const platform = normalizeSocialPlatform(l.source_connector, l.source_platform);
                  return (
                    <tr
                      key={l.id}
                      className="border-t border-border/70 cursor-pointer hover:bg-muted/20"
                      onClick={() => onSelectLead(l)}
                    >
                      <td className="p-2 font-medium">
                        {l.full_name || l.handle || l.email || "(no name)"}
                      </td>
                      <td className="p-2 font-mono">{l.phone ?? "—"}</td>
                      <td className="p-2">{l.email ?? "—"}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1.5">
                          <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                          {platform}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {new Date(entryAt).toLocaleDateString()}
                        <span className="ml-1 text-muted-foreground">
                          · {formatLeadAge(entryAt, nowISO)} old
                        </span>
                      </td>
                      <td className="p-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-3xs font-medium ${CHIP_TONE_CLASSES[pipelineStageInfo(l.status).tone]}`}
                        >
                          {pipelineStageInfo(l.status).label}
                        </span>
                      </td>
                      <td className="p-2">{setterName}</td>
                      <td className="p-2">
                        <div className="font-medium">{availability?.headline ?? "—"}</div>
                        {availability?.detail && (
                          <div className="text-3xs text-muted-foreground">
                            {availability.detail}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      No leads available to call in the current range/filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </GlassTableShell>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Leads() {
  const { data: org } = useCurrentOrg();
  const orgId = org?.org_id;
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucket, setBucket] = useState<"all" | "active" | "booked" | "closed" | "lost">("all");
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [qualExpanded, setQualExpanded] = useState(false);
  const [selectedOptInDate, setSelectedOptInDate] = useState("");
  // Range filter is deliberately local (not the shared global DateRangeProvider,
  // which defaults to "Last 30d") — this page is a historical lead-record view,
  // so it must show full history by default, not silently hide older leads.
  // Same shared Today/Yesterday/7d/30d/MTD/Custom control every other page
  // uses (date-range-picker.tsx), just defaulting to "All time" instead of
  // "Last 30d" to preserve that full-history default.
  const [entryRange, setEntryRange] = useState<DateRange>(() => RANGES.all());
  const [setterFilter, setSetterFilter] = useState("all");
  const [closerFilter, setCloserFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [offerFilter, setOfferFilter] = useState("all");
  const [detailKind, setDetailKind] = useState<
    "total" | "booked" | "closed" | "available" | "stage" | null
  >(null);
  const [detailStageFilter, setDetailStageFilter] = useState<string | null>(null);

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["leads", orgId, devBypass],
    enabled: !!orgId,
    queryFn: async (): Promise<LeadRow[]> => {
      if (devBypass) {
        // Deterministic, varied mock call history so the new pipeline-stage/
        // available-to-call UI has something real-shaped to render in the
        // sandbox — mockLeads() itself stays a lean lead-only fixture.
        return (
          mockLeads() as unknown as Omit<LeadRow, "callCount" | "lastCallAt" | "closerName">[]
        ).map((l, i) => {
          const callCount = i % 4 === 0 ? 0 : i % 3;
          return {
            ...l,
            closer_id: null,
            callCount,
            lastCallAt:
              callCount > 0 ? new Date(Date.now() - (i % 6) * 3600e3).toISOString() : null,
            closerName: callCount > 1 ? ["Jordan Blake", "Sam Rivera"][i % 2] : null,
          };
        });
      }
      const { data, error } = await supabase
        .from("leads")
        .select(
          "id, full_name, email, handle, phone, status, pipeline_stage, priority, precall_video_watched, intent_score, engagement_score, estimated_close_probability, source_connector, source_platform, source_format, source_campaign, first_touch_at, first_touch_content_id, assigned_setter_id, qualification_notes, application_data, notes, created_at, tags, ticket_tier, calls(closer_id, closer_name, scheduled_for)",
        )
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      type LeadWithCalls = LeadRow & {
        calls?: Array<{
          closer_id: string | null;
          closer_name: string | null;
          scheduled_for: string | null;
        }>;
      };
      return (data ?? []).map((row) => {
        const lead = row as unknown as LeadWithCalls;
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
      });
    },
  });

  // Immediate-action deep link from hot-lead alerts / other pages (?leadId=…)
  // — opens the matching lead's drawer as soon as the list has loaded.
  const { leadId: deepLinkLeadId } = Route.useSearch();
  useEffect(() => {
    if (!deepLinkLeadId || !leads) return;
    const match = leads.find((l) => l.id === deepLinkLeadId);
    if (match) setSelected(match);
  }, [deepLinkLeadId, leads]);

  const updateLead = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await (supabase as any).from("leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Real per-lead callback-due data — the same operational_work_items /
  // "dialer_callback" entity the Inbound Dialer's own callback queue writes
  // to (activity-module.tsx), keyed by entity_id = lead.id. Used for the
  // "Follow-up — callback due today" wording; never fabricated when absent.
  const { data: callbacksByLead = {} } = useQuery({
    queryKey: ["leads-callbacks", orgId, devBypass],
    enabled: !!orgId && !devBypass,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operational_work_items" as never)
        .select("entity_id, due_at, state")
        .eq("org_id", orgId!)
        .eq("entity_type", "dialer_callback");
      if (error) throw error;
      const map: Record<string, { due_at: string | null; state: string }> = {};
      for (const row of (data ?? []) as {
        entity_id: string;
        due_at: string | null;
        state: string;
      }[]) {
        if (row.entity_id) map[row.entity_id] = { due_at: row.due_at, state: row.state };
      }
      return map;
    },
  });

  // Resolves leads.assigned_setter_id (a real auth.users uuid) to a display
  // name where the user actually has a profile — "Unknown" otherwise. This
  // is a genuinely different identity space from the free-text roster names
  // (team_members.name) used by setter_activity/EOD forms; there is no
  // reliable bridge between the two, so this is the best real join
  // available for a per-lead "assigned setter" rather than a guess.
  const setterIds = useMemo(
    () =>
      Array.from(
        new Set((leads ?? []).map((l) => l.assigned_setter_id).filter((v): v is string => !!v)),
      ),
    [leads],
  );
  const { data: setterProfiles = {} } = useQuery({
    queryKey: ["leads-setter-profiles", orgId, setterIds.join(","), devBypass],
    enabled: !!orgId && !devBypass && setterIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", setterIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) if (row.display_name) map[row.id] = row.display_name;
      return map;
    },
  });

  const generateLinkFn = useServerFn(generatePreCallVideoLinkFn);
  const copyPreCallLink = useMutation({
    mutationFn: async (leadId: string) => {
      // Real link only under a real session — dev-bypass has no lead this
      // token could resolve against, so it copies a clearly-fake preview
      // link rather than silently failing on the requireSupabaseAuth call.
      if (devBypass) return `${window.location.origin}/pcv/dev-preview-token`;
      const { token } = await generateLinkFn({ data: { leadId } });
      return `${window.location.origin}/pcv/${token}`;
    },
    onSuccess: async (url) => {
      await navigator.clipboard.writeText(url);
      toast.success("Pre-call video link copied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Extracted so the same "every filter except the date range" predicate can
  // be reused against the prior comparable period for the donut's cap/working
  // derivations (an apples-to-apples comparison, not just a raw prior count).
  const matchesNonDateFilters = (l: LeadRow, q: string) => {
    if (bucket !== "all" && !BUCKET_STATUSES[bucket].includes(l.status)) return false;
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    const offer = typeof l.application_data?.offer === "string" ? l.application_data.offer : null;
    if (setterFilter !== "all" && (l.assigned_setter_id ?? "unassigned") !== setterFilter)
      return false;
    if (closerFilter !== "all" && (l.closer_id ?? "unassigned") !== closerFilter) return false;
    if (platformFilter !== "all" && (l.source_platform ?? "unavailable") !== platformFilter)
      return false;
    if (offerFilter !== "all" && (offer ?? "unavailable") !== offerFilter) return false;
    if (!q) return true;
    const hay = [
      l.full_name,
      l.email,
      l.handle,
      l.phone,
      l.notes,
      JSON.stringify(l.application_data ?? {}),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  };

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (leads ?? []).filter((l) => {
      const entryAt = l.first_touch_at ?? l.created_at;
      if (selectedOptInDate && entryAt.slice(0, 10) !== selectedOptInDate) return false;
      if (entryAt.slice(0, 10) < entryRange.from) return false;
      if (entryAt.slice(0, 10) > entryRange.to) return false;
      return matchesNonDateFilters(l, q);
    });
    // matchesNonDateFilters closes over the filter state values already listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    leads,
    query,
    statusFilter,
    bucket,
    selectedOptInDate,
    entryRange,
    setterFilter,
    closerFilter,
    platformFilter,
    offerFilter,
  ]);

  const nowISO = useMemo(() => new Date().toISOString(), []);
  const availabilityByLeadId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof deriveLeadAvailability>>();
    for (const l of leads ?? []) {
      const cb = callbacksByLead[l.id];
      map.set(
        l.id,
        deriveLeadAvailability({
          status: l.status,
          callCount: l.callCount,
          lastCallAt: l.lastCallAt,
          callbackDueAt: cb?.state === "completed" ? null : (cb?.due_at ?? null),
          nowISO,
        }),
      );
    }
    return map;
  }, [leads, callbacksByLead, nowISO]);

  const filterOptions = useMemo(() => {
    const values = (pick: (lead: LeadRow) => string | null) =>
      Array.from(new Set((leads ?? []).map(pick).filter(Boolean))) as string[];
    return {
      setters: values((lead) => lead.assigned_setter_id),
      closers: values((lead) => lead.closer_id ?? null),
      platforms: values((lead) => lead.source_platform),
      offers: Array.from(
        new Set(
          (leads ?? [])
            .map((lead) =>
              typeof lead.application_data?.offer === "string" ? lead.application_data.offer : null,
            )
            .filter(Boolean),
        ),
      ) as string[],
    };
  }, [leads]);

  const { page, setPage, pageCount, paged, total, pageSize } = usePagination(view, 25);

  // All date-range-sensitive: derived from `view` (respects entry range +
  // every active filter), not the raw unfiltered `leads` array the old stats
  // used — Priority 5's "the KPI cards must respect the selected range."
  const stats = useMemo(() => {
    return {
      total: view.length,
      booked: view.filter((l) => l.status === "call_booked").length,
      closed: view.filter((l) => l.status === "closed").length,
      diamond: view.filter((l) => l.priority === "diamond" || l.pipeline_stage === "diamond")
        .length,
      available: view.filter((l) => availabilityByLeadId.get(l.id)?.bucket !== "unavailable")
        .length,
    };
  }, [view, availabilityByLeadId]);

  // Pipeline-stage composition (Priority 8's replacement chart) — a real
  // share-of-leads-by-stage breakdown from the true lead_status enum, date-
  // range aware via `view`. Donut, not a line chart: this is a composition/
  // share metric at a point in time, not a time series.
  const stageComposition = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of view) {
      const label = pipelineStageInfo(l.status).label;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }, [view]);

  // Real cumulative funnel (Total → Reached a Call → Closed) purely to feed
  // deriveCap/deriveWorking's cap/working text on the KPI drilldowns below —
  // not rendered as its own chart (Priority 8 asks for one chart total).
  const cumulativeFunnelStages: FunnelStage[] = useMemo(
    () => [
      { key: "total", label: "Total Leads", value: view.length, spectrum: "cold" },
      {
        key: "reached_call",
        label: "Reached a Call",
        value: view.filter((l) => REACHED_CALL_REAL_STATUSES.includes(l.status)).length,
        spectrum: "mid",
      },
      {
        key: "closed",
        label: "Closed",
        value: view.filter((l) => l.status === "closed").length,
        spectrum: "hot",
      },
    ],
    [view],
  );
  const priorRange = useMemo(() => priorPeriod(entryRange.from, entryRange.to), [entryRange]);
  const priorFunnelStages: FunnelStage[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const priorView = (leads ?? []).filter((l) => {
      const entryAt = (l.first_touch_at ?? l.created_at).slice(0, 10);
      if (entryAt < priorRange.from || entryAt > priorRange.to) return false;
      return matchesNonDateFilters(l, q);
    });
    return [
      { key: "total", label: "Total Leads", value: priorView.length, spectrum: "cold" },
      {
        key: "reached_call",
        label: "Reached a Call",
        value: priorView.filter((l) => REACHED_CALL_REAL_STATUSES.includes(l.status)).length,
        spectrum: "mid",
      },
      {
        key: "closed",
        label: "Closed",
        value: priorView.filter((l) => l.status === "closed").length,
        spectrum: "hot",
      },
    ];
    // matchesNonDateFilters closes over the filter state values already listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    leads,
    priorRange,
    query,
    bucket,
    statusFilter,
    setterFilter,
    closerFilter,
    platformFilter,
    offerFilter,
  ]);

  const settingsFn = useServerFn(getWorkspaceSettingsFn);
  const { data: workspaceSettings } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass
        ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS)
        : settingsFn({ data: { orgId: orgId! } }),
  });
  const minCapSample =
    workspaceSettings?.funnel_instrument.minCapSample ??
    DEFAULT_WORKSPACE_SETTINGS.funnel_instrument.minCapSample;

  const workingDerivation: Derivation = useMemo(
    () => deriveWorking(cumulativeFunnelStages, priorFunnelStages, minCapSample),
    [cumulativeFunnelStages, priorFunnelStages, minCapSample],
  );
  const noUpstreamDerivation: Derivation = {
    status: "insufficient_data",
    sentence: "Nothing sits upstream of this count — there's no constraint to identify.",
  };
  const bookedCapDerivation: Derivation = useMemo(
    () => deriveCap(cumulativeFunnelStages, 1, minCapSample),
    [cumulativeFunnelStages, minCapSample],
  );
  const closedCapDerivation: Derivation = useMemo(
    () => deriveCap(cumulativeFunnelStages, 2, minCapSample),
    [cumulativeFunnelStages, minCapSample],
  );

  return (
    <>
      <TopBar
        title="Leads CRM"
        subtitle="Pipeline stage · priority · pre-call vid tracking · notes"
      />
      <div className="p-6 space-y-5">
        <PageHero
          icon={<Users className="h-5 w-5" />}
          eyebrow="Sales Tracking"
          title="Leads CRM"
          subtitle="Pipeline stage, priority, pre-call video tracking, and full activity notes."
          status={[
            { label: `${stats.total} total leads`, tone: "default" },
            { label: `${stats.diamond} diamond`, tone: "accent" },
            ...(stats.booked > 0
              ? [{ label: `${stats.booked} awaiting show`, tone: "warning" as const }]
              : []),
          ]}
        />

        {/* Pipeline-stage composition — replaces the old 3-bar funnel (Priority 3/8):
            a real share-of-leads-by-real-status donut, date-range aware via `view`,
            click-through into the underlying leads for that stage. */}
        <LeadsPipelineDonut
          data={stageComposition}
          onSelectStage={(label) => {
            setDetailKind(null);
            setDetailStageFilter(label);
          }}
        />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 stagger-fade">
          {/* Volume/conversion metrics take their funnel position (B4) — never a semantic
              tone. Deltas are real period-over-period counts (cumulativeFunnelStages vs
              priorFunnelStages) — previously hardcoded placeholder numbers/sparks; a
              real spark series would need daily-bucketed history this page doesn't
              fetch, so it's omitted rather than fabricated (KpiTile's own convention). */}
          <MetricCard
            label="Total leads"
            value={stats.total}
            icon={<Users className="h-3 w-3" />}
            spectrum="cold"
            deltaPct={pctDelta(stats.total, priorFunnelStages[0].value)}
            onClick={() => {
              setDetailStageFilter(null);
              setDetailKind("total");
            }}
          />
          <MetricCard
            label="Available to call"
            value={stats.available}
            icon={<PhoneCall className="h-3 w-3" />}
            spectrum="mid"
            onClick={() => {
              setDetailStageFilter(null);
              setDetailKind("available");
            }}
          />
          <MetricCard
            label="Call booked"
            value={stats.booked}
            icon={<CalendarDays className="h-3 w-3" />}
            spectrum="mid"
            deltaPct={pctDelta(stats.booked, priorFunnelStages[1].value)}
            onClick={() => {
              setDetailStageFilter(null);
              setDetailKind("booked");
            }}
          />
          <MetricCard
            label="Closed"
            value={stats.closed}
            icon={<Sparkles className="h-3 w-3" />}
            spectrum="hot"
            deltaPct={pctDelta(stats.closed, priorFunnelStages[2].value)}
            onClick={() => {
              setDetailStageFilter(null);
              setDetailKind("closed");
            }}
          />
          <MetricCard
            label="💎 Diamond leads"
            value={stats.diamond}
            icon={<Gem className="h-3 w-3" />}
            spectrum="hot"
          />
        </div>

        <LeadInsightsPanel orgId={orgId} />

        <SmartViewsBar
          current={{ query, statusFilter, bucket }}
          onApply={(v) => {
            setQuery(v.query);
            setStatusFilter(v.statusFilter);
            setBucket(v.bucket as typeof bucket);
          }}
        />

        <GlassTableShell
          toolbar={
            <>
              <TableSearch
                value={query}
                onChange={setQuery}
                placeholder="Search name, handle, application…"
              />
              <FilterPills
                options={[
                  { key: "all", label: "All", count: leads?.length ?? 0 },
                  { key: "active", label: "Active" },
                  { key: "booked", label: "Booked" },
                  { key: "closed", label: "Closed" },
                  { key: "lost", label: "Lost" },
                ]}
                value={bucket}
                onChange={setBucket}
              />
              <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedOptInDate}
                  onChange={(e) => setSelectedOptInDate(e.target.value)}
                  aria-label="Filter leads by a specific opt-in day"
                  title="Show all leads that opted in on this exact day"
                  className="h-8 bg-transparent text-2xs outline-none"
                />
                {selectedOptInDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedOptInDate("")}
                    className="text-2xs text-muted-foreground hover:text-foreground"
                    aria-label="Clear opt-in date filter"
                  >
                    ×
                  </button>
                )}
              </div>
              <DateRangePicker value={entryRange} onChange={setEntryRange} />
              {[
                ["Setter", setterFilter, setSetterFilter, filterOptions.setters],
                ["Closer", closerFilter, setCloserFilter, filterOptions.closers],
                ["Platform", platformFilter, setPlatformFilter, filterOptions.platforms],
                ["Offer", offerFilter, setOfferFilter, filterOptions.offers],
              ].map(([label, value, setter, options]) => (
                <select
                  key={label as string}
                  value={value as string}
                  onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                  className="h-8 max-w-[150px] rounded-md border border-input bg-background px-2 text-2xs"
                >
                  <option value="all">All {label as string}s</option>
                  <option value="unassigned">Unavailable / unassigned</option>
                  {(options as string[]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ))}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-2xs"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="ml-auto text-2xs text-muted-foreground">
                {view.length} / {leads?.length ?? 0}
              </div>
            </>
          }
          footer={
            <Pagination
              page={page}
              pageCount={pageCount}
              onPage={setPage}
              total={total}
              pageSize={pageSize}
            />
          }
        >
          <table className="w-full text-sm">
            <thead className="sticky-thead bg-muted/40 text-3xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-2.5 min-w-[110px]">Date / Time</th>
                <th className="text-left p-2.5 min-w-[60px]">💎</th>
                <th className="text-left p-2.5 min-w-[160px]">Name</th>
                <th className="text-left p-2.5 min-w-[120px]">Stage</th>
                <th className="text-left p-2.5 min-w-[220px]">Lead Status</th>
                <th className="text-center p-2.5 min-w-[90px]">Pre-call vid</th>
                {qualExpanded ? (
                  APP_COLS.map((c, i) => (
                    <th key={c.key} className={`text-left p-2.5 normal-case ${c.width ?? ""}`}>
                      {i === 0 ? (
                        <ColumnGroupToggle
                          label={c.label}
                          expanded
                          onToggle={() => setQualExpanded(false)}
                        />
                      ) : (
                        c.label
                      )}
                    </th>
                  ))
                ) : (
                  <th className="text-left p-2.5 min-w-[140px] normal-case">
                    <ColumnGroupToggle
                      label="Qualification"
                      expanded={false}
                      onToggle={() => setQualExpanded(true)}
                    />
                  </th>
                )}
                <th className="text-left p-2.5 min-w-[140px]">Email</th>
                <th className="text-left p-2.5 min-w-[130px]">Setter</th>
                <th className="text-left p-2.5 min-w-[130px]">Closer</th>
                {/* Confirmed real gap (Sales Tracking Part 1): phone was a real, already-
                    fetched column, but only ever shown as a Contact-column fallback
                    (email ?? phone) — never its own visible column. */}
                <th className="text-left p-2.5 min-w-[120px]">Phone</th>
                <th className="text-left p-2.5 min-w-[130px]">Handle</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((l) => {
                const t = tone(l.status);
                const app = l.application_data ?? {};
                const isDiamond = l.priority === "diamond" || l.pipeline_stage === "diamond";
                return (
                  <tr
                    key={l.id}
                    className={`border-t border-border cursor-pointer transition-colors ${isDiamond ? "bg-accent/5 hover:bg-accent/10" : t.row || "hover:bg-muted/30"}`}
                    onClick={() => setSelected(l)}
                  >
                    <td
                      className="p-2.5 text-xs text-muted-foreground whitespace-nowrap"
                      title={`Entry: ${new Date(l.first_touch_at ?? l.created_at).toISOString()}`}
                    >
                      {new Date(l.first_touch_at ?? l.created_at).toLocaleDateString()}
                      <br />
                      <span className="text-3xs">
                        {new Date(l.first_touch_at ?? l.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.priority ?? "normal"}
                        onChange={(e) =>
                          updateLead.mutate({ id: l.id, patch: { priority: e.target.value } })
                        }
                        className="h-7 rounded px-1 text-2xs bg-transparent border border-border cursor-pointer"
                        title="Priority"
                      >
                        {PRIORITY_OPTIONS.map((p) => (
                          <option key={p.v} value={p.v}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2.5">
                      <div className="font-medium flex items-center gap-1.5">
                        {isDiamond && <Gem className="h-3.5 w-3.5 text-accent shrink-0" />}
                        {l.full_name || l.handle || l.email || "(no name)"}
                      </div>
                      {l.tags && l.tags.length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {l.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded bg-muted px-1 py-0.5 text-4xs text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <select
                        value={l.pipeline_stage ?? ""}
                        onChange={(e) =>
                          updateLead.mutate({
                            id: l.id,
                            patch: { pipeline_stage: e.target.value || null },
                          })
                        }
                        className={`h-7 rounded px-2 text-2xs font-medium border-0 cursor-pointer ${stageChip(l.pipeline_stage)}`}
                      >
                        {PIPELINE_STAGES.map((s) => (
                          <option key={s.v} value={s.v}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      {/* Real pipeline stage (from the actual lead_status enum) — the
                          editable dropdown below it writes a different, legacy vocabulary
                          that only partially overlaps the real column (see
                          lead-pipeline.ts's header comment); this chip is what's actually
                          true right now. */}
                      <span
                        className={`mb-1 inline-flex rounded px-1.5 py-0.5 text-3xs font-medium ${CHIP_TONE_CLASSES[pipelineStageInfo(l.status).tone]}`}
                      >
                        {pipelineStageInfo(l.status).label}
                      </span>
                      <select
                        value={l.status}
                        onChange={(e) =>
                          updateLead.mutate({ id: l.id, patch: { status: e.target.value } })
                        }
                        className={`block h-7 rounded px-2 text-2xs font-medium border-0 cursor-pointer ${t.chip}`}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.v} value={s.v}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() =>
                            updateLead.mutate({
                              id: l.id,
                              patch: { precall_video_watched: !l.precall_video_watched },
                            })
                          }
                          className={`h-7 w-12 rounded text-3xs font-semibold uppercase tracking-wider transition-colors ${l.precall_video_watched ? CHIP_TONE_CLASSES.success : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
                          title={l.precall_video_watched ? "Watched" : "Mark as watched"}
                        >
                          {l.precall_video_watched ? "✓ Yes" : "No"}
                        </button>
                        <button
                          onClick={() => copyPreCallLink.mutate(l.id)}
                          disabled={copyPreCallLink.isPending}
                          className="grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground disabled:opacity-50"
                          title="Copy pre-call video link to send this lead"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                    {qualExpanded ? (
                      APP_COLS.map((c) => (
                        <td key={c.key} className="p-2.5 text-xs">
                          <div className="truncate max-w-[200px]" title={app[c.key] ?? ""}>
                            {app[c.key] ?? <span className="text-muted-foreground/50">—</span>}
                          </div>
                        </td>
                      ))
                    ) : (
                      <td className="p-2.5 text-xs text-muted-foreground font-mono">
                        {APP_COLS.filter((c) => app[c.key]).length}/{APP_COLS.length} filled
                      </td>
                    )}
                    <td className="p-2.5 text-xs text-muted-foreground">{l.email ?? "—"}</td>
                    <td className="p-2.5 text-xs text-muted-foreground">Unavailable</td>
                    <td className="p-2.5 text-xs text-muted-foreground">Unavailable</td>
                    <td className="p-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {l.phone ?? "—"}
                    </td>
                    <td className="p-2.5 text-xs">
                      {l.handle ? (
                        <span className="text-accent">@{l.handle.replace(/^@/, "")}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {leadsLoading && (
                <tr>
                  <td
                    colSpan={6 + (qualExpanded ? APP_COLS.length : 1) + 5}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!leadsLoading && view.length === 0 && (
                <tr>
                  <td
                    colSpan={6 + (qualExpanded ? APP_COLS.length : 1) + 5}
                    className="p-10 text-center text-sm text-muted-foreground"
                  >
                    No leads match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </GlassTableShell>

        <Dialog
          open={!!selected}
          onOpenChange={(o) => {
            if (!o) setSelected(null);
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selected?.full_name || selected?.handle || selected?.email || "Lead"}
              </DialogTitle>
            </DialogHeader>
            {selected && (
              <LeadDetail
                lead={selected}
                setterName={
                  selected.assigned_setter_id
                    ? (setterProfiles[selected.assigned_setter_id] ?? "Unknown")
                    : null
                }
                availability={availabilityByLeadId.get(selected.id) ?? null}
              />
            )}
          </DialogContent>
        </Dialog>

        {(() => {
          const kind = detailStageFilter ? "stage" : detailKind;
          if (!kind) return null;
          const rows =
            kind === "total"
              ? view
              : kind === "booked"
                ? view.filter((l) => l.status === "call_booked")
                : kind === "closed"
                  ? view.filter((l) => l.status === "closed")
                  : kind === "available"
                    ? view.filter((l) => availabilityByLeadId.get(l.id)?.bucket !== "unavailable")
                    : view.filter((l) => pipelineStageInfo(l.status).label === detailStageFilter);
          const title =
            kind === "total"
              ? "Total leads"
              : kind === "booked"
                ? "Call booked"
                : kind === "closed"
                  ? "Closed"
                  : kind === "available"
                    ? "Available to call"
                    : `Stage: ${detailStageFilter}`;
          const cap =
            kind === "booked"
              ? bookedCapDerivation
              : kind === "closed"
                ? closedCapDerivation
                : noUpstreamDerivation;
          const working =
            kind === "total" || kind === "booked" || kind === "closed"
              ? workingDerivation
              : noUpstreamDerivation;
          const close = () => {
            setDetailKind(null);
            setDetailStageFilter(null);
          };
          if (kind === "available") {
            return (
              <AvailableToCallDrawer
                open
                onOpenChange={(o) => !o && close()}
                rows={rows}
                availabilityByLeadId={availabilityByLeadId}
                setterProfiles={setterProfiles}
                onSelectLead={(l) => {
                  close();
                  setSelected(l);
                }}
              />
            );
          }
          return (
            <MetricDetailPanel
              open
              onOpenChange={(o) => !o && close()}
              title={title}
              subtitle={`${entryRange.label} · ${entryRange.from} → ${entryRange.to}`}
              columns={LEAD_DETAIL_COLUMNS}
              rows={rows}
              rowKey={(l) => l.id}
              cap={cap}
              working={working}
              emptyRowsLabel="No leads match this in the current range/filters."
            />
          );
        })()}
      </div>
    </>
  );
}

const DONUT_COLORS = [
  "var(--spectrum-hot)",
  "var(--spectrum-mid)",
  "var(--spectrum-cold)",
  "var(--accent)",
  "var(--primary)",
  "var(--color-warning)",
  "var(--color-success)",
];

/**
 * Replaces the old 3-bar "Pipeline Funnel" (Priority 8) — leads by real
 * pipeline stage is a composition/share metric, not a time series, so a
 * donut communicates it more directly. Same recharts PieChart/Cell pattern
 * traffic.tsx's "Share of leads by channel" already established — no new
 * chart dependency, same neutral-card/thin-treatment visual language.
 */
function LeadsPipelineDonut({
  data,
  onSelectStage,
}: {
  data: { label: string; value: number }[];
  onSelectStage: (label: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider">
        Leads by Pipeline Stage
      </div>
      <div className="p-4">
        {total > 0 ? (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="label"
                    innerRadius="55%"
                    outerRadius="90%"
                    paddingAngle={2}
                    onClick={(entry: { label?: string }) =>
                      entry?.label && onSelectStage(entry.label)
                    }
                    className="cursor-pointer"
                  >
                    {data.map((d, i) => (
                      <RechartsCell key={d.label} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => `${v} leads`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center gap-1.5">
              {data.map((d, i) => (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => onSelectStage(d.label)}
                  className="-mx-1 flex items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/30"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <span className="flex-1 truncate font-medium">{d.label}</span>
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground">
                    {d.value} · {total ? ((d.value / total) * 100).toFixed(0) : 0}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No leads in range yet — the chart fills in as leads come through.
          </div>
        )}
      </div>
    </div>
  );
}

function LeadDetail({
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
          .select("id, status, scheduled_for, showed, closed, cash_collected_cents, call_summary")
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
      const { data, error } = await (supabase as any)
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
      const { error } = await (supabase as any)
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

  const totalCash = (timeline?.calls ?? []).reduce((s, c) => s + (c.cash_collected_cents ?? 0), 0);
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
              <span className="text-muted-foreground">Source:</span> {lead.source_connector ?? "—"}
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
          <div className="rounded border border-border divide-y divide-border text-xs">
            {APP_COLS.map((c) => (
              <div key={c.key} className="p-2.5 grid grid-cols-3 gap-2">
                <div className="text-muted-foreground uppercase text-3xs tracking-wider">
                  {c.label}
                </div>
                <div className="col-span-2">
                  {app[c.key] || <span className="text-muted-foreground/50">—</span>}
                </div>
              </div>
            ))}
          </div>
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
            {(notes ?? []).map((n: any) => (
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
              <div className="font-mono font-bold">{timeline?.touches.length ?? 0}</div>
              <div className="text-3xs text-muted-foreground">Content touches</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <MessageSquare className="h-3 w-3 mx-auto text-primary mb-1" />
              <div className="font-mono font-bold">{timeline?.convs.length ?? 0}</div>
              <div className="text-3xs text-muted-foreground">Conversations</div>
            </div>
            <div className="rounded border border-border p-2 text-center">
              <PhoneCall className="h-3 w-3 mx-auto text-emerald-500 mb-1" />
              <div className="font-mono font-bold">{timeline?.calls.length ?? 0}</div>
              <div className="text-3xs text-muted-foreground">
                calls · ${Math.round(totalCash / 100).toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <div className="text-3xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <Film className="h-3 w-3" /> Content path (first → last)
            </div>
            <div className="space-y-1.5">
              {(timeline?.touches ?? []).map((t: any) => {
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
              {(timeline?.calls ?? []).map((c: any) => (
                <div key={c.id} className="rounded border border-border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium uppercase text-3xs">{c.status}</span>
                    <span className="font-mono text-emerald-500">
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

function LeadInsightsPanel({ orgId }: { orgId?: string }) {
  const run = useServerFn(analyzeLeads);
  const { devBypass } = useAuth();
  const [data, setData] = useState<{
    bottlenecks: any[];
    double_down: any[];
    priority_leads: any[];
    sampleSize: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<"1d" | "3d" | "7d" | "30d" | "all">("30d");

  const generate = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      if (devBypass) {
        setData(await withMockDelay(mockLeadInsights()));
        return;
      }
      const now = new Date();
      const days: Record<string, number | null> = {
        "1d": 1,
        "3d": 3,
        "7d": 7,
        "30d": 30,
        all: null,
      };
      const d = days[range];
      const from = d ? new Date(now.getTime() - d * 86400000).toISOString() : undefined;
      const out = await run({ data: { orgId, from, to: now.toISOString() } });
      setData(out as any);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <div>
            <div className="text-sm font-semibold">Lead AI Insights</div>
            <div className="text-2xs text-muted-foreground">
              Bottlenecks, double-downs, and today's diamond leads
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as any);
              setData(null);
            }}
            className="h-8 rounded border border-input bg-background px-2 text-xs"
          >
            <option value="1d">Last 24h</option>
            <option value="3d">Last 3 days</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
          <Button size="sm" onClick={generate} disabled={loading || !orgId}>
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate
              </>
            )}
          </Button>
        </div>
      </div>
      {!data && !loading && (
        <div className="text-xs text-muted-foreground italic">
          Pick a window and hit Generate to surface bottlenecks, double-downs, and today's priority
          leads.
        </div>
      )}
      {data && (
        <div className="grid md:grid-cols-3 gap-3 animate-in fade-in-0 slide-in-from-top-1 duration-300">
          <div className="rounded border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-destructive font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3" /> Bottlenecks
            </div>
            {data.bottlenecks.map((b, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">{b.title}</div>
                <div className="text-muted-foreground">{b.body}</div>
                <div className="text-accent text-2xs">→ {b.recommendation}</div>
              </div>
            ))}
          </div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Double down
            </div>
            {data.double_down.map((b, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">{b.title}</div>
                <div className="text-muted-foreground">{b.body}</div>
                <div className="text-accent text-2xs">→ {b.recommendation}</div>
              </div>
            ))}
          </div>
          <div className="rounded border border-accent/30 bg-accent/5 p-3 space-y-2">
            <div className="text-3xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
              <Gem className="h-3 w-3" /> Priority leads
            </div>
            {data.priority_leads.map((p, i) => (
              <div key={i} className="text-xs space-y-0.5">
                <div className="font-medium">💎 {p.name}</div>
                <div className="text-muted-foreground">{p.reason}</div>
              </div>
            ))}
            {data.priority_leads.length === 0 && (
              <div className="text-xs text-muted-foreground italic">No standout leads yet.</div>
            )}
          </div>
        </div>
      )}
      {data && (
        <div className="text-3xs text-muted-foreground">
          Based on {data.sampleSize} lead{data.sampleSize === 1 ? "" : "s"}.
        </div>
      )}
    </div>
  );
}
