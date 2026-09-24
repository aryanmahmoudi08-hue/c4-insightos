import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  EMPTY_WEBINAR_METRIC,
  countInputToNumber,
  isEmptyWebinarMetric,
  moneyInputToCents,
  parseWebinarMetricsCsv,
  type WebinarMetricInput,
} from "@/lib/webinar-metrics";

type FieldSpec = { key: keyof WebinarMetricInput; label: string; money?: boolean };

/** Grouped to match how the page reads them, not the column order. */
const GROUPS: Array<{ title: string; fields: FieldSpec[] }> = [
  {
    title: "Acquisition",
    fields: [
      { key: "lead_capture_investment_cents", label: "Ad spend", money: true },
      { key: "clicks", label: "Clicks" },
      { key: "visits_paid", label: "Paid visits" },
      { key: "visits_organic", label: "Organic visits" },
      { key: "paid_leads", label: "Paid leads" },
      { key: "organic_leads", label: "Organic leads" },
      { key: "group_leads", label: "Group leads" },
      { key: "email_opens", label: "Email opens" },
      { key: "email_clicks", label: "Email clicks" },
    ],
  },
  {
    title: "Attendance",
    fields: [
      { key: "registered", label: "Registered" },
      { key: "live_attendees", label: "Live attendees" },
      { key: "pitch_attendees", label: "Stayed to pitch" },
    ],
  },
  {
    title: "Sales",
    fields: [
      { key: "deposits", label: "Deposits" },
      { key: "sales", label: "Sales" },
      { key: "core_revenue_cents", label: "Core revenue", money: true },
      { key: "refunds_cents", label: "Refunds", money: true },
    ],
  },
  {
    title: "Bumps & upsells",
    fields: [
      { key: "order_bump_sales", label: "Order bump sales" },
      { key: "order_bump_revenue_cents", label: "Order bump revenue", money: true },
      { key: "upsell_sales", label: "Upsell sales" },
      { key: "upsell_revenue_cents", label: "Upsell revenue", money: true },
    ],
  },
];

function todayISODate() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Manual + CSV entry for `public.webinar_metrics`. Webinar Analytics already
 * reads this table; until now nothing could write to it, which is why its
 * Executive KPI and Closing & Return groups had no data. Mirrors how VSL
 * Analytics has always worked (`source` = 'manual' | 'csv'), so an aggregate-
 * only webinar platform — or a spreadsheet — is a first-class source rather
 * than a workaround.
 */
export function WebinarMetricsDialog({
  orgId,
  webinars,
  defaultWebinarId,
  trigger,
}: {
  orgId?: string;
  webinars: Array<{ id: string; name: string }>;
  defaultWebinarId?: string;
  trigger: ReactNode;
}) {
  const { devBypass } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [webinarId, setWebinarId] = useState(defaultWebinarId ?? "");
  const [capturedOn, setCapturedOn] = useState(todayISODate());
  const [raw, setRaw] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState("");

  const capturedAtISO = useMemo(() => {
    // Midday UTC, not local midnight: the column is a timestamptz read back
    // through a date-range filter, and local midnight can land on the
    // previous day once converted (same class of bug as 158902c).
    const d = new Date(`${capturedOn}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }, [capturedOn]);

  const manualMetric = useMemo<WebinarMetricInput>(() => {
    const out = { ...EMPTY_WEBINAR_METRIC };
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const value = raw[field.key] ?? "";
        out[field.key] = field.money ? moneyInputToCents(value) : countInputToNumber(value);
      }
    }
    return out;
  }, [raw]);

  const csvPreview = useMemo(() => {
    if (!csv.trim()) return null;
    try {
      return { ...parseWebinarMetricsCsv(csv, capturedAtISO), error: null as string | null };
    } catch (e) {
      return { rows: [], unrecognizedHeaders: [], matchedColumns: [], error: (e as Error).message };
    }
  }, [csv, capturedAtISO]);

  const reset = () => {
    setRaw({});
    setCsv("");
    setCapturedOn(todayISODate());
  };

  const save = useMutation({
    mutationFn: async (mode: "manual" | "csv") => {
      if (!orgId) throw new Error("No workspace resolved yet — reload and try again.");
      if (!webinarId) throw new Error("Pick which webinar these numbers belong to.");

      const rows =
        mode === "manual"
          ? [{ ...manualMetric, captured_at: capturedAtISO }]
          : (csvPreview?.rows ?? []);

      if (mode === "manual" && isEmptyWebinarMetric(manualMetric)) {
        throw new Error("Fill in at least one metric — an empty snapshot would claim nothing.");
      }
      if (mode === "csv") {
        if (csvPreview?.error) throw new Error(csvPreview.error);
        if (!rows.length) throw new Error("Nothing to import.");
      }

      // webinar_metrics isn't in the generated type snapshot yet — same cast
      // the page itself uses to read it.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { error } = await db
        .from("webinar_metrics")
        .insert(rows.map((r) => ({ ...r, org_id: orgId, webinar_id: webinarId, source: mode })));
      if (error) throw new Error(error.message);
      return rows.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Snapshot saved" : `${count} snapshots imported`);
      qc.invalidateQueries({ queryKey: ["webinar-metrics"] });
      qc.invalidateQueries({ queryKey: ["webinar-metrics-comparison"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const webinarPicker = (
    <div className="space-y-1">
      <Label className="text-2xs">Webinar</Label>
      <Select value={webinarId} onValueChange={setWebinarId}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a webinar…" />
        </SelectTrigger>
        <SelectContent>
          {webinars.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const dateField = (
    <div className="space-y-1">
      <Label className="text-2xs">Date these numbers cover</Label>
      <Input type="date" value={capturedOn} onChange={(e) => setCapturedOn(e.target.value)} />
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setWebinarId(defaultWebinarId ?? "");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add webinar metrics</DialogTitle>
          <DialogDescription>
            Day-level numbers for one webinar. Leave a field blank if you don&apos;t have it — blank
            reads as &quot;not supplied&quot;, while 0 is recorded as a real zero.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList>
            <TabsTrigger value="manual">Manual entry</TabsTrigger>
            <TabsTrigger value="csv">CSV import</TabsTrigger>
          </TabsList>

          <TabsContent value="manual" className="space-y-4 pt-3">
            <div className="grid grid-cols-2 gap-3">
              {webinarPicker}
              {dateField}
            </div>
            {GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <div className="text-3xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {group.title}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <Label className="text-2xs">
                        {field.label}
                        {field.money && <span className="ml-1 text-muted-foreground">(USD)</span>}
                      </Label>
                      <Input
                        inputMode="decimal"
                        placeholder="—"
                        value={raw[field.key] ?? ""}
                        onChange={(e) => setRaw((r) => ({ ...r, [field.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-3xs text-muted-foreground">
              Money is entered in USD — `webinar_metrics` has no currency column, so these are
              stored as canonical USD cents like the rest of the schema.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={save.isPending || devBypass || !webinarId}
                onClick={() => save.mutate("manual")}
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save snapshot
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="csv" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              {webinarPicker}
              {dateField}
            </div>
            <div className="space-y-1">
              <Label className="text-2xs">Paste CSV</Label>
              <Textarea
                rows={8}
                className="font-mono text-2xs"
                placeholder={
                  "date,registered,live_attendees,sales,revenue\n2026-09-01,300,120,12,24000"
                }
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
              />
              <p className="text-3xs text-muted-foreground">
                A header row is required. Rows without a recognizable date use the date above. Money
                columns are read in USD.
              </p>
            </div>

            {csvPreview?.error && (
              <p className="flex items-start gap-1.5 text-2xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                {csvPreview.error}
              </p>
            )}
            {csvPreview && !csvPreview.error && (
              <div className="space-y-1 rounded-lg border border-border p-2.5">
                <div className="text-2xs">
                  <span className="font-medium">{csvPreview.rows.length}</span> row
                  {csvPreview.rows.length === 1 ? "" : "s"} ready ·{" "}
                  <span className="font-medium">{csvPreview.matchedColumns.length}</span> column
                  {csvPreview.matchedColumns.length === 1 ? "" : "s"} matched
                </div>
                {csvPreview.unrecognizedHeaders.length > 0 && (
                  <div className="text-3xs text-[color:var(--color-warning)]">
                    Ignored (no matching metric): {csvPreview.unrecognizedHeaders.join(", ")}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={
                  save.isPending ||
                  devBypass ||
                  !webinarId ||
                  !csvPreview ||
                  !!csvPreview.error ||
                  !csvPreview.rows.length
                }
                onClick={() => save.mutate("csv")}
              >
                {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import {csvPreview && !csvPreview.error ? csvPreview.rows.length || "" : ""} row
                {csvPreview && !csvPreview.error && csvPreview.rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {devBypass && (
          <p className="text-2xs text-muted-foreground">
            Dev preview — metrics read from a fixture here, so saving needs a real signed-in
            session.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
