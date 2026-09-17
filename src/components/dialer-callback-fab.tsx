import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Clock, PhoneIncoming, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { mockLeads } from "@/lib/dev-mock-data";
import { useDialerCallbacks } from "@/hooks/use-dialer-callbacks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DialerFollowUpRows } from "@/components/dialer-followup-list";

// The browser's own local time is what dueAt is always interpreted in
// (`new Date(dueAt).toISOString()` at the mutation call site relies on
// that), so the honest thing to surface is which timezone that browser-local
// value is actually being interpreted in, not a guessed lead timezone.
// Never attribute this offset to the lead.
const browserTzAbbrev = () =>
  new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "Local";
const browserUtcOffset = () => {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, "0")}` : ""}`;
};

/**
 * The Inbound Dialer's "Log a callback" floating action button + drawer —
 * same operational_work_items / entity_type "dialer_callback" workflow used
 * on /inbound-dialer (src/components/activity-module.tsx), extracted so it
 * can also render in place on Home without navigating the dialer away from
 * their Home content. The callback list/mutations themselves live in
 * useDialerCallbacks so this stays in sync with the standalone "Upcoming
 * Follow-ups" list (dialer-followup-list.tsx) wherever both render on the
 * same page. Honors the same ?action=log-callback deep link the command
 * palette already uses to open this from /inbound-dialer.
 */
export function DialerCallbackFab({ orgId, devBypass }: { orgId: string; devBypass: boolean }) {
  const { openCallbacks, logCallback } = useDialerCallbacks(orgId, devBypass);

  const [open, setOpen] = useState(false);
  const actionSearch = useSearch({ strict: false }) as { action?: string };
  const navigate = useNavigate();
  useEffect(() => {
    if (actionSearch.action === "log-callback") {
      setOpen(true);
      navigate({ search: {} as never, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSearch.action]);

  const [leadQuery, setLeadQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<{
    id: string;
    full_name: string | null;
    handle: string | null;
    email: string | null;
  } | null>(null);
  const { data: leadResults = [] } = useQuery({
    queryKey: ["dialer-callback-lead-search", orgId, leadQuery, devBypass],
    enabled: !!orgId && leadQuery.trim().length >= 2 && !selectedLead,
    queryFn: async () => {
      const q = leadQuery.trim();
      // Dev bypass never has a real Supabase session, so a real leads query
      // comes back RLS-empty — a search-and-select workflow with nothing to
      // select isn't a degraded-but-honest empty state, it's an unusable
      // interaction, so it gets a real mock fallback like the dashboard's
      // own copy of this search does.
      if (devBypass) {
        const needle = q.toLowerCase();
        return mockLeads()
          .filter(
            (lead) =>
              lead.full_name.toLowerCase().includes(needle) ||
              lead.handle.toLowerCase().includes(needle) ||
              lead.email.toLowerCase().includes(needle),
          )
          .slice(0, 8)
          .map((lead) => ({
            id: lead.id,
            full_name: lead.full_name,
            handle: lead.handle,
            email: lead.email,
          }));
      }
      const { data, error } = await supabase
        .from("leads")
        .select("id, full_name, handle, email")
        .eq("org_id", orgId)
        .or(`full_name.ilike.%${q}%,handle.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const dueAt = dueDate && dueTime ? `${dueDate}T${dueTime}` : "";
  const resetDueAt = () => {
    setDueDate("");
    setDueTime("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Log Callback"
        title="Log a Callback"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-lg transition hover:scale-105 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <PhoneIncoming className="h-5 w-5" />
        {openCallbacks.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-border bg-destructive px-1 text-3xs font-semibold text-destructive-foreground">
            {openCallbacks.length}
          </span>
        )}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Log a callback</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="relative">
              <Label className="text-2xs">Lead</Label>
              {selectedLead ? (
                <div className="mt-1 flex w-fit items-center gap-2 rounded-lg border border-spectrum-mid/40 bg-spectrum-mid/10 py-1.5 pr-1.5 pl-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-spectrum-mid shadow-[0_0_6px_var(--spectrum-mid)]" />
                  <span className="text-xs font-semibold text-foreground">
                    {selectedLead.full_name ?? selectedLead.handle ?? selectedLead.email}
                  </span>
                  {selectedLead.email && (
                    <span className="text-3xs text-muted-foreground">{selectedLead.email}</span>
                  )}
                  <button
                    type="button"
                    aria-label="Change lead"
                    onClick={() => setSelectedLead(null)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Search a Legacy Lead by name, handle, or email"
                    className="mt-1 h-8 w-72 text-xs"
                  />
                  {leadResults.length > 0 && (
                    <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-md border border-border bg-popover shadow-md">
                      {leadResults.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setSelectedLead(lead);
                            setLeadQuery("");
                          }}
                        >
                          {lead.full_name ?? lead.handle ?? lead.email ?? "Unnamed lead"}
                          {lead.email && (
                            <span className="ml-1.5 text-muted-foreground">{lead.email}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-2xs">Date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-8 w-36 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-2xs">Time</Label>
                <Input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="h-8 w-28 text-xs"
                />
              </div>
              <Button
                size="sm"
                disabled={!selectedLead || logCallback.isPending}
                onClick={() => {
                  if (!selectedLead) return;
                  logCallback.mutate(
                    {
                      leadId: selectedLead.id,
                      leadName:
                        selectedLead.full_name ??
                        selectedLead.handle ??
                        selectedLead.email ??
                        "Unnamed lead",
                      dueAt,
                    },
                    {
                      onSuccess: () => {
                        setSelectedLead(null);
                        setLeadQuery("");
                        resetDueAt();
                      },
                    },
                  );
                }}
              >
                Log callback
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-3xs">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/50 px-2 py-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                Your time zone:{" "}
                <span className="font-medium text-foreground">
                  {browserTzAbbrev()} ({browserUtcOffset()})
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/50 px-2 py-1 text-muted-foreground">
                Lead time zone: <span className="font-medium text-foreground">Unavailable</span>
              </span>
              {dueAt && (
                <span className="inline-flex items-center gap-1 rounded-full border border-spectrum-mid/40 bg-spectrum-mid/10 px-2 py-1 text-spectrum-mid">
                  Scheduling for{" "}
                  {new Date(dueAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}{" "}
                  {browserTzAbbrev()}
                </span>
              )}
            </div>
          </div>
          {openCallbacks.length > 0 && (
            <div className="mt-3">
              <DialerFollowUpRows orgId={orgId} devBypass={devBypass} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
