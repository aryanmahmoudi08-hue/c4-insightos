import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TopBar } from "@/components/app-sidebar";
import { useAuth, useCurrentOrg } from "@/hooks/use-auth";
import { useRole } from "@/hooks/use-role";
import { useTheme } from "@/hooks/use-theme";
import { useDateRange } from "@/hooks/use-date-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { browserTimeZone } from "@/lib/zoned-time";
import { DISPLAY_TIMEZONES } from "@/hooks/use-display-timezone";
import {
  Moon,
  Sun,
  ShieldCheck,
  Users,
  LogOut,
  Building2,
  Loader2,
  Save,
  Radar,
  ExternalLink,
  Link2,
  Plus,
  Trash2,
  PlugZap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { googleCalendarStatus, startGoogleCalendarOAuth } from "@/lib/google-calendar.functions";
import { ROLE_LABELS, ROLE_BLURBS, type ManagedRole } from "@/lib/permissions";
import {
  getWorkspaceSettingsFn,
  updateWorkspaceSettingsFn,
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceSettings,
  type NotificationSettingsT,
} from "@/lib/workspace-settings.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
  head: () => ({
    meta: [
      { title: "Settings · AscendOS" },
      {
        name: "description",
        content:
          "Manage appearance, workspace details and team access for your AscendOS workspace.",
      },
      { property: "og:title", content: "Settings · AscendOS" },
      {
        property: "og:description",
        content:
          "Manage appearance, workspace details and team access for your AscendOS workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-2xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Settings() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const { role, isAdmin } = useRole();
  const { theme, setTheme } = useTheme();
  const { range } = useDateRange();

  return (
    <>
      <TopBar title="Settings" subtitle="Appearance, workspace and access" />
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Section
          title="Appearance"
          description="Dark is the default. Black, white, and a violet → pink → light-blue spectrum that encodes funnel temperature (cold → hot) in data only — never decoration or UI chrome."
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                key: "dark" as const,
                label: "Dark",
                icon: Moon,
                swatch: ["#151515", "#232323", "#f7f7f7"],
              },
              {
                key: "light" as const,
                label: "Light",
                icon: Sun,
                swatch: ["#fcfcfc", "#ededed", "#1a1a1a"],
              },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = theme === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    active ? "border-primary ring-1 ring-ring" : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="h-4 w-4" /> {opt.label}
                    {active && (
                      <span className="ml-auto text-3xs uppercase tracking-wider text-muted-foreground">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-1">
                    {opt.swatch.map((c) => (
                      <span
                        key={c}
                        className="h-4 w-8 rounded border border-border"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="Workspace" description="Details of the workspace you're signed into.">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Workspace</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                <Building2 className="h-3.5 w-3.5" />
                {org?.organizations?.name ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Signed in as</dt>
              <dd className="mt-0.5 font-medium">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="mt-0.5 font-medium">
                {role ? (ROLE_LABELS[role as ManagedRole] ?? role) : "—"}
              </dd>
              {role && (
                <dd className="text-2xs text-muted-foreground">
                  {ROLE_BLURBS[role as ManagedRole] ?? "Full owner access."}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-muted-foreground">Default reporting range</dt>
              <dd className="mt-0.5 font-medium">{range?.label ?? "Last 30 days"}</dd>
            </div>
          </dl>
        </Section>

        {/* The panel itself moved to its own page, next to the catalogue
            that explains what each system feeds and where it lands. Two
            homes for connections is how one of them goes stale. */}
        <Section
          title="Connections"
          description="Every integration — Typeform, Stripe, Calendly, Close, Meta Ads and the rest — now lives on its own page, alongside what each one brings in and where that data lands."
        >
          <Link
            to="/integrations"
            className="btn-accent inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium"
          >
            <PlugZap className="h-4 w-4" />
            Open Integrations
          </Link>
        </Section>

        <SchedulingSection orgId={org?.org_id} isAdmin={isAdmin} />
        <NotificationsSection orgId={org?.org_id} isAdmin={isAdmin} />
        <ContentEngineSection orgId={org?.org_id} isAdmin={isAdmin} />

        <Section
          title="Access & team"
          description="Control what every role — and every individual rep — can view or edit."
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="justify-start gap-2"
              disabled={!isAdmin}
            >
              <Link to="/permissions">
                <ShieldCheck className="h-4 w-4" /> Role access
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="justify-start gap-2">
              <Link to="/team">
                <Users className="h-4 w-4" /> Team & per-person
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-2xs text-muted-foreground">
            Role access sets the baseline. Person-level overrides live on each team row under Team →
            Access and always win over the role default.
          </p>
        </Section>

        <Section title="Session">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </Section>
      </div>
    </>
  );
}

type NumField = { key: string; label: string; hint: string; min: number; max: number };

const CONTENT_ENGINE_FIELDS: NumField[] = [
  {
    key: "minBucketSample",
    label: "Minimum sample per bucket",
    hint: 'Below this many same-mechanism/platform pieces with metrics logged, a performance verdict isn\'t shown — "not enough data" instead.',
    min: 1,
    max: 200,
  },
  {
    key: "baselineWindowSize",
    label: "Baseline window (pieces)",
    hint: "How many past pieces per bucket the comparison baseline is computed from.",
    min: 1,
    max: 500,
  },
  {
    key: "minTotalSignalWeight",
    label: "Minimum total signal weight",
    hint: 'Below this total demand-signal weight, the recommended mix is badged "limited data."',
    min: 0,
    max: 10000,
  },
  {
    key: "weeklyReelTarget",
    label: "Weekly reel target",
    hint: "Default reel target shown on Content Signals.",
    min: 1,
    max: 50,
  },
];
const ALERT_FIELDS: NumField[] = [
  {
    key: "showRateAlertPct",
    label: "Show-rate alert threshold (%)",
    hint: "Fires when show rate drops below this — set to your own baseline, not an industry number.",
    min: 0,
    max: 100,
  },
  {
    key: "closeRateAlertPct",
    label: "Close-rate alert threshold (%)",
    hint: "Fires when close rate drops below this. Set it below your real close rate but close enough that a meaningful drop trips it — a threshold far below your actual performance never fires, and one above it fires constantly.",
    min: 0,
    max: 100,
  },
];
const CLIENT_FIELDS: NumField[] = [
  {
    key: "renewalAtRiskDays",
    label: "Renewal at-risk window (days)",
    hint: "A client is flagged at-risk when their renewal falls inside this many days with no conversation started yet, or is overdue.",
    min: 1,
    max: 365,
  },
];
/**
 * The workspace's Calendly scheduling link.
 *
 * Only "Book a meeting" on a CRM lead card uses it. Cancel and Reschedule
 * are per-booking URLs Calendly issues and the webhook stores on the call
 * row, so they open that specific booking and need nothing configured here.
 */
function SchedulingSection({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkspaceSettingsFn);
  const updateFn = useServerFn(updateWorkspaceSettingsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS) : getFn({ data: { orgId: orgId! } }),
  });

  const [url, setUrl] = useState("");
  const [seeded, setSeeded] = useState(false);
  if (data && !seeded) {
    setUrl(data.scheduling.calendlyUrl);
    setSeeded(true);
  }

  const trimmed = url.trim();
  const invalid = trimmed.length > 0 && !/^https:\/\//i.test(trimmed);

  const save = useMutation({
    mutationFn: async () => {
      if (devBypass) return data ?? DEFAULT_WORKSPACE_SETTINGS;
      return updateFn({ data: { orgId: orgId!, scheduling: { calendlyUrl: trimmed } } });
    },
    onSuccess: (saved) => {
      toast.success(trimmed ? "Scheduling link saved" : "Scheduling link cleared");
      qc.setQueryData(["workspace-settings", orgId, devBypass], saved);
      qc.invalidateQueries({ queryKey: ["crm-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Scheduling"
      description="Where “Book a meeting” on a CRM lead card sends you. Cancelling and rescheduling use the booking's own Calendly links and need nothing here."
    >
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mx-auto animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Calendly scheduling link</Label>
            <Input
              value={url}
              disabled={!isAdmin}
              placeholder="https://calendly.com/your-team/intro-call"
              onChange={(e) => setUrl(e.target.value)}
            />
            {invalid ? (
              <p className="text-3xs text-destructive">Use an HTTPS URL.</p>
            ) : (
              <p className="text-3xs text-muted-foreground">
                Leave blank and the Book button stays disabled, saying no link is set — rather than
                opening something that does not exist.
              </p>
            )}
          </div>
          {isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => save.mutate()}
              disabled={save.isPending || invalid}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Save
            </Button>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Only workspace owners and admins can change this.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

const WEEKDAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const TOUCHPOINT_OPTIONS: Array<{
  value: NotificationSettingsT["confirmTouchpoint"];
  label: string;
}> = [
  { value: "night_before", label: "Night before — homework video" },
  { value: "morning", label: "Morning of — goals message" },
  { value: "one_hour", label: "1 hour before — link reminder" },
  { value: "thirty_min", label: "30 minutes before" },
  { value: "ten_min", label: "10 minutes before" },
];

function hourLabel(h: number) {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${suffix}`;
}

/**
 * What the scheduled Discord events mean for this workspace: which timezone
 * "today" is in, which confirmation touchpoint counts as "confirmed", and when
 * the sales reports send.
 */
function NotificationsSection({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkspaceSettingsFn);
  const updateFn = useServerFn(updateWorkspaceSettingsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS) : getFn({ data: { orgId: orgId! } }),
  });

  const [draft, setDraft] = useState<NotificationSettingsT | null>(null);
  if (data && !draft) setDraft(data.notifications);
  const browserZone = browserTimeZone();
  const zoneOptions = Array.from(
    new Set([
      ...(draft?.timeZone ? [draft.timeZone] : []),
      browserZone,
      ...DISPLAY_TIMEZONES.map((z) => z.value),
    ]),
  );

  const save = useMutation({
    mutationFn: async () => {
      if (devBypass || !draft) return data ?? DEFAULT_WORKSPACE_SETTINGS;
      return updateFn({ data: { orgId: orgId!, notifications: draft } });
    },
    onSuccess: (saved) => {
      toast.success("Notification settings saved");
      qc.setQueryData(["workspace-settings", orgId, devBypass], saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof NotificationSettingsT>(k: K, v: NotificationSettingsT[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  return (
    <Section
      title="Notifications"
      description="What the scheduled Discord events mean for this workspace. Each one only sends if an Event Bus subscription is listening for it."
    >
      {isLoading || !draft ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mx-auto animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Business timezone</Label>
            <select
              className={SELECT_CLASS}
              disabled={!isAdmin}
              value={draft.timeZone}
              onChange={(e) => set("timeZone", e.target.value)}
            >
              <option value="">Not set</option>
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {DISPLAY_TIMEZONES.find((d) => d.value === z)?.label ?? z}
                  {z === browserZone ? " (this browser)" : ""}
                </option>
              ))}
            </select>
            <p className="text-3xs text-muted-foreground">
              Defines “today” for the daily report and the times shown in Discord messages. Until it
              is set the sales reports do not send, rather than counting a day that ends at 7 PM.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">A call counts as confirmed when this step is ticked</Label>
            <select
              className={SELECT_CLASS}
              disabled={!isAdmin}
              value={draft.confirmTouchpoint}
              onChange={(e) =>
                set(
                  "confirmTouchpoint",
                  e.target.value as NotificationSettingsT["confirmTouchpoint"],
                )
              }
            >
              {TOUCHPOINT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-3xs text-muted-foreground">
              Ticking it fires <span className="font-mono">call.confirmed</span>. Until it is
              ticked, <span className="font-mono">call.unconfirmed</span> alerts at 10 PM the night
              before and 3 h, 2 h, 1 h and 30 min before the call, skipping any that had already
              passed when the call was booked.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Sales reports send at</Label>
              <select
                className={SELECT_CLASS}
                disabled={!isAdmin}
                value={draft.dailyReportHour}
                onChange={(e) => set("dailyReportHour", Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weekly report day</Label>
              <select
                className={SELECT_CLASS}
                disabled={!isAdmin}
                value={draft.weeklyReportDay}
                onChange={(e) => set("weeklyReportDay", Number(e.target.value))}
              >
                {WEEKDAY_OPTIONS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-3xs text-muted-foreground">
            The daily report covers that day; the weekly one covers the seven days ending on its
            day.
          </p>

          <div className="space-y-1">
            <Label className="text-xs">Content schedule posts at</Label>
            <select
              className={SELECT_CLASS}
              disabled={!isAdmin}
              value={draft.contentScheduleHour}
              onChange={(e) => set("contentScheduleHour", Number(e.target.value))}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
            <p className="text-3xs text-muted-foreground">
              Lists the day’s scheduled content each morning. The top-content-sources reports send
              with the sales reports, and the monthly one on the last day of the month.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Discord Setter role ID</Label>
              <Input
                inputMode="numeric"
                disabled={!isAdmin}
                value={draft.discordSetterRoleId}
                placeholder="e.g. 1570643974073487430"
                onChange={(e) => set("discordSetterRoleId", e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Discord Closer role ID</Label>
              <Input
                inputMode="numeric"
                disabled={!isAdmin}
                value={draft.discordCloserRoleId}
                placeholder="e.g. 1570644095586664649"
                onChange={(e) => set("discordCloserRoleId", e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <p className="text-3xs text-muted-foreground">
            Who the unconfirmed-call alerts and the “CALL THEM ASAP” / “FOLLOW UP ASAP” messages
            ping. Leave a channel’s own role pings empty on the Event Bus for those channels, or
            every message there pings both.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Today’s calls posts at</Label>
              <select
                className={SELECT_CLASS}
                disabled={!isAdmin}
                value={draft.todaysCallsHour}
                onChange={(e) => set("todaysCallsHour", Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">EOD no-shows post at</Label>
              <select
                className={SELECT_CLASS}
                disabled={!isAdmin}
                value={draft.eodNoShowHour}
                onChange={(e) => set("eodNoShowHour", Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applied but not booked after</Label>
              <select
                className={SELECT_CLASS}
                disabled={!isAdmin}
                value={draft.appliedNotBookedMinutes}
                onChange={(e) => set("appliedNotBookedMinutes", Number(e.target.value))}
              >
                {[15, 30, 60, 120, 240, 1440].map((m) => (
                  <option key={m} value={m}>
                    {m < 60
                      ? `${m} minutes`
                      : m === 1440
                        ? "24 hours"
                        : `${m / 60} hour${m === 60 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-3xs text-muted-foreground">
            #todays-calls lists the day’s booked calls. #eod-no-show flags each rep who didn’t file
            the previous day’s EOD or post-call notes. #applied-not-booked flags a full application
            with no call booked after this long.
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Pre-call assets (up to 5)</Label>
            {Array.from({ length: 5 }, (_, i) => {
              const a = draft.precallAssets[i] ?? { label: "", url: "" };
              const update = (patch: Partial<{ label: string; url: string }>) => {
                const next = Array.from(
                  { length: 5 },
                  (_, j) => draft.precallAssets[j] ?? { label: "", url: "" },
                );
                next[i] = { ...next[i], ...patch };
                set(
                  "precallAssets",
                  next.filter((x) => x.label.trim() || x.url.trim()),
                );
              };
              return (
                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Input
                    disabled={!isAdmin}
                    value={a.label}
                    placeholder={`Asset ${i + 1} name (e.g. Watch the pre-call video)`}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                  <Input
                    className="sm:col-span-2"
                    disabled={!isAdmin}
                    value={a.url}
                    placeholder="https://"
                    onChange={(e) => update({ url: e.target.value })}
                  />
                </div>
              );
            })}
            <p className="text-3xs text-muted-foreground">
              Shown on each lead’s pre-call page. Opening one ticks it off on the lead’s message in
              #pre-call-assets (✅❌❌❌❌).
            </p>
          </div>

          <GoogleCalendarConnect isAdmin={isAdmin} />

          {isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Save
            </Button>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Only workspace owners and admins can change this.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

function GoogleCalendarConnect({ isAdmin }: { isAdmin: boolean }) {
  const start = useServerFn(startGoogleCalendarOAuth);
  const status = useServerFn(googleCalendarStatus);
  const { data } = useQuery({ queryKey: ["google-calendar-status"], queryFn: () => status() });
  const connect = useMutation({
    mutationFn: () => start(),
    onSuccess: (r) => {
      window.location.href = r.authorizeUrl;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-1 rounded-md border border-border/70 p-3">
      <Label className="text-xs">Google Calendar (confirmed = invite accepted)</Label>
      <p className="text-3xs text-muted-foreground">
        {data?.connected
          ? `Connected${data.account ? ` as ${data.account}` : ""}. A call is confirmed when the lead accepts the calendar invite.`
          : "Not connected. Sign in with the Google account Calendly adds calls to. Until then, a call is confirmed when the confirm step is ticked."}
      </p>
      {isAdmin && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => connect.mutate()}
          disabled={connect.isPending}
        >
          {data?.connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
        </Button>
      )}
    </div>
  );
}

function ContentEngineSection({ orgId, isAdmin }: { orgId?: string; isAdmin: boolean }) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const getFn = useServerFn(getWorkspaceSettingsFn);
  const updateFn = useServerFn(updateWorkspaceSettingsFn);

  const { data, isLoading } = useQuery({
    queryKey: ["workspace-settings", orgId, devBypass],
    enabled: devBypass || !!orgId,
    queryFn: () =>
      devBypass ? Promise.resolve(DEFAULT_WORKSPACE_SETTINGS) : getFn({ data: { orgId: orgId! } }),
  });

  const [draft, setDraft] = useState<WorkspaceSettings>(DEFAULT_WORKSPACE_SETTINGS);
  const [seeded, setSeeded] = useState(false);
  if (data && !seeded) {
    setDraft(data);
    setSeeded(true);
  }

  const setField = <G extends keyof WorkspaceSettings>(
    group: G,
    key: keyof WorkspaceSettings[G],
    value: number,
  ) => setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [key]: value } }));

  const save = useMutation({
    mutationFn: async () => {
      if (devBypass) return draft;
      return updateFn({
        data: {
          orgId: orgId!,
          content_engine: draft.content_engine,
          alerts: draft.alerts,
          clients: draft.clients,
          funnel_instrument: draft.funnel_instrument,
        },
      });
    },
    onSuccess: (saved) => {
      toast.success("Content engine settings saved");
      qc.setQueryData(["workspace-settings", orgId, devBypass], saved);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups: { title: string; group: keyof WorkspaceSettings; fields: NumField[] }[] = [
    { title: "Content Engine", group: "content_engine", fields: CONTENT_ENGINE_FIELDS },
    { title: "Alerts", group: "alerts", fields: ALERT_FIELDS },
    { title: "Clients", group: "clients", fields: CLIENT_FIELDS },
  ];

  return (
    <Section
      title="Content Engine & Alerts"
      description="Every threshold the Content Signals / Bottleneck Engine and alerting use — no buried literals. Changes apply the moment they're saved."
    >
      {isLoading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 mx-auto animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.group} className="space-y-3">
              <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Radar className="h-3.5 w-3.5" /> {g.title}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {g.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input
                      type="number"
                      min={f.min}
                      max={f.max}
                      value={(draft[g.group] as Record<string, number>)[f.key]}
                      disabled={!isAdmin}
                      onChange={(e) =>
                        setField(
                          g.group,
                          f.key as never,
                          Math.max(f.min, Math.min(f.max, Number(e.target.value) || f.min)),
                        )
                      }
                    />
                    <p className="text-3xs text-muted-foreground">{f.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {isAdmin ? (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}{" "}
              Save
            </Button>
          ) : (
            <p className="text-2xs text-muted-foreground">
              Only workspace owners and admins can change these.
            </p>
          )}
        </div>
      )}
    </Section>
  );
}
